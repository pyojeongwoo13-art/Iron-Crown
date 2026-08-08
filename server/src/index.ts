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
import { createToken, isActiveSession, requireAuth, verifyToken, type AuthUser } from "./auth.js";
import { createBossEngine, type BossPresence } from "./boss-engine.js";
import { initializeDatabase, pool } from "./db.js";
import { buyFromShop, deleteItemFromSave, enhanceOnServer, loadSave, mergeClientState, rewardForKill, writeSave } from "./game.js";
import { initialSave, MONSTERS } from "../../client/src/game/content.js";
import { NETWORK } from "../../client/src/game/network.js";

const app = express(), server = http.createServer(app);
const origins = (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(",").map((value) => value.trim().replace(/\/$/, "")).filter(Boolean);
const allowedOrigin = (origin?: string) => !origin || origins.includes("*") || origins.includes(origin.replace(/\/$/, "")) || /^https:\/\/[a-z0-9-]+\.github\.io$/i.test(origin);
app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin(origin, callback) { callback(allowedOrigin(origin) ? null : new Error("Origin blocked"), Boolean(origin)); } }));
app.use(express.json({ limit: "256kb" }));
app.use(rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: true, legacyHeaders: false }));

const credentialSchema = z.object({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,20}$/, "아이디는 영문 소문자, 숫자, _만 사용할 수 있습니다."), password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다.").max(72) });
const registerSchema = credentialSchema.extend({ displayName: z.string().trim().min(1).max(16) });
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 25, standardHeaders: true, legacyHeaders: false });

app.get("/health", (_request, response) => response.json({ ok: true, game: "IRON CROWN", time: Date.now() }));
app.post("/api/auth/register", authLimiter, async (request, response) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: parsed.error.issues[0].message });
  const client = await pool.connect();
  try {
    const id = randomUUID(), sessionId = randomUUID(), passwordHash = await bcrypt.hash(parsed.data.password, 12), save = initialSave();
    await client.query("BEGIN");
    await client.query("INSERT INTO users(id,username,display_name,password_hash,active_session_id) VALUES($1,$2,$3,$4,$5)", [id, parsed.data.username, parsed.data.displayName, passwordHash, sessionId]);
    await client.query("INSERT INTO saves(user_id,save_json,version) VALUES($1,$2,2)", [id, JSON.stringify(save)]);
    await client.query("COMMIT");
    const player = { id, username: parsed.data.username, displayName: parsed.data.displayName, sessionId };
    response.status(201).json({ token: createToken(player), player: { username: player.username, displayName: player.displayName } });
  } catch (error: any) { await client.query("ROLLBACK"); response.status(error?.code === "23505" ? 409 : 500).json({ error: error?.code === "23505" ? "이미 사용 중인 아이디입니다." : "계정을 만들지 못했습니다." }); }
  finally { client.release(); }
});

app.post("/api/auth/login", authLimiter, async (request, response) => {
  // 로그인은 회원가입 전용 displayName 필드를 검증하지 않는다. 이전 클라이언트의 빈 문자열도 안전하게 무시한다.
  const parsed = credentialSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "아이디와 비밀번호를 확인하세요." });
  const result = await pool.query("SELECT id,username,display_name,password_hash FROM users WHERE username=$1", [parsed.data.username]);
  const row = result.rows[0];
  if (!row || !(await bcrypt.compare(parsed.data.password, row.password_hash))) return response.status(401).json({ error: "아이디 또는 비밀번호가 맞지 않습니다." });
  const sessionId = randomUUID();
  await pool.query("UPDATE users SET last_login_at=NOW(),active_session_id=$2 WHERE id=$1", [row.id, sessionId]);
  for (const connected of io.sockets.sockets.values()) if ((connected.data.user as AuthUser | undefined)?.id === row.id) {
    connected.emit("session:replaced", { message: "다른 기기에서 로그인되어 현재 접속이 종료되었습니다." });
    setTimeout(() => connected.disconnect(true), 40);
  }
  const player = { id: row.id, username: row.username, displayName: row.display_name, sessionId };
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

