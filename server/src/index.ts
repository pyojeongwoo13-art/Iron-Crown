import "dotenv/config";
import { randomUUID } from "node:crypto";
import http from "node:http";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { Server } from "socket.io";
import { z } from "zod";
import { createToken, requireAuth, verifyToken, type AuthUser } from "./auth.js";
import { createBossEngine, type BossPresence } from "./boss-engine.js";
import { initializeDatabase, pool } from "./db.js";
import { buyFromShop, enhanceOnServer, loadSave, mergeClientState, rewardForKill, writeSave } from "./game.js";
import { initialSave, MONSTERS } from "../../client/src/game/content.js";

const app = express(), server = http.createServer(app);
const origins = (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(",").map((value) => value.trim()).filter(Boolean);
const allowedOrigin = (origin?: string) => !origin || origins.includes("*") || origins.includes(origin);
app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin(origin, callback) { callback(allowedOrigin(origin) ? null : new Error("Origin blocked"), Boolean(origin)); } }));
app.use(express.json({ limit: "256kb" }));
app.use(rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: true, legacyHeaders: false }));

const authSchema = z.object({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,20}$/, "아이디는 영문 소문자, 숫자, _만 사용할 수 있습니다."), password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다.").max(72), displayName: z.string().trim().min(1).max(16).optional() });
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 25, standardHeaders: true, legacyHeaders: false });

app.get("/health", (_request, response) => response.json({ ok: true, game: "IRON CROWN", time: Date.now() }));
app.post("/api/auth/register", authLimiter, async (request, response) => {
  const parsed = authSchema.safeParse(request.body);
  if (!parsed.success || !parsed.data.displayName) return response.status(400).json({ error: parsed.success ? "캐릭터 이름을 입력하세요." : parsed.error.issues[0].message });
  const client = await pool.connect();
  try {
    const id = randomUUID(), passwordHash = await bcrypt.hash(parsed.data.password, 12), save = initialSave();
    await client.query("BEGIN");
    await client.query("INSERT INTO users(id,username,display_name,password_hash) VALUES($1,$2,$3,$4)", [id, parsed.data.username, parsed.data.displayName, passwordHash]);
    await client.query("INSERT INTO saves(user_id,save_json,version) VALUES($1,$2,2)", [id, JSON.stringify(save)]);
    await client.query("COMMIT");
    const player = { id, username: parsed.data.username, displayName: parsed.data.displayName };
    response.status(201).json({ token: createToken(player), player: { username: player.username, displayName: player.displayName } });
  } catch (error: any) { await client.query("ROLLBACK"); response.status(error?.code === "23505" ? 409 : 500).json({ error: error?.code === "23505" ? "이미 사용 중인 아이디입니다." : "계정을 만들지 못했습니다." }); }
  finally { client.release(); }
});

app.post("/api/auth/login", authLimiter, async (request, response) => {
  const parsed = authSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "아이디와 비밀번호를 확인하세요." });
  const result = await pool.query("SELECT id,username,display_name,password_hash FROM users WHERE username=$1", [parsed.data.username]);
  const row = result.rows[0];
  if (!row || !(await bcrypt.compare(parsed.data.password, row.password_hash))) return response.status(401).json({ error: "아이디 또는 비밀번호가 맞지 않습니다." });
  await pool.query("UPDATE users SET last_login_at=NOW() WHERE id=$1", [row.id]);
  const player = { id: row.id, username: row.username, displayName: row.display_name };
  response.json({ token: createToken(player), player: { username: player.username, displayName: player.displayName } });
});

app.get("/api/auth/me", requireAuth, (request, response) => response.json({ player: { username: request.user!.username, displayName: request.user!.displayName } }));
app.get("/api/save", requireAuth, async (request, response) => { const client = await pool.connect(); try { response.json({ save: await loadSave(client, request.user!.id), player: request.user!.displayName }); } finally { client.release(); } });
app.post("/api/save", requireAuth, async (request, response) => {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const current = await loadSave(client, request.user!.id, true), save = mergeClientState(current, request.body); await writeSave(client, request.user!.id, save); await client.query("COMMIT"); response.json({ ok: true, save }); }
  catch { await client.query("ROLLBACK"); response.status(400).json({ error: "저장할 수 없는 데이터입니다." }); }
  finally { client.release(); }
});

