import { balanceConfig } from "./balance-config";

const rules = balanceConfig.economy.onlineYuanbao;

function elapsedSeconds(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, Math.min(rules.intervalSeconds - 1, Math.floor(amount))) : 0;
}

function onlineState(save: Record<string, unknown>) {
  return {
    seconds: elapsedSeconds(save._onlineYuanbaoSeconds ?? save.idleSeconds),
    at: typeof save._onlineYuanbaoAt === "number" && Number.isSafeInteger(save._onlineYuanbaoAt) && save._onlineYuanbaoAt >= 0
      ? save._onlineYuanbaoAt : null,
    session: typeof save._onlineYuanbaoSessionId === "string" ? save._onlineYuanbaoSessionId : null,
  };
}

// Generic autosaves can display the counter but cannot issue time or currency.
export function preserveServerOnlineYuanbao(
  incoming: Record<string, unknown>, server: Record<string, unknown> | null,
): Record<string, unknown> {
  const state = server ? onlineState(server) : { seconds: 0, at: null, session: null };
  return { ...incoming, idleSeconds: state.seconds,
    _onlineYuanbaoSeconds: state.seconds, _onlineYuanbaoAt: state.at,
    _onlineYuanbaoSessionId: state.session };
}

export function advanceOnlineYuanbao(
  save: Record<string, unknown>, now: number, sessionId: string,
): { save: Record<string, unknown>; reward: number } | null {
  if (!Number.isSafeInteger(now) || now < 0 || !sessionId) return null;
  const yuanbao = Number(save.yuanbao ?? 0);
  const revision = Number(save.adminRevision ?? 0);
  if (!Number.isSafeInteger(yuanbao) || yuanbao < 0 ||
      !Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) return null;
  const before = onlineState(save);
  const credited = before.at !== null && before.session === sessionId && now >= before.at
    ? Math.min(rules.heartbeatMaxSeconds, Math.floor((now - before.at) / 1_000)) : 0;
  const total = before.seconds + credited;
  const reward = Math.floor(total / rules.intervalSeconds) * rules.reward;
  if (yuanbao > Number.MAX_SAFE_INTEGER - reward) return null;
  return { reward, save: {
    ...save, idleSeconds: total % rules.intervalSeconds,
    _onlineYuanbaoSeconds: total % rules.intervalSeconds, _onlineYuanbaoAt: now,
    _onlineYuanbaoSessionId: sessionId, yuanbao: yuanbao + reward,
    adminRevision: revision + (reward > 0 ? 1 : 0),
  } };
}
