import assert from "node:assert/strict";
import { createRequire } from "node:module";
const requireFromClient = createRequire(new URL("../client/package.json", import.meta.url));
const { io } = requireFromClient("socket.io-client");

const base = process.env.TEST_API_URL || "http://localhost:3311";
const seed = `${Date.now()}`.slice(-9);

async function json(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const body = await response.json();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}
const auth = (token, body) => ({ method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });

const health = await json("/health"); assert.equal(health.ok, true);
const first = await json("/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: `hero_${seed}`, password: "test-password-123", displayName: "검증용사" }) });
const second = await json("/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: `ally_${seed}`, password: "test-password-123", displayName: "검증동료" }) });
assert.ok(first.token); assert.ok(second.token);

const before = (await json("/api/save", { headers: { authorization: `Bearer ${first.token}` } })).save;
const forged = structuredClone(before); forged.gold = 999_999_999; forged.level = 75; forged.xp = 9_000_000; forged.inventory[0].enhance = 30;
const afterCheat = (await json("/api/save", auth(first.token, forged))).save;
assert.equal(afterCheat.gold, before.gold); assert.equal(afterCheat.level, before.level); assert.equal(afterCheat.inventory[0].enhance, 0);

const normalKill = await json("/api/game/kill", auth(first.token, { monsterId: "slime" }));
assert.ok(normalKill.save.gold > before.gold); assert.equal(normalKill.save.stats.bossKills, 0);
const forbiddenBoss = await fetch(`${base}/api/game/kill`, auth(first.token, { monsterId: "hornBeast" }));
assert.equal(forbiddenBoss.status, 409);

const socketA = io(base, { auth: { token: first.token }, transports: ["websocket"] });
const socketB = io(base, { auth: { token: second.token }, transports: ["websocket"] });
const sendA = () => socketA.emit("presence", { x: 3820, y: 1200, hp: 100, maxHp: 100, weapon: "낡은 장검", region: "meadow" });
const sendB = () => socketB.emit("presence", { x: 3890, y: 1280, hp: 100, maxHp: 100, weapon: "낡은 장검", region: "meadow" });
const presenceCheck = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("Socket.IO presence timeout")), 5_000);
  const inspect = (players) => { if (players.length >= 2) { clearTimeout(timeout); resolve(players); } };
  socketA.on("world", inspect); socketB.on("world", inspect);
  socketA.on("connect", sendA); socketB.on("connect", sendB);
});
await presenceCheck;
const presenceTimer = setInterval(() => { sendA(); sendB(); }, 180);
socketA.emit("boss:engage", { regionId: "meadow" }); socketB.emit("boss:engage", { regionId: "meadow" });
const bossRewards = new Promise((resolve, reject) => {
  const rewards = new Map(), timeout = setTimeout(() => reject(new Error("server boss reward timeout")), 12_000);
  const collect = (key) => (payload) => { rewards.set(key, payload); if (rewards.size === 2) { clearTimeout(timeout); resolve(rewards); } };
  socketA.on("boss:reward", collect("a")); socketB.on("boss:reward", collect("b"));
  socketA.on("boss:reward-error", reject); socketB.on("boss:reward-error", reject);
});
const damageTimer = setInterval(() => { socketA.emit("boss:damage", { regionId: "meadow", damage: 999_999 }); socketB.emit("boss:damage", { regionId: "meadow", damage: 999_999 }); }, 120);
const rewards = await bossRewards; clearInterval(damageTimer); clearInterval(presenceTimer);
const heroBoss = rewards.get("a"); assert.equal(heroBoss.reward.xp, 450); assert.ok(heroBoss.reward.drops.length >= 1); assert.equal(heroBoss.save.stats.bossKills, 1);
socketA.disconnect(); socketB.disconnect();

const shop = await json("/api/game/shop", auth(first.token, { kind: "potion", id: "meadow1", regionId: "meadow" }));
assert.equal(shop.save.potions.meadow1, 4);
const enhanced = await json("/api/game/enhance", auth(first.token, { itemId: shop.save.inventory[0].id, useGuard: false }));
assert.ok(["success", "great", "keep", "drop"].includes(enhanced.result));

const login = await json("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: `hero_${seed}`, password: "test-password-123" }) });
const restored = (await json("/api/save", { headers: { authorization: `Bearer ${login.token}` } })).save;
assert.equal(restored.gold, enhanced.save.gold); assert.equal(restored.stats.bossKills, 1); assert.equal(restored.inventory.length, enhanced.save.inventory.length);
console.log("LIVE API CHECK PASSED: auth, protected save, server boss AI/reward, shop, enhancement, relogin restore, two-player presence");
