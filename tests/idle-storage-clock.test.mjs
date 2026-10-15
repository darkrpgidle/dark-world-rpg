import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {advanceIdleStorageClock, reconcileIdleStorageClock, resetIdleStorageClock} from '../app/idle-storage-clock.ts';
import {prepareIdleClaim, settleIdleSave} from '../app/idle-claim.ts';

const version = ms => new Date(ms).toISOString();
const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const start = page.indexOf('  useEffect(() => {\n    if (!saveReady || !playerId || sessionSuperseded) return;\n    const initial = idleStorageClockRef');
const end = page.indexOf('\n  }, [saveReady, playerId, sessionSuperseded]);', start);
const effect = new Function('env', `with(env){return (()=>{${page.slice(start + '  useEffect(() => {'.length, end)}})()}`);

test('the real page clock accrues 60 seconds during ultimate, defeat, boss, tabs and rapid target changes', () => {
  let now = 0, display = 300, tick, cleanup, listener;
  const env = {saveReady:true, playerId:'player', sessionSuperseded:false,
    idleStorageClockRef:{current:resetIdleStorageClock(null,300,0)},
    performance:{now:()=>now}, resetIdleStorageClock, advanceIdleStorageClock,
    setStoredSeconds:v=>{display=v},
    window:{setInterval:fn=>{tick=fn;return 1},clearInterval:()=>{tick=null}},
    document:{addEventListener:(_,fn)=>{listener=fn},removeEventListener:()=>{listener=null}}};
  cleanup = effect(env);
  for (now=250; now<=60_000; now+=250) {
    Object.assign(env,{wave:now/250,battleOn:false,runSummary:{},activeBossBattle:{},tab:'背包',ultimateAnimationLockRef:{current:1}});
    if (now%1000===0) tick();
  }
  assert.equal(display,360);
  assert.equal(typeof listener,'function');
  cleanup();assert.equal(tick,null);assert.equal(listener,null);
  for (const patch of [{saveReady:false},{sessionSuperseded:true},{playerId:null}]) {
    assert.equal(effect({...env,...patch}),undefined);
  }
});

test('a throttled/background timer catches elapsed time once and fractional seconds survive updates', () => {
  let clock=resetIdleStorageClock(null,120.125,0);
  for(let now=175;now<=700;now+=175) clock=advanceIdleStorageClock(clock,now);
  assert.ok(Math.abs(clock.seconds-120.825)<1e-9);
  clock=advanceIdleStorageClock(clock,60_000);assert.ok(Math.abs(clock.seconds-180.125)<1e-9);
  assert.equal(advanceIdleStorageClock(clock,60_000).seconds,clock.seconds);
  assert.equal(advanceIdleStorageClock(clock,59_000).seconds,clock.seconds);
  assert.equal(advanceIdleStorageClock(clock,86_400_000).seconds,43_200);
});

test('cloud counters reconcile the same interval without summing, rolling back or accepting older responses', () => {
  let clock=resetIdleStorageClock(null,300,0,version(1000));
  const epoch=clock.epoch;
  clock=advanceIdleStorageClock(clock,5000);
  clock=reconcileIdleStorageClock(clock,304,5000,epoch,version(2000));
  assert.equal(clock.seconds,305);
  clock=reconcileIdleStorageClock(clock,365,65_000,epoch,version(3000));
  assert.equal(clock.seconds,365);
  assert.equal(reconcileIdleStorageClock(clock,1000,65_000,epoch,version(2000)),clock);
  assert.equal(reconcileIdleStorageClock(clock,NaN,65_000,epoch,version(4000)),clock);
});

test('late cloud responses cannot restore time after claiming, rebirth or loading another canonical save', () => {
  const before=resetIdleStorageClock(null,7200,0,version(1000));
  for (const seconds of [0,30]) {
    let next=resetIdleStorageClock(before,seconds,3000,version(4000));
    assert.equal(reconcileIdleStorageClock(next,7203,4000,before.epoch,version(5000)),next);
    next=advanceIdleStorageClock(next,4000);assert.equal(next.seconds,seconds+1);
  }
});

test('server settlement retains sub-second intervals instead of losing them on frequent visibility changes', () => {
  let save={storedSeconds:300.125,lastSeenAt:1000};
  for(let now=1250;now<=2000;now+=250) save=settleIdleSave(save,now,'session').save;
  assert.equal(save.storedSeconds,301.125);
  assert.equal(settleIdleSave(save,2000,'session').save.storedSeconds,301.125);
  assert.equal(settleIdleSave(save,1000,'session').elapsedSeconds,0);
  assert.equal(settleIdleSave(save,86_400_000,'session').save.storedSeconds,43_200);
});

test('claim settles unsaved elapsed time once; retries preserve its receipt and later claims only consume new time', () => {
  const first=prepareIdleClaim({storedSeconds:60.25,lastSeenAt:1000},'claim',3750,'session');
  assert.equal(first.claimedSeconds,63);
  assert.equal(first.save.storedSeconds,0);
  const retry=prepareIdleClaim(first.save,'claim',6750,'session');
  assert.equal(retry.accepted,false);assert.equal(retry.claimedSeconds,63);
  const next=prepareIdleClaim(first.save,'next',6750,'session');assert.equal(next.claimedSeconds,3);
  assert.equal(prepareIdleClaim({storedSeconds:43_199,lastSeenAt:1000},'full',10000,'session').claimedSeconds,43_200);
});
