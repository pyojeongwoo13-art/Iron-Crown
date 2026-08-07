export type Slot = "weapon" | "shield" | "armor" | "soul";
export type Rarity = "normal" | "legendary" | "soul";
export type WeaponKind = "dagger" | "longsword" | "greatsword" | "mace";
export type AttackStyle = "melee" | "charge" | "slam" | "ranged" | "flank";

export type LegendarySkill = { name: string; multiplier: number; cooldown: number; style: "arc" | "burst" | "line" | "meteor" };
export type Equipment = {
  id: string; catalogId: string; name: string; slot: Slot; rarity: Rarity;
  weaponKind?: WeaponKind; baseStat: number; enhance: number; baseCost: number;
  source: string; tier: number; legendarySkill?: LegendarySkill; reflect?: number;
  moveSpeed?: number; soulText?: string;
};
export type SaveData = {
  version: 2; level: number; xp: number; gold: number; hp: number; currentRegion: string;
  inventory: Equipment[]; equipped: Record<Slot, string | null>; potions: Record<string, number>;
  selectedPotion: string; guards: Record<string, number>;
  stats: { kills: number; bossKills: number; legendaryDrops: number }; updatedAt: number;
};
export type DropEntry = { itemId: string; chance: number; legendChance: number; note?: string };
export type GuaranteedDrop = { itemId: string; weight: number; legendChance: number };
export type MonsterKind = "normal" | "elite" | "boss";
export type MonsterBlueprint = {
  id: string; name: string; regionId: string; kind: MonsterKind; hp: number; attack: number;
  xp: number; gold: [number, number]; radius: number; speed: number; color: string; accent: string;
  respawn: number; shape: string; attackStyle: AttackStyle; windup: number; cooldown: number;
  range: number; drops: DropEntry[]; guaranteed?: GuaranteedDrop[]; rareDrops?: DropEntry[];
};
export type Region = {
  id: string; name: string; english: string; level: number; color: string; accent: string;
  ground: string; dark: string; layout: "meadow" | "forest" | "mine" | "swamp" | "canyon" | "frost" | "volcano" | "fortress";
  description: string; monsters: string[]; bossId: string; potionIds: string[];
};

export const XP_REQUIREMENTS = [
  0,150,200,250,300,400,500,700,900,1100,1300,1500,1800,2100,2500,3000,3500,4000,5000,6000,7000,8000,10000,
  12000,14000,17000,20000,24000,28000,33000,38000,45000,52000,60000,70000,80000,92000,105000,120000,140000,160000,
  190000,220000,250000,290000,330000,380000,440000,500000,580000,670000,770000,900000,1050000,1200000,1400000,
  1600000,1850000,2100000,2400000,2750000,3150000,3600000,4100000,4800000,5500000,6300000,7200000,8200000,9300000,
  10500000,12000000,13500000,15000000,17000000,
];
export const ENHANCE_RATES = [
  [95,5,0,.3],[92,8,0,.28],[88,12,0,.26],[84,15,1,.24],[80,18,2,.22],[75,22,3,.2],[70,26,4,.18],[64,31,5,.16],
  [58,36,6,.14],[52,41,7,.12],[46,46,8,.1],[40,51,9,.09],[35,55,10,.08],[30,59,11,.07],[26,62,12,.06],
  [22,65,13,.05],[19,67,14,.045],[16,69,15,.04],[13,71,16,.035],[11,72,17,.03],[9,73,18,.025],[7.5,73.5,19,.02],
  [6,74,20,.018],[5,74,21,.016],[4,74,22,.014],[3.2,73.8,23,.012],[2.5,73.5,24,.01],[1.8,73.2,25,.008],
  [1.2,72.8,26,.006],[.7,72.3,27,.005],
] as const;
export const WEAPON_MULTIPLIERS = [1,1.05,1.11,1.18,1.26,1.35,1.45,1.57,1.71,1.88,2.1,2.35,2.65,3,3.4,3.9,4.5,5.2,6.1,7.2,8.5,10,12,14.5,18,23,31,45,70,120,220];
export const ARMOR_MULTIPLIERS = [1,1.05,1.1,1.16,1.23,1.3,1.4,1.52,1.66,1.82,2,2.22,2.48,2.78,3.12,3.5,3.95,4.48,5.12,5.95,7,8.25,9.8,11.7,13.8,16,21,29,42,65,100];
export const SHIELD_BONUS = [0,.2,.4,.6,.8,1,1.4,1.8,2.2,2.6,3,3.6,4.2,4.8,5.4,6,6.8,7.6,8.4,9.2,10,11,12,13,14,15,17,19,21,23,25];
export const COST_MULTIPLIERS = [1,1.2,1.5,2,2.7,3.5,4.5,6,8,10,14,18,24,32,42,55,72,95,125,165,220,300,420,600,850,1200,1700,2500,4000,7000];

