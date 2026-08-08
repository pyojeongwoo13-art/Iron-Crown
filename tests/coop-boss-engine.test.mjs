import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("two players damage one authoritative boss and both receive contributor rewards", async () => {
  const build = spawnSync("npm", ["run", "build", "--prefix", "server"], { cwd: new URL("..", import.meta.url), encoding:"utf8" });
  assert.equal(build.status, 0, build.stderr || build.stdout);
  const { createBossEngine } = await import(`../server/dist/server/src/boss-engine.js?test=${Date.now()}`);
  const events=[];
  const rooms=new Map([["region:meadow",new Set(["socket-a","socket-b"])]]);
  const fakeIo={
    sockets:{adapter:{rooms},sockets:new Map()},
    to(room){return{emit(name,payload){events.push({room,name,payload})}}},
  };
  const now=()=>Date.now();
  const players=[
    {socketId:"socket-a",userId:"user-a",name:"용사A",x:3820,y:1200,vx:0,vy:0,hp:100,region:"meadow",updatedAt:now()},
    {socketId:"socket-b",userId:"user-b",name:"용사B",x:3890,y:1280,vx:0,vy:0,hp:100,region:"meadow",updatedAt:now()},
  ];
  let contributors=[];
  const defeated=new Promise(resolve=>{
    const engine=createBossEngine({io:fakeIo,getPresence:()=>players,onDefeat:async(_bossId,list)=>{contributors=list;resolve(engine)}});
    engine.engage("socket-a","meadow");engine.engage("socket-b","meadow");
    void (async()=>{for(let hit=0;hit<6;hit+=1){engine.damage("socket-a",{regionId:"meadow",damage:200});engine.damage("socket-b",{regionId:"meadow",damage:200});await new Promise(done=>setTimeout(done,115))}})();
  });
  const engine=await Promise.race([defeated,new Promise((_,reject)=>setTimeout(()=>reject(new Error("co-op boss timeout")),4000))]);
  engine.stop();
  assert.deepEqual(new Set(contributors.map(item=>item.userId)),new Set(["user-a","user-b"]));
  assert.ok(events.some(event=>event.room==="region:meadow"&&event.name==="boss:defeated"));
  assert.ok(engine.getMetrics().acceptedPlayerHits>=8);
});
