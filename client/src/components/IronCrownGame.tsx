"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  ENHANCE_RATES, GUARDS, ITEMS, MONSTERS, POTIONS, REGIONS, XP_REQUIREMENTS,
  createEquipment, enhanceCost, formatNumber, initialSave, itemFinalStat, itemSeed, regionById,
  type Equipment, type MonsterBlueprint, type Region, type SaveData, type Slot, type WeaponKind,
} from "../game/content";

type Vec={x:number;y:number};
type MobState="idle"|"chase"|"windup"|"charge"|"recover";
type Mob={
  uid:string;type:string;x:number;y:number;homeX:number;homeY:number;hp:number;alive:boolean;
  respawnAt:number;state:MobState;stateUntil:number;cooldownUntil:number;targetX:number;targetY:number;
  hitDone:boolean;flashUntil:number;facing:number;aggro:boolean;aggroUntil:number;
  attackMode:"melee"|"charge"|"slam"|"ranged";wanderAngle:number;wanderUntil:number;phase:number;
};
type Particle={x:number;y:number;vx:number;vy:number;life:number;max:number;color:string;size:number;ring?:boolean};
type FloatText={x:number;y:number;text:string;color:string;life:number;size:number};
type Slash={x:number;y:number;angle:number;radius:number;color:string;life:number;max:number;wide?:boolean;full?:boolean};
type Projectile={x:number;y:number;vx:number;vy:number;radius:number;damage:number;color:string;life:number;source:string};
type OtherPlayer={id:string;name:string;x:number;y:number;hp:number;maxHp:number;weapon:string;region:string;updatedAt:number};
type ServerReward={gold:number;xp:number;levels:number;drops:Equipment[]};
type Panel=null|"inventory"|"forge"|"shop"|"world"|"bestiary"|"help";
type NearAction="shop"|"forge"|"gate"|null;
type Circle={x:number;y:number;r:number;kind:string};
type Rect={x:number;y:number;w:number;h:number;kind:string};

const WORLD={w:4600,h:2800};
const ENTRY={x:520,y:1400};
const SHOP={x:280,y:880,interactX:390,interactY:1070};
const FORGE={x:300,y:1940,interactX:410,interactY:1735};
const GATE={x:560,y:1400};
const ARENA={x:3570,y:650,w:820,h:1100,gateY1:1115,gateY2:1315};
const SPAWNS=[
  [1050,650],[1350,820],[1650,610],[980,1260],[1350,1450],[1760,1210],
  [1050,2100],[1420,2260],[1810,2020],[2150,690],[2460,900],[2780,690],
  [2220,1510],[2580,1740],[2920,1470],
] as const;
const weaponProfiles:Record<WeaponKind,{speed:number;range:number;arc:number;mult:number}>={
  dagger:{speed:.3,range:102,arc:1.7,mult:.78},longsword:{speed:.55,range:132,arc:2.05,mult:1},
  greatsword:{speed:1.04,range:172,arc:2.42,mult:1.45},mace:{speed:.88,range:148,arc:2.18,mult:1.28},
};

const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const dist=(a:Vec,b:Vec)=>Math.hypot(a.x-b.x,a.y-b.y);
const between=(min:number,max:number)=>min+Math.random()*(max-min);
const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const pseudo=(n:number,seed:number)=>Math.abs(Math.sin(n*97.13+seed*31.7)*43758.5453)%1;
const equippedItem=(save:SaveData,slot:Slot)=>save.inventory.find(i=>i.id===save.equipped[slot]);

function statsFromSave(save:SaveData){
  const weapon=equippedItem(save,"weapon"),shield=equippedItem(save,"shield"),armor=equippedItem(save,"armor"),soul=equippedItem(save,"soul");
  const hpMult=soul?.catalogId==="slimeSoul"?1.05:1;
  const attackMult=["alphaSoul","emberSoul"].includes(soul?.catalogId??"")?soul?.catalogId==="emberSoul"?1.12:1.08:1;
  const soulMove=["wolfSoul","wyvernSoul"].includes(soul?.catalogId??"")?5:0;
  const attackSpeed=["spiderSoul","wyvernSoul"].includes(soul?.catalogId??"")?soul?.catalogId==="wyvernSoul"?12:7:0;
  const maxHp=Math.round((100+(save.level-1)*3+(armor?itemFinalStat(armor):0))*hpMult);
  return {weapon,shield,armor,soul,maxHp,attack:Math.max(6,Math.round((weapon?itemFinalStat(weapon):6)*attackMult)),
    defense:shield?Math.min(70,itemFinalStat(shield)):0,move:225*(1+((armor?.moveSpeed??0)+soulMove)/100),attackSpeed};
}

function makeMobs(region:Region):Mob[]{
  const normals=region.monsters.filter(id=>MONSTERS[id].kind==="normal");
  const result:Mob[]=[];
  normals.forEach((type,index)=>{
    for(let copy=0;copy<3;copy++){
      const spot=SPAWNS[(index*3+copy)%SPAWNS.length];
      result.push(makeMob(type,`${type}-${copy}`,spot[0],spot[1]));
    }
  });
  const elite=region.monsters.find(id=>MONSTERS[id].kind==="elite");
  if(elite)result.push(makeMob(elite,`${elite}-elite`,3060,1920));
  result.push(makeMob(region.bossId,`${region.bossId}-boss`,ARENA.x+ARENA.w*.55,ARENA.y+ARENA.h*.52));
  return result;
}
function makeMob(type:string,uid:string,x:number,y:number):Mob{
  return {uid,type,x,y,homeX:x,homeY:y,hp:MONSTERS[type].hp,alive:true,respawnAt:0,state:"idle",stateUntil:0,
    cooldownUntil:performance.now()+Math.random()*1500,targetX:x,targetY:y,hitDone:false,flashUntil:0,facing:0,
    aggro:false,aggroUntil:0,attackMode:"melee",wanderAngle:Math.random()*Math.PI*2,wanderUntil:0,phase:1};
}

function regionObstacles(region:Region):{circles:Circle[];rects:Rect[]}{
  const commonRects:Rect[]=[
    {x:SHOP.x-150,y:SHOP.y-180,w:300,h:190,kind:"building"},{x:FORGE.x-160,y:FORGE.y-70,w:320,h:205,kind:"building"},
    {x:ARENA.x,y:ARENA.y,w:ARENA.w,h:48,kind:"arena"},{x:ARENA.x,y:ARENA.y+ARENA.h-48,w:ARENA.w,h:48,kind:"arena"},
    {x:ARENA.x+ARENA.w-48,y:ARENA.y,w:48,h:ARENA.h,kind:"arena"},
    {x:ARENA.x,y:ARENA.y,w:48,h:ARENA.gateY1-ARENA.y,kind:"arena"},
    {x:ARENA.x,y:ARENA.gateY2,w:48,h:ARENA.y+ARENA.h-ARENA.gateY2,kind:"arena"},
  ];
  const layouts:Record<Region["layout"],{circles:Circle[];rects:Rect[]}>={
    meadow:{circles:[
      {x:850,y:340,r:82,kind:"tree"},{x:1250,y:420,r:76,kind:"tree"},{x:1900,y:330,r:90,kind:"tree"},{x:2700,y:370,r:82,kind:"tree"},
      {x:880,y:2460,r:86,kind:"tree"},{x:1580,y:2370,r:75,kind:"tree"},{x:2410,y:2450,r:90,kind:"tree"},{x:3130,y:2260,r:82,kind:"tree"},
    ],rects:[]},
    forest:{circles:[
      {x:850,y:360,r:120,kind:"tree"},{x:1150,y:380,r:130,kind:"tree"},{x:1500,y:350,r:115,kind:"tree"},{x:2050,y:390,r:135,kind:"tree"},{x:2550,y:340,r:125,kind:"tree"},{x:3100,y:420,r:130,kind:"tree"},
      {x:900,y:2450,r:135,kind:"tree"},{x:1370,y:2380,r:115,kind:"tree"},{x:1930,y:2460,r:130,kind:"tree"},{x:2500,y:2360,r:125,kind:"tree"},{x:3050,y:2440,r:135,kind:"tree"},
      {x:2000,y:1120,r:105,kind:"tree"},{x:2000,y:1720,r:105,kind:"tree"},
    ],rects:[{x:1190,y:1010,w:390,h:75,kind:"log"},{x:2480,y:1840,w:430,h:80,kind:"log"}]},
    mine:{circles:[
      {x:870,y:430,r:95,kind:"rock"},{x:1510,y:350,r:110,kind:"crystal"},{x:2350,y:420,r:105,kind:"rock"},{x:3040,y:350,r:115,kind:"crystal"},
      {x:1050,y:2390,r:110,kind:"crystal"},{x:1880,y:2440,r:100,kind:"rock"},{x:2700,y:2370,r:105,kind:"crystal"},
    ],rects:[{x:1800,y:800,w:105,h:590,kind:"cavewall"},{x:1800,y:1650,w:105,h:550,kind:"cavewall"},{x:2850,y:1050,w:100,h:700,kind:"cavewall"}]},
    swamp:{circles:[
      {x:920,y:410,r:85,kind:"deadTree"},{x:1600,y:390,r:95,kind:"deadTree"},{x:2460,y:420,r:88,kind:"deadTree"},{x:3050,y:360,r:100,kind:"deadTree"},
      {x:1150,y:2380,r:95,kind:"deadTree"},{x:2160,y:2420,r:90,kind:"deadTree"},{x:2980,y:2310,r:100,kind:"deadTree"},
    ],rects:[{x:1260,y:960,w:520,h:260,kind:"pool"},{x:2170,y:1570,w:590,h:300,kind:"pool"},{x:2900,y:780,w:330,h:270,kind:"pool"}]},
    canyon:{circles:[
      {x:900,y:350,r:120,kind:"rock"},{x:1520,y:400,r:125,kind:"rock"},{x:2450,y:340,r:135,kind:"rock"},{x:3180,y:410,r:125,kind:"rock"},
      {x:900,y:2440,r:135,kind:"rock"},{x:1650,y:2390,r:120,kind:"rock"},{x:2500,y:2450,r:135,kind:"rock"},{x:3160,y:2340,r:125,kind:"rock"},
    ],rects:[{x:1780,y:690,w:150,h:670,kind:"cliff"},{x:1780,y:1590,w:150,h:570,kind:"cliff"},{x:2800,y:1060,w:130,h:730,kind:"cliff"}]},
    frost:{circles:[
      {x:900,y:430,r:90,kind:"ice"},{x:1500,y:360,r:100,kind:"ruin"},{x:2370,y:390,r:95,kind:"ice"},{x:3100,y:370,r:105,kind:"ruin"},
      {x:1120,y:2380,r:105,kind:"ruin"},{x:2050,y:2440,r:95,kind:"ice"},{x:3000,y:2320,r:105,kind:"ruin"},
    ],rects:[{x:1380,y:1070,w:520,h:230,kind:"iceLake"},{x:2280,y:1580,w:650,h:260,kind:"iceLake"}]},
    volcano:{circles:[
      {x:910,y:380,r:105,kind:"basalt"},{x:1580,y:420,r:115,kind:"basalt"},{x:2450,y:350,r:110,kind:"basalt"},{x:3120,y:430,r:120,kind:"basalt"},
      {x:1050,y:2420,r:120,kind:"basalt"},{x:2050,y:2380,r:110,kind:"basalt"},{x:3070,y:2350,r:120,kind:"basalt"},
    ],rects:[{x:1500,y:830,w:140,h:1330,kind:"lava"},{x:2560,y:670,w:130,h:760,kind:"lava"},{x:2560,y:1670,w:130,h:580,kind:"lava"}]},
    fortress:{circles:[
      {x:1000,y:430,r:85,kind:"statue"},{x:1700,y:430,r:85,kind:"statue"},{x:2500,y:430,r:85,kind:"statue"},{x:3200,y:430,r:85,kind:"statue"},
      {x:1000,y:2370,r:85,kind:"statue"},{x:1700,y:2370,r:85,kind:"statue"},{x:2500,y:2370,r:85,kind:"statue"},{x:3200,y:2370,r:85,kind:"statue"},
    ],rects:[{x:1450,y:760,w:120,h:680,kind:"wall"},{x:1450,y:1700,w:120,h:420,kind:"wall"},{x:2500,y:710,w:125,h:480,kind:"wall"},{x:2500,y:1450,w:125,h:700,kind:"wall"}]},
  };
  return {circles:layouts[region.layout].circles,rects:[...commonRects,...layouts[region.layout].rects]};
}

const REGION_OBSTACLES=Object.fromEntries(REGIONS.map(region=>[region.id,regionObstacles(region)])) as Record<string,{circles:Circle[];rects:Rect[]}>;