export type Potion = { id: string; name: string; heal: number; price: number; regionId: string; rank: number };
const P = (id:string,regionId:string,rank:number,heal:number,price:number):Potion => ({id,regionId,rank,heal,price,name:`체력 ${rank}`});
const potionList = [
  P("meadow1","meadow",1,80,20),P("meadow2","meadow",2,180,50),P("meadow3","meadow",3,350,120),
  P("forest1","forest",1,300,120),P("forest2","forest",2,700,300),P("forest3","forest",3,1300,700),
  P("mine1","mine",1,1200,800),P("mine2","mine",2,2800,2000),P("mine3","mine",3,5000,5000),
  P("swamp1","swamp",1,5000,6000),P("swamp2","swamp",2,11000,15000),P("swamp3","swamp",3,20000,35000),
  P("canyon1","canyon",1,18000,40000),P("canyon2","canyon",2,40000,100000),P("canyon3","canyon",3,75000,240000),
  P("frost1","frost",1,70000,300000),P("frost2","frost",2,160000,750000),P("frost3","frost",3,300000,1800000),
  P("volcano1","volcano",1,280000,2000000),P("volcano2","volcano",2,650000,5000000),P("volcano3","volcano",3,1200000,12000000),
  P("fortress1","fortress",1,1100000,15000000),P("fortress2","fortress",2,2500000,40000000),P("fortress3","fortress",3,4500000,100000000),
];
export const POTIONS: Record<string,Potion> = Object.fromEntries(potionList.map(x=>[x.id,x]));
export const GUARDS = {
  low:{id:"low",name:"하급 하락 방지권",price:50000,min:0,max:9},
  mid:{id:"mid",name:"중급 하락 방지권",price:2000000,min:10,max:14},
  high:{id:"high",name:"상급 하락 방지권",price:50000000,min:15,max:19},
  top:{id:"top",name:"최상급 하락 방지권",price:2000000000,min:20,max:24},
  absolute:{id:"absolute",name:"절대 방지권",price:100000000000,min:25,max:29},
} as const;

