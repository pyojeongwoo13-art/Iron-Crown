import test from "node:test";
import assert from "node:assert/strict";
import { createEquipment, initialSave } from "../client/src/game/content.ts";
import { buyFromShop, deleteItemFromSave, enhanceOnServer, mergeClientState, rewardForKill } from "../server/dist/server/src/game.js";

test("normal save sync cannot invent gold, XP, levels, items, or enhancements", () => {
  const current = initialSave(), starter = current.inventory[0];
  const forged = structuredClone(current);
  forged.gold = 999_999_999; forged.xp = 9_000_000; forged.level = 75; forged.stats.kills = 999_999; forged.hp = 999_999_999;
  forged.inventory[0].enhance = 30;
  forged.inventory.push({ ...starter, id: "forged-item-id", catalogId: "kingbane", name: "왕멸", tier: 8, baseStat: 940000 });
  const merged = mergeClientState(current, forged);
  assert.equal(merged.gold, current.gold); assert.equal(merged.xp, current.xp); assert.equal(merged.level, current.level);
  assert.equal(merged.stats.kills, current.stats.kills); assert.equal(merged.inventory.length, current.inventory.length); assert.equal(merged.inventory[0].enhance, 0); assert.equal(merged.hp, 100);
});

test("server kill reward grants boss equipment and progression", () => {
  const save = initialSave(), before = save.inventory.length;
  const reward = rewardForKill(save, "hornBeast");
  assert.ok(reward.gold >= 140 && reward.gold <= 450);
  assert.equal(reward.xp, 450); assert.ok(reward.drops.length >= 1); assert.ok(save.inventory.length > before);
  assert.equal(save.stats.kills, 1); assert.equal(save.stats.bossKills, 1);
});

test("enhancement random roll happens on the server", () => {
  const save = initialSave(); save.gold = 1_000_000;
  const originalRandom = Math.random; Math.random = () => 0;
  try {
    const outcome = enhanceOnServer(save, save.inventory[0].id, false);
    assert.equal(outcome.result, "great"); assert.equal(save.inventory[0].enhance, 3); assert.ok(save.gold < 1_000_000);
  } finally { Math.random = originalRandom; }
});

test("shop validates current region and subtracts server gold", () => {
  const save = initialSave(), before = save.gold;
  buyFromShop(save, "potion", "meadow1", "meadow");
  assert.equal(save.gold, before - 20); assert.equal(save.potions.meadow1, 4);
  assert.throws(() => buyFromShop(save, "potion", "forest1", "meadow"), /판매하지 않는/);
});

test("server-authoritative item deletion protects equipped and final weapons", () => {
  const save=initialSave(),starter=save.inventory[0],gold=save.gold;
  const normal=createEquipment("hornMace",false),legendary=createEquipment("hornMace",true),enhanced={...createEquipment("hornMace",false),enhance:20};
  save.inventory.push(normal,legendary,enhanced);
  assert.throws(()=>deleteItemFromSave(save,starter.id),/장착 중/);
  assert.equal(deleteItemFromSave(save,normal.id).id,normal.id);
  assert.equal(deleteItemFromSave(save,legendary.id).rarity,"legendary");
  assert.equal(deleteItemFromSave(save,enhanced.id).enhance,20);
  assert.equal(save.gold,gold);assert.throws(()=>deleteItemFromSave(save,normal.id),/존재하지 않는/);
  save.equipped.weapon=null;assert.throws(()=>deleteItemFromSave(save,starter.id),/마지막 무기/);
  assert.equal(save.inventory.length,1);
});
