import test from 'node:test';
import assert from 'node:assert/strict';
import { GameCenterService } from '../src/services/game-center.js';
import { playerCards, hostHistory } from '../src/center-model.js';
import { GAMES, gameUrl } from '../src/catalog.js';
function fixture(role = 'master', records = {}) {
  const reads = [], writes = [];
  const session = { profile: { profileId: 'sean', displayName: 'Sean', role }, db: {}, auth: {currentUser:{uid:'browser'}}, ref: path => path || '', api: {
    get: async path => { reads.push(path); return {val:()=>records[path] ?? null}; },
    update: async (path, value) => { writes.push({path,value}); }, remove: async path => { writes.push({path,remove:true}); }
  }};
  return { service: new GameCenterService(session), session, reads, writes };
}
test('player cards merge by stable profile ID, keep game scores separate and strip private fields', () => {
  const cards = playerCards({googlefeud:{alice:{displayName:'Alice',totalPoints:90,email:'private',gameSummaries:{secret:1}}},sameslate:{alice:{displayName:'Alice',totalPoints:3}}}, {profileId:'new',displayName:'New',role:'player'});
  assert.equal(cards.length,2);assert.equal(cards[0].uid,'new');assert.equal(cards[1].games.googlefeud.totalPoints,90);assert.equal(cards[1].games.sameslate.totalPoints,3);
  assert.doesNotMatch(JSON.stringify(cards),/private|secret|email/);
});
test('history shows hosted games only, newest first, using validated room IDs', () => {
  assert.deepEqual(hostHistory({older:{role:'host',createdAt:1},joined:{role:'player',createdAt:9},newer:{role:'host',createdAt:2},'bad/id':{role:'host'}}).map(x=>x.id),['newer','older']);
});
test('regular players cannot read master accounts or host archives, or change roles', async () => {
  const f=fixture('player');
  await assert.rejects(f.service.masterData(),/Master/);await assert.rejects(f.service.hostedGames(),/Host/);await assert.rejects(f.service.setHost('friend',true,'player'),/Master/);
  assert.deepEqual(f.reads,[]);assert.deepEqual(f.writes,[]);
});
test('host approval changes only existing shared role fields and clears its request atomically', async () => {
  const f=fixture('master',{'users/friend':{displayName:'Friend',role:'player',messageId:'KEEP',email:'KEEP'}});
  await f.service.setHost('friend',true,'player');
  assert.equal(f.writes.length,1);const update=f.writes[0].value;
  assert.deepEqual(Object.keys(update).sort(),['hostRequests/friend','users/friend/hostNumber','users/friend/role','users/friend/updatedAt']);
  assert.equal(update['users/friend/role'],'host');assert.match(update['users/friend/hostNumber'],/^H-\d{5}$/);assert.equal(update['hostRequests/friend'],null);
});
test('protected and stale target roles cannot be overwritten', async () => {
  const f=fixture('master',{'users/protected':{role:'admin'},'users/changed':{role:'host'}});
  await assert.rejects(f.service.setHost('protected',false,'admin'),/protected/);
  await assert.rejects(f.service.setHost('changed',true,'player'),/changed/);
  await assert.rejects(f.service.setHost('sean',false,'master'),/another/);assert.deepEqual(f.writes,[]);
});
test('an account switch during an in-flight read cancels a pending role mutation', async () => {
  const f=fixture();f.session.api.get=async()=>{f.session.profile={profileId:'other',role:'master'};return{val:()=>({role:'player'})}};
  await assert.rejects(f.service.setHost('friend',true,'player'),/changed/);assert.deepEqual(f.writes,[]);
});
test('missing stats remain unavailable, and host pages do not reveal another host’s room', async () => {
  const f=fixture('host',{'games/other':{hostUid:'someone-else',nickname:'Private'}});
  f.session.api.get=async path=>{if(path==='playerStats')throw Error('offline');return{val:()=>null}};
  const result=await f.service.players();assert.deepEqual(result.failures,['googlefeud']);assert.equal(result.cards[0].uid,'sean');
  f.session.api.get=async()=>({val:()=>({hostUid:'someone-else',nickname:'Private'})});
  const rooms=await f.service.rooms('googlefeud',[{id:'other'}]);assert.equal(rooms[0].unavailable,true);assert.equal(rooms[0].nickname,undefined);
});
test('deep links preserve valid game routes and reject arbitrary destinations', () => {
  assert.equal(gameUrl(GAMES[0],'#/game/room-123/details'),'https://seansommer.github.io/googlefeud/#/game/room-123/details');
  for(const value of ['https://evil.example','#/game/../../admin/details','javascript:alert(1)'])assert.equal(gameUrl(GAMES[0],value),gameUrl(GAMES[0]));
});
