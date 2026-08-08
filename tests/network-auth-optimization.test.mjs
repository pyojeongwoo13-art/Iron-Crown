import test from "node:test";
import assert from "node:assert/strict";
import { buildAuthPayload } from "../client/src/game/auth.ts";
import { NETWORK, cameraZoomFor, positionChanged, smoothPosition } from "../client/src/game/network.ts";
import { bossArmorForTier, bossDamageAfterDefense } from "../client/src/game/combat.ts";
import { ITEMS, MONSTERS, itemFinalStat } from "../client/src/game/content.ts";

test("login payload omits the registration-only display name", () => {
  assert.deepEqual(buildAuthPayload("login", " Hero_01 ", "password-123", ""), { username: "hero_01", password: "password-123" });
  assert.deepEqual(buildAuthPayload("register", " Hero_01 ", "password-123", " 용사 "), { username: "hero_01", password: "password-123", displayName: "용사" });
});

test("remote interpolation is frame-rate independent and snaps teleports", () => {
  const simulate = (fps) => { let point={x:0,y:0};for(let frame=0;frame<fps;frame++)point=smoothPosition(point,{x:300,y:0},NETWORK.remoteSmoothRate,1/fps);return point.x };
  const at30=simulate(30),at60=simulate(60),at120=simulate(120);
  assert.ok(Math.abs(at30-at60)<.01);assert.ok(Math.abs(at60-at120)<.01);assert.ok(at60>299.9);
  const teleport=smoothPosition({x:0,y:0},{x:NETWORK.teleportSnapDistance+1,y:0},NETWORK.remoteSmoothRate,1/60);
  assert.equal(teleport.snapped,true);assert.equal(teleport.x,NETWORK.teleportSnapDistance+1);
});

test("presence sender can suppress idle frames while preserving a heartbeat", () => {
  assert.equal(positionChanged({x:100,y:100},{x:100.2,y:100.2}),false);
  assert.equal(positionChanged({x:100,y:100},{x:101,y:100}),true);
  assert.ok(NETWORK.presenceSendHz>=15&&NETWORK.presenceSendHz<=20);
  assert.ok(NETWORK.worldSnapshotHz>=10&&NETWORK.worldSnapshotHz<=20);
  assert.ok(NETWORK.bossSnapshotHz<NETWORK.bossSimulationHz);
});

test("mobile world camera zoom keeps HUD coordinates separate", () => {
  assert.equal(cameraZoomFor(390,844,true),.8);
  assert.equal(cameraZoomFor(844,390,true),.8);
  assert.equal(cameraZoomFor(740,360,false),.8);
  assert.equal(cameraZoomFor(1366,768,false),1);
  assert.equal(NETWORK.bossSnapshotHz,12);
});

test("boss defense preserves weapon and +30 enhancement growth without a boss HP cap", () => {
  const first = bossDamageAfterDefense(380, MONSTERS.hornBeast.tier);
  const second = bossDamageAfterDefense(380, MONSTERS.chiefUrk.tier);
  assert.equal(bossArmorForTier(1), 10);
  assert.ok(first.final > 300, `first boss should take meaningful damage, got ${first.final}`);
  assert.ok(second.final > 300, `second boss should take meaningful damage, got ${second.final}`);

  const template = ITEMS.guardianGreatsword;
  const values = [0,5,10,15,20,25,30].map(enhance => {
    const attack = itemFinalStat({ id:"test",catalogId:template.catalogId,name:template.name,slot:"weapon",rarity:"normal",weaponKind:template.weaponKind,baseStat:template.normal,enhance,baseCost:template.baseCost,source:template.source,tier:template.tier });
    return bossDamageAfterDefense(attack, 3).final;
  });
  for (let index=1;index<values.length;index+=1) assert.ok(values[index]>values[index-1], `enhancement damage must rise: ${values}`);
  assert.ok(values.at(-1)>values[0]*20, `+30 must remain dramatically stronger: ${values}`);

  const regionalWeapons=["hornMace","chiefMace","guardianGreatsword","mistDagger","warlordGreatsword","frozenGreatsword","forgeMace","ironKingGreatsword"];
  const regionalBosses=["hornBeast","chiefUrk","mineGuardian","mistWitch","warlord","frozenColossus","forgeLord","ironKing"];
  for(let region=0;region<regionalBosses.length;region+=1){
    const item=ITEMS[regionalWeapons[region]],boss=MONSTERS[regionalBosses[region]];
    const damageAt=[0,5,10,15,20,25,30].map(enhance=>bossDamageAfterDefense(itemFinalStat({id:`tier-${region}`,catalogId:item.catalogId,name:item.name,slot:"weapon",rarity:"normal",weaponKind:item.weaponKind,baseStat:item.normal,enhance,baseCost:item.baseCost,source:item.source,tier:item.tier}),boss.tier).final);
    for(let step=1;step<damageAt.length;step+=1)assert.ok(damageAt[step]>damageAt[step-1],`${boss.id} enhancement curve regressed: ${damageAt}`);
  }
});

test("short landscape layouts keep login, online counter, HUD and controls visible", async () => {
  const [accountCss,gameCss] = await Promise.all([
    import("node:fs/promises").then(fs=>fs.readFile(new URL("../client/src/account.css",import.meta.url),"utf8")),
    import("node:fs/promises").then(fs=>fs.readFile(new URL("../client/src/game.css",import.meta.url),"utf8")),
  ]);
  assert.match(accountCss,/max-height:500px[\s\S]*orientation:landscape/);
  assert.match(accountCss,/\.account-submit\{grid-column:1\/-1/);
  assert.match(gameCss,/max-height:500px[\s\S]*orientation:landscape/);
  assert.match(gameCss,/\.online-counter/);
  assert.match(gameCss,/\.game-shell\{height:100vh;height:100dvh;min-height:0\}/);
});

test("server login ignores legacy empty display names", async () => {
  const source=await import("node:fs/promises").then(fs=>fs.readFile(new URL("../server/src/index.ts",import.meta.url),"utf8"));
  assert.match(source,/const credentialSchema/);
  assert.match(source,/api\/auth\/login[\s\S]*credentialSchema\.safeParse/);
});

test("single active session and participant-only arena seal are wired", async () => {
  const [server,auth,client]=await Promise.all([
    import("node:fs/promises").then(fs=>fs.readFile(new URL("../server/src/index.ts",import.meta.url),"utf8")),
    import("node:fs/promises").then(fs=>fs.readFile(new URL("../server/src/auth.ts",import.meta.url),"utf8")),
    import("node:fs/promises").then(fs=>fs.readFile(new URL("../client/src/components/IronCrownGame.tsx",import.meta.url),"utf8")),
  ]);
  assert.match(server,/active_session_id/);assert.match(server,/session:replaced/);assert.match(auth,/isActiveSession/);
  assert.match(client,/localArenaLockedRef/);assert.match(client,/boss:participation/);assert.match(client,/cameraZoomRef/);
});

test("boss death and respawn paths clear temporary attacks before reset", async () => {
  const source=await import("node:fs/promises").then(fs=>fs.readFile(new URL("../server/src/boss-engine.ts",import.meta.url),"utf8"));
  assert.match(source,/runtime\.effects = \[\]; runtime\.pendingSteps = \[\]/);
  assert.match(source,/now >= runtime\.respawnAt\) \{ resetRuntime\(runtime, now\)/);
  assert.match(source,/compactInPlace\(runtime\.effects/);
});
