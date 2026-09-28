import { balanceConfig } from "./balance-config";

export const DAILY_HUNT_REWARD = balanceConfig.economy.dailyHuntReward;

const dateKey = /^\d{4}-\d{2}-\d{2}$/;

export function taipeiDailyDate(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
}

export function claimedDailyHuntDate(save: Record<string, unknown>): string | null {
  if (typeof save._lastDailyHuntClaimDate === "string" && dateKey.test(save._lastDailyHuntClaimDate))
    return save._lastDailyHuntClaimDate;
  // A legacy save may have already granted today's reward in the browser.
  if (save.dailyRewardClaimed === true && typeof save.dailyDate === "string" && dateKey.test(save.dailyDate))
    return save.dailyDate;
  return null;
}

export function preserveServerDailyHuntClaim(
  incoming: Record<string, unknown>, server: Record<string, unknown> | null,
): Record<string, unknown> {
  const claimDate = server ? claimedDailyHuntDate(server)
    : incoming.dailyRewardClaimed === true && typeof incoming.dailyDate === "string" &&
      dateKey.test(incoming.dailyDate) ? incoming.dailyDate : null;
  return { ...incoming, _lastDailyHuntClaimDate: claimDate,
    dailyRewardClaimed: claimDate !== null && claimDate === incoming.dailyDate };
}

function validBalance(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function applyDailyHuntClaim(
  save: Record<string, unknown>,
  request: { dailyDate?: string; dailyKills?: number },
  today = taipeiDailyDate(),
): { accepted: boolean; save: Record<string, unknown> } | null {
  if (claimedDailyHuntDate(save) === today) return { accepted: false, save };
  if (request.dailyDate !== today || !Number.isSafeInteger(request.dailyKills) ||
      (request.dailyKills as number) < DAILY_HUNT_REWARD.kills) return null;
  const balances = {
    gold: save.gold ?? 0, enhanceStones: save.enhanceStones ?? 0,
    reforgeStones: save.reforgeStones ?? 0, yuanbao: save.yuanbao ?? 0,
  };
  for (const field of ["gold", "enhanceStones", "reforgeStones", "yuanbao"] as const)
    if (!validBalance(balances[field]) || balances[field] > Number.MAX_SAFE_INTEGER - DAILY_HUNT_REWARD[field])
      return null;
  const revision = Number(save.adminRevision ?? 0);
  if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) return null;
  const next = {
    ...save, dailyDate: today,
    dailyKills: Math.max(Number(save.dailyDate === today ? save.dailyKills : 0) || 0, request.dailyKills as number),
    dailyRewardClaimed: true, _lastDailyHuntClaimDate: today,
    gold: (balances.gold as number) + DAILY_HUNT_REWARD.gold,
    enhanceStones: (balances.enhanceStones as number) + DAILY_HUNT_REWARD.enhanceStones,
    reforgeStones: (balances.reforgeStones as number) + DAILY_HUNT_REWARD.reforgeStones,
    yuanbao: (balances.yuanbao as number) + DAILY_HUNT_REWARD.yuanbao,
    adminRevision: revision + 1,
  };
  return { accepted: true, save: next };
}