export type ItemTemplate = {
  catalogId:string; name:string; slot:Slot; weaponKind?:WeaponKind; normal:number; legendary?:number;
  baseCost:number; source:string; tier:number; legendarySkill?:LegendarySkill; legendaryReflect?:number;
  legendaryMove?:number; soulText?:string;
};
type ItemInput = Omit<ItemTemplate,"catalogId"|"baseCost"|"legendarySkill"|"legendaryReflect"|"legendaryMove"> & {
  id:string; skillName?:string; skillMult?:number; skillStyle?:LegendarySkill["style"]; reflect?:number; move?:number; baseCost?:number;
};
const BASE_COSTS=[20,220,2800,26000,220000,1600000,11000000,90000000];
function makeItem(i:ItemInput):ItemTemplate {
  const skill = i.slot==="weapon"&&i.legendary ? {
    name:i.skillName??`${i.name.replace(/ (단검|장검|대검|철퇴)$/,"")}의 각성`,
    multiplier:i.skillMult??2.4+i.tier*.35, cooldown:Math.max(6,10-Math.floor(i.tier/2)),
    style:i.skillStyle??(i.weaponKind==="greatsword"?"line":i.weaponKind==="mace"?"burst":"arc"),
  } satisfies LegendarySkill : undefined;
  return {catalogId:i.id,name:i.name,slot:i.slot,weaponKind:i.weaponKind,normal:i.normal,legendary:i.legendary,
    baseCost:i.baseCost??BASE_COSTS[i.tier-1],source:i.source,tier:i.tier,legendarySkill:skill,
    legendaryReflect:i.slot==="shield"&&i.legendary?(i.reflect??Math.min(35,5+i.tier*4)):undefined,
    legendaryMove:i.slot==="armor"&&i.legendary?(i.move??Math.min(10,2+i.tier)):undefined,soulText:i.soulText};
}
const W=(id:string,name:string,kind:WeaponKind,normal:number,legendary:number,source:string,tier:number,extra:Partial<ItemInput>={})=>makeItem({id,name,slot:"weapon",weaponKind:kind,normal,legendary,source,tier,...extra});
const S=(id:string,name:string,normal:number,legendary:number,source:string,tier:number,extra:Partial<ItemInput>={})=>makeItem({id,name,slot:"shield",normal,legendary,source,tier,...extra});
const A=(id:string,name:string,normal:number,legendary:number,source:string,tier:number,extra:Partial<ItemInput>={})=>makeItem({id,name,slot:"armor",normal,legendary,source,tier,...extra});
const O=(id:string,name:string,source:string,tier:number,soulText:string,stat:number)=>makeItem({id,name,slot:"soul",normal:stat,source,tier,soulText});
const items:ItemTemplate[]=[
  W("starterSword","낡은 장검","longsword",16,20,"모험가 지급품",1,{baseCost:20,skillName:"낡은 검의 투지",skillMult:2.1}),
  O("slimeSoul","점액의 혼","슬라임",1,"최대 HP +5%",5),W("ratDagger","들쥐 단검","dagger",18,23,"들쥐",1,{skillName:"쏜살베기",skillMult:2.4}),
  A("wolfArmor","늑대가죽 갑옷",120,150,"들늑대",1,{move:3}),O("wolfSoul","늑대의 혼","들늑대",1,"이동속도 +5%",5),
  W("goblinSword","고블린 장검","longsword",25,32,"약탈 고블린",1,{skillName:"약탈 베기",skillMult:2.4}),S("goblinShield","고블린 방패",5,7,"약탈 고블린",1,{reflect:7}),
  W("fangDagger","거대 송곳니 단검","dagger",25,32,"정예 거대 들늑대",1,{skillName:"우두머리 난무",skillMult:3.1}),A("alphaArmor","우두머리 갑옷",160,200,"정예 거대 들늑대",1,{move:4}),
  O("alphaSoul","우두머리의 혼","정예 거대 들늑대",1,"공격 피해 +8%",8),W("hornMace","뿔짐승 철퇴","mace",45,56,"초원의 뿔짐승",1,{skillName:"뿔망치 지진",skillMult:3.2,skillStyle:"burst"}),
  S("hornShield","뿔 방패",8,10,"초원의 뿔짐승",1,{reflect:9}),A("beastArmor","야수가죽 갑옷",220,275,"초원의 뿔짐승",1,{move:5}),
  W("greatHorn","대각수","greatsword",65,82,"초원의 뿔짐승 · 극희귀",1,{skillName:"초원 가르기",skillMult:3.5,skillStyle:"line"}),

  W("forestSword","숲 고블린 장검","longsword",85,106,"숲 고블린",2,{skillName:"수풀 가르기"}),S("ironRimShield","철테 방패",10,12,"방패 고블린",2,{reflect:10}),
  A("thornArmor","가시 갑옷",450,560,"가시벌레",2,{move:4}),W("venomDagger","독니 단검","dagger",65,82,"독거미",2,{skillName:"맹독 송곳니"}),O("spiderSoul","거미의 혼","독거미",2,"공격속도 +7%",7),
  A("bearArmor","곰가죽 갑옷",550,690,"숲의 곰",2),W("berserkerGreatsword","광전사의 대검","greatsword",150,188,"정예 고블린 광전사",2,{skillName:"광전 난도질",skillStyle:"line"}),
  S("berserkerShield","광전사의 방패",11,14,"정예 고블린 광전사",2,{reflect:12}),W("chiefMace","족장의 철퇴","mace",170,213,"족장 우르크",2,{skillName:"족장의 포효",skillStyle:"burst"}),
  S("chiefShield","족장의 방패",13,16,"족장 우르크",2,{reflect:14}),A("chiefArmor","족장의 갑옷",750,940,"족장 우르크",2,{move:5}),
  W("greenKingSword","녹림왕의 장검","longsword",220,275,"족장 우르크 · 극희귀",2,{skillName:"숲의 일섬",skillMult:3.8,skillStyle:"line"}),

  O("batSoul","박쥐의 혼","광산 박쥐",3,"대쉬 쿨타임 -10%",10),S("rockShield","암석 방패",15,18,"돌껍질 벌레",3,{reflect:15}),
  W("minerMace","광부 철퇴","mace",480,600,"광부 해골",3,{skillName:"갱도 파열",skillStyle:"burst"}),W("mineThiefDagger","도적 단검","dagger",300,375,"광산 도적",3,{skillName:"그림자 채굴"}),
  A("stoneArmor","석갑",1800,2250,"작은 골렘",3),W("crystalMace","수정 철퇴","mace",600,750,"정예 수정 골렘",3,{skillName:"수정 폭쇄",skillStyle:"burst"}),A("crystalArmor","수정 갑옷",2200,2750,"정예 수정 골렘",3,{move:5}),
  W("guardianGreatsword","수호자의 대검","greatsword",800,1000,"광산의 수호자",3,{skillName:"수호벽 절단",skillStyle:"line"}),S("guardianShield","수호자의 방패",17,20,"광산의 수호자",3,{reflect:17}),
  A("guardianArmor","수호자의 갑옷",2700,3400,"광산의 수호자",3,{move:6}),W("deepCrusher","심층 파쇄자","greatsword",1050,1320,"광산의 수호자 · 극희귀",3,{skillName:"지하단층",skillMult:4.3,skillStyle:"line"}),

  A("crocArmor","악어 갑옷",7000,8800,"늪 악어",4),O("sporeSoul","독포자의 혼","독버섯",4,"피격 시 독구름 방출",8),W("swampSword","늪지 장검","longsword",1400,1750,"늪지 도마뱀",4,{skillName:"늪물결 참격"}),
  W("wraithDagger","망령 단검","dagger",1000,1250,"진흙 망령",4,{skillName:"망령 급습"}),W("predatorDagger","포식자의 단검","dagger",1300,1625,"정예 늪의 포식자",4,{skillName:"포식 연참"}),A("swampArmor","늪 갑옷",8500,10600,"정예 늪의 포식자",4,{move:6}),
  W("mistDagger","독안개 단검","dagger",1600,2000,"독안개 마녀",4,{skillName:"독무월",skillStyle:"burst"}),S("mistShield","안개 방패",20,23,"독안개 마녀",4,{reflect:20}),A("grayArmor","회색 갑옷",11000,13800,"독안개 마녀",4,{move:7}),
  W("grayMoon","회색 달","longsword",2800,3500,"독안개 마녀 · 극희귀",4,{skillName:"월식 베기",skillMult:4,skillStyle:"arc"}),

  O("hyenaSoul","하이에나의 혼","협곡 하이에나",5,"적 HP 30% 이하 피해 +12%",12),W("redSword","붉은 장검","longsword",5500,6900,"붉은 도적",5,{skillName:"붉은 궤적"}),W("banditDagger","협곡 도적 단검","dagger",4000,5000,"투척 도적",5,{skillName:"비도 연격"}),
  S("scorpionShield","전갈 방패",23,26,"바위 전갈",5,{reflect:23}),W("trollMace","트롤 철퇴","mace",7500,9400,"협곡 트롤",5,{skillName:"트롤 대지진",skillStyle:"burst"}),A("trollArmor","트롤 갑옷",28000,35000,"협곡 트롤",5,{move:7}),
  W("redKnightSword","적기사 장검","longsword",6500,8100,"정예 붉은 갑옷 기사",5,{skillName:"적기사 십자참"}),S("redKnightShield","적기사 방패",25,28,"정예 붉은 갑옷 기사",5,{reflect:25}),
  W("warlordGreatsword","전쟁군주 대검","greatsword",10000,12500,"전쟁군주",5,{skillName:"전선 붕괴",skillStyle:"line"}),A("warlordArmor","전쟁군주 갑옷",36000,45000,"전쟁군주",5,{move:8}),S("warlordShield","전쟁군주 방패",27,30,"전쟁군주",5,{reflect:27}),
  W("bloodCrusher","핏빛 분쇄자","mace",13000,16300,"전쟁군주 · 극희귀",5,{skillName:"붉은 충격",skillMult:4.5,skillStyle:"burst"}),

  A("snowArmor","설원 갑옷",110000,138000,"설원 늑대",6,{move:8}),W("iceSword","빙철 장검","longsword",22000,27500,"얼음 해골병",6,{skillName:"빙설 일섬"}),S("iceShield","빙철 방패",29,32,"서리 망령",6,{reflect:29}),O("frostSoul","서리의 혼","서리 망령",6,"공격 적중 시 12% 둔화",12),
  W("iceMace","빙석 철퇴","mace",30000,37500,"얼음 골렘",6,{skillName:"빙산 추락",skillStyle:"meteor"}),W("giantMace","거인의 철퇴","mace",32000,40000,"눈산 거인",6,{skillName:"거신의 발구름",skillStyle:"burst"}),
  W("whiteDagger","백색 단검","dagger",20000,25000,"정예 백색 사냥꾼",6,{skillName:"백야 난무"}),A("whiteArmor","백색 갑옷",130000,163000,"정예 백색 사냥꾼",6,{move:8}),
  W("frozenGreatsword","빙결 대검","greatsword",40000,50000,"빙결의 거수",6,{skillName:"빙벽 절단",skillStyle:"line"}),S("frozenShield","빙결 방패",31,34,"빙결의 거수",6,{reflect:31}),A("frozenArmor","빙결 갑옷",150000,188000,"빙결의 거수",6,{move:9}),
  W("eternalIce","영구빙검","longsword",52000,65000,"빙결의 거수 · 극희귀",6,{skillName:"절대빙결참",skillMult:4.8,skillStyle:"line"}),

  O("emberSoul","불씨의 혼","화염 임프",7,"공격 피해 +12%",12),S("lavaShield","용암 방패",33,36,"용암 게",7,{reflect:32}),W("fireSword","화염 장검","longsword",85000,106000,"불꽃 기사",7,{skillName:"화염 궤적"}),A("flameArmor","불꽃 갑옷",450000,560000,"불꽃 기사",7,{move:9}),
  W("lavaMace","용암 철퇴","mace",115000,144000,"용암 골렘",7,{skillName:"용암 폭발",skillStyle:"burst"}),W("dragonFangGreatsword","용아 대검","greatsword",135000,169000,"어린 화룡",7,{skillName:"화룡 승천",skillStyle:"line"}),
  W("blackflameGreatsword","흑염 대검","greatsword",155000,194000,"정예 검은 화염 기사",7,{skillName:"흑염 참수",skillStyle:"line"}),A("blackflameArmor","흑염 갑옷",520000,650000,"정예 검은 화염 기사",7,{move:9}),
  W("forgeMace","용광 철퇴","mace",170000,213000,"용광로의 군주",7,{skillName:"용광 폭쇄",skillStyle:"meteor"}),S("forgeShield","용광 방패",35,38,"용광로의 군주",7,{reflect:33}),A("forgeArmor","용광 갑옷",600000,750000,"용광로의 군주",7,{move:10}),
  W("sunCrusher","태양 파쇄자","greatsword",220000,275000,"용광로의 군주 · 극희귀",7,{skillName:"태양낙하",skillMult:5.5,skillStyle:"meteor"}),

  W("blackIronSword","흑철 장검","longsword",330000,413000,"검은 갑옷병",8,{skillName:"흑철 단절"}),S("blackIronShield","흑철 방패",37,40,"검은 갑옷병",8,{reflect:34}),
  W("fortressGreatsword","성채 대검","greatsword",470000,588000,"검은 대검병",8,{skillName:"성벽 양단",skillStyle:"line"}),W("royalDagger","왕성 단검","dagger",260000,325000,"성채 암살자",8,{skillName:"왕성 암습"}),
  S("guardianWall","수호철벽",39,42,"성채 수호 골렘",8,{reflect:35}),A("wyvernArmor","와이번 갑옷",1800000,2250000,"검은 와이번",8,{move:10}),O("wyvernSoul","와이번의 혼","검은 와이번",8,"공격속도 +12% · 이동속도 +5%",12),
  W("royalSword","왕실 장검","longsword",380000,475000,"정예 몰락한 왕실기사",8,{skillName:"몰락왕가의 검"}),S("royalShield","왕실 방패",40,43,"정예 몰락한 왕실기사",8,{reflect:35}),A("royalArmor","왕실 갑옷",2000000,2500000,"정예 몰락한 왕실기사",8,{move:10}),
  W("ironKingGreatsword","철왕의 대검","greatsword",550000,688000,"철왕 발테르",8,{skillName:"왕의 단죄",skillMult:5.2,skillStyle:"line"}),S("ironKingShield","철왕의 방패",42,45,"철왕 발테르",8,{reflect:35}),A("ironKingArmor","철왕의 갑옷",2300000,2875000,"철왕 발테르",8,{move:10}),
  W("kingbane","왕멸","greatsword",750000,940000,"철왕 발테르 · 극희귀",8,{skillName:"왕국 붕괴",skillMult:6.5,skillStyle:"burst"}),
];
export const ITEMS:Record<string,ItemTemplate>=Object.fromEntries(items.map(i=>[i.catalogId,i]));

