import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (context.parentURL?.includes("/app/") && specifier.startsWith("./") && !specifier.endsWith(".ts"))
    return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });

const { advanceOnlineYuanbao, preserveServerOnlineYuanbao } = await import("../app/online-yuanbao.ts");
const start = 1_800_000_000_000;
const legacy = () => ({ yuanbao: 300, adminRevision: 4, idleSeconds: 550, gold: 77 });

test("one minute heartbeat completes ten minutes and grants exactly ten yuanbao", () => {
  const initial = advanceOnlineYuanbao(legacy(), start, "session-a");
  assert.equal(initial.reward, 0);
  assert.equal(initial.save.idleSeconds, 550);
  const paid = advanceOnlineYuanbao(initial.save, start + 60_000, "session-a");
  assert.equal(paid.reward, 10);
  assert.equal(paid.save.yuanbao, 310);
  assert.equal(paid.save.idleSeconds, 10);
  assert.equal(paid.save.adminRevision, 5);
  assert.equal(paid.save.gold, 77);
  assert.equal(advanceOnlineYuanbao(paid.save, start + 60_000, "session-a").reward, 0);
  assert.equal(initial.save.yuanbao, 300);
});

test("offline gap and new login cannot mint the missing hours", () => {
  const live = advanceOnlineYuanbao({ ...legacy(), idleSeconds: 0 }, start, "session-a").save;
  const resumed = advanceOnlineYuanbao(live, start + 8 * 3_600_000, "session-a");
  assert.equal(resumed.reward, 0);
  assert.equal(resumed.save.idleSeconds, 90);
  const replaced = advanceOnlineYuanbao(resumed.save, start + 9 * 3_600_000, "session-b");
  assert.equal(replaced.reward, 0);
  assert.equal(replaced.save.idleSeconds, 90);
  assert.equal(replaced.save._onlineYuanbaoSessionId, "session-b");
});

test("repeated or out-of-order heartbeats never double credit time", () => {
  let save = advanceOnlineYuanbao({ ...legacy(), idleSeconds: 0 }, start, "session-a").save;
  save = advanceOnlineYuanbao(save, start + 60_000, "session-a").save;
  assert.equal(save.idleSeconds, 60);
  const repeat = advanceOnlineYuanbao(JSON.parse(JSON.stringify(save)), start + 60_000, "session-a");
  assert.equal(repeat.reward, 0);
  assert.equal(repeat.save.idleSeconds, 60);
  assert.equal(advanceOnlineYuanbao(repeat.save, start + 10_000, "session-a").reward, 0);
});

test("generic save cannot forge timestamps or earned seconds", () => {
  const server = advanceOnlineYuanbao(legacy(), start, "session-a").save;
  const incoming = { ...legacy(), idleSeconds: 599, _onlineYuanbaoSeconds: 599,
    _onlineYuanbaoAt: start - 3_600_000, _onlineYuanbaoSessionId: "forged" };
  const protectedSave = preserveServerOnlineYuanbao(incoming, server);
  assert.equal(protectedSave.idleSeconds, 550);
  assert.equal(protectedSave._onlineYuanbaoAt, start);
  assert.equal(protectedSave._onlineYuanbaoSessionId, "session-a");
  const initial = preserveServerOnlineYuanbao(incoming, null);
  assert.equal(initial._onlineYuanbaoAt, null);
  assert.equal(initial._onlineYuanbaoSessionId, null);
  assert.equal(initial.idleSeconds, 0);
});

test("malformed balances and counters reject payouts", () => {
  assert.equal(advanceOnlineYuanbao({ ...legacy(), yuanbao: -1 }, start, "session-a"), null);
  assert.equal(advanceOnlineYuanbao({ ...legacy(), adminRevision: 1.2 }, start, "session-a"), null);
  assert.equal(advanceOnlineYuanbao(legacy(), Number.NaN, "session-a"), null);
  assert.equal(advanceOnlineYuanbao(legacy(), start, ""), null);
});