function gearColors(item:Equipment){
  const seed=itemSeed(item.catalogId),h=(seed%310)+15,s=46+item.tier*4,l=42+Math.min(12,item.tier*2);
  return {main:`hsl(${h} ${s}% ${l}%)`,light:`hsl(${(h+28)%360} ${Math.min(95,s+18)}% ${Math.min(78,l+22)}%)`,
    dark:`hsl(${h} ${Math.max(28,s-15)}% ${Math.max(15,l-25)}%)`,glow:item.rarity==="legendary"?"#ffd760":item.tier>=7?"#b990ff":`hsl(${h} 90% 70%)`,seed};
}

function GearIcon({item,size=54}:{item:Equipment;size?:number}){
  const c=gearColors(item),s=c.seed,legend=item.rarity==="legendary";
  if(item.slot==="weapon"){
    const wide=item.weaponKind==="greatsword",mace=item.weaponKind==="mace",dagger=item.weaponKind==="dagger";
    return <svg className={`gear-svg ${legend?"legend":""}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      {legend&&<circle cx="32" cy="32" r="27" fill="none" stroke={c.glow} strokeDasharray={`${3+s%7} 5`} opacity=".7"/>}
      <g transform={`rotate(${-38+(s%17)-8} 32 32)`}>
        <rect x="29" y="37" width="6" height="20" rx="2" fill={c.dark}/><circle cx="32" cy="57" r={4+s%3} fill={c.main}/>
        <path d={mace?`M22 8 L42 8 L46 22 L38 30 L26 30 L18 22 Z`:wide?`M24 5 L40 5 L45 39 L32 47 L19 39 Z`:dagger?`M28 17 L36 10 L39 39 L32 47 L25 39 Z`:`M27 7 L37 7 L40 39 L32 47 L24 39 Z`} fill={c.main} stroke={c.light} strokeWidth="2"/>
        {!mace&&<path d={`M32 ${10+s%8} L32 39`} stroke={c.light} strokeWidth={1+s%3}/>}
        <path d={`M${17-s%4} 40 L${47+s%4} 40`} stroke={c.light} strokeWidth="5" strokeLinecap="round"/>
        {item.tier>=5&&<path d="M23 18 L15 13 M41 18 L49 13" stroke={c.glow} strokeWidth="3"/>}
      </g></svg>;
  }
  if(item.slot==="shield")return <svg className={`gear-svg ${legend?"legend":""}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden>
    {legend&&<circle cx="32" cy="31" r="28" fill={c.glow} opacity=".18"/>}
    <path d={`M${12+s%5} 10 L${52-s%5} 10 L${56-s%3} 31 Q32 61 ${8+s%3} 31 Z`} fill={c.main} stroke={c.light} strokeWidth="3"/>
    <path d={s%3===0?"M32 14 L32 49 M17 27 L47 27":s%3===1?"M19 18 L45 44 M45 18 L19 44":"M32 17 L43 27 L38 44 L26 44 L21 27 Z"} fill="none" stroke={c.glow} strokeWidth="4"/>
    {item.tier>=6&&<path d="M10 18 L3 11 M54 18 L61 11" stroke={c.glow} strokeWidth="3"/>}
  </svg>;
  if(item.slot==="armor")return <svg className={`gear-svg ${legend?"legend":""}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden>
    {legend&&<circle cx="32" cy="31" r="28" fill={c.glow} opacity=".18"/>}
    <path d={`M21 10 L32 ${17+s%4} L43 10 L56 21 L48 31 L45 57 L19 57 L16 31 L8 21 Z`} fill={c.main} stroke={c.light} strokeWidth="3"/>
    <path d={s%2?"M32 18 L32 55 M20 34 L44 34":"M20 20 L32 29 L44 20 M24 32 L32 53 L40 32"} fill="none" stroke={c.glow} strokeWidth="3"/>
    {item.tier>=5&&<path d="M10 20 L3 11 L18 14 M54 20 L61 11 L46 14" fill={c.dark} stroke={c.light} strokeWidth="2"/>}
  </svg>;
  return <svg className={`gear-svg soul ${legend?"legend":""}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden>
    <defs><radialGradient id={`soul-${s}`}><stop stopColor={c.light}/><stop offset="1" stopColor={c.main}/></radialGradient></defs>
    <path d={`M32 5 C${52-s%8} 16 56 38 32 58 C8 38 ${12+s%8} 16 32 5 Z`} fill={`url(#soul-${s})`} stroke={c.glow} strokeWidth="2"/>
    {Array.from({length:3+s%4},(_,i)=><circle key={i} cx={32+Math.cos(i*6.28/(3+s%4))*18} cy={31+Math.sin(i*6.28/(3+s%4))*18} r="2.5" fill={c.glow}/>)}
  </svg>;
}

export default function IronCrownGame({playerName,apiUrl,token,onLogout}:{playerName:string;apiUrl:string;token:string;onLogout:()=>void}){
  const canvasRef=useRef<HTMLCanvasElement>(null),shellRef=useRef<HTMLDivElement>(null);
  const saveRef=useRef<SaveData>(initialSave()),regionRef=useRef<Region>(REGIONS[0]);
  const playerRef=useRef({x:ENTRY.x,y:ENTRY.y,hp:100,facing:0,dashUntil:0,dashX:0,dashY:0,dashReady:0,attackReady:0,attackAnim:0,skillReady:0,potionReady:0,deadUntil:0,blocking:false});
  const mobsRef=useRef<Mob[]>(makeMobs(REGIONS[0])),particlesRef=useRef<Particle[]>([]),textsRef=useRef<FloatText[]>([]),slashesRef=useRef<Slash[]>([]),projectilesRef=useRef<Projectile[]>([]);
  const keysRef=useRef(new Set<string>()),pointerRef=useRef({x:900,y:450,down:false}),cameraRef=useRef({x:0,y:0}),joystickRef=useRef({x:0,y:0,active:false});
  const persistTimer=useRef<ReturnType<typeof setTimeout>|null>(null),audioRef=useRef<AudioContext|null>(null),shakeRef=useRef(0),hitStopUntilRef=useRef(0);
  const bossActiveRef=useRef(false),bossIntroRef=useRef(false),nearActionRef=useRef<NearAction>(null);
  const [save,setSave]=useState<SaveData>(()=>initialSave()),[regionId,setRegionId]=useState("meadow"),[loaded,setLoaded]=useState(false);
  const [panel,setPanel]=useState<Panel>(null),panelRef=useRef<Panel>(null),[selectedItem,setSelectedItem]=useState<string|null>(null),[useGuard,setUseGuard]=useState(false);
  const [notice,setNotice]=useState("푸른 들판에 도착했습니다"),[legendary,setLegendary]=useState<Equipment|null>(null),[toast,setToast]=useState<Array<{id:number;text:string;tone:string}>>([]);
  const [bossHp,setBossHp]=useState<{hp:number;max:number;name:string}|null>(null),[cooldowns,setCooldowns]=useState({dash:0,attack:0,skill:0,potion:0});
  const [others,setOthers]=useState<OtherPlayer[]>([]),[online,setOnline]=useState(1),[enhanceResult,setEnhanceResult]=useState(""),[guardMessage,setGuardMessage]=useState("");
  const [muted,setMuted]=useState(false),[gameStarted,setGameStarted]=useState(false),[mobile,setMobile]=useState(false),[nearAction,setNearAction]=useState<NearAction>(null);
  const [joystickVisual,setJoystickVisual]=useState({x:0,y:0}),[dead,setDead]=useState(false);
  const [codexRegion,setCodexRegion]=useState("meadow");
  const currentRegion=regionById(regionId),obstacles=REGION_OBSTACLES[regionId]??REGION_OBSTACLES.meadow;
  useEffect(()=>{saveRef.current=save},[save]); useEffect(()=>{panelRef.current=panel},[panel]);
  useEffect(()=>{regionRef.current=currentRegion},[currentRegion]);
  const stats=useMemo(()=>statsFromSave(save),[save]),xpNeed=XP_REQUIREMENTS[save.level]??0,currentHp=Math.min(save.hp,stats.maxHp);
  const selected=save.inventory.find(i=>i.id===selectedItem)??null;

  const apiFetch=useCallback((path:string,init:RequestInit={})=>fetch(`${apiUrl}${path}`,{...init,headers:{...init.headers,authorization:`Bearer ${token}`}}),[apiUrl,token]);
  const addToast=useCallback((text:string,tone="plain")=>{const id=Date.now()+Math.random();setToast(o=>[...o.slice(-3),{id,text,tone}]);setTimeout(()=>setToast(o=>o.filter(t=>t.id!==id)),3400)},[]);
  const sound=useCallback((kind:string)=>{
    if(muted)return;const C=window.AudioContext||(window as typeof window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(!C)return;
    const ctx=audioRef.current??new C();audioRef.current=ctx;if(ctx.state==="suspended")void ctx.resume();const now=ctx.currentTime;
    const noise=(dur:number,freq:number,vol:number,type:BiquadFilterType="bandpass")=>{const b=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*dur),ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);const src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();src.buffer=b;f.type=type;f.frequency.value=freq;f.Q.value=2.2;g.gain.setValueAtTime(vol,now);g.gain.exponentialRampToValueAtTime(.001,now+dur);src.connect(f).connect(g).connect(ctx.destination);src.start(now)};
    const tone=(from:number,to:number,dur:number,vol:number,type:OscillatorType="triangle",delay=0)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(from,now+delay);o.frequency.exponentialRampToValueAtTime(Math.max(25,to),now+delay+dur);g.gain.setValueAtTime(.001,now);g.gain.setValueAtTime(vol,now+delay);g.gain.exponentialRampToValueAtTime(.001,now+delay+dur);o.connect(g).connect(ctx.destination);o.start(now);o.stop(now+delay+dur)};
    if(["dagger","sword","great","mace"].includes(kind)){const heavy=kind==="great"||kind==="mace";noise(heavy?.27:.13,heavy?680:1800,heavy?.18:.11);tone(heavy?170:520,heavy?48:190,heavy?.22:.09,heavy?.075:.04,kind==="mace"?"square":"sawtooth");if(kind!=="mace")tone(2300,1050,.08,.025,"sine",.025);return}
    if(kind==="block"){noise(.17,2100,.14);tone(480,260,.12,.045,"square");return}
    if(kind==="hit"||kind==="hurt"){noise(.12,kind==="hit"?1350:470,.15);tone(kind==="hit"?210:115,55,.1,.05);return}
    if(kind==="dash"){noise(.22,1750,.12,"highpass");tone(650,190,.18,.025);return}
    const map:Record<string,[number,number,number,number,OscillatorType]>={potion:[520,980,.3,.06,"sine"],drop:[580,1120,.34,.05,"triangle"],legendary:[230,1500,.8,.09,"sawtooth"],success:[430,800,.34,.05,"triangle"],keep:[220,175,.23,.04,"triangle"],fail:[150,38,.55,.08,"sawtooth"],boss:[70,30,1,.15,"sawtooth"],level:[420,1250,.75,.08,"triangle"],travel:[260,880,.6,.07,"sine"]};
    const [a,b,d,v,t]=map[kind]??map.success;tone(a,b,d,v,t);
  },[muted]);

  useEffect(()=>{
    const updateMobile=()=>setMobile(matchMedia("(pointer: coarse)").matches||innerWidth<760),mobileFrame=requestAnimationFrame(updateMobile);addEventListener("resize",updateMobile);
    apiFetch("/api/save").then(r=>r.ok?r.json():Promise.reject(new Error("save unavailable"))).then(data=>{
      const base=initialSave(),next:SaveData=data?.save?{...base,...data.save,potions:{...base.potions,...data.save.potions},guards:{...base.guards,...data.save.guards}}:base;
      const valid=regionById(next.currentRegion);next.currentRegion=next.level>=valid.level?valid.id:"meadow";
      setSave(next);saveRef.current=next;setRegionId(next.currentRegion);regionRef.current=regionById(next.currentRegion);mobsRef.current=makeMobs(regionRef.current);
      const st=statsFromSave(next);playerRef.current.hp=clamp(next.hp||st.maxHp,1,st.maxHp);
      setLoaded(true);
    }).catch(()=>{const next=initialSave();setSave(next);setLoaded(true);addToast("서버 저장 연결을 다시 시도합니다","warn")});
    return()=>{cancelAnimationFrame(mobileFrame);removeEventListener("resize",updateMobile)};
  },[addToast,apiFetch]);
  useEffect(()=>{if(!loaded)return;if(persistTimer.current)clearTimeout(persistTimer.current);persistTimer.current=setTimeout(()=>{const payload={...saveRef.current,hp:Math.round(playerRef.current.hp),updatedAt:Date.now()};apiFetch("/api/save",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)}).then(async response=>{if(response.status===401){onLogout();return}if(!response.ok)console.error("IRON CROWN save failed",response.status,await response.text())}).catch(error=>console.error("IRON CROWN save unavailable",error))},700);return()=>{if(persistTimer.current)clearTimeout(persistTimer.current)}},[save,loaded,apiFetch,onLogout]);
  useEffect(()=>{if(!loaded)return;const socket=io(apiUrl,{auth:{token},transports:["websocket","polling"]});const send=()=>{const p=playerRef.current,st=statsFromSave(saveRef.current),region=regionRef.current.id;socket.emit("presence",{x:p.x,y:p.y,hp:Math.round(p.hp),maxHp:st.maxHp,weapon:st.weapon?.name??"맨손",region})};socket.on("world",(players:OtherPlayer[])=>{setOthers(players.filter(o=>o.id!==socket.id&&o.region===regionRef.current.id));setOnline(players.length)});send();const timer=setInterval(send,180);return()=>{clearInterval(timer);socket.disconnect()}},[apiUrl,loaded,token]);

  const mutateSave=useCallback((fn:(draft:SaveData)=>void)=>setSave(old=>{const next:SaveData={...old,inventory:old.inventory.map(x=>({...x})),equipped:{...old.equipped},potions:{...old.potions},guards:{...old.guards},stats:{...old.stats}};fn(next);next.updatedAt=Date.now();saveRef.current=next;return next}),[]);
  const burst=useCallback((x:number,y:number,color:string,count:number,power=120,ring=false)=>{for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=Math.random()*power;particlesRef.current.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+Math.random()*.55,max:.9,color,size:2+Math.random()*7,ring})}},[]);
  const claimKill=useCallback((type:string)=>{apiFetch("/api/game/kill",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({monsterId:type})}).then(async response=>{if(!response.ok)throw new Error(await response.text());return response.json()}).then((data:{save:SaveData;reward:ServerReward})=>{setSave(data.save);saveRef.current=data.save;const reward=data.reward;textsRef.current.push({x:playerRef.current.x,y:playerRef.current.y-55,text:`+${formatNumber(reward.xp)} XP  +${formatNumber(reward.gold)}G`,color:"#ffe7a0",life:1.5,size:17});if(reward.levels){sound("level");addToast(`LEVEL UP!  Lv.${data.save.level}`,"level")}reward.drops.forEach(item=>{const isLegend=item.rarity==="legendary";sound(isLegend?"legendary":"drop");burst(playerRef.current.x,playerRef.current.y,isLegend?"#ffd653":"#8cff9a",isLegend?60:24,isLegend?340:180,true);if(isLegend){setLegendary(item);setTimeout(()=>setLegendary(null),3700)}addToast(`${isLegend?"전설 ":""}${item.name} 획득!`,isLegend?"legendary":"drop")})}).catch(()=>addToast("보상 서버와 연결이 끊겼습니다","warn"))},[addToast,apiFetch,burst,sound]);

  const damageMob=useCallback((mob:Mob,damage:number,heavy=false)=>{
    if(!mob.alive)return;const now=performance.now();mob.hp-=damage;mob.flashUntil=now+140;mob.aggro=true;mob.aggroUntil=now+14000;if(mob.state==="idle")mob.state="chase";
    shakeRef.current=Math.max(shakeRef.current,heavy?13:6);hitStopUntilRef.current=Math.max(hitStopUntilRef.current,now+(heavy?62:35));
    textsRef.current.push({x:mob.x+between(-12,12),y:mob.y-40,text:formatNumber(damage),color:heavy?"#ffd36d":"#fff",life:.9,size:heavy?24:18});
    burst(mob.x,mob.y,heavy?"#ffd36d":"#eaf8d4",heavy?18:8,heavy?200:115);sound(heavy?"mace":"hit");
    if(mob.hp<=0){const bp=MONSTERS[mob.type];mob.hp=0;mob.alive=false;mob.respawnAt=now+bp.respawn*1000;burst(mob.x,mob.y,bp.accent,bp.kind==="boss"?70:28,bp.kind==="boss"?360:190,true);claimKill(mob.type);addToast(`${bp.name} 처치`,bp.kind);
      if(bp.kind==="boss"){bossActiveRef.current=false;setBossHp(null);setNotice(`${bp.name} 처치! 투기장의 봉인이 풀렸습니다.`)}}
  },[addToast,burst,claimKill,sound]);
  const hurtPlayer=useCallback((raw:number,source?:Mob)=>{
    const p=playerRef.current;if(p.deadUntil>performance.now())return;const st=statsFromSave(saveRef.current),actual=Math.max(1,Math.round(raw*(1-st.defense/100)*(p.blocking?.55:1)));
    p.hp-=actual;textsRef.current.push({x:p.x,y:p.y-55,text:`-${formatNumber(actual)}`,color:"#ff6f6f",life:1,size:22});burst(p.x,p.y,"#ff6f6f",14,165);shakeRef.current=Math.max(shakeRef.current,10);sound(p.blocking?"block":"hurt");
    if(source&&st.shield?.reflect)damageMob(source,Math.max(1,Math.round(actual*st.shield.reflect/100)));
    if(p.hp<=0){p.hp=0;p.deadUntil=performance.now()+2400;setDead(true);setNotice(`쓰러졌습니다 · ${regionRef.current.name} 입구로 귀환 중`);bossActiveRef.current=false;setBossHp(null);projectilesRef.current=[];
      const boss=mobsRef.current.find(m=>MONSTERS[m.type].kind==="boss");if(boss){boss.x=boss.homeX;boss.y=boss.homeY;boss.hp=MONSTERS[boss.type].hp;boss.aggro=false;boss.state="idle"}
      setTimeout(()=>{p.x=ENTRY.x;p.y=ENTRY.y;p.hp=statsFromSave(saveRef.current).maxHp;mutateSave(d=>{d.hp=Math.round(p.hp)});setDead(false);setNotice(`${regionRef.current.name} 입구에서 다시 일어났습니다`)},2400)}
    mutateSave(d=>{d.hp=Math.max(0,Math.round(p.hp))});
  },[burst,damageMob,mutateSave,sound]);

  const attack=useCallback((special=false)=>{
    if(!gameStarted||panelRef.current||!loaded)return;const now=performance.now(),p=playerRef.current;if(p.deadUntil>now||p.dashUntil>now||p.blocking)return;
    const st=statsFromSave(saveRef.current),kind=st.weapon?.weaponKind??"longsword",profile=weaponProfiles[kind],speedMod=1-st.attackSpeed/100;
    if(special){const skill=st.weapon?.legendarySkill;if(!skill||p.skillReady>now)return;p.skillReady=now+skill.cooldown*1000;p.attackAnim=now+600;
      const damage=Math.round(st.attack*skill.multiplier),target={x:pointerRef.current.x,y:pointerRef.current.y};
      if(skill.style==="burst"){slashesRef.current.push({x:p.x,y:p.y,angle:0,radius:profile.range*2.15,color:"#ffd45d",life:.65,max:.65,wide:true,full:true});mobsRef.current.forEach(m=>{if(m.alive&&dist(m,p)<profile.range*2.25+MONSTERS[m.type].radius)damageMob(m,damage,true)})}
      else if(skill.style==="meteor"){const tx=clamp(target.x,p.x-520,p.x+520),ty=clamp(target.y,p.y-520,p.y+520);slashesRef.current.push({x:tx,y:ty,angle:0,radius:190,color:"#ffb53d",life:.8,max:.8,wide:true,full:true});mobsRef.current.forEach(m=>{if(m.alive&&dist(m,{x:tx,y:ty})<220)damageMob(m,damage,true)});burst(tx,ty,"#ffb43d",48,310,true)}
      else {const length=skill.style==="line"?profile.range*3:profile.range*2.1;slashesRef.current.push({x:p.x,y:p.y,angle:p.facing,radius:length,color:"#ffd45d",life:.58,max:.58,wide:true});mobsRef.current.forEach(m=>{if(!m.alive)return;const d=dist(m,p),a=Math.atan2(m.y-p.y,m.x-p.x);if(d<length+MONSTERS[m.type].radius&&Math.abs(angleDelta(a,p.facing))<(skill.style==="line"?.42:1.15))damageMob(m,damage,true)})}
      burst(p.x,p.y,"#ffd45d",40,300,true);sound("legendary");addToast(skill.name,"legendary");return}
    if(p.attackReady>now)return;p.attackReady=now+profile.speed*speedMod*1000;p.attackAnim=now+Math.min(420,profile.speed*620);
    const color=kind==="dagger"?"#c9f7ff":kind==="greatsword"?"#ffcf7a":kind==="mace"?"#e7c07d":"#eef6ff";
    slashesRef.current.push({x:p.x,y:p.y,angle:p.facing,radius:profile.range,color,life:.3,max:.3,wide:kind==="greatsword"||kind==="mace"});
    let hits=0;mobsRef.current.forEach(m=>{if(!m.alive)return;const d=dist(m,p),a=Math.atan2(m.y-p.y,m.x-p.x);if(d<=profile.range+MONSTERS[m.type].radius+30&&Math.abs(angleDelta(a,p.facing))<=profile.arc/2){damageMob(m,Math.round(st.attack*profile.mult*between(.94,1.07)),kind==="greatsword"||kind==="mace");hits++}});
    sound(kind==="dagger"?"dagger":kind==="greatsword"?"great":kind==="mace"?"mace":"sword");if(!hits)burst(p.x+Math.cos(p.facing)*profile.range,p.y+Math.sin(p.facing)*profile.range,"#fff",4,45);
  },[addToast,burst,damageMob,gameStarted,loaded,sound]);
  const dash=useCallback(()=>{if(!gameStarted||panelRef.current)return;const now=performance.now(),p=playerRef.current;if(p.dashReady>now||p.deadUntil>now||p.dashUntil>now)return;let dx=0,dy=0;const k=keysRef.current;if(k.has("KeyA")||k.has("ArrowLeft"))dx--;if(k.has("KeyD")||k.has("ArrowRight"))dx++;if(k.has("KeyW")||k.has("ArrowUp"))dy--;if(k.has("KeyS")||k.has("ArrowDown"))dy++;dx+=joystickRef.current.x;dy+=joystickRef.current.y;if(Math.hypot(dx,dy)<.1){dx=Math.cos(p.facing);dy=Math.sin(p.facing)}const mag=Math.hypot(dx,dy),bat=equippedItem(saveRef.current,"soul")?.catalogId==="batSoul";p.dashX=dx/mag;p.dashY=dy/mag;p.dashUntil=now+200;p.dashReady=now+(bat?900:1000);burst(p.x,p.y,"#c8efff",18,150);sound("dash")},[burst,gameStarted,sound]);
  const drinkPotion=useCallback(()=>{if(!gameStarted||panelRef.current)return;const now=performance.now(),p=playerRef.current;if(p.potionReady>now||p.deadUntil>now)return;const potion=POTIONS[saveRef.current.selectedPotion];if(!potion||(saveRef.current.potions[potion.id]??0)<=0){addToast("장착한 포션이 없습니다","warn");return}const max=statsFromSave(saveRef.current).maxHp;if(p.hp>=max){addToast("이미 체력이 가득합니다","warn");return}const healed=Math.min(potion.heal,max-p.hp);p.hp+=healed;p.potionReady=now+5000;mutateSave(d=>{d.potions[potion.id]--;d.hp=Math.round(p.hp)});textsRef.current.push({x:p.x,y:p.y-54,text:`+${formatNumber(healed)}`,color:"#69f0ae",life:1.2,size:22});burst(p.x,p.y,"#69f0ae",24,145,true);sound("potion")},[addToast,burst,gameStarted,mutateSave,sound]);

  const blocked=useCallback((x:number,y:number,r=18)=>{
    if(x<35+r||y<35+r||x>WORLD.w-35-r||y>WORLD.h-35-r)return true;
    if(obstacles.circles.some(c=>Math.hypot(x-c.x,y-c.y)<c.r+r))return true;
    if(bossActiveRef.current&&x+r>ARENA.x&&x-r<ARENA.x+48&&y+r>ARENA.gateY1&&y-r<ARENA.gateY2)return true;
    return obstacles.rects.some(rect=>x+r>rect.x&&x-r<rect.x+rect.w&&y+r>rect.y&&y-r<rect.y+rect.h);
  },[obstacles]);
  const travel=useCallback((id:string)=>{
    const target=regionById(id);if(saveRef.current.level<target.level){addToast(`Lv.${target.level}부터 입장할 수 있습니다`,"warn");return}
    bossActiveRef.current=false;bossIntroRef.current=false;setBossHp(null);projectilesRef.current=[];particlesRef.current=[];mobsRef.current=makeMobs(target);regionRef.current=target;setRegionId(target.id);setCodexRegion(target.id);
    const p=playerRef.current;p.x=ENTRY.x;p.y=ENTRY.y;p.hp=Math.min(p.hp,statsFromSave(saveRef.current).maxHp);cameraRef.current={x:0,y:0};
    mutateSave(d=>{d.currentRegion=target.id;d.hp=Math.round(p.hp)});setNotice(`${target.name}에 도착했습니다`);setPanel(null);sound("travel");addToast(`${target.name} 입장`,"level");
  },[addToast,mutateSave,sound]);

  useEffect(()=>{const down=(e:KeyboardEvent)=>{if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code))e.preventDefault();keysRef.current.add(e.code);if(e.code==="Space")attack();if(e.code.startsWith("Shift"))dash();if(e.code==="KeyE")attack(true);if(e.code==="KeyQ")drinkPotion();if(e.code==="KeyF")playerRef.current.blocking=true;if(e.code==="KeyI")setPanel(x=>x==="inventory"?null:"inventory");if(e.code==="KeyR"&&nearActionRef.current)setPanel(nearActionRef.current==="gate"?"world":nearActionRef.current);if(e.code==="Escape")setPanel(null)};
    const up=(e:KeyboardEvent)=>{keysRef.current.delete(e.code);if(e.code==="KeyF")playerRef.current.blocking=false};addEventListener("keydown",down,{passive:false});addEventListener("keyup",up);return()=>{removeEventListener("keydown",down);removeEventListener("keyup",up)}},[attack,dash,drinkPotion]);

  const draw=useCallback((ctx:CanvasRenderingContext2D,width:number,height:number,now:number)=>{
    const cam=cameraRef.current,shake=shakeRef.current,p=playerRef.current;
    playerRefGlobal.attackAnim=p.attackAnim;playerPositionGlobal.x=p.x;playerPositionGlobal.y=p.y;
    bossActiveGlobal.value=bossActiveRef.current;
    mobsRefGlobal.splice(0,mobsRefGlobal.length,...mobsRef.current);
    ctx.clearRect(0,0,width,height);ctx.save();ctx.translate(-cam.x+between(-shake,shake),-cam.y+between(-shake,shake));
    drawWorld(ctx,currentRegion,cam,width,height,now);drawFacilities(ctx,currentRegion);obstacles.circles.forEach((o,i)=>drawObstacle(ctx,o,currentRegion,i));obstacles.rects.filter(r=>!["building","arena"].includes(r.kind)).forEach(r=>drawRectObstacle(ctx,r,currentRegion));drawArena(ctx,currentRegion);
    others.forEach(o=>{if(Date.now()-o.updatedAt<9000)drawPlayer(ctx,o.x,o.y,0,o.name,true,undefined,undefined,undefined,o.hp/Math.max(1,o.maxHp),now)});
    mobsRef.current.forEach(m=>{if(m.alive)drawMob(ctx,m,now)});projectilesRef.current.forEach(pr=>{ctx.save();ctx.fillStyle=pr.color;ctx.shadowColor=pr.color;ctx.shadowBlur=18;ctx.beginPath();ctx.arc(pr.x,pr.y,pr.radius,0,Math.PI*2);ctx.fill();ctx.restore()});
    slashesRef.current.forEach(s=>{const a=s.life/s.max;ctx.save();ctx.globalAlpha=a;ctx.strokeStyle=s.color;ctx.shadowColor=s.color;ctx.shadowBlur=s.wide?32:18;ctx.lineCap="round";ctx.lineWidth=s.wide?28:11;ctx.beginPath();if(s.full)ctx.arc(s.x,s.y,s.radius,0,Math.PI*2);else ctx.arc(s.x,s.y,s.radius,s.angle-(s.wide?1.25:.82),s.angle+(s.wide?1.25:.82));ctx.stroke();ctx.restore()});
    particlesRef.current.forEach(f=>{ctx.save();ctx.globalAlpha=clamp(f.life/f.max,0,1);ctx.fillStyle=f.color;ctx.strokeStyle=f.color;if(f.ring){ctx.lineWidth=2;ctx.beginPath();ctx.arc(f.x,f.y,f.size*clamp(f.life/f.max,.25,1),0,Math.PI*2);ctx.stroke()}else{ctx.beginPath();ctx.arc(f.x,f.y,f.size*clamp(f.life/f.max,.2,1),0,Math.PI*2);ctx.fill()}ctx.restore()});
    const st=statsFromSave(saveRef.current);drawPlayer(ctx,p.x,p.y,p.facing,playerName,false,st.weapon,st.shield,st.armor,p.hp/Math.max(1,st.maxHp),now);
    textsRef.current.forEach(t=>{ctx.globalAlpha=clamp(t.life,0,1);ctx.fillStyle=t.color;ctx.font=`800 ${t.size}px system-ui`;ctx.textAlign="center";ctx.strokeStyle="rgba(0,0,0,.55)";ctx.lineWidth=4;ctx.strokeText(t.text,t.x,t.y);ctx.fillText(t.text,t.x,t.y)});ctx.globalAlpha=1;ctx.restore();drawMinimap(ctx,width,height,currentRegion);
  },[currentRegion,obstacles,others,playerName]);

  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;const ctx=canvas.getContext("2d");if(!ctx)return;let frame=0,last=performance.now(),hudTick=0;
    const resize=()=>{const rect=canvas.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.floor(rect.width*dpr);canvas.height=Math.floor(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)};resize();addEventListener("resize",resize);
    const updateMob=(mob:Mob,dt:number,now:number)=>{
      const bp=MONSTERS[mob.type],p=playerRef.current;
      if(!mob.alive){if(now>=mob.respawnAt){Object.assign(mob,makeMob(mob.type,mob.uid,mob.homeX,mob.homeY))}return}
      if(bp.kind==="boss"&&!bossActiveRef.current){mob.aggro=false;mob.state="idle";return}
      const dx=p.x-mob.x,dy=p.y-mob.y,d=Math.hypot(dx,dy),a=Math.atan2(dy,dx);if(mob.aggro)mob.facing=a;
      if(!mob.aggro||p.deadUntil>now||(bp.kind!=="boss"&&(now>mob.aggroUntil||d>900))){mob.aggro=false;mob.state="idle";const home=dist(mob,{x:mob.homeX,y:mob.homeY});if(now>mob.wanderUntil){mob.wanderUntil=now+between(1700,3500);mob.wanderAngle=Math.random()*Math.PI*2}const moveA=home>125?Math.atan2(mob.homeY-mob.y,mob.homeX-mob.x):mob.wanderAngle;mob.facing=moveA;const speed=bp.speed*(home>125?.5:.13),nx=mob.x+Math.cos(moveA)*speed*dt,ny=mob.y+Math.sin(moveA)*speed*dt;if(!blocked(nx,ny,bp.radius*.68)){mob.x=nx;mob.y=ny}return}
      if(bp.kind==="boss"){mob.phase=mob.hp<bp.hp*.33?3:mob.hp<bp.hp*.66?2:1;setBossHp({hp:Math.max(0,mob.hp),max:bp.hp,name:bp.name})}
      if(mob.state==="windup"&&now>=mob.stateUntil){mob.hitDone=false;
        if(mob.attackMode==="melee"){if(dist(mob,p)<bp.radius+bp.range)hurtPlayer(bp.attack,mob);burst(mob.x+Math.cos(mob.facing)*bp.radius,mob.y+Math.sin(mob.facing)*bp.radius,bp.accent,14,170);mob.state="recover";mob.stateUntil=now+950}
        else if(mob.attackMode==="ranged"){const tx=mob.targetX-mob.x,ty=mob.targetY-mob.y,mag=Math.max(1,Math.hypot(tx,ty)),speed=bp.kind==="boss"?460:360;projectilesRef.current.push({x:mob.x,y:mob.y,vx:tx/mag*speed,vy:ty/mag*speed,radius:bp.kind==="boss"?20:12,damage:bp.attack*(bp.kind==="boss"?1.15:1),color:bp.accent,life:2.4,source:mob.uid});burst(mob.x,mob.y,bp.accent,15,120);mob.state="recover";mob.stateUntil=now+(bp.kind==="boss"?800:1100)}
        else {mob.state="charge";mob.stateUntil=now+(mob.attackMode==="slam"?500:bp.kind==="boss"?760:580)}return}
      if(mob.state==="charge"){
        if(mob.attackMode==="slam"){if(!mob.hitDone){mob.hitDone=true;const radius=bp.kind==="boss"?210+mob.phase*35:155;slashesRef.current.push({x:mob.x,y:mob.y,angle:0,radius,color:bp.accent,life:.5,max:.5,wide:true,full:true});burst(mob.x,mob.y,bp.accent,bp.kind==="boss"?55:30,330,true);shakeRef.current=18;if(dist(mob,p)<radius)hurtPlayer(bp.attack*(bp.kind==="boss"?1.3:1.2),mob)}}
        else {const ca=Math.atan2(mob.targetY-mob.y,mob.targetX-mob.x),speed=bp.speed*(bp.kind==="boss"?4.7:3.8),nx=mob.x+Math.cos(ca)*speed*dt,ny=mob.y+Math.sin(ca)*speed*dt;if(!blocked(nx,ny,bp.radius)){mob.x=nx;mob.y=ny}else mob.stateUntil=now;if(!mob.hitDone&&dist(mob,p)<bp.radius+32){mob.hitDone=true;hurtPlayer(bp.attack*(bp.kind==="boss"?1.35:1.08),mob)}}
        if(now>=mob.stateUntil){mob.state="recover";mob.stateUntil=now+(bp.kind==="boss"?1100:980)}return}
      if(mob.state==="recover"){if(now<mob.stateUntil)return;mob.state="chase"}
      const ranged=bp.attackStyle==="ranged",preferred=ranged?300:bp.attackStyle==="flank"?135:bp.kind==="boss"?190:bp.radius+48;
      if(now>=mob.cooldownUntil&&d<bp.range+(bp.kind==="boss"?180:0)){const bossChoices:Mob["attackMode"][]=["slam","charge","ranged"];mob.attackMode=bp.kind==="boss"?bossChoices[Math.floor(Math.random()*(mob.phase+1))%3]:bp.attackStyle==="ranged"?"ranged":bp.attackStyle==="charge"?"charge":bp.attackStyle==="slam"?"slam":"melee";mob.state="windup";mob.targetX=p.x;mob.targetY=p.y;mob.hitDone=false;mob.stateUntil=now+bp.windup*1000;mob.cooldownUntil=now+bp.cooldown*1000/(bp.kind==="boss"?1+(mob.phase-1)*.15:1);return}
      if((ranged&&d<preferred-50)){const back=a+Math.PI,nx=mob.x+Math.cos(back)*bp.speed*dt,ny=mob.y+Math.sin(back)*bp.speed*dt;if(!blocked(nx,ny,bp.radius*.7)){mob.x=nx;mob.y=ny}}
      else if(d>preferred){const side=bp.attackStyle==="flank"?Math.sin(now/430+mob.homeX)*.65:0,ma=a+side,nx=mob.x+Math.cos(ma)*bp.speed*dt,ny=mob.y+Math.sin(ma)*bp.speed*dt;if(!blocked(nx,ny,bp.radius*.7)){mob.x=nx;mob.y=ny}}
    };
    const tick=(now:number)=>{
      const dt=Math.min(.034,(now-last)/1000);last=now;const rect=canvas.getBoundingClientRect(),p=playerRef.current,st=statsFromSave(saveRef.current);
      const inside=p.x>ARENA.x+48&&p.x<ARENA.x+ARENA.w-48&&p.y>ARENA.y+48&&p.y<ARENA.y+ARENA.h-48,boss=mobsRef.current.find(m=>MONSTERS[m.type].kind==="boss");
      if(inside&&boss?.alive&&!bossActiveRef.current){bossActiveRef.current=true;boss.aggro=true;boss.aggroUntil=Infinity;boss.state="chase";boss.cooldownUntil=now+1500;setBossHp({hp:boss.hp,max:MONSTERS[boss.type].hp,name:MONSTERS[boss.type].name});setNotice(`봉인이 닫혔습니다 · ${MONSTERS[boss.type].name}의 패턴을 공략하세요`);if(!bossIntroRef.current){bossIntroRef.current=true;sound("boss");shakeRef.current=23}}
      if(gameStarted&&loaded&&!panelRef.current&&p.deadUntil<=now&&now>=hitStopUntilRef.current){let dx=0,dy=0;const k=keysRef.current;if(k.has("KeyA")||k.has("ArrowLeft"))dx--;if(k.has("KeyD")||k.has("ArrowRight"))dx++;if(k.has("KeyW")||k.has("ArrowUp"))dy--;if(k.has("KeyS")||k.has("ArrowDown"))dy++;dx+=joystickRef.current.x;dy+=joystickRef.current.y;if(p.dashUntil>now){dx=p.dashX;dy=p.dashY}const mag=Math.hypot(dx,dy);if(mag>.08){dx/=mag;dy/=mag;if(!pointerRef.current.down||mobile)p.facing=Math.atan2(dy,dx);const speed=p.dashUntil>now?st.move*7.5:st.move*(p.blocking?.52:1),nx=p.x+dx*speed*dt,ny=p.y+dy*speed*dt;if(!blocked(nx,p.y))p.x=nx;if(!blocked(p.x,ny))p.y=ny;if(p.dashUntil>now&&Math.random()<.7)particlesRef.current.push({x:p.x,y:p.y,vx:-dx*40,vy:-dy*40,life:.24,max:.24,color:"#b9eaff",size:9})}mobsRef.current.forEach(m=>updateMob(m,dt,now))}
      projectilesRef.current.forEach(pr=>{pr.x+=pr.vx*dt;pr.y+=pr.vy*dt;pr.life-=dt;if(pr.life>0&&dist(pr,p)<pr.radius+19){const source=mobsRef.current.find(m=>m.uid===pr.source);hurtPlayer(pr.damage,source);pr.life=0;burst(pr.x,pr.y,pr.color,16,140)}});projectilesRef.current=projectilesRef.current.filter(pr=>pr.life>0&&!blocked(pr.x,pr.y,pr.radius));
      particlesRef.current.forEach(f=>{f.x+=f.vx*dt;f.y+=f.vy*dt;f.vy+=35*dt;f.life-=dt});particlesRef.current=particlesRef.current.filter(f=>f.life>0).slice(-700);
      textsRef.current.forEach(t=>{t.y-=35*dt;t.life-=dt});textsRef.current=textsRef.current.filter(t=>t.life>0);slashesRef.current.forEach(s=>s.life-=dt);slashesRef.current=slashesRef.current.filter(s=>s.life>0);
      cameraRef.current.x+=(clamp(p.x-rect.width/2,0,WORLD.w-rect.width)-cameraRef.current.x)*Math.min(1,dt*8);cameraRef.current.y+=(clamp(p.y-rect.height/2,0,WORLD.h-rect.height)-cameraRef.current.y)*Math.min(1,dt*8);shakeRef.current=Math.max(0,shakeRef.current-dt*35);
      draw(ctx,rect.width,rect.height,now);hudTick+=dt;if(hudTick>.12){hudTick=0;setCooldowns({dash:Math.max(0,(p.dashReady-now)/1000),attack:Math.max(0,(p.attackReady-now)/1000),skill:Math.max(0,(p.skillReady-now)/1000),potion:Math.max(0,(p.potionReady-now)/1000)});
        const n:NearAction=dist(p,{x:SHOP.interactX,y:SHOP.interactY})<155?"shop":dist(p,{x:FORGE.interactX,y:FORGE.interactY})<155?"forge":dist(p,GATE)<135?"gate":null;if(n!==nearActionRef.current){nearActionRef.current=n;setNearAction(n)}}
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);return()=>{cancelAnimationFrame(frame);removeEventListener("resize",resize)};
  },[blocked,burst,draw,gameStarted,hurtPlayer,loaded,mobile,regionId,sound]);
  const pointerWorld=(e:React.PointerEvent<HTMLCanvasElement>)=>{const r=e.currentTarget.getBoundingClientRect();return{x:e.clientX-r.left+cameraRef.current.x,y:e.clientY-r.top+cameraRef.current.y}};
  const equip=(item:Equipment)=>{mutateSave(d=>{d.equipped[item.slot]=item.id;const max=statsFromSave(d).maxHp;playerRef.current.hp=Math.min(max,Math.max(playerRef.current.hp,1));d.hp=Math.round(playerRef.current.hp)});sound("success");addToast(`${item.name} 장착`,item.rarity)};
  const buyPotion=(id:string)=>{apiFetch("/api/game/shop",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"potion",id,regionId:regionRef.current.id})}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error);setSave(data.save);saveRef.current=data.save;sound("success");addToast(`${currentRegion.name} ${POTIONS[id].name} 구매`,"drop")}).catch(e=>addToast(e instanceof Error?e.message:"구매 실패","warn"))};
  const guardFor=(level:number)=>Object.values(GUARDS).find(g=>level>=g.min&&level<=g.max);
  const enhance=()=>{if(!selected||selected.slot==="soul"||selected.enhance>=30)return;apiFetch("/api/game/enhance",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({itemId:selected.id,useGuard})}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error);setSave(data.save);saveRef.current=data.save;setEnhanceResult(data.message);setGuardMessage("");sound(data.result==="great"?"legendary":data.result==="drop"?"fail":data.result==="keep"?"keep":"success");burst(playerRef.current.x,playerRef.current.y,data.result==="drop"?"#ff665c":"#ffd45d",34,240,true)}).catch(e=>{setEnhanceResult(e instanceof Error?e.message:"강화 실패");sound("fail")})};
  const buyGuard=(id:keyof typeof GUARDS)=>{apiFetch("/api/game/shop",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({kind:"guard",id,regionId:regionRef.current.id})}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error);setSave(data.save);saveRef.current=data.save;addToast(`${GUARDS[id].name} 구매`,"drop");sound("success")}).catch(e=>addToast(e instanceof Error?e.message:"구매 실패","warn"))};
  const beginJoystick=(e:React.PointerEvent<HTMLDivElement>)=>{e.currentTarget.setPointerCapture(e.pointerId);joystickRef.current.active=true};
  const moveJoystick=(e:React.PointerEvent<HTMLDivElement>)=>{if(!joystickRef.current.active)return;const r=e.currentTarget.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),mag=Math.max(1,Math.hypot(dx,dy)),next={x:clamp(dx/42,-1,1),y:clamp(dy/42,-1,1)};joystickRef.current={...next,active:true};setJoystickVisual(next);if(mag>4)playerRef.current.facing=Math.atan2(dy,dx)};
  const endJoystick=()=>{joystickRef.current={x:0,y:0,active:false};setJoystickVisual({x:0,y:0})};

  return <div ref={shellRef} className={`game-shell region-${currentRegion.id}`}>
    <canvas ref={canvasRef} className="game-canvas" aria-label={`IRON CROWN ${currentRegion.name} 전투 화면`}
      onPointerMove={e=>{const w=pointerWorld(e);pointerRef.current.x=w.x;pointerRef.current.y=w.y;if(!mobile)playerRef.current.facing=Math.atan2(w.y-playerRef.current.y,w.x-playerRef.current.x)}}
      onPointerDown={e=>{if(e.button===0){pointerRef.current.down=true;attack()}if(e.button===2)playerRef.current.blocking=true}}
      onPointerUp={e=>{pointerRef.current.down=false;if(e.button===2)playerRef.current.blocking=false}} onContextMenu={e=>e.preventDefault()}/>
    <header className="top-hud"><div className="brand-mark"><span className="crown">♛</span><div><strong>IRON CROWN</strong><small>{currentRegion.english} · COMPLETE WORLD</small></div></div>
      <div className="resource"><span>Lv.{save.level}</span><b>{formatNumber(save.gold)} G</b><em><i className="online-dot"/>{online} 온라인</em></div>
      <button className="icon-btn" onClick={()=>setMuted(x=>!x)} aria-label="소리 켜기/끄기">{muted?"🔇":"🔊"}</button><button className="icon-btn" onClick={()=>document.fullscreenElement?document.exitFullscreen():shellRef.current?.requestFullscreen()} aria-label="전체화면">⛶</button><button className="icon-btn" onClick={onLogout} aria-label="로그아웃">↪</button></header>
    <section className="status-hud"><div className="portrait">{stats.weapon&&<GearIcon item={stats.weapon} size={43}/>}</div><div className="bars"><div className="hp-line"><span style={{width:`${clamp(currentHp/stats.maxHp*100,0,100)}%`}}/><b>{formatNumber(currentHp)} / {formatNumber(stats.maxHp)}</b></div><div className="xp-line"><span style={{width:`${xpNeed?clamp(save.xp/xpNeed*100,0,100):100}%`}}/><b>XP {formatNumber(save.xp)} / {xpNeed?formatNumber(xpNeed):"MAX"}</b></div></div><div className="weapon-chip"><small>장착 무기</small><strong>{stats.weapon?`${stats.weapon.name} +${stats.weapon.enhance}`:"맨손"}</strong><span>공격력 {formatNumber(stats.attack)}</span></div></section>
    {bossHp&&<div className="boss-bar"><small>REGION BOSS</small><strong>{bossHp.name}</strong><div><span style={{width:`${bossHp.hp/bossHp.max*100}%`}}/></div><em>{formatNumber(bossHp.hp)} / {formatNumber(bossHp.max)}</em></div>}
    <div className="region-badge" style={{"--region-color":currentRegion.color} as React.CSSProperties}><small>현재 지역</small><b>{currentRegion.name}</b></div><div className="notice">{notice}</div>
    <div className="toast-stack">{toast.map(t=><div key={t.id} className={`toast ${t.tone}`}>{t.text}</div>)}</div>
    <nav className="game-menu" aria-label="게임 메뉴"><button onClick={()=>setPanel("inventory")}><span>🎒</span>인벤토리<kbd>I</kbd></button><button onClick={()=>setPanel("world")}><span>🗺</span>지역 이동</button><button onClick={()=>{setCodexRegion(regionId);setPanel("bestiary")}}><span>☷</span>드랍 도감</button><button onClick={()=>setPanel("help")}><span>?</span>도움말</button></nav>
    {nearAction&&!panel&&gameStarted&&<button className="world-interact" onClick={()=>setPanel(nearAction==="gate"?"world":nearAction)}><kbd>R</kbd><span><b>{nearAction==="shop"?"보급 상점 이용":nearAction==="forge"?"강화 대장간 이용":"지역 관문 이용"}</b><small>시설 앞에서만 이용할 수 있습니다</small></span></button>}
    <div className="combat-actions"><button className="potion-action" onPointerDown={drinkPotion}><span>🧪</span><b>{save.potions[save.selectedPotion]??0}</b>{cooldowns.potion>0&&<i>{cooldowns.potion.toFixed(1)}</i>}<small>Q</small></button>
      <button onPointerDown={()=>{playerRef.current.blocking=true}} onPointerUp={()=>{playerRef.current.blocking=false}} onPointerLeave={()=>{playerRef.current.blocking=false}}><span>🛡</span><b>방어</b><small>F</small></button>
      <button onPointerDown={dash}><span>➤</span><b>대쉬</b>{cooldowns.dash>0&&<i>{cooldowns.dash.toFixed(1)}</i>}<small>SHIFT</small></button>
      {stats.weapon?.legendarySkill&&<button className="legend-action" onPointerDown={()=>attack(true)}><span>✦</span><b>{stats.weapon.legendarySkill.name}</b>{cooldowns.skill>0&&<i>{cooldowns.skill.toFixed(1)}</i>}<small>E</small></button>}
      <button className="attack-action" onPointerDown={()=>attack()}><span>⚔</span><b>공격</b>{cooldowns.attack>0&&<i>{cooldowns.attack.toFixed(1)}</i>}<small>SPACE</small></button></div>
    {mobile&&<div className="joystick" onPointerDown={beginJoystick} onPointerMove={moveJoystick} onPointerUp={endJoystick} onPointerCancel={endJoystick}><span style={{transform:`translate(${joystickVisual.x*30}px,${joystickVisual.y*30}px)`}}/></div>}
    {!gameStarted&&<div className="start-screen"><div className="start-card"><div className="mini-crown">♛</div><p>ONLINE ACTION FARMING RPG</p><h1>IRON<br/><span>CROWN</span></h1><div className="start-rule"/><p className="start-copy">8개 지역. {Object.keys(MONSTERS).length}종의 적. {Object.keys(ITEMS).length}종의 장비.<br/>싸우고, 얻고, 강화해서 철왕에게 도전하라.</p><button disabled={!loaded} onClick={()=>{setGameStarted(true);sound("boss")}}>{loaded?"모험 계속하기":"서버에서 모험 불러오는 중…"}</button><small>WASD 이동 · 클릭/SPACE 공격 · SHIFT 대쉬</small></div></div>}
    {panel&&<div className="panel-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setPanel(null)}}><section className="game-panel"><button className="panel-close" onClick={()=>setPanel(null)}>×</button>
      {panel==="inventory"&&<><div className="panel-heading"><small>GEAR & ITEMS</small><h2>인벤토리</h2><p>{save.inventory.length}개의 장비 · 모든 장비는 고유한 착용 외형을 가집니다.</p></div><div className="inventory-layout"><div className="equip-column">{(["weapon","shield","armor","soul"] as Slot[]).map(slot=>{const item=equippedItem(save,slot);return <div key={slot} className={`equip-slot ${item?.rarity??"empty"}`}><small>{slot==="weapon"?"무기":slot==="shield"?"방패":slot==="armor"?"갑옷":"혼"}</small>{item&&<GearIcon item={item} size={42}/>}<b>{item?.name??"비어 있음"}</b>{item&&<span>+{item.enhance} · {formatNumber(itemFinalStat(item))}</span>}</div>})}</div><div className="item-grid">{save.inventory.map(item=><button key={item.id} className={`item-card tier-${item.tier} ${item.rarity} ${selectedItem===item.id?"selected":""}`} onClick={()=>setSelectedItem(item.id)}><GearIcon item={item}/><small>{item.rarity==="legendary"?"LEGENDARY":item.rarity==="soul"?"SOUL":"NORMAL"} · T{item.tier}</small><b>{item.name}</b><em>+{item.enhance}</em></button>)}</div><ItemDetail item={selected} equipped={selected?save.equipped[selected.slot]===selected.id:false} onEquip={equip}/></div></>}
      {panel==="forge"&&<><div className="panel-heading"><small>THE IRON OATH</small><h2>{currentRegion.name} 강화 대장간</h2><p>강화는 이 대장간 앞에서만 가능합니다. 하락은 즉시 +0으로 돌아갑니다.</p></div><div className="forge-layout"><div className="forge-list">{save.inventory.filter(x=>x.slot!=="soul").map(item=><button key={item.id} className={`${item.rarity} ${selectedItem===item.id?"selected":""}`} onClick={()=>{setSelectedItem(item.id);setEnhanceResult("")}}><GearIcon item={item} size={34}/><b>{item.name}</b><span>+{item.enhance}</span></button>)}</div>{selected&&selected.slot!=="soul"?<div className="anvil"><div className={`forge-item ${selected.rarity}`}><GearIcon item={selected} size={94}/><span>+{selected.enhance}</span></div><h3>{selected.name}</h3><p>현재 {formatNumber(itemFinalStat(selected))} → {selected.enhance<30?formatNumber(itemFinalStat({...selected,enhance:selected.enhance+1})):"MAX"}</p>{selected.enhance<30&&<><div className="rate-row"><span>성공<b>{ENHANCE_RATES[selected.enhance][0]}%</b></span><span>유지<b>{ENHANCE_RATES[selected.enhance][1]}%</b></span><span>+0 하락<b>{ENHANCE_RATES[selected.enhance][2]}%</b></span><span>대성공<b>{ENHANCE_RATES[selected.enhance][3]}%</b></span></div><label className="guard-toggle"><input type="checkbox" checked={useGuard} onChange={e=>setUseGuard(e.target.checked)}/><span/>하락 방지 사용<em>{guardFor(selected.enhance)?.name??"-"} ×{guardFor(selected.enhance)?save.guards[guardFor(selected.enhance)!.id]??0:0}</em></label><button className="enhance-btn" onClick={enhance}>강화 실행<small>{formatNumber(enhanceCost(selected))} G</small></button></>}<strong className={`enhance-result ${enhanceResult.includes("하락")?"bad":""}`}>{enhanceResult}</strong><p className="guard-message">{guardMessage}</p></div>:<div className="empty-guide">왼쪽에서 강화할 장비를 선택하세요.</div>}</div></>}
      {panel==="shop"&&<><div className="panel-heading"><small>{currentRegion.english} SUPPLY</small><h2>{currentRegion.name} 보급 상점</h2><p>이 상점은 현재 지역용 포션만 판매합니다. 모든 포션은 5초 쿨타임을 공유합니다.</p></div><div className="shop-grid">{currentRegion.potionIds.map(id=>{const p=POTIONS[id];return <article key={id}><div className={`potion-art potion-${p.rank}`}>✦</div><small>HP +{formatNumber(p.heal)}</small><h3>{p.name}</h3><p>보유 {save.potions[id]??0}개</p><button onClick={()=>buyPotion(id)}>구매 · {formatNumber(p.price)} G</button><button className="sub-btn" onClick={()=>mutateSave(d=>{d.selectedPotion=id})}>{save.selectedPotion===id?"장착 중":"장착"}</button></article>})}</div><h3 className="shop-subtitle">강화 하락 방지권</h3><div className="guard-shop">{Object.values(GUARDS).map(g=><article key={g.id}><b>{g.name}</b><span>+{g.min} ~ +{g.max===29?30:g.max}</span><em>보유 {save.guards[g.id]??0}</em><button onClick={()=>buyGuard(g.id)}>{formatNumber(g.price)} G</button></article>)}</div></>}
      {panel==="world"&&<><div className="panel-heading"><small>COMPLETE WORLD</small><h2>지역 이동</h2><p>8개 지역이 모두 열려 있습니다. 레벨은 입장 자격이며 실제 생존에는 장비와 강화가 필요합니다.</p></div><div className="region-road">{REGIONS.map((r,i)=><article key={r.id} className={`region-node ${save.level>=r.level?"open":"locked"} ${regionId===r.id?"current":""}`} style={{"--region":r.color} as React.CSSProperties}><span>{i+1}</span><div><small>{regionId===r.id?"현재 지역":save.level>=r.level?"입장 가능":`Lv.${r.level} 필요`}</small><b>{r.name}</b><em>{r.description}</em></div><button disabled={save.level<r.level||regionId===r.id} onClick={()=>travel(r.id)}>{regionId===r.id?"탐험 중":"입장"}</button></article>)}</div></>}
      {panel==="bestiary"&&<DropCodex regionId={codexRegion} onRegion={setCodexRegion}/>}
      {panel==="help"&&<><div className="panel-heading"><small>FIELD MANUAL</small><h2>전투 도움말</h2></div><div className="help-grid"><article><kbd>WASD</kbd><h3>이동</h3><p>캐릭터는 회전하지 않고 이동 방향으로 좌우 반전됩니다.</p></article><article><kbd>CLICK / SPACE</kbd><h3>무기 공격</h3><p>단검·장검·대검·철퇴의 속도, 범위, 타격음이 모두 다릅니다.</p></article><article><kbd>SHIFT</kbd><h3>대쉬</h3><p>0.2초간 빠르게 이동하지만 무적이 아니며 공격할 수 없습니다.</p></article><article><kbd>F / 우클릭</kbd><h3>방어</h3><p>피해를 줄이는 대신 이동이 느려집니다.</p></article><article><kbd>R</kbd><h3>시설 이용</h3><p>상점, 대장간, 지역 관문 앞에서만 해당 시설이 열립니다.</p></article><article><kbd>Q / E</kbd><h3>포션 / 전설 스킬</h3><p>포션은 즉시 회복, 전설 스킬은 무기마다 다른 직접 공격입니다.</p></article></div><div className="drop-rates"><b>전투 흐름</b><span>평소 몬스터는 자기 영역을 배회합니다. 먼저 공격한 개체만 적대합니다.</span><span>붉은 예고 → 공격 회피 → 긴 후딜에 반격하세요. 보스는 체력에 따라 3페이즈로 빨라집니다.</span></div></>}
    </section></div>}
    {legendary&&<div className="legendary-drop"><div className="legend-rays"/><GearIcon item={legendary} size={86}/><small>LEGENDARY DROP</small><strong>{legendary.name}</strong><span>전설 장비를 획득했습니다</span></div>}
    {dead&&<div className="death-vignette"/>}
  </div>;
}

