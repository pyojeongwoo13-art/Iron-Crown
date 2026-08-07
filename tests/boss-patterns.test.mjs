import test from "node:test";
import assert from "node:assert/strict";
import { BOSS_DEFINITIONS, BOSS_XP, bossPhase, patternsFor } from "../client/src/game/bosses.ts";
import { MONSTERS, REGIONS } from "../client/src/game/content.ts";

const expectedXp = {
  hornBeast: 450, chiefUrk: 1_500, mineGuardian: 4_500, mistWitch: 15_000,
  warlord: 45_000, frozenColossus: 140_000, forgeLord: 400_000, ironKing: 1_200_000,
};

test("every regional boss has its own complete pattern and phase set", () => {
  assert.deepEqual(Object.keys(BOSS_DEFINITIONS).sort(), REGIONS.map((region) => region.bossId).sort());
  for (const region of REGIONS) {
    const boss = BOSS_DEFINITIONS[region.bossId];
    assert.ok(boss.patterns.length >= 3, `${boss.id} needs at least three patterns`);
    assert.ok(boss.phases.length >= 2, `${boss.id} needs phase changes`);
    assert.equal(new Set(boss.patterns.map((pattern) => pattern.id)).size, boss.patterns.length);
    for (let phase = 1; phase <= boss.phases.length; phase += 1) assert.ok(patternsFor(boss.id, phase).length, `${boss.id} phase ${phase} has no pattern`);
    for (const pattern of boss.patterns) {
      assert.ok(pattern.recovery >= 900, `${pattern.id} must leave a punish window`);
      assert.ok(pattern.steps.length >= 1);
      for (const step of pattern.steps) {
        assert.ok(step.windup >= 390 && step.windup <= 1_400, `${pattern.id}/${step.name} windup is unfair`);
        assert.ok(step.damage > 0 && step.damage <= 1.2, `${pattern.id}/${step.name} damage multiplier is excessive`);
        assert.ok(["circle", "ring", "cone", "line"].includes(step.shape));
      }
    }
  }
});

test("difficulty grows through chained patterns without changing dash rules", () => {
  const chainCounts = REGIONS.map((region) => Math.max(...BOSS_DEFINITIONS[region.bossId].patterns.map((pattern) => pattern.steps.length)));
  assert.ok(chainCounts[0] >= 3);
  assert.ok(chainCounts[7] >= 4);
  assert.ok(BOSS_DEFINITIONS.ironKing.phases.length === 3);
  assert.ok(BOSS_DEFINITIONS.ironKing.patterns.filter((pattern) => pattern.phases.includes(3)).length >= 3);
});

test("boss phase thresholds and XP values match the update specification", () => {
  assert.deepEqual(BOSS_XP, expectedXp);
  for (const [id, xp] of Object.entries(expectedXp)) assert.equal(MONSTERS[id].xp, xp);
  assert.equal(bossPhase("hornBeast", .51), 1); assert.equal(bossPhase("hornBeast", .5), 2);
  assert.equal(bossPhase("ironKing", .66), 1); assert.equal(bossPhase("ironKing", .65), 2); assert.equal(bossPhase("ironKing", .25), 3);
});

test("persistent hazards and generated objects are explicitly bounded", () => {
  for (const boss of Object.values(BOSS_DEFINITIONS)) for (const pattern of boss.patterns) for (const step of pattern.steps) {
    assert.ok((step.count ?? 1) <= 7, `${pattern.id} spawns too many objects`);
    assert.ok((step.persistent ?? 0) <= 9_000, `${pattern.id} hazard lasts too long`);
    if (step.persistent) assert.ok((step.repeat ?? 0) >= 400, `${pattern.id} repeats too quickly`);
  }
});
