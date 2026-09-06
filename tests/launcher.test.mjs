import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { GAMES, findGame, gameUrl, hubUrl, isSharedOrigin } from "../src/catalog.js";
import { THEMES } from "../src/services/music.js";

test("only catalog games can launch, on the existing shared origin",()=>{
  assert.equal(new Set(GAMES.map(game=>game.id)).size,GAMES.length);
  for (const game of GAMES) assert.equal(new URL(gameUrl(game)).origin,"https://seansommer.github.io");
  assert.equal(findGame("https://attacker.example"),null);
  assert.throws(()=>gameUrl({path:"https://attacker.example"}));
  assert.equal(hubUrl("unknown"),"https://seansommer.github.io/gamecenter/");
  assert.equal(isSharedOrigin("https://game-center.fatherearth.chatgpt.site"),false);
  assert.equal(findGame("henrythetrain").account,"guest");
});
test("manifest stays in its own directory and shortcuts resolve to catalog games",async ()=>{
  const manifest = JSON.parse(await readFile(new URL("../manifest.webmanifest",import.meta.url)));
  assert.equal(manifest.scope,"./"); assert.equal(manifest.start_url,"./");
  for (const item of manifest.shortcuts) assert.ok(findGame(new URL(item.url,"https://seansommer.github.io/gamecenter/").searchParams.get("play")));
});
test("offline activation leaves Google Feud, Same Slate and unrelated caches alone",async ()=>{
  const events = {}, removed = [];
  vm.runInNewContext(await readFile(new URL("../service-worker.js",import.meta.url),"utf8"),{
    self:{addEventListener:(name,handler)=>events[name]=handler,clients:{claim:()=>{}},registration:{scope:"https://seansommer.github.io/gamecenter/"}},
    caches:{keys:async()=>["googlefeud-shell-v25","sameslate-shell-v9","gamecenter-shell-v0","gamecenter-shell-v1","other"],delete:async key=>removed.push(key)},
    URL
  });
  let done; events.activate({waitUntil:promise=>done=promise}); await done;
  assert.deepEqual(removed,["gamecenter-shell-v0"]);
  let intercepted = false;
  events.fetch({request:{method:"GET",url:"https://seansommer.github.io/sameslate/src/app.js"},respondWith:()=>intercepted=true});
  events.fetch({request:{method:"GET",url:"https://fued-728c4-default-rtdb.firebaseio.com/users.json"},respondWith:()=>intercepted=true});
  assert.equal(intercepted,false);
});
test("the original arcade arrangement has finite notes contained in its loop",()=>{
  const theme = THEMES.home;
  assert.equal(theme.title,"Meet Me at the Arcade");
  for (const [beat,pitch,duration] of theme.melody) {
    assert.ok(Number.isFinite(pitch) && pitch>0);
    assert.ok(beat>=0 && duration>0 && beat+duration<=theme.loopBeats);
  }
});