function ItemDetail({item,equipped,onEquip}:{item:Equipment|null;equipped:boolean;onEquip:(item:Equipment)=>void}){
  if(!item)return <aside className="item-detail empty-guide">장비를 선택하면 상세 능력과 획득처가 표시됩니다.</aside>;
  const label=item.slot==="weapon"?"공격력":item.slot==="shield"?"피해 감소":item.slot==="armor"?"추가 HP":"효과";
  return <aside className={`item-detail tier-${item.tier} ${item.rarity}`}><div className="detail-gear"><GearIcon item={item} size={88}/></div><small>{item.rarity==="legendary"?"LEGENDARY":item.rarity==="soul"?"MONSTER SOUL":"NORMAL EQUIPMENT"} · TIER {item.tier}</small><h3>{item.name} <em>+{item.enhance}</em></h3><div className="detail-stat"><span>{label}</span><b>{item.slot==="shield"?`${itemFinalStat(item).toFixed(1)}%p`:item.slot==="soul"?item.soulText:formatNumber(itemFinalStat(item))}</b></div>
    {item.legendarySkill&&<div className="legend-power"><b>✦ {item.legendarySkill.name}</b><span>무기 공격력 {Math.round(item.legendarySkill.multiplier*100)}% 직접 공격 · {item.legendarySkill.style} · 쿨타임 {item.legendarySkill.cooldown}초</span></div>}
    {item.reflect&&<div className="legend-power"><b>✦ 피해 반사 {item.reflect}%</b><span>실제로 받은 피해 일부를 공격자에게 되돌립니다.</span></div>}{item.moveSpeed&&<div className="legend-power"><b>✦ 이동속도 +{item.moveSpeed}%</b></div>}<p>획득처 · {item.source}</p><button disabled={equipped} onClick={()=>onEquip(item)}>{equipped?"장착 중":"장착하기"}</button></aside>;
}

