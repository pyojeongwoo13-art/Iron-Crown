import type { PoolClient } from "pg";
import {
  ENHANCE_RATES, GUARDS, ITEMS, MONSTERS, POTIONS, REGIONS, XP_REQUIREMENTS,
  createEquipment, enhanceCost, initialSave, itemFinalStat, type Equipment, type SaveData, type Slot,
} from "../../client/src/game/content.js";

const slots: Slot[] = ["weapon", "shield", "armor", "soul"];
const finite = (value: unknown, fallback: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, typeof value === "number" && Number.isFinite(value) ? value : fallback)));
const equippedItem = (save: SaveData, slot: Slot) => save.inventory.find((item) => item.id === save.equipped[slot]);
const maxHpFor = (save: SaveData) => {
  const armor = equippedItem(save, "armor"), soul = equippedItem(save, "soul");
  return Math.round((100 + (save.level - 1) * 3 + (armor ? itemFinalStat(armor) : 0)) * (soul?.catalogId === "slimeSoul" ? 1.05 : 1));
};

function normalizeItem(raw: unknown): Equipment | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<Equipment>, template = item.catalogId ? ITEMS[item.catalogId] : undefined;
  if (!template || typeof item.id !== "string" || !/^[a-zA-Z0-9-]{6,120}$/.test(item.id)) return null;
  const rarity = template.slot === "soul" ? "soul" : item.rarity === "legendary" ? "legendary" : "normal";
  return {
    id: item.id, catalogId: template.catalogId, name: template.name, slot: template.slot,
    weaponKind: template.weaponKind, rarity, enhance: finite(item.enhance, 0, 0, 30),
    baseStat: rarity === "legendary" && template.legendary ? template.legendary : template.normal,
    baseCost: template.baseCost, source: template.source, tier: template.tier,
    legendarySkill: rarity === "legendary" ? template.legendarySkill : undefined,
    reflect: rarity === "legendary" ? template.legendaryReflect : undefined,
    moveSpeed: rarity === "legendary" ? template.legendaryMove : undefined,
    soulText: template.soulText,
  };
}

export function sanitizeStoredSave(raw: unknown): SaveData {
  const base = initialSave();
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Partial<SaveData>;
  const inventory = Array.isArray(value.inventory) ? value.inventory.slice(0, 220).map(normalizeItem).filter((item): item is Equipment => Boolean(item)) : base.inventory;
  if (!inventory.some((item) => item.slot === "weapon")) inventory.unshift(base.inventory[0]);
  const ids = new Set(inventory.map((item) => item.id));
  const equipped = { ...base.equipped };
  for (const slot of slots) {
    const wanted = value.equipped?.[slot];
    equipped[slot] = typeof wanted === "string" && ids.has(wanted) && inventory.find((item) => item.id === wanted)?.slot === slot ? wanted : inventory.find((item) => item.slot === slot)?.id ?? null;
  }
  const save: SaveData = {
    version: 2,
    level: finite(value.level, 1, 1, 75), xp: finite(value.xp, 0, 0, 20_000_000), gold: finite(value.gold, 80, 0, 1_000_000_000_000_000),
    hp: finite(value.hp, 100, 0, 1_000_000_000_000), currentRegion: REGIONS.some((region) => region.id === value.currentRegion) ? value.currentRegion! : "meadow",
    inventory, equipped,
    potions: Object.fromEntries(Object.keys(POTIONS).map((id) => [id, finite(value.potions?.[id], id === "meadow1" ? 3 : 0, 0, 999_999)])),
    selectedPotion: value.selectedPotion && POTIONS[value.selectedPotion] ? value.selectedPotion : "meadow1",
    guards: Object.fromEntries(Object.keys(GUARDS).map((id) => [id, finite(value.guards?.[id], 0, 0, 9_999)])),
    stats: { kills: finite(value.stats?.kills, 0, 0, 1_000_000_000), bossKills: finite(value.stats?.bossKills, 0, 0, 1_000_000_000), legendaryDrops: finite(value.stats?.legendaryDrops, 0, 0, 1_000_000_000) },
    updatedAt: Date.now(),
  };
  save.hp = Math.min(save.hp, maxHpFor(save));
  return save;
}

export function mergeClientState(current: SaveData, raw: unknown): SaveData {
  if (!raw || typeof raw !== "object") return current;
  const incoming = raw as Partial<SaveData>, next = structuredClone(current);
  next.hp = finite(incoming.hp, current.hp, 0, maxHpFor(current));
  const region = REGIONS.find((candidate) => candidate.id === incoming.currentRegion);
  if (region && current.level >= region.level) next.currentRegion = region.id;
  if (incoming.selectedPotion && POTIONS[incoming.selectedPotion]) next.selectedPotion = incoming.selectedPotion;
  for (const id of Object.keys(POTIONS)) next.potions[id] = Math.min(current.potions[id] ?? 0, finite(incoming.potions?.[id], current.potions[id] ?? 0, 0, 999_999));
  for (const id of Object.keys(GUARDS)) next.guards[id] = Math.min(current.guards[id] ?? 0, finite(incoming.guards?.[id], current.guards[id] ?? 0, 0, 9_999));
  const ids = new Set(current.inventory.map((item) => item.id));
  for (const slot of slots) {
    const wanted = incoming.equipped?.[slot];
    if (typeof wanted === "string" && ids.has(wanted) && current.inventory.find((item) => item.id === wanted)?.slot === slot) next.equipped[slot] = wanted;
  }
  next.updatedAt = Date.now();
  return next;
}