app.post("/api/game/delete-item", requireAuth, async (request, response) => {
  const itemId = typeof request.body?.itemId === "string" ? request.body.itemId : "";
  if (!itemId) return response.status(400).json({ error: "삭제할 장비를 선택하세요." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const save = await loadSave(client, request.user!.id, true);
    const deleted = deleteItemFromSave(save, itemId);
    await writeSave(client, request.user!.id, save);
    await client.query("COMMIT");
    response.json({ save, deleted: { id: deleted.id, name: deleted.name } });
  } catch (error) {
    await client.query("ROLLBACK");
    response.status(409).json({ error: error instanceof Error ? error.message : "장비를 삭제하지 못했습니다." });
  } finally { client.release(); }
});

type Presence = BossPresence & { id: string; maxHp: number; weapon: string; level: number };
const presence = new Map<string, Presence>();
const networkMetrics = { presenceMessages: 0, worldSnapshots: 0, rosterBroadcasts: 0, onlineRosterBroadcasts: 0, worldSnapshotBytes: 0 };
const dirtyRegions = new Set<string>(), regionSnapshotAt = new Map<string, number>();
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
const emitRoster = (region: string) => {
  const players = [...presence.values()].filter((player) => player.region === region).map(({ id, name, maxHp, weapon, level }) => ({ id, name, maxHp, weapon, level }));
  io.to(`region:${region}`).emit("world:roster", players); networkMetrics.rosterBroadcasts += 1;
};
const emitOnlineRoster = () => {
  const players = [...presence.values()].map(({ id, name, maxHp, weapon, level, region }) => ({ id, name, maxHp, weapon, level, region }));
  io.emit("online:roster", players); networkMetrics.onlineRosterBroadcasts += 1;
};
io.use(async (socket, next) => { try { const user = verifyToken(String(socket.handshake.auth?.token ?? "")); if (!(await isActiveSession(user))) return next(new Error("session replaced")); socket.data.user = user; next(); } catch { next(new Error("unauthorized")); } });
io.on("connection", (socket) => {
  const user = socket.data.user as AuthUser;
  socket.on("presence", async (raw: Record<string, unknown>) => {
    networkMetrics.presenceMessages += 1;
    const number = (value: unknown, fallback: number, min: number, max: number) => Math.min(max, Math.max(min, typeof value === "number" && Number.isFinite(value) ? value : fallback));
    const previous = presence.get(socket.id), now = Date.now(), x = number(raw.x, previous?.x ?? 520, 0, 4600), y = number(raw.y, previous?.y ?? 1400, 0, 2800), region = typeof raw.region === "string" ? raw.region.slice(0, 20) : previous?.region ?? "meadow";
    const elapsed = Math.max(.05, Math.min(.6, (now - (previous?.updatedAt ?? now)) / 1000));
    presence.set(socket.id, { id: socket.id, socketId: socket.id, userId: user.id, name: user.displayName, x, y,
      vx: previous?.region === region ? (x - previous.x) / elapsed : 0, vy: previous?.region === region ? (y - previous.y) / elapsed : 0,
      hp: number(raw.hp, previous?.hp ?? 1, 0, 1e12), maxHp: number(raw.maxHp, previous?.maxHp ?? 100, 1, 1e12), weapon: typeof raw.weapon === "string" ? raw.weapon.slice(0, 90) : previous?.weapon ?? "맨손", level: number(raw.level, previous?.level ?? 1, 1, 75), region, updatedAt: now });
    const current = presence.get(socket.id)!;
    if (!previous || previous.region !== region || Math.abs(previous.x - x) >= .05 || Math.abs(previous.y - y) >= .05 || previous.hp !== current.hp) dirtyRegions.add(region);
    if (previous?.region && previous.region !== region) dirtyRegions.add(previous.region);
    const rosterChanged = !previous || previous.region !== region || previous.maxHp !== current.maxHp || previous.weapon !== current.weapon || previous.level !== current.level;
    if (!previous || previous.region !== region) {
      await bossEngine.joinRegion(socket.id, previous?.region ?? null, region);
      if (previous) emitRoster(previous.region);
    }
    if (rosterChanged) { emitRoster(region); emitOnlineRoster(); }
  });
  socket.on("boss:engage", (raw: Record<string, unknown>) => bossEngine.engage(socket.id, typeof raw?.regionId === "string" ? raw.regionId : ""));
  socket.on("boss:leave", () => bossEngine.leave(socket.id, "death"));
  socket.on("boss:damage", (raw: unknown) => bossEngine.damage(socket.id, raw));
  socket.on("disconnect", () => { const previous = presence.get(socket.id); presence.delete(socket.id); bossEngine.removePlayer(socket.id); if (previous) { dirtyRegions.add(previous.region); emitRoster(previous.region); emitOnlineRoster(); } });
});

const worldTimer = setInterval(() => {
  const now = Date.now(), byRegion = new Map<string, Presence[]>();
  for (const player of presence.values()) {
    if (now - player.updatedAt > 2_000) continue;
    const group = byRegion.get(player.region) ?? []; group.push(player); byRegion.set(player.region, group);
  }
  for (const [region, players] of byRegion) {
    if (!io.sockets.adapter.rooms.get(`region:${region}`)?.size) continue;
    if (!dirtyRegions.has(region) && now - (regionSnapshotAt.get(region) ?? 0) < NETWORK.presenceHeartbeatMs) continue;
    const payload = { t: now, p: players.map((player) => [player.id, Math.round(player.x * 10) / 10, Math.round(player.y * 10) / 10, Math.round(player.hp)] as const) };
    io.to(`region:${region}`).emit("world:snapshot", payload); networkMetrics.worldSnapshots += 1; networkMetrics.worldSnapshotBytes += JSON.stringify(payload).length;
    dirtyRegions.delete(region); regionSnapshotAt.set(region, now);
  }
}, 1000 / NETWORK.worldSnapshotHz);

app.get("/health/network", (_request, response) => response.json({ ok: true, uptimeMs: Math.round(process.uptime() * 1000), network: { ...networkMetrics, averageWorldSnapshotBytes: networkMetrics.worldSnapshots ? Math.round(networkMetrics.worldSnapshotBytes / networkMetrics.worldSnapshots) : 0 }, boss: bossEngine.getMetrics(), rates: NETWORK }));

app.use((_request, response) => response.status(404).json({ error: "not found" }));
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => { console.error(error); response.status(500).json({ error: "server error" }); });

await initializeDatabase();
const port = Number(process.env.PORT || 3001);
server.listen(port, "0.0.0.0", () => console.log(`IRON CROWN server listening on ${port}`));