function DropCodex({regionId,onRegion}:{regionId:string;onRegion:(id:string)=>void}){
  const region=regionById(regionId);
  return <><div className="panel-heading"><small>MONSTER DROP CODEX</small><h2>몬스터 드랍률 도감</h2><p>모든 장비의 실제 1회 처치 기준 확률과 전설 판정 확률을 공개합니다.</p></div>
    <div className="codex-tabs">{REGIONS.map(r=><button key={r.id} className={r.id===regionId?"active":""} style={{"--region":r.color} as React.CSSProperties} onClick={()=>onRegion(r.id)}>{r.name}<small>Lv.{r.level}</small></button>)}</div>
    <div className="codex-list">{region.monsters.map(id=>{const m=MONSTERS[id];return <article key={id} className={`codex-monster ${m.kind}`}><header><MonsterBadge monster={m}/><div><small>{m.kind==="boss"?"BOSS":m.kind==="elite"?"ELITE":"MONSTER"}</small><h3>{m.name}</h3><p>HP {formatNumber(m.hp)} · 공격 {formatNumber(m.attack)} · XP {formatNumber(m.xp)}</p></div></header><div className="codex-drops">
      {!m.drops.length&&!m.guaranteed?.length&&!m.rareDrops?.length&&<span className="no-drop">장비 드랍 없음</span>}
      {m.drops.map(d=><DropLine key={d.itemId} itemId={d.itemId} chance={d.chance} legend={d.legendChance}/>)}
      {m.guaranteed?.map(g=><DropLine key={g.itemId} itemId={g.itemId} chance={g.weight} legend={g.legendChance} guaranteed/>)}
      {m.rareDrops?.map(d=><DropLine key={d.itemId} itemId={d.itemId} chance={d.chance} legend={d.legendChance} rare note={d.note}/>)}
    </div></article>})}</div></>;
}
function DropLine({itemId,chance,legend,guaranteed,rare,note}:{itemId:string;chance:number;legend:number;guaranteed?:boolean;rare?:boolean;note?:string}){
  const t=ITEMS[itemId],preview=createEquipment(itemId,false),actual=guaranteed?chance*legend/100:chance*legend/100;
  return <div className={`drop-line ${rare?"rare":""}`}><GearIcon item={preview} size={36}/><div><b>{t.name}</b><small>{guaranteed?`보스 확정 장비 중 ${chance}%`:`드랍 ${chance}%`}{rare?" · 극희귀 독립 판정":""}</small>{note&&<em>{note}</em>}</div><strong>{t.slot==="soul"?"등급 없음":`전설 판정 ${legend}%`}<small>{t.slot!=="soul"&&`전체 처치 기준 전설 ${actual<.01?actual.toFixed(4):actual.toFixed(3)}%`}</small></strong></div>;
}
function MonsterBadge({monster}:{monster:MonsterBlueprint}){const seed=itemSeed(monster.id);return <div className={`monster-badge ${monster.kind}`} style={{"--mob":monster.color,"--accent":monster.accent} as React.CSSProperties}><span>{["slime","wraith","mushroom"].some(x=>monster.shape.includes(x))?"◉":["goblin","bandit","knight","chief","warlord","ironKing"].some(x=>monster.shape.includes(x))?"♞":["golem","guardian","colossus"].some(x=>monster.shape.includes(x))?"◆":["bat","dragon","wyvern","imp"].some(x=>monster.shape.includes(x))?"⌁":"✦"}</span><i style={{transform:`rotate(${seed%35-17}deg)`}}/></div>}

