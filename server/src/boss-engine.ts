import { randomUUID } from "node:crypto";
import type { Server } from "socket.io";
import { BOSS_DEFINITIONS, bossPhase, patternsFor, type BossPattern, type BossStep, type BossShape } from "../../client/src/game/bosses.js";
import { MONSTERS, REGIONS } from "../../client/src/game/content.js";

const ARENA = { x: 3570, y: 650, w: 820, h: 1100 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export type BossPresence = {
  socketId: string;
  userId: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  region: string;
  updatedAt: number;
};

export type BossEffect = {
  id: string;
  bossId: string;
  patternId: string;
  patternName: string;
  name: string;
  element: string;
  cue: string;
  shape: BossShape;
  x: number;
  y: number;
  sourceX: number;
  sourceY: number;
  angle: number;
  radius: number;
  innerRadius: number;
  range: number;
  width: number;
  arc: number;
  damage: number;
  warnAt: number;
  resolveAt: number;
  expiresAt: number;
  repeat: number;
  move: string;
  resolved: boolean;
  nextHitAt: number;
  hitCycle: number;
  hitKeys: Set<string>;
};

type BossRuntime = {
  regionId: string;
  bossId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  phase: number;
  alive: boolean;
  engaged: boolean;
  respawnAt: number;
  targetId: string | null;
  retargetAt: number;
  nextPatternAt: number;
  patternUntil: number;
  patternId: string | null;
  patternName: string | null;
  recentPatterns: string[];
  vulnerableUntil: number;
  armor: number;
  armorMax: number;
  contributors: Map<string, string>;
  effects: BossEffect[];
  pendingSteps: Array<{ at: number; pattern: BossPattern; step: BossStep }>;
  phaseSpecials: Set<string>;
};

export type BossSnapshot = {
  regionId: string;
  bossId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  phase: number;
  alive: boolean;
  engaged: boolean;
  respawnAt: number;
  targetId: string | null;
  patternId: string | null;
  patternName: string | null;
  vulnerableUntil: number;
  armor: number;
  armorMax: number;
  serverNow: number;
};

type EngineOptions = {
  io: Server;
  getPresence: () => BossPresence[];
  onDefeat: (bossId: string, contributors: Array<{ userId: string; socketId: string }>) => Promise<void>;
};

function makeRuntime(regionId: string, bossId: string): BossRuntime {
  const monster = MONSTERS[bossId];
  const armorMax = bossId === "mineGuardian" ? monster.hp * .22 : 0;
  return {
    regionId, bossId, x: ARENA.x + ARENA.w * .55, y: ARENA.y + ARENA.h * .52,
    hp: monster.hp, maxHp: monster.hp, phase: 1, alive: true, engaged: false, respawnAt: 0,
    targetId: null, retargetAt: 0, nextPatternAt: 0, patternUntil: 0, patternId: null, patternName: null,
    recentPatterns: [], vulnerableUntil: 0, armor: 0, armorMax, contributors: new Map(), effects: [], pendingSteps: [], phaseSpecials: new Set(),
  };
}

function insideArena(player: BossPresence) {
  return player.x > ARENA.x + 42 && player.x < ARENA.x + ARENA.w - 42 && player.y > ARENA.y + 42 && player.y < ARENA.y + ARENA.h - 42;
}

function snapshot(runtime: BossRuntime): BossSnapshot {
  return {
    regionId: runtime.regionId, bossId: runtime.bossId, x: runtime.x, y: runtime.y,
    hp: runtime.hp, maxHp: runtime.maxHp, phase: runtime.phase, alive: runtime.alive,
    engaged: runtime.engaged, respawnAt: runtime.respawnAt, targetId: runtime.targetId,
    patternId: runtime.patternId, patternName: runtime.patternName, vulnerableUntil: runtime.vulnerableUntil,
    armor: runtime.armor, armorMax: runtime.armorMax, serverNow: Date.now(),
  };
}

function effectHits(effect: BossEffect, player: BossPresence) {
  const dx = player.x - effect.x, dy = player.y - effect.y, d = Math.hypot(dx, dy);
  if (effect.shape === "circle") return d <= effect.radius + 19;
  if (effect.shape === "ring") return d >= Math.max(0, effect.innerRadius - 19) && d <= effect.radius + 19;
  if (effect.shape === "cone") return d <= effect.range + 19 && Math.abs(angleDelta(Math.atan2(dy, dx), effect.angle)) <= effect.arc / 2;
  const along = dx * Math.cos(effect.angle) + dy * Math.sin(effect.angle);
  const across = Math.abs(-dx * Math.sin(effect.angle) + dy * Math.cos(effect.angle));
  return along >= -19 && along <= effect.range + 19 && across <= effect.width / 2 + 19;
}

function weightedPick(patterns: BossPattern[], recent: string[]) {
  const weighted = patterns.map((pattern) => ({ pattern, weight: (pattern.weight ?? 1) * (recent.includes(pattern.id) ? .28 : 1) }));
  let roll = Math.random() * weighted.reduce((sum, item) => sum + item.weight, 0);
  for (const item of weighted) { roll -= item.weight; if (roll <= 0) return item.pattern; }
  return weighted.at(-1)!.pattern;
}

export function createBossEngine({ io, getPresence, onDefeat }: EngineOptions) {
  const runtimes = new Map(REGIONS.map((region) => [region.id, makeRuntime(region.id, region.bossId)]));
  const damageThrottle = new Map<string, number>();

  const playersFor = (runtime: BossRuntime) => getPresence().filter((player) => player.region === runtime.regionId && player.hp > 0 && Date.now() - player.updatedAt < 2_000 && insideArena(player));
  const targetFor = (runtime: BossRuntime) => getPresence().find((player) => player.socketId === runtime.targetId) ?? null;

  function chooseTarget(runtime: BossRuntime, now: number) {
    const players = playersFor(runtime);
    if (!players.length) { runtime.targetId = null; return null; }
    const current = targetFor(runtime);
    if (current && now < runtime.retargetAt && insideArena(current)) return current;
    const sorted = players.sort((a, b) => distance(a, runtime) - distance(b, runtime));
    const pool = sorted.slice(0, Math.min(3, sorted.length));
    const next = pool[Math.floor(Math.random() * pool.length)];
    runtime.targetId = next.socketId;
    runtime.retargetAt = now + 3_200 + Math.random() * 1_800;
    return next;
  }

  function aimFor(runtime: BossRuntime, target: BossPresence, step: BossStep) {
    const speed = Math.hypot(target.vx, target.vy), lead = step.aim === "predicted" ? clamp(step.windup / 1000 * .52, .18, .52) : 0;
    let x = target.x + target.vx * lead, y = target.y + target.vy * lead;
    if (step.aim === "boss") { x = runtime.x; y = runtime.y; }
    if (step.aim === "arena") { x = ARENA.x + ARENA.w / 2; y = ARENA.y + ARENA.h / 2; }
    if (step.aim === "behindTarget") {
      const movementAngle = speed > 25 ? Math.atan2(target.vy, target.vx) : Math.atan2(target.y - runtime.y, target.x - runtime.x);
      x = target.x - Math.cos(movementAngle) * 120; y = target.y - Math.sin(movementAngle) * 120;
    }
    return { x: clamp(x, ARENA.x + 80, ARENA.x + ARENA.w - 80), y: clamp(y, ARENA.y + 80, ARENA.y + ARENA.h - 80) };
  }

  function expandStep(runtime: BossRuntime, target: BossPresence, pattern: BossPattern, step: BossStep, startAt: number) {
    const aim = aimFor(runtime, target, step), baseAngle = Math.atan2(aim.y - runtime.y, aim.x - runtime.x) + (step.offset ?? 0);
    const count = clamp(step.count ?? 1, 1, 7), effects: BossEffect[] = [];
    for (let index = 0; index < count; index += 1) {
      const centered = index - (count - 1) / 2, positionalSpread = (step.spread ?? 0) > 2, angularOffset = positionalSpread ? 0 : centered * (step.spread ?? 0);
      let x = step.shape === "line" || step.shape === "cone" ? runtime.x : aim.x;
      let y = step.shape === "line" || step.shape === "cone" ? runtime.y : aim.y;
      if (positionalSpread) {
        const spacing = Number(step.spread) / Math.max(1, count - 1), fan = baseAngle + Math.PI / 2;
        x += Math.cos(fan) * centered * spacing + Math.cos(baseAngle) * Math.abs(centered) * 28;
        y += Math.sin(fan) * centered * spacing + Math.sin(baseAngle) * Math.abs(centered) * 28;
      }
      const warnAt = startAt + step.at, resolveAt = warnAt + step.windup, persistent = step.persistent ?? 0;
      effects.push({
        id: randomUUID(), bossId: runtime.bossId, patternId: pattern.id, patternName: pattern.name, name: step.name,
        element: BOSS_DEFINITIONS[runtime.bossId].element, cue: step.cue ?? BOSS_DEFINITIONS[runtime.bossId].element,
        shape: step.shape, x, y, sourceX: runtime.x, sourceY: runtime.y, angle: baseAngle + angularOffset,
        radius: step.radius ?? 0, innerRadius: step.innerRadius ?? 0, range: step.range ?? 0, width: step.width ?? 0, arc: step.arc ?? 0,
        damage: Math.max(1, Math.round(MONSTERS[runtime.bossId].attack * step.damage)), warnAt, resolveAt,
        expiresAt: resolveAt + Math.max(260, persistent), repeat: step.repeat ?? 0, move: step.move ?? "none",
        resolved: false, nextHitAt: resolveAt, hitCycle: 0, hitKeys: new Set(),
      });
    }
    return effects;
  }

  function startPattern(runtime: BossRuntime, target: BossPresence, now: number) {
    const d = distance(runtime, target);
    const available = patternsFor(runtime.bossId, runtime.phase).filter((pattern) => pattern.id !== "urk-goblins");
    let choices = available.filter((pattern) => (pattern.minDistance ?? 0) <= d && d <= (pattern.maxDistance ?? Infinity));
    if (!choices.length) choices = available;
    const pattern = weightedPick(choices, runtime.recentPatterns);
    launchPattern(runtime, target, pattern, now);
  }

  function launchPattern(runtime: BossRuntime, target: BossPresence, pattern: BossPattern, now: number) {
    runtime.patternId = pattern.id; runtime.patternName = pattern.name;
    runtime.recentPatterns = [pattern.id, ...runtime.recentPatterns].slice(0, 2);
    const lastStep = Math.max(...pattern.steps.map((item) => item.at + item.windup));
    runtime.patternUntil = now + lastStep;
    runtime.nextPatternAt = runtime.patternUntil + pattern.recovery;
    if (pattern.exposes) runtime.vulnerableUntil = runtime.nextPatternAt + pattern.exposes;
    runtime.pendingSteps.push(...pattern.steps.map((item) => ({ at: now + item.at, pattern, step: item })));
    flushPendingSteps(runtime, target, now);
  }

  function flushPendingSteps(runtime: BossRuntime, target: BossPresence, now: number) {
    const due = runtime.pendingSteps.filter((item) => item.at <= now), future = runtime.pendingSteps.filter((item) => item.at > now);
    runtime.pendingSteps = future;
    for (const item of due) {
      const effects = expandStep(runtime, target, item.pattern, item.step, item.at - item.step.at);
      runtime.effects.push(...effects);
      io.to(`region:${runtime.regionId}`).emit("boss:pattern", { boss: snapshot(runtime), effects: effects.map(({ hitKeys: _hitKeys, ...effect }) => effect) });
    }
  }

  function resetRuntime(runtime: BossRuntime, now: number) {
    const fresh = makeRuntime(runtime.regionId, runtime.bossId);
    Object.assign(runtime, fresh, { nextPatternAt: now + 1_400 });
  }

  function tickRuntime(runtime: BossRuntime, now: number, dt: number) {
    if (!runtime.alive) {
      if (now >= runtime.respawnAt) resetRuntime(runtime, now);
      return;
    }
    const players = playersFor(runtime);
    if (!players.length) {
      runtime.engaged = false; runtime.targetId = null; runtime.patternId = null; runtime.patternName = null; runtime.effects = []; runtime.pendingSteps = [];
      const home = { x: ARENA.x + ARENA.w * .55, y: ARENA.y + ARENA.h * .52 };
      runtime.x += (home.x - runtime.x) * Math.min(1, dt * 2); runtime.y += (home.y - runtime.y) * Math.min(1, dt * 2);
      return;
    }
    runtime.engaged = true;
    const target = chooseTarget(runtime, now);
    if (!target) return;
    const nextPhase = bossPhase(runtime.bossId, runtime.hp / runtime.maxHp);
    if (nextPhase !== runtime.phase) {
      runtime.phase = nextPhase; runtime.effects = []; runtime.pendingSteps = []; runtime.patternUntil = 0; runtime.nextPatternAt = now + 1_100;
      if (runtime.bossId === "mineGuardian" && nextPhase >= 2 && runtime.armor <= 0) runtime.armor = runtime.armorMax;
      io.to(`region:${runtime.regionId}`).emit("boss:phase", snapshot(runtime));
      if (runtime.bossId === "chiefUrk" && [2,3].includes(nextPhase)) {
        const specialKey = `urk-goblins:${nextPhase}`, support = BOSS_DEFINITIONS.chiefUrk.patterns.find((pattern) => pattern.id === "urk-goblins");
        if (support && !runtime.phaseSpecials.has(specialKey)) { runtime.phaseSpecials.add(specialKey); launchPattern(runtime, target, support, now + 450); }
      }
    }
    if (now >= runtime.patternUntil && now < runtime.nextPatternAt) { runtime.patternId = null; runtime.patternName = null; }
    if (now >= runtime.nextPatternAt) startPattern(runtime, target, now);
    flushPendingSteps(runtime, target, now);
    if (now >= runtime.patternUntil) {
      const definition = BOSS_DEFINITIONS[runtime.bossId], desired = definition.preferredDistance, d = distance(runtime, target);
      if (Math.abs(d - desired) > 34) {
        const direction = Math.atan2(target.y - runtime.y, target.x - runtime.x) + (d < desired ? Math.PI : 0);
        const speed = MONSTERS[runtime.bossId].speed * (runtime.phase >= 3 ? 1.1 : .88);
        runtime.x = clamp(runtime.x + Math.cos(direction) * speed * dt, ARENA.x + 70, ARENA.x + ARENA.w - 70);
        runtime.y = clamp(runtime.y + Math.sin(direction) * speed * dt, ARENA.y + 70, ARENA.y + ARENA.h - 70);
      }
    }

    for (const effect of runtime.effects) {
      if (!effect.resolved && now >= effect.resolveAt) {
        effect.resolved = true;
        if (effect.move !== "none") {
          const destinationX = effect.shape === "line" ? effect.x + Math.cos(effect.angle) * Math.min(effect.range, 520) : effect.x;
          const destinationY = effect.shape === "line" ? effect.y + Math.sin(effect.angle) * Math.min(effect.range, 520) : effect.y;
          runtime.x = clamp(destinationX, ARENA.x + 70, ARENA.x + ARENA.w - 70);
          runtime.y = clamp(destinationY, ARENA.y + 70, ARENA.y + ARENA.h - 70);
        }
      }
      while (now >= effect.nextHitAt && effect.nextHitAt <= effect.expiresAt) {
        for (const player of players) {
          const hitKey = `${player.socketId}:${effect.hitCycle}`;
          if (!effect.hitKeys.has(hitKey) && effectHits(effect, player)) {
            effect.hitKeys.add(hitKey);
            io.to(player.socketId).emit("boss:hit", { effectId: effect.id, bossId: runtime.bossId, damage: effect.damage, cue: effect.cue });
          }
        }
        effect.hitCycle += 1;
        effect.nextHitAt += effect.repeat > 0 ? effect.repeat : Math.max(1_000_000, effect.expiresAt - effect.resolveAt + 1);
      }
    }
    runtime.effects = runtime.effects.filter((effect) => now <= effect.expiresAt + 350).slice(-80);
  }

  async function defeat(runtime: BossRuntime, now: number) {
    runtime.hp = 0; runtime.alive = false; runtime.engaged = false; runtime.effects = []; runtime.pendingSteps = []; runtime.patternId = null; runtime.patternName = null;
    runtime.respawnAt = now + MONSTERS[runtime.bossId].respawn * 1000;
    const contributors = [...runtime.contributors].map(([userId, socketId]) => ({ userId, socketId }));
    io.to(`region:${runtime.regionId}`).emit("boss:defeated", snapshot(runtime));
    try { await onDefeat(runtime.bossId, contributors); } catch (error) { console.error("boss reward failed", error); }
  }

  function damage(socketId: string, raw: unknown) {
    if (!raw || typeof raw !== "object") return;
    const body = raw as Record<string, unknown>, regionId = typeof body.regionId === "string" ? body.regionId : "", runtime = runtimes.get(regionId);
    const player = getPresence().find((item) => item.socketId === socketId);
    if (!runtime || !player || player.region !== regionId || !insideArena(player) || !runtime.alive || !runtime.engaged) return;
    const now = Date.now(), throttleKey = `${socketId}:${runtime.bossId}`;
    if (now - (damageThrottle.get(throttleKey) ?? 0) < 105) return;
    damageThrottle.set(throttleKey, now);
    const requested = typeof body.damage === "number" && Number.isFinite(body.damage) ? Math.max(1, body.damage) : 1;
    let amount = Math.min(requested, runtime.maxHp * .025);
    if (runtime.bossId === "mineGuardian" && runtime.phase >= 2 && runtime.armor > 0) {
      const armorDamage = Math.min(runtime.armor, amount); runtime.armor -= armorDamage; amount *= .38;
      if (runtime.armor <= 0) runtime.vulnerableUntil = now + 3_000;
    }
    if (now < runtime.vulnerableUntil) amount *= runtime.bossId === "forgeLord" ? 1.35 : 1.22;
    if (runtime.bossId === "frozenColossus" && runtime.phase >= 3) amount *= 1.18;
    runtime.hp = Math.max(0, runtime.hp - Math.round(amount));
    runtime.contributors.set(player.userId, socketId);
    io.to(`region:${regionId}`).emit("boss:damage", { bossId: runtime.bossId, hp: runtime.hp, amount: Math.round(amount), by: socketId });
    if (runtime.hp <= 0) void defeat(runtime, now);
  }

  function engage(socketId: string, regionId: string) {
    const runtime = runtimes.get(regionId), player = getPresence().find((item) => item.socketId === socketId);
    if (!runtime || !player || player.region !== regionId || !insideArena(player) || !runtime.alive) return;
    runtime.engaged = true; runtime.targetId ??= socketId;
    if (!runtime.nextPatternAt) runtime.nextPatternAt = Date.now() + 1_350;
    io.to(socketId).emit("boss:state", snapshot(runtime));
  }

  function joinRegion(socketId: string, previous: string | null, regionId: string) {
    const socket = io.sockets.sockets.get(socketId); if (!socket) return;
    if (previous) void socket.leave(`region:${previous}`);
    void socket.join(`region:${regionId}`);
    const runtime = runtimes.get(regionId); if (runtime) io.to(socketId).emit("boss:state", snapshot(runtime));
  }

  let last = Date.now(), broadcastAt = 0;
  const timer = setInterval(() => {
    const now = Date.now(), dt = Math.min(.08, (now - last) / 1000); last = now;
    for (const runtime of runtimes.values()) tickRuntime(runtime, now, dt);
    if (now >= broadcastAt) {
      broadcastAt = now + 100;
      for (const runtime of runtimes.values()) io.to(`region:${runtime.regionId}`).emit("boss:state", snapshot(runtime));
    }
  }, 50);

  return { damage, engage, joinRegion, stop: () => clearInterval(timer), snapshotFor: (regionId: string) => { const runtime = runtimes.get(regionId); return runtime ? snapshot(runtime) : null; } };
}