export async function loadSave(client: PoolClient, userId: string, lock = false) {
  const row = await client.query(`SELECT save_json FROM saves WHERE user_id=$1${lock ? " FOR UPDATE" : ""}`, [userId]);
  if (!row.rows[0]) throw new Error("SAVE_NOT_FOUND");
  return sanitizeStoredSave(row.rows[0].save_json);
}

export async function writeSave(client: PoolClient, userId: string, save: SaveData) {
  save.updatedAt = Date.now();
  await client.query("UPDATE saves SET save_json=$2, version=2, updated_at=NOW() WHERE user_id=$1", [userId, JSON.stringify(save)]);
}

function rollItem(catalogId: string, legendChance: number) {
  const legendary = ITEMS[catalogId].slot !== "soul" && Math.random() * 100 < legendChance;
  return createEquipment(catalogId, legendary);
}

export function rewardForKill(save: SaveData, monsterId: string) {
  const monster = MONSTERS[monsterId];
  if (!monster) throw new Error("알 수 없는 몬스터입니다.");
  if (monster.regionId !== save.currentRegion) throw new Error("현재 지역의 몬스터가 아닙니다.");
  const region = REGIONS.find((candidate) => candidate.id === monster.regionId)!;
  if (save.level < region.level) throw new Error("이 지역의 입장 레벨이 부족합니다.");
  const gold = Math.round(monster.gold[0] + Math.random() * (monster.gold[1] - monster.gold[0]));
  const drops: Equipment[] = [];
  monster.drops.forEach((drop) => { if (Math.random() * 100 < drop.chance) drops.push(rollItem(drop.itemId, drop.legendChance)); });
  if (monster.guaranteed?.length) {
    let roll = Math.random() * 100, pick = monster.guaranteed.at(-1)!;
    for (const candidate of monster.guaranteed) { if (roll < candidate.weight) { pick = candidate; break; } roll -= candidate.weight; }
    drops.push(rollItem(pick.itemId, pick.legendChance));
  }
  monster.rareDrops?.forEach((drop) => { if (Math.random() * 100 < drop.chance) drops.push(rollItem(drop.itemId, drop.legendChance)); });
  save.gold += gold; save.xp += monster.xp; save.stats.kills += 1;
  if (monster.kind === "boss") save.stats.bossKills += 1;
  let levels = 0;
  while (save.level < 75 && save.xp >= (XP_REQUIREMENTS[save.level] ?? Infinity)) { save.xp -= XP_REQUIREMENTS[save.level]; save.level += 1; levels += 1; }
  for (const item of drops) { save.inventory.push(item); if (item.rarity === "legendary") save.stats.legendaryDrops += 1; }
  return { gold, xp: monster.xp, levels, drops };
}

export function enhanceOnServer(save: SaveData, itemId: string, useGuard: boolean) {
  const item = save.inventory.find((candidate) => candidate.id === itemId);
  if (!item || item.slot === "soul") throw new Error("강화할 수 없는 장비입니다.");
  if (item.enhance >= 30) throw new Error("이미 최대 강화입니다.");
  const cost = enhanceCost(item);
  if (save.gold < cost) throw new Error("골드가 부족합니다.");
  const guard = Object.values(GUARDS).find((candidate) => item.enhance >= candidate.min && item.enhance <= candidate.max);
  if (useGuard && (!guard || (save.guards[guard.id] ?? 0) < 1)) throw new Error(`${guard?.name ?? "하락 방지권"}이 없습니다.`);
  const before = item.enhance, [success, keep, , greatChance] = ENHANCE_RATES[before], roll = Math.random() * 100;
  let result: "success" | "great" | "keep" | "drop" = "keep", next = before;
  if (roll < success) { result = Math.random() * 100 < greatChance ? "great" : "success"; next = Math.min(30, before + (result === "great" ? 3 : 1)); }
  else if (roll >= success + keep) { result = "drop"; next = useGuard ? before : 0; }
  save.gold -= cost; item.enhance = next;
  if (useGuard && guard) save.guards[guard.id] -= 1;
  const message = result === "great" ? `대성공! +${before} → +${next}` : result === "success" ? `강화 성공! +${next}` : result === "keep" ? `강화 유지 · +${before}` : useGuard ? `하락 방지! +${before} 유지` : `강화 하락 · +${before} → +0`;
  return { result, message };
}

export function buyFromShop(save: SaveData, kind: string, id: string, regionId: string) {
  if (save.currentRegion !== regionId) throw new Error("현재 지역의 상점만 이용할 수 있습니다.");
  if (kind === "potion") {
    const potion = POTIONS[id];
    if (!potion || potion.regionId !== regionId) throw new Error("이 상점에서 판매하지 않는 포션입니다.");
    if (save.gold < potion.price) throw new Error("골드가 부족합니다.");
    save.gold -= potion.price; save.potions[id] = (save.potions[id] ?? 0) + 1; save.selectedPotion = id;
  } else if (kind === "guard") {
    const guard = GUARDS[id as keyof typeof GUARDS];
    if (!guard) throw new Error("알 수 없는 방지권입니다.");
    if (save.gold < guard.price) throw new Error("골드가 부족합니다.");
    save.gold -= guard.price; save.guards[id] = (save.guards[id] ?? 0) + 1;
  } else throw new Error("알 수 없는 상점 요청입니다.");
}