function drawWorld(ctx:CanvasRenderingContext2D,r:Region,cam:Vec,width:number,height:number,now:number){
  const grad=ctx.createLinearGradient(0,0,0,WORLD.h);grad.addColorStop(0,r.ground);grad.addColorStop(1,r.dark);ctx.fillStyle=grad;ctx.fillRect(0,0,WORLD.w,WORLD.h);
  const idx=REGIONS.findIndex(x=>x.id===r.id);
  if(r.layout==="meadow"){ctx.fillStyle="rgba(255,236,167,.28)";ctx.beginPath();ctx.moveTo(420,1320);ctx.bezierCurveTo(1200,1060,1850,1570,2500,1260);ctx.bezierCurveTo(3000,1030,3340,1190,3570,1160);ctx.lineTo(3570,1320);ctx.bezierCurveTo(2960,1400,2700,1280,2200,1480);ctx.bezierCurveTo(1500,1710,900,1370,420,1510);ctx.closePath();ctx.fill()}
  if(r.layout==="forest"){ctx.fillStyle="rgba(15,39,26,.34)";for(let y=650;y<2500;y+=420){ctx.beginPath();ctx.roundRect(600,y,2950,145,70);ctx.fill()}ctx.strokeStyle="rgba(190,226,119,.12)";ctx.lineWidth=35;ctx.beginPath();ctx.moveTo(500,1400);ctx.bezierCurveTo(1300,900,2200,1900,3570,1220);ctx.stroke()}
  if(r.layout==="mine"){ctx.strokeStyle="rgba(110,88,65,.62)";ctx.lineWidth=9;for(let y=620;y<2450;y+=320){ctx.beginPath();ctx.moveTo(530,y);ctx.lineTo(3450,y+130);ctx.stroke();for(let x=650;x<3400;x+=95){ctx.beginPath();ctx.moveTo(x,y-13);ctx.lineTo(x,y+24);ctx.stroke()}}}
  if(r.layout==="swamp"){ctx.fillStyle="rgba(190,218,128,.09)";for(let i=0;i<18;i++){const x=550+pseudo(i,idx)*2900,y=280+pseudo(i+20,idx)*2300;ctx.beginPath();ctx.ellipse(x,y,120+pseudo(i+5,idx)*180,45+pseudo(i+9,idx)*65,pseudo(i+12,idx),0,Math.PI*2);ctx.fill()}ctx.fillStyle=`rgba(220,230,210,${.05+Math.sin(now/1200)*.015})`;ctx.fillRect(cam.x,cam.y,width,height)}
  if(r.layout==="canyon"){ctx.strokeStyle="rgba(255,192,117,.16)";ctx.lineWidth=4;for(let i=0;i<24;i++){const y=200+i*110;ctx.beginPath();ctx.moveTo(450,y);ctx.bezierCurveTo(1450,y-90,2350,y+100,3500,y-20);ctx.stroke()}}
  if(r.layout==="frost"){ctx.strokeStyle="rgba(91,158,190,.28)";ctx.lineWidth=3;for(let i=0;i<45;i++){const x=500+pseudo(i,idx)*3000,y=200+pseudo(i+50,idx)*2400;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+25+pseudo(i+4,idx)*40,y+20);ctx.lineTo(x+5,y+55);ctx.stroke()}}
  if(r.layout==="volcano"){ctx.strokeStyle="#ff6b30";ctx.shadowColor="#ff4c1f";ctx.shadowBlur=18;ctx.lineWidth=9;for(let i=0;i<14;i++){const x=600+pseudo(i,idx)*2850,y=300+pseudo(i+30,idx)*2200;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+35,y+45);ctx.lineTo(x+15,y+105);ctx.stroke()}ctx.shadowBlur=0}
  if(r.layout==="fortress"){ctx.strokeStyle="rgba(184,170,207,.17)";ctx.lineWidth=3;for(let x=500;x<3500;x+=150)for(let y=250;y<2550;y+=100)ctx.strokeRect(x+(Math.floor(y/100)%2)*75,y,150,100)}
  for(let i=0;i<520;i++){const x=470+pseudo(i,idx)*3050,y=100+pseudo(i+600,idx)*2600;if(x<cam.x-30||x>cam.x+width+30||y<cam.y-30||y>cam.y+height+30)continue;ctx.save();ctx.translate(x,y);ctx.globalAlpha=.28+.35*pseudo(i+80,idx);ctx.fillStyle=r.accent;if(r.layout==="meadow"){ctx.beginPath();ctx.arc(0,0,2+pseudo(i+2,idx)*3,0,Math.PI*2);ctx.fill()}else if(r.layout==="frost"){ctx.rotate(pseudo(i+2,idx));ctx.fillRect(-1,-7,2,14);ctx.fillRect(-7,-1,14,2)}else{ctx.beginPath();ctx.ellipse(0,0,3+pseudo(i,idx)*8,2+pseudo(i+3,idx)*4,0,0,Math.PI*2);ctx.fill()}ctx.restore()}
}
function drawFacilities(ctx:CanvasRenderingContext2D,r:Region){
  ctx.fillStyle="rgba(8,18,15,.28)";ctx.beginPath();ctx.ellipse(330,1400,250,75,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=r.layout==="fortress"?"#282632":r.layout==="mine"?"#342f3e":"#5d3825";ctx.fillRect(SHOP.x-145,SHOP.y-170,290,180);ctx.fillStyle=r.accent;ctx.beginPath();ctx.moveTo(SHOP.x-170,SHOP.y-155);ctx.lineTo(SHOP.x,SHOP.y-265);ctx.lineTo(SHOP.x+170,SHOP.y-155);ctx.closePath();ctx.fill();ctx.fillStyle="#f2dba7";ctx.fillRect(SHOP.x-30,SHOP.y-82,60,92);
  ctx.fillStyle="#352e31";ctx.fillRect(FORGE.x-155,FORGE.y-70,310,200);ctx.fillStyle=r.dark;ctx.beginPath();ctx.moveTo(FORGE.x-180,FORGE.y-50);ctx.lineTo(FORGE.x,FORGE.y-165);ctx.lineTo(FORGE.x+180,FORGE.y-50);ctx.closePath();ctx.fill();ctx.fillStyle="#ffb34b";ctx.shadowColor="#ff6b2e";ctx.shadowBlur=20;ctx.beginPath();ctx.arc(FORGE.x,FORGE.y+25,27,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  ctx.fillStyle="#fff";ctx.font="800 20px system-ui";ctx.textAlign="center";ctx.fillText("보급 상점",SHOP.x,SHOP.y-190);ctx.fillText("강화 대장간",FORGE.x,FORGE.y-96);
  ctx.strokeStyle=r.accent;ctx.lineWidth=8;ctx.beginPath();ctx.arc(GATE.x,GATE.y,52,-Math.PI/2,Math.PI*1.5);ctx.stroke();ctx.fillStyle=r.accent;ctx.font="800 15px system-ui";ctx.fillText("지역 관문",GATE.x,GATE.y-70);
}
function drawObstacle(ctx:CanvasRenderingContext2D,o:Circle,r:Region,seed:number){
  ctx.save();ctx.translate(o.x,o.y);ctx.fillStyle="rgba(0,0,0,.22)";ctx.beginPath();ctx.ellipse(10,o.r*.62,o.r*.8,o.r*.25,.15,0,Math.PI*2);ctx.fill();
  if(["tree","deadTree"].includes(o.kind)){ctx.fillStyle=o.kind==="deadTree"?"#4d4034":"#6e4427";ctx.fillRect(-13,-5,26,o.r*.82);ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=13;if(o.kind==="deadTree"){ctx.beginPath();ctx.moveTo(0,20);ctx.lineTo(-36,-30);ctx.moveTo(0,10);ctx.lineTo(39,-40);ctx.stroke()}else{ctx.fillStyle=r.color;for(const [x,y,s] of [[0,-25,1],[-35,0,.72],[35,0,.72],[0,24,.8]] as const){ctx.beginPath();ctx.arc(x,y,o.r*s,0,Math.PI*2);ctx.fill()}}}
  else if(["crystal","ice"].includes(o.kind)){ctx.fillStyle=r.accent;ctx.shadowColor=r.accent;ctx.shadowBlur=18;for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(-35+i*22,25);ctx.lineTo(-20+i*20,-o.r*(.55+pseudo(i,seed)*.4));ctx.lineTo(2+i*16,24);ctx.closePath();ctx.fill()}ctx.shadowBlur=0}
  else if(["statue","ruin"].includes(o.kind)){ctx.fillStyle="#686878";ctx.fillRect(-o.r*.5,-o.r*.55,o.r,o.r*1.15);ctx.fillStyle="#353541";ctx.fillRect(-o.r*.35,-o.r*.8,o.r*.7,o.r*.32);ctx.strokeStyle=r.accent;ctx.lineWidth=3;ctx.strokeRect(-o.r*.3,-o.r*.4,o.r*.6,o.r*.5)}
  else{ctx.fillStyle=o.kind==="basalt"?"#221e1d":r.dark;ctx.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,rr=o.r*(.7+pseudo(i,seed)*.28);const x=Math.cos(a)*rr,y=Math.sin(a)*rr;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y)}ctx.closePath();ctx.fill();ctx.strokeStyle=r.accent;ctx.globalAlpha=.35;ctx.stroke()}ctx.restore();
}
function drawRectObstacle(ctx:CanvasRenderingContext2D,o:Rect,r:Region){
  ctx.save();if(["pool","iceLake","lava"].includes(o.kind)){ctx.fillStyle=o.kind==="lava"?"#ff572e":o.kind==="iceLake"?"#83d4ea":"#374f42";ctx.shadowColor=o.kind==="lava"?"#ff4b20":r.accent;ctx.shadowBlur=o.kind==="lava"?24:8;ctx.beginPath();ctx.roundRect(o.x,o.y,o.w,o.h,55);ctx.fill();ctx.shadowBlur=0;if(o.kind!=="lava"){ctx.strokeStyle="rgba(255,255,255,.28)";ctx.lineWidth=4;for(let y=o.y+25;y<o.y+o.h;y+=42){ctx.beginPath();ctx.moveTo(o.x+20,y);ctx.lineTo(o.x+o.w-20,y+Math.sin(y)*8);ctx.stroke()}}}
  else{ctx.fillStyle=o.kind==="log"?"#65412c":o.kind==="wall"?"#292733":r.dark;ctx.fillRect(o.x,o.y,o.w,o.h);ctx.strokeStyle=r.accent;ctx.globalAlpha=.35;ctx.lineWidth=5;ctx.strokeRect(o.x,o.y,o.w,o.h)}ctx.restore();
}
function drawArena(ctx:CanvasRenderingContext2D,r:Region){
  ctx.fillStyle=`${r.dark}cc`;ctx.fillRect(ARENA.x+48,ARENA.y+48,ARENA.w-96,ARENA.h-96);ctx.strokeStyle=r.accent;ctx.globalAlpha=.42;ctx.lineWidth=30;ctx.strokeRect(ARENA.x+20,ARENA.y+20,ARENA.w-40,ARENA.h-40);ctx.globalAlpha=1;
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;ctx.fillStyle=r.color;ctx.beginPath();ctx.roundRect(ARENA.x+ARENA.w*.55+Math.cos(a)*300-13,ARENA.y+ARENA.h*.52+Math.sin(a)*410-22,26,44,7);ctx.fill()}
  ctx.fillStyle="#fff";ctx.font="900 23px system-ui";ctx.textAlign="center";ctx.fillText(`${r.name} 보스 투기장`,ARENA.x+ARENA.w/2,ARENA.y+90);ctx.fillStyle=r.dark;ctx.fillRect(ARENA.x-28,ARENA.gateY1,76,ARENA.gateY2-ARENA.gateY1);
  if(bossActiveGlobal.value){ctx.save();ctx.strokeStyle=r.accent;ctx.shadowColor=r.accent;ctx.shadowBlur=28;ctx.lineWidth=10;for(let y=ARENA.gateY1+12;y<ARENA.gateY2;y+=24){ctx.beginPath();ctx.moveTo(ARENA.x-5,y);ctx.lineTo(ARENA.x+52,y-10);ctx.stroke()}ctx.restore()}
}
function drawMob(ctx:CanvasRenderingContext2D,m:Mob,now:number){
  const bp=MONSTERS[m.type],dir=Math.cos(m.facing)<0?-1:1,seed=itemSeed(m.type);ctx.save();ctx.translate(m.x,m.y);ctx.scale(dir,1);if(m.flashUntil>now)ctx.globalAlpha=.5;
  if(m.state==="windup"){const pulse=1+Math.sin(now/55)*.08;ctx.strokeStyle=bp.kind==="boss"?"#ffdf6d":"#ff5e55";ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=18;ctx.lineWidth=6;ctx.beginPath();ctx.arc(0,0,(m.attackMode==="slam"?(bp.kind==="boss"?220:160):bp.radius+32)*pulse,0,Math.PI*2);ctx.stroke();if(["charge","ranged"].includes(m.attackMode)){ctx.setLineDash([18,12]);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo((m.targetX-m.x)*dir,m.targetY-m.y);ctx.stroke();ctx.setLineDash([])}ctx.shadowBlur=0}
  ctx.fillStyle="rgba(0,0,0,.25)";ctx.beginPath();ctx.ellipse(5,bp.radius*.68,bp.radius*.9,bp.radius*.3,0,0,Math.PI*2);ctx.fill();
  const animal=["beast","wolf","bear","croc","lizard","predator","hyena"].some(x=>bp.shape.includes(x)),humanoid=["goblin","shield","berserker","chief","bandit","knight","hunter","assassin","warlord","ironKing","skeleton"].some(x=>bp.shape.includes(x)),rock=["golem","crystal","guardian","giant","colossus","forgeLord"].some(x=>bp.shape.includes(x)),bug=["bug","spider","scorpion","crab"].some(x=>bp.shape.includes(x)),flying=["bat","dragon","wyvern","imp"].some(x=>bp.shape.includes(x)),spirit=["wraith","witch","mushroom"].some(x=>bp.shape.includes(x));
  if(bp.shape==="slime"){ctx.fillStyle=bp.color;ctx.beginPath();ctx.moveTo(-bp.radius,12);ctx.quadraticCurveTo(-bp.radius-8,-bp.radius,0,-bp.radius);ctx.quadraticCurveTo(bp.radius+8,-bp.radius,bp.radius,12);ctx.quadraticCurveTo(0,bp.radius,-bp.radius,12);ctx.fill()}
  else if(animal){ctx.fillStyle=bp.color;ctx.beginPath();ctx.ellipse(-4,2,bp.radius*1.05,bp.radius*.62,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(bp.radius*.55,-bp.radius*.35);ctx.lineTo(bp.radius*1.25,-bp.radius*.25);ctx.lineTo(bp.radius*1.35,bp.radius*.25);ctx.lineTo(bp.radius*.58,bp.radius*.25);ctx.closePath();ctx.fill();ctx.fillStyle=bp.accent;ctx.beginPath();ctx.moveTo(bp.radius*.75,-bp.radius*.3);ctx.lineTo(bp.radius*.88,-bp.radius*.85);ctx.lineTo(bp.radius*1.03,-bp.radius*.3);ctx.fill();for(let i=0;i<2+(seed%3);i++){ctx.fillRect(-bp.radius*.7+i*14,bp.radius*.42,7,bp.radius*.7)}}
  else if(humanoid){ctx.fillStyle=bp.color;ctx.beginPath();ctx.arc(0,-bp.radius*.45,bp.radius*.55,0,Math.PI*2);ctx.fill();ctx.fillRect(-bp.radius*.55,0,bp.radius*1.1,bp.radius*1.1);ctx.fillStyle=bp.accent;ctx.fillRect(-bp.radius*.48,-bp.radius*.55,bp.radius*.96,7);ctx.strokeStyle=bp.accent;ctx.lineWidth=bp.kind==="boss"?10:6;ctx.beginPath();ctx.moveTo(bp.radius*.45,0);ctx.lineTo(bp.radius*1.35,-bp.radius*.45);ctx.stroke();if(bp.kind!=="normal"){ctx.fillStyle=bp.accent;ctx.beginPath();ctx.moveTo(-bp.radius*.5,-bp.radius*.9);ctx.lineTo(0,-bp.radius*1.45);ctx.lineTo(bp.radius*.5,-bp.radius*.9);ctx.fill()}}
  else if(rock){ctx.fillStyle=bp.color;for(let i=0;i<6;i++){const a=i*Math.PI/3,rr=bp.radius*.35;ctx.beginPath();ctx.roundRect(Math.cos(a)*rr-bp.radius*.42,Math.sin(a)*rr-bp.radius*.42,bp.radius*.84,bp.radius*.84,8);ctx.fill()}ctx.fillStyle=bp.accent;ctx.fillRect(-bp.radius*.45,-8,bp.radius*.9,8)}
  else if(bug){ctx.fillStyle=bp.color;ctx.beginPath();ctx.ellipse(0,0,bp.radius*.9,bp.radius*.65,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle=bp.accent;ctx.lineWidth=4;for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(i*8,0);ctx.lineTo(i*14,bp.radius*(i%2?.9:-.9));ctx.stroke()}if(bp.shape.includes("scorpion")){ctx.beginPath();ctx.moveTo(-bp.radius,0);ctx.quadraticCurveTo(-bp.radius*1.8,-bp.radius,-bp.radius*1.2,-bp.radius*1.6);ctx.stroke()}}
  else if(flying){ctx.fillStyle=bp.color;ctx.beginPath();ctx.ellipse(0,0,bp.radius*.7,bp.radius*.65,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(-5,0);ctx.lineTo(-bp.radius*1.5,-bp.radius*.75);ctx.lineTo(-bp.radius*1.25,bp.radius*.45);ctx.closePath();ctx.moveTo(5,0);ctx.lineTo(bp.radius*1.5,-bp.radius*.75);ctx.lineTo(bp.radius*1.25,bp.radius*.45);ctx.closePath();ctx.fill()}
  else if(spirit){ctx.fillStyle=bp.color;ctx.globalAlpha=.82;ctx.beginPath();ctx.arc(0,-bp.radius*.35,bp.radius*.65,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(-bp.radius*.65,-5);ctx.quadraticCurveTo(-bp.radius,bp.radius,0,bp.radius*1.2);ctx.quadraticCurveTo(bp.radius,bp.radius,bp.radius*.65,-5);ctx.fill();ctx.globalAlpha=1}
  else{ctx.fillStyle=bp.color;ctx.beginPath();ctx.arc(0,0,bp.radius,0,Math.PI*2);ctx.fill()}
  ctx.fillStyle="#ffdc63";ctx.beginPath();ctx.arc(bp.radius*.35,-bp.radius*.35,3+bp.kind.length,0,Math.PI*2);ctx.fill();ctx.restore();
  if(m.aggro||bp.kind!=="normal"){const ratio=m.hp/bp.hp,w=bp.kind==="boss"?120:bp.kind==="elite"?92:68;ctx.fillStyle="rgba(10,18,15,.82)";ctx.fillRect(m.x-w/2,m.y-bp.radius-42,w,9);ctx.fillStyle=bp.kind==="boss"?"#ff8f5c":bp.kind==="elite"?"#61d4ff":"#8be36e";ctx.fillRect(m.x-w/2,m.y-bp.radius-42,w*ratio,9);ctx.fillStyle="#fff";ctx.font=`700 ${bp.kind==="boss"?16:13}px system-ui`;ctx.textAlign="center";ctx.fillText(bp.name,m.x,m.y-bp.radius-50)}
}
function drawPlayer(ctx:CanvasRenderingContext2D,x:number,y:number,facing:number,name:string,ghost:boolean,weapon?:Equipment,shield?:Equipment,armor?:Equipment,hpRatio=1,now=0){
  const dir=Math.cos(facing)<0?-1:1,swing=!ghost&&playerRefGlobal.attackAnim>performance.now(),base=armor?gearColors(armor):{main:"#35465a",light:"#d9e1e8",dark:"#1c2833",glow:"#f0c66d",seed:1};
  ctx.save();ctx.translate(x,y);ctx.scale(dir,1);ctx.globalAlpha=ghost?.58:1;ctx.fillStyle="rgba(0,0,0,.28)";ctx.beginPath();ctx.ellipse(2,25,28,10,0,0,Math.PI*2);ctx.fill();
  if(armor&&armor.rarity==="legendary"){ctx.strokeStyle=base.glow;ctx.shadowColor=base.glow;ctx.shadowBlur=18;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,32+Math.sin(now/170)*3,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0}
  ctx.fillStyle=base.main;ctx.beginPath();ctx.moveTo(-20,-3);ctx.lineTo(-23,26);ctx.lineTo(20,26);ctx.lineTo(18,-3);ctx.closePath();ctx.fill();
  if(armor){const seed=base.seed;ctx.fillStyle=base.light;ctx.fillRect(-16,3,32,5);ctx.fillStyle=base.dark;ctx.beginPath();ctx.moveTo(-19,1);ctx.lineTo(-30,-8-(seed%8));ctx.lineTo(-14,-5);ctx.moveTo(19,1);ctx.lineTo(30,-8-(seed%8));ctx.lineTo(14,-5);ctx.fill()}
  ctx.fillStyle=ghost?"#59c9e6":base.light;ctx.beginPath();ctx.arc(0,-18,17,0,Math.PI*2);ctx.fill();ctx.fillStyle=ghost?"#7ae4ff":base.glow;ctx.fillRect(-16,-20,32,6);ctx.fillStyle=base.dark;ctx.fillRect(6,-19,10,3);
  if(weapon)drawCanvasWeapon(ctx,weapon,swing);else{ctx.strokeStyle="#dfe8eb";ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(12,5);ctx.lineTo(44,-5);ctx.stroke()}
  if(shield)drawCanvasShield(ctx,shield);ctx.restore();ctx.globalAlpha=ghost?.75:1;ctx.fillStyle="rgba(13,28,22,.82)";ctx.fillRect(x-30,y-57,60,7);ctx.fillStyle=ghost?"#63dafa":"#69e387";ctx.fillRect(x-30,y-57,60*clamp(hpRatio,0,1),7);ctx.fillStyle="#fff";ctx.font="700 13px system-ui";ctx.textAlign="center";ctx.fillText(name,x,y-65);ctx.globalAlpha=1;
}
const playerRefGlobal={attackAnim:0};
function drawCanvasWeapon(ctx:CanvasRenderingContext2D,item:Equipment,swing:boolean){
  const c=gearColors(item),seed=c.seed,kind=item.weaponKind??"longsword",len=kind==="dagger"?32:kind==="greatsword"?57:kind==="mace"?45:44,w=kind==="greatsword"?13:kind==="mace"?11:7;
  ctx.save();ctx.translate(12,6);ctx.rotate(swing?-1.18:-.25);if(item.rarity==="legendary"){ctx.shadowColor=c.glow;ctx.shadowBlur=22}
  ctx.strokeStyle=c.dark;ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(-6,0);ctx.lineTo(14,0);ctx.stroke();ctx.strokeStyle=c.light;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(6,-8);ctx.lineTo(6,8);ctx.stroke();
  if(kind==="mace"){ctx.strokeStyle=c.main;ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(8,0);ctx.lineTo(len-10,0);ctx.stroke();ctx.fillStyle=c.main;ctx.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,rr=12+(seed%4);if(i)ctx.lineTo(len+Math.cos(a)*rr,Math.sin(a)*rr);else ctx.moveTo(len+Math.cos(a)*rr,Math.sin(a)*rr)}ctx.closePath();ctx.fill()}
  else{ctx.fillStyle=c.main;ctx.strokeStyle=c.light;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(9,-w/2);ctx.lineTo(len-5,-w/2-(seed%4));ctx.lineTo(len,0);ctx.lineTo(len-5,w/2+(seed%4));ctx.lineTo(9,w/2);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle=c.glow;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(15,0);ctx.lineTo(len-7,0);ctx.stroke()}
  ctx.restore();
}
function drawCanvasShield(ctx:CanvasRenderingContext2D,item:Equipment){const c=gearColors(item),seed=c.seed;ctx.save();ctx.translate(-19,6);if(item.rarity==="legendary"){ctx.shadowColor=c.glow;ctx.shadowBlur=16}ctx.fillStyle=c.main;ctx.strokeStyle=c.light;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-14,-17);ctx.lineTo(14,-17);ctx.lineTo(16,4);ctx.quadraticCurveTo(0,27,-16,4);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle=c.glow;ctx.lineWidth=3;ctx.beginPath();if(seed%2){ctx.moveTo(0,-13);ctx.lineTo(0,15);ctx.moveTo(-10,-3);ctx.lineTo(10,-3)}else{ctx.moveTo(-9,-10);ctx.lineTo(9,10);ctx.moveTo(9,-10);ctx.lineTo(-9,10)}ctx.stroke();ctx.restore()}
function drawMinimap(ctx:CanvasRenderingContext2D,width:number,height:number,r:Region){const mobile=width<760,w=mobile?112:154,h=mobile?74:100,x=width-w-18,y=82;ctx.fillStyle="rgba(13,22,20,.84)";ctx.beginPath();ctx.roundRect(x,y,w,h,13);ctx.fill();ctx.strokeStyle=r.accent;ctx.stroke();ctx.fillStyle=r.ground;ctx.fillRect(x+8,y+8,w-16,h-16);ctx.fillStyle=r.accent;ctx.beginPath();ctx.arc(x+w*.83,y+h*.43,8,0,Math.PI*2);ctx.fill();mobsRefGlobal.filter(m=>m.alive&&MONSTERS[m.type].kind!=="normal").forEach(m=>{ctx.fillStyle=MONSTERS[m.type].kind==="boss"?"#ff725e":"#65d9ff";ctx.beginPath();ctx.arc(x+8+m.x/WORLD.w*(w-16),y+8+m.y/WORLD.h*(h-16),3,0,Math.PI*2);ctx.fill()});ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(x+8+playerPositionGlobal.x/WORLD.w*(w-16),y+8+playerPositionGlobal.y/WORLD.h*(h-16),4,0,Math.PI*2);ctx.fill()}
const mobsRefGlobal:Mob[]=[];const playerPositionGlobal={x:ENTRY.x,y:ENTRY.y};
const bossActiveGlobal={value:false};