const D=(itemId:string,chance:number,legendChance:number,note?:string):DropEntry=>({itemId,chance,legendChance,note});
const G=(itemId:string,weight:number,legendChance=10):GuaranteedDrop=>({itemId,weight,legendChance});
const GOLDS:Array<[number,number]>=[[5,15],[30,80],[200,500],[1000,3000],[7000,20000],[40000,100000],[250000,700000],[1500000,4000000]];
const COLORS=[["#79d86a","#d9ff9c"],["#3d8b57","#d9c56b"],["#7467a8","#8ce9ff"],["#66745f","#c6e38c"],["#b84e3b","#ffd073"],["#b9e9f4","#6ab8f0"],["#dc542e","#ffcf55"],["#34323f","#c69bff"]] as const;
type MInput=Omit<MonsterBlueprint,"radius"|"speed"|"color"|"accent"|"respawn"|"windup"|"cooldown"|"range"> & {tier:number};
function monster(i:MInput):MonsterBlueprint {
  const [color,accent]=COLORS[i.tier-1],scale=i.kind==="boss"?1.7:i.kind==="elite"?1.28:1;
  return {...i,radius:Math.round(24*scale),speed:Math.round((82+i.tier*2)/Math.sqrt(scale)),color,accent,
    respawn:i.kind==="boss"?45:i.kind==="elite"?28:10,windup:i.kind==="boss"?1.2:i.attackStyle==="ranged"?.9:.72,
    cooldown:i.kind==="boss"?3.8:i.kind==="elite"?3:2.45,range:i.attackStyle==="ranged"?430:i.attackStyle==="charge"?300:i.attackStyle==="slam"?175:95};
}
const M=(id:string,name:string,regionId:string,tier:number,kind:MonsterKind,hp:number,attack:number,xp:number,shape:string,attackStyle:AttackStyle,drops:DropEntry[]=[],guaranteed?:GuaranteedDrop[],rareDrops?:DropEntry[])=>{
  const g=GOLDS[tier-1],gold:[number,number]=kind==="boss"?[g[0]*28,g[1]*30]:kind==="elite"?[g[0]*7,g[1]*8]:g;
  return monster({id,name,regionId,tier,kind,hp,attack,xp,gold,shape,attackStyle,drops,guaranteed,rareDrops});
};
const mobs:MonsterBlueprint[]=[
  M("slime","슬라임","meadow",1,"normal",180,8,20,"slime","melee",[D("slimeSoul",.8,0)]),M("rat","들쥐","meadow",1,"normal",200,9,20,"beast","flank",[D("ratDagger",2.5,5)]),
  M("wolf","들늑대","meadow",1,"normal",240,11,25,"wolf","charge",[D("wolfArmor",2,5),D("wolfSoul",.5,0)]),M("goblin","약탈 고블린","meadow",1,"normal",300,13,30,"goblin","melee",[D("goblinSword",2,5),D("goblinShield",1.5,5)]),
  M("alphaWolf","정예 거대 들늑대","meadow",1,"elite",700,18,90,"wolf","charge",[D("fangDagger",7,7),D("alphaArmor",5,7),D("alphaSoul",1.5,0)]),
  M("hornBeast","초원의 뿔짐승","meadow",1,"boss",1500,28,450,"hornbeast","slam",[],[G("hornMace",40),G("hornShield",35),G("beastArmor",25)],[D("greatHorn",2.5,15,"확정 장비와 별도 판정")]),
  M("forestGoblin","숲 고블린","forest",2,"normal",700,25,70,"goblin","melee",[D("forestSword",1.8,5)]),M("shieldGoblin","방패 고블린","forest",2,"normal",850,28,80,"shield","melee",[D("ironRimShield",1.5,5)]),
  M("thornBug","가시벌레","forest",2,"normal",950,30,90,"bug","charge",[D("thornArmor",1.2,5)]),M("poisonSpider","독거미","forest",2,"normal",1050,34,100,"spider","ranged",[D("venomDagger",1,5),D("spiderSoul",.5,0)]),
  M("forestBear","숲의 곰","forest",2,"normal",1300,40,120,"bear","slam",[D("bearArmor",1,5)]),M("berserkerGoblin","정예 고블린 광전사","forest",2,"elite",2800,55,320,"berserker","charge",[D("berserkerGreatsword",6,7),D("berserkerShield",4,7)]),
  M("chiefUrk","족장 우르크","forest",2,"boss",6000,75,1500,"chief","slam",[],[G("chiefMace",40),G("chiefShield",30),G("chiefArmor",30)],[D("greenKingSword",2,15)]),
  M("mineBat","광산 박쥐","mine",3,"normal",2500,85,220,"bat","flank",[D("batSoul",.5,0)]),M("stoneBug","돌껍질 벌레","mine",3,"normal",3000,95,250,"bug","charge",[D("rockShield",1,5)]),
  M("minerSkeleton","광부 해골","mine",3,"normal",3400,105,280,"skeleton","slam",[D("minerMace",1.2,5)]),M("mineBandit","광산 도적","mine",3,"normal",3800,115,320,"bandit","flank",[D("mineThiefDagger",1,5)]),
  M("smallGolem","작은 골렘","mine",3,"normal",4500,135,360,"golem","slam",[D("stoneArmor",.8,5)]),M("crystalGolem","정예 수정 골렘","mine",3,"elite",10000,180,950,"crystal","slam",[D("crystalMace",5,7),D("crystalArmor",4,7)]),
  M("mineGuardian","광산의 수호자","mine",3,"boss",22000,250,4500,"guardian","slam",[],[G("guardianGreatsword",40),G("guardianShield",35),G("guardianArmor",25)],[D("deepCrusher",2,15)]),
  M("swampSlime","늪 슬라임","swamp",4,"normal",10000,320,700,"slime","melee"),M("swampCroc","늪 악어","swamp",4,"normal",12000,360,800,"croc","charge",[D("crocArmor",.9,5)]),
  M("poisonMushroom","독버섯","swamp",4,"normal",13500,400,900,"mushroom","ranged",[D("sporeSoul",.4,0)]),M("swampLizard","늪지 도마뱀","swamp",4,"normal",15000,450,1000,"lizard","charge",[D("swampSword",.9,5)]),
  M("mudWraith","진흙 망령","swamp",4,"normal",18000,520,1150,"wraith","ranged",[D("wraithDagger",.8,5)]),M("swampPredator","정예 늪의 포식자","swamp",4,"elite",40000,700,3200,"predator","charge",[D("predatorDagger",5,7),D("swampArmor",4,7)]),
  M("mistWitch","독안개 마녀","swamp",4,"boss",85000,950,15000,"witch","ranged",[],[G("mistDagger",40),G("mistShield",35),G("grayArmor",25)],[D("grayMoon",1.8,15)]),
  M("canyonHyena","협곡 하이에나","canyon",5,"normal",40000,1200,2000,"hyena","flank",[D("hyenaSoul",.4,0)]),M("redBandit","붉은 도적","canyon",5,"normal",48000,1350,2300,"bandit","melee",[D("redSword",.8,5)]),
  M("throwBandit","투척 도적","canyon",5,"normal",55000,1500,2600,"bandit","ranged",[D("banditDagger",.7,5)]),M("rockScorpion","바위 전갈","canyon",5,"normal",62000,1700,2900,"scorpion","charge",[D("scorpionShield",.7,5)]),
  M("canyonTroll","협곡 트롤","canyon",5,"normal",72000,2000,3300,"troll","slam",[D("trollMace",.7,5),D("trollArmor",.5,5)]),M("redKnight","정예 붉은 갑옷 기사","canyon",5,"elite",160000,2700,9000,"knight","charge",[D("redKnightSword",4.5,7),D("redKnightShield",3.5,7)]),
  M("warlord","전쟁군주","canyon",5,"boss",350000,3800,45000,"warlord","slam",[],[G("warlordGreatsword",45),G("warlordArmor",30),G("warlordShield",25)],[D("bloodCrusher",1.5,15)]),
  M("snowWolf","설원 늑대","frost",6,"normal",160000,4500,6000,"wolf","charge",[D("snowArmor",.7,5)]),M("iceSkeleton","얼음 해골병","frost",6,"normal",190000,5000,6800,"skeleton","melee",[D("iceSword",.7,5)]),
  M("frostWraith","서리 망령","frost",6,"normal",220000,5600,7600,"wraith","ranged",[D("iceShield",.5,5),D("frostSoul",.3,0)]),M("iceGolem","얼음 골렘","frost",6,"normal",250000,6300,8500,"golem","slam",[D("iceMace",.6,5)]),
  M("snowGiant","눈산 거인","frost",6,"normal",300000,7200,9500,"giant","slam",[D("giantMace",.5,5)]),M("whiteHunter","정예 백색 사냥꾼","frost",6,"elite",650000,9500,26000,"hunter","flank",[D("whiteDagger",4.5,7),D("whiteArmor",3.5,7)]),
  M("frozenColossus","빙결의 거수","frost",6,"boss",1400000,13000,140000,"colossus","slam",[],[G("frozenGreatsword",40),G("frozenShield",35),G("frozenArmor",25)],[D("eternalIce",1.2,15)]),
  M("fireImp","화염 임프","volcano",7,"normal",650000,18000,18000,"imp","ranged",[D("emberSoul",.25,0)]),M("lavaCrab","용암 게","volcano",7,"normal",750000,20000,20000,"crab","melee",[D("lavaShield",.5,5)]),
  M("flameKnight","불꽃 기사","volcano",7,"normal",850000,23000,23000,"knight","charge",[D("fireSword",.5,5),D("flameArmor",.4,5)]),M("lavaGolem","용암 골렘","volcano",7,"normal",950000,26000,26000,"golem","slam",[D("lavaMace",.4,5)]),
  M("youngDragon","어린 화룡","volcano",7,"normal",1100000,30000,30000,"dragon","ranged",[D("dragonFangGreatsword",.35,5)]),M("blackFlameKnight","정예 검은 화염 기사","volcano",7,"elite",2500000,42000,85000,"knight","charge",[D("blackflameGreatsword",4,7),D("blackflameArmor",3.5,7)]),
  M("forgeLord","용광로의 군주","volcano",7,"boss",5500000,58000,400000,"forgeLord","slam",[],[G("forgeMace",40),G("forgeShield",30),G("forgeArmor",30)],[D("sunCrusher",1,15)]),
  M("blackSoldier","검은 갑옷병","fortress",8,"normal",2600000,75000,55000,"knight","melee",[D("blackIronSword",.4,5),D("blackIronShield",.35,5)]),M("blackGreatsword","검은 대검병","fortress",8,"normal",3000000,85000,65000,"berserker","slam",[D("fortressGreatsword",.35,5)]),
  M("fortressAssassin","성채 암살자","fortress",8,"normal",3400000,95000,75000,"assassin","flank",[D("royalDagger",.3,5)]),M("fortressGolem","성채 수호 골렘","fortress",8,"normal",3900000,110000,85000,"guardian","slam",[D("guardianWall",.3,5)]),
  M("blackWyvern","검은 와이번","fortress",8,"normal",4500000,125000,100000,"wyvern","ranged",[D("wyvernArmor",.25,5),D("wyvernSoul",.2,0)]),M("fallenRoyalKnight","정예 몰락한 왕실기사","fortress",8,"elite",10000000,175000,280000,"royalKnight","charge",[D("royalSword",3.5,7),D("royalShield",3,7),D("royalArmor",2.5,7)]),
  M("ironKing","철왕 발테르","fortress",8,"boss",50000000,250000,1200000,"ironKing","slam",[],[G("ironKingGreatsword",40),G("ironKingShield",30),G("ironKingArmor",30)],[D("kingbane",.8,15)]),
];
export const MONSTERS:Record<string,MonsterBlueprint>=Object.fromEntries(mobs.map(m=>[m.id,m]));