app.post("/api/game/kill", requireAuth, async (request, response) => {
  const monsterId = typeof request.body?.monsterId === "string" ? request.body.monsterId : "";
  const monster = MONSTERS[monsterId]; if (!monster) return response.status(400).json({ error: "알 수 없는 몬스터입니다." });
  if (monster.kind === "boss") return response.status(409).json({ error: "보스 처치와 보상은 서버 전투 인스턴스에서만 확정됩니다." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const save = await loadSave(client, request.user!.id, true);
    const claim = await client.query("SELECT claimed_at FROM reward_claims WHERE user_id=$1 AND monster_id=$2 FOR UPDATE", [request.user!.id, monsterId]);
    const last = claim.rows[0] ? new Date(claim.rows[0].claimed_at).getTime() : 0, minimum = monster.kind === "elite" ? 2_500 : 350;
    if (Date.now() - last < minimum) throw new Error("보상 요청이 너무 빠릅니다.");
    const reward = rewardForKill(save, monsterId); await writeSave(client, request.user!.id, save);
    await client.query("INSERT INTO reward_claims(user_id,monster_id,claimed_at) VALUES($1,$2,NOW()) ON CONFLICT(user_id,monster_id) DO UPDATE SET claimed_at=NOW()", [request.user!.id, monsterId]);
    await client.query("COMMIT"); response.json({ save, reward });
  } catch (error) { await client.query("ROLLBACK"); response.status(429).json({ error: error instanceof Error ? error.message : "보상을 처리하지 못했습니다." }); }
  finally { client.release(); }
});

app.post("/api/game/enhance", requireAuth, async (request, response) => {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const save = await loadSave(client, request.user!.id, true), result = enhanceOnServer(save, String(request.body?.itemId ?? ""), Boolean(request.body?.useGuard)); await writeSave(client, request.user!.id, save); await client.query("COMMIT"); response.json({ save, ...result }); }
  catch (error) { await client.query("ROLLBACK"); response.status(400).json({ error: error instanceof Error ? error.message : "강화에 실패했습니다." }); }
  finally { client.release(); }
});

app.post("/api/game/shop", requireAuth, async (request, response) => {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const save = await loadSave(client, request.user!.id, true); buyFromShop(save, String(request.body?.kind ?? ""), String(request.body?.id ?? ""), String(request.body?.regionId ?? "")); await writeSave(client, request.user!.id, save); await client.query("COMMIT"); response.json({ save }); }
  catch (error) { await client.query("ROLLBACK"); response.status(400).json({ error: error instanceof Error ? error.message : "구매에 실패했습니다." }); }
  finally { client.release(); }
});

type Presence = BossPresence & { id: string; maxHp: number; weapon: string };
const presence = new Map<string, Presence>();
const io = new Server(server, { cors: { origin: origins.includes("*") ? true : origins, methods: ["GET", "POST"] }, pingInterval: 10_000, pingTimeout: 20_000 });
const bossEngine = createBossEngine({
  io,
  getPresence: () => [...presence.values()],
  onDefeat: async (bossId, contributors) => {
    for (const contributor of contributors) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const save = await loadSave(client, contributor.userId, true);
        const reward = rewardForKill(save, bossId);
        await writeSave(client, contributor.userId, save);
        await client.query("INSERT INTO reward_claims(user_id,monster_id,claimed_at) VALUES($1,$2,NOW()) ON CONFLICT(user_id,monster_id) DO UPDATE SET claimed_at=NOW()", [contributor.userId, bossId]);
        await client.query("COMMIT");
        io.to(contributor.socketId).emit("boss:reward", { bossId, save, reward });
      } catch (error) {
        await client.query("ROLLBACK");
        io.to(contributor.socketId).emit("boss:reward-error", { bossId, error: error instanceof Error ? error.message : "보상을 처리하지 못했습니다." });
      } finally { client.release(); }
    }
  },
});
io.use((socket, next) => { try { socket.data.user = verifyToken(String(socket.handshake.auth?.token ?? "")); next(); } catch { next(new Error("unauthorized")); } });
io.on("connection", (socket) => {
  const user = socket.data.user as AuthUser;
  socket.on("presence", (raw: Record<string, unknown>) => {
    const number = (value: unknown, fallback: number, min: number, max: number) => Math.min(max, Math.max(min, typeof value === "number" && Number.isFinite(value) ? value : fallback));
    const previous = presence.get(socket.id), now = Date.now(), x = number(raw.x, 520, 0, 4600), y = number(raw.y, 1400, 0, 2800), region = typeof raw.region === "string" ? raw.region.slice(0, 20) : "meadow";
    const elapsed = Math.max(.05, Math.min(.6, (now - (previous?.updatedAt ?? now)) / 1000));
    presence.set(socket.id, { id: socket.id, socketId: socket.id, userId: user.id, name: user.displayName, x, y,
      vx: previous?.region === region ? (x - previous.x) / elapsed : 0, vy: previous?.region === region ? (y - previous.y) / elapsed : 0,
      hp: number(raw.hp, 1, 0, 1e12), maxHp: number(raw.maxHp, 100, 1, 1e12), weapon: typeof raw.weapon === "string" ? raw.weapon.slice(0, 90) : "맨손", region, updatedAt: now });
    if (!previous || previous.region !== region) bossEngine.joinRegion(socket.id, previous?.region ?? null, region);
    io.emit("world", [...presence.values()]);
  });
  socket.on("boss:engage", (raw: Record<string, unknown>) => bossEngine.engage(socket.id, typeof raw?.regionId === "string" ? raw.regionId : ""));
  socket.on("boss:damage", (raw: unknown) => bossEngine.damage(socket.id, raw));
  socket.on("disconnect", () => { presence.delete(socket.id); io.emit("world", [...presence.values()]); });
});

app.use((_request, response) => response.status(404).json({ error: "not found" }));
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => { console.error(error); response.status(500).json({ error: "server error" }); });

await initializeDatabase();
const port = Number(process.env.PORT || 3001);
server.listen(port, "0.0.0.0", () => console.log(`IRON CROWN server listening on ${port}`));
