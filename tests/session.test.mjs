import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PlayerSession } from "../src/services/player-session.js";
import { loginKey, messageKey, createMessageId } from "../src/identity.js";

const snapshot = value => ({exists:()=>value !== null && value !== undefined, val:()=>value ?? null});
function fixture(initial = {}) {
  const records = new Map(Object.entries(initial)), writes = [], watchers = new Map();
  const service = new PlayerSession();
  service.auth = {currentUser:{uid:"browser-one", isAnonymous:true}}; service.db = {};
  let counter = 0;
  const notify = path => { for (const watcher of watchers.get(path) || []) watcher(snapshot(records.get(path))); };
  service.api = {
    ref:(_,path)=>path || "", get:async path=>snapshot(records.get(path)),
    push:()=>({key:"new-player-" + ++counter}),
    set:async (path,value)=>{records.set(path,value); writes.push([path,value]); notify(path);},
    remove:async path=>{records.delete(path); writes.push([path,null]); notify(path);},
    runTransaction:async (path,update)=>{
      const value = update(records.get(path)); records.set(path,value); return {snapshot:snapshot(value)};
    },
    update:async (_,updates)=>{
      writes.push(["",updates]);
      for (const [path,value] of Object.entries(updates)) {
        if (path.startsWith("users/") && path.split("/").length === 3) {
          const [root,id,key] = path.split("/"), parent = root + "/" + id;
          records.set(parent,{...records.get(parent),[key]:value}); notify(parent);
        } else records.set(path,value);
      }
    },
    signOut:async ()=>{service.auth.currentUser = null; service.watchAuth(null);},
    onValue:(path,callback)=>{
      const list = watchers.get(path) || new Set(); list.add(callback); watchers.set(path,list);
      callback(snapshot(records.get(path))); return ()=>list.delete(callback);
    }
  };
  return {service,records,writes,watchers,notify};
}

test("existing games' email/nickname and Message ID lookup contracts match",async ()=>{
  assert.equal(await loginKey(" PERSON@Example.COM "," HéLLo-- World "),
    createHash("sha256").update("person@example.com|helloworld").digest("hex"));
  const id = createMessageId();
  assert.match(id,/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{16}$/);
  assert.equal(await messageKey(id,"HéLLo-- World"),
    createHash("sha256").update("message-v1|" + id + "|helloworld").digest("hex"));
});

test("signing in keeps the existing host, stats reference, and permanent Message ID",async ()=>{
  const key = await loginKey("host@example.com","Host");
  const id = "ABCDEFGHJKLMNPQR";
  const original = {displayName:"Host",email:"host@example.com",role:"master",hostNumber:42,messageId:id,messageLookupKey:await messageKey(id,"Host")};
  const {service,writes} = fixture({["loginLookup/"+key]:"existing", "users/existing":original});
  const profile = await service.signIn({email:"HOST@example.com",displayName:"Host"});
  assert.equal(profile.profileId,"existing"); assert.equal(profile.role,"master");
  assert.equal(profile.hostNumber,42); assert.equal(profile.messageId,id);
  assert.deepEqual(writes,[["sessions/browser-one",{profileId:"existing",loginKey:key}]]);
});

test("new players use shared paths and receive a permanent 16-character message ID",async ()=>{
  const {service,records} = fixture();
  const profile = await service.signUp({email:" New@Example.com ",displayName:" Sunny "});
  assert.equal(profile.displayName,"Sunny"); assert.equal(profile.email,"new@example.com");
  assert.equal(profile.role,"player"); assert.match(profile.messageId,/^[A-Z0-9]{16}$/);
  assert.equal(records.get("messageIds/"+profile.messageId),profile.profileId);
  assert.equal(records.get("loginLookup/"+await loginKey("new@example.com","Sunny")),profile.profileId);
  assert.equal(records.get("sessions/browser-one").profileId,profile.profileId);
});

test("a simultaneous signup cannot replace a claimed profile",async ()=>{
  const {service,records} = fixture();
  service.api.runTransaction = async ()=>({snapshot:snapshot("the-winner")});
  await assert.rejects(service.signUp({email:"new@example.com",displayName:"Sunny"}),/just created/);
  assert.equal(records.has("users/new-player-1"),false);
  assert.equal(records.has("sessions/browser-one"),false);
});

test("unknown players never overwrite the current session",async ()=>{
  const {service,writes} = fixture();
  await assert.rejects(service.signIn({email:"missing@example.com",displayName:"Nobody"}),/couldn’t find/);
  assert.deepEqual(writes,[]);
});

test("restores a game session and follows account changes in another same-origin game",async ()=>{
  const {service,records,notify,watchers} = fixture({
    "sessions/browser-one":{profileId:"first",loginKey:"key"},
    "users/first":{displayName:"First",role:"host"},
    "users/second":{displayName:"Second",role:"player"}
  });
  service.watchAuth(service.auth.currentUser);
  assert.equal(service.profile.profileId,"first");
  const staleCallback = [...watchers.get("users/first")][0];
  records.set("sessions/browser-one",{profileId:"second",loginKey:"new"}); notify("sessions/browser-one");
  assert.equal(service.profile.profileId,"second");
  staleCallback(snapshot({displayName:"Old response"}));
  assert.equal(service.profile.profileId,"second","a delayed read must not restore a previous player");
  service.watchAuth(null); assert.equal(service.profile,null);
});

test("sign out clears the browser session and Firebase identity",async ()=>{
  const {service,records} = fixture({"sessions/browser-one":{profileId:"first"}});
  await service.signOut();
  assert.equal(records.has("sessions/browser-one"),false);
  assert.equal(service.auth.currentUser,null); assert.equal(service.profile,null);
});