export const REGIONS:Region[]=[
  {id:"meadow",name:"푸른 들판",english:"BLUE MEADOW",level:1,color:"#79c975",accent:"#ffe07a",ground:"#78bd68",dark:"#315e3d",layout:"meadow",description:"밝고 넓은 초원과 뿔짐승의 봉인투기장",monsters:["slime","rat","wolf","goblin","alphaWolf","hornBeast"],bossId:"hornBeast",potionIds:["meadow1","meadow2","meadow3"]},
  {id:"forest",name:"깊은 숲",english:"DEEP FOREST",level:7,color:"#315f3b",accent:"#b8db68",ground:"#315f3b",dark:"#142c22",layout:"forest",description:"거목 사이의 좁은 길과 고블린 족장의 야영지",monsters:["forestGoblin","shieldGoblin","thornBug","poisonSpider","forestBear","berserkerGoblin","chiefUrk"],bossId:"chiefUrk",potionIds:["forest1","forest2","forest3"]},
  {id:"mine",name:"메아리 광산",english:"ECHO MINE",level:14,color:"#7164a4",accent:"#62e8ff",ground:"#363347",dark:"#171721",layout:"mine",description:"광차 선로와 빛나는 수정이 이어지는 거대한 동굴",monsters:["mineBat","stoneBug","minerSkeleton","mineBandit","smallGolem","crystalGolem","mineGuardian"],bossId:"mineGuardian",potionIds:["mine1","mine2","mine3"]},
  {id:"swamp",name:"잿빛 늪지",english:"ASHEN SWAMP",level:22,color:"#6b7159",accent:"#b9d96b",ground:"#59624f",dark:"#29312c",layout:"swamp",description:"독안개와 진흙 웅덩이, 썩은 나무다리가 뒤엉킨 늪",monsters:["swampSlime","swampCroc","poisonMushroom","swampLizard","mudWraith","swampPredator","mistWitch"],bossId:"mistWitch",potionIds:["swamp1","swamp2","swamp3"]},
  {id:"canyon",name:"붉은 협곡",english:"RED CANYON",level:31,color:"#aa5542",accent:"#ffd073",ground:"#974936",dark:"#4a2722",layout:"canyon",description:"붉은 절벽과 도적 요새를 가르는 세 갈래 전장",monsters:["canyonHyena","redBandit","throwBandit","rockScorpion","canyonTroll","redKnight","warlord"],bossId:"warlord",potionIds:["canyon1","canyon2","canyon3"]},
  {id:"frost",name:"서리 고원",english:"FROST HIGHLAND",level:41,color:"#a8dce8",accent:"#65c9ff",ground:"#d7edf1",dark:"#6a91a4",layout:"frost",description:"눈보라, 얼음 호수, 얼어붙은 왕국의 폐허",monsters:["snowWolf","iceSkeleton","frostWraith","iceGolem","snowGiant","whiteHunter","frozenColossus"],bossId:"frozenColossus",potionIds:["frost1","frost2","frost3"]},
  {id:"volcano",name:"불타는 산",english:"BURNING MOUNT",level:52,color:"#d65a32",accent:"#ffcf55",ground:"#322d2a",dark:"#171313",layout:"volcano",description:"검은 화산암과 용암 강, 거대한 용광로 제단",monsters:["fireImp","lavaCrab","flameKnight","lavaGolem","youngDragon","blackFlameKnight","forgeLord"],bossId:"forgeLord",potionIds:["volcano1","volcano2","volcano3"]},
  {id:"fortress",name:"검은 성채",english:"BLACK FORTRESS",level:64,color:"#383747",accent:"#c69bff",ground:"#292834",dark:"#101016",layout:"fortress",description:"거대한 성벽, 무너진 왕궁, 철왕의 마지막 왕좌",monsters:["blackSoldier","blackGreatsword","fortressAssassin","fortressGolem","blackWyvern","fallenRoyalKnight","ironKing"],bossId:"ironKing",potionIds:["fortress1","fortress2","fortress3"]},
];
export function regionById(id:string):Region{return REGIONS.find(r=>r.id===id)??REGIONS[0]}
export function createEquipment(catalogId:string,legendary=false):Equipment{
  const t=ITEMS[catalogId]??ITEMS.starterSword,isSoul=t.slot==="soul",rarity:Rarity=isSoul?"soul":legendary?"legendary":"normal";
  return {id:`${t.catalogId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,catalogId:t.catalogId,name:t.name,slot:t.slot,
    weaponKind:t.weaponKind,rarity,enhance:0,baseStat:legendary&&t.legendary?t.legendary:t.normal,baseCost:t.baseCost,source:t.source,tier:t.tier,
    legendarySkill:legendary?t.legendarySkill:undefined,reflect:legendary?t.legendaryReflect:undefined,moveSpeed:legendary?t.legendaryMove:undefined,soulText:t.soulText};
}
export function initialSave():SaveData{
  const sword=createEquipment("starterSword"),potions=Object.fromEntries(Object.keys(POTIONS).map(id=>[id,id==="meadow1"?3:0]));
  return {version:2,level:1,xp:0,gold:80,hp:100,currentRegion:"meadow",inventory:[sword],equipped:{weapon:sword.id,shield:null,armor:null,soul:null},
    potions,selectedPotion:"meadow1",guards:{low:0,mid:0,high:0,top:0,absolute:0},stats:{kills:0,bossKills:0,legendaryDrops:0},updatedAt:Date.now()};
}
export function itemFinalStat(item:Equipment):number{
  const l=Math.max(0,Math.min(30,item.enhance));
  if(item.slot==="weapon")return Math.round(item.baseStat*WEAPON_MULTIPLIERS[l]);
  if(item.slot==="armor")return Math.round(item.baseStat*ARMOR_MULTIPLIERS[l]);
  if(item.slot==="shield")return Math.min(70,item.baseStat+SHIELD_BONUS[l]); return item.baseStat;
}
export function enhanceCost(item:Equipment):number{return Math.max(1,Math.round(item.baseCost*COST_MULTIPLIERS[Math.max(0,Math.min(29,item.enhance))]))}
export function formatNumber(v:number):string{if(v>=1e12)return`${(v/1e12).toFixed(2)}조`;if(v>=1e8)return`${(v/1e8).toFixed(2)}억`;if(v>=1e4)return`${(v/1e4).toFixed(1)}만`;return Math.round(v).toLocaleString("ko-KR")}
export function itemSeed(id:string):number{let h=2166136261;for(const c of id)h=Math.imul(h^c.charCodeAt(0),16777619);return Math.abs(h>>>0)}
