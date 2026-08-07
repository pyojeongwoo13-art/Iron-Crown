import test from "node:test";
import assert from "node:assert/strict";
import {
  ARMOR_MULTIPLIERS, COST_MULTIPLIERS, ENHANCE_RATES, ITEMS, MONSTERS, POTIONS,
  REGIONS, SHIELD_BONUS, WEAPON_MULTIPLIERS, XP_REQUIREMENTS, initialSave, itemSeed,
} from "../client/src/game/content.ts";

test("complete world content is present and connected", () => {
  assert.equal(REGIONS.length, 8);
  assert.equal(Object.keys(MONSTERS).length, 55);
  assert.equal(Object.keys(ITEMS).length, 97);
  assert.equal(Object.keys(POTIONS).length, 24);
  assert.deepEqual(REGIONS.map((region) => region.level), [1, 7, 14, 22, 31, 41, 52, 64]);
  for (const region of REGIONS) {
    assert.equal(region.potionIds.length, 3);
    assert.ok(region.monsters.includes(region.bossId));
    for (const monsterId of region.monsters) assert.equal(MONSTERS[monsterId].regionId, region.id);
  }
});

test("all drops resolve and boss guaranteed weights total 100 percent", () => {
  for (const monster of Object.values(MONSTERS)) {
    for (const drop of [...monster.drops, ...(monster.rareDrops ?? []), ...(monster.guaranteed ?? [])]) assert.ok(ITEMS[drop.itemId], `${monster.id} references missing ${drop.itemId}`);
    if (monster.kind === "boss") {
      assert.equal(monster.guaranteed?.reduce((sum, drop) => sum + drop.weight, 0), 100);
      assert.ok(monster.rareDrops?.length);
    }
  }
});

test("legendary gear has required powers and stable unique appearance seeds", () => {
  for (const item of Object.values(ITEMS)) {
    if (!item.legendary) continue;
    if (item.slot === "weapon") assert.ok(item.legendarySkill, `${item.catalogId} has no active skill`);
    if (item.slot === "shield") assert.ok(item.legendaryReflect, `${item.catalogId} has no reflect`);
    if (item.slot === "armor") assert.ok(item.legendaryMove, `${item.catalogId} has no move bonus`);
  }
  const seeds = Object.keys(ITEMS).map(itemSeed);
  assert.equal(new Set(seeds).size, seeds.length);
});

test("enhancement and level progression preserve the complete design", () => {
  assert.equal(ENHANCE_RATES.length, 30);
  for (const [success, keep, drop] of ENHANCE_RATES) assert.equal(success + keep + drop, 100);
  assert.equal(WEAPON_MULTIPLIERS.length, 31);
  assert.equal(WEAPON_MULTIPLIERS[30], 220);
  assert.equal(ARMOR_MULTIPLIERS[30], 100);
  assert.equal(SHIELD_BONUS[30], 25);
  assert.equal(COST_MULTIPLIERS[29], 7000);
  assert.equal(XP_REQUIREMENTS[74], 17_000_000);
  const save = initialSave();
  assert.equal(save.level, 1); assert.equal(save.currentRegion, "meadow"); assert.equal(Object.keys(save.potions).length, 24);
});
