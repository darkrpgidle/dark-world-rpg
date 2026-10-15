import { balanceConfig } from "./balance-config";
import { legacyRebirthReward } from "./legacy-rebirth-rewards";

const bundle = balanceConfig.economy.yuanbaoReforgeBundle;
const MAX_IDS = 256;

function purchaseIds(save: Record<string, unknown>): string[] {
  if (!Array.isArray(save._shopPurchaseIds)) return [];
  return save._shopPurchaseIds.filter((id): id is string =>
    typeof id === "string" && /^[a-f0-9-]{36}$/.test(id)).slice(-MAX_IDS);
}

const knownTitles = ["none", "night-watcher", "ash-conqueror", "abyss-survivor", "beta-reincarnator", "seasoned-reincarnator", "elite-reincarnator", "abyss-reincarnator"] as const;
const legacyTitleIds = ["beta-reincarnator", "seasoned-reincarnator", "elite-reincarnator", "abyss-reincarnator"] as const;
const knownAppearances = ["none", "ember-aura", "arcane-aura", "abyss-aura"] as const;
export type CosmeticSku = keyof typeof balanceConfig.economy.yuanbaoCosmetics;
const cosmeticIds: Record<CosmeticSku, { kind: "title" | "appearance"; id: string }> = {
  "title-ash": { kind: "title", id: "ash-conqueror" },
  "title-abyss": { kind: "title", id: "abyss-survivor" },
  "appearance-ember": { kind: "appearance", id: "ember-aura" },
  "appearance-arcane": { kind: "appearance", id: "arcane-aura" },
  "appearance-abyss": { kind: "appearance", id: "abyss-aura" },
};

function owned(value: unknown, allowed: readonly string[]): string[] {
  return ["none", ...new Set(
    Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && id !== "none" && allowed.includes(id)) : [],
  )];
}

function ownedTitlesForLegacyCount(value: unknown, legacyRebirthCount: unknown) {
  const titles = owned(value, knownTitles);
  const safeCount = typeof legacyRebirthCount === "number" && Number.isSafeInteger(legacyRebirthCount)
    ? Math.max(0, Math.min(20, legacyRebirthCount)) : 0;
  const highestLegacyTitle = legacyRebirthReward(safeCount).titleId;
  return [...titles.filter((id) => !legacyTitleIds.includes(id as typeof legacyTitleIds[number])),
    ...(highestLegacyTitle ? [highestLegacyTitle] : [])];
}

export function cosmeticSku(value: unknown): value is CosmeticSku {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(cosmeticIds, value);
}

function cosmeticRequirementMet(save: Record<string, unknown>, item: CosmeticSku) {
  if (item !== "title-ash" && item !== "title-abyss") return true;
  const bestFloors = save.mapBestFloors;
  if (!bestFloors || typeof bestFloors !== "object" || Array.isArray(bestFloors)) return false;
  const floors = bestFloors as Record<string, unknown>;
  if (item === "title-ash") return Number.isInteger(floors[1]) && Number(floors[1]) >= 30;
  return save.finalBossDefeated === true || (Number.isInteger(floors[9]) && Number(floors[9]) >= 30);
}

// The client can carry pending purchases, but cannot remove or forge server receipts.
export function preserveServerShopPurchases(
  incoming: Record<string, unknown>, server: Record<string, unknown> | null,
): Record<string, unknown> {
  const eligibleLegacyTitle = server
    ? legacyRebirthReward(typeof server.legacyRebirthCount === "number" ? server.legacyRebirthCount : 0).titleId
    : null;
  const titles = server ? ownedTitlesForLegacyCount(server.ownedTitles, server.legacyRebirthCount) : ["none"];
  const appearances = server ? owned(server.ownedAppearances, knownAppearances) : ["none"];
  const selectedTitle = titles.includes(incoming.selectedTitle as string) ? incoming.selectedTitle
    : titles.includes(server?.selectedTitle as string) ? server?.selectedTitle : eligibleLegacyTitle ?? "none";
  const selectedAppearance = appearances.includes(incoming.selectedAppearance as string) ? incoming.selectedAppearance
    : appearances.includes(server?.selectedAppearance as string) ? server?.selectedAppearance : "none";
  return { ...incoming, _shopPurchaseIds: server ? purchaseIds(server) : [],
    ownedTitles: titles, ownedAppearances: appearances, selectedTitle, selectedAppearance };
}

export function buyYuanbaoReforgeBundle(
  save: Record<string, unknown>, purchaseId: string,
): { save: Record<string, unknown>; accepted: boolean } | null {
  if (!/^[a-f0-9-]{36}$/.test(purchaseId)) return null;
  const ids = purchaseIds(save);
  if (ids.includes(purchaseId)) return { save, accepted: false };
  const yuanbao = save.yuanbao;
  const stones = save.reforgeStones;
  const revision = save.adminRevision ?? 0;
  if (typeof yuanbao !== "number" || !Number.isSafeInteger(yuanbao) || yuanbao < bundle.price ||
      typeof stones !== "number" || !Number.isSafeInteger(stones) || stones < 0 ||
      typeof revision !== "number" || !Number.isSafeInteger(revision) ||
      revision < 0 || revision >= Number.MAX_SAFE_INTEGER ||
      stones > Number.MAX_SAFE_INTEGER - bundle.stones) return null;
  return { accepted: true, save: { ...save,
    yuanbao: yuanbao - bundle.price,
    reforgeStones: stones + bundle.stones,
    adminRevision: revision + 1,
    _shopPurchaseIds: [...ids, purchaseId].slice(-MAX_IDS),
  } };
}

export function buyYuanbaoCosmetic(
  save: Record<string, unknown>, item: CosmeticSku, purchaseId: string,
): { save: Record<string, unknown>; accepted: boolean } | null {
  if (!cosmeticSku(item) || !/^[a-f0-9-]{36}$/.test(purchaseId)) return null;
  if (!cosmeticRequirementMet(save, item)) return null;
  const ids = purchaseIds(save);
  if (ids.includes(purchaseId)) return { save, accepted: false };
  const { kind, id } = cosmeticIds[item];
  const titles = ownedTitlesForLegacyCount(save.ownedTitles, save.legacyRebirthCount);
  const appearances = owned(save.ownedAppearances, knownAppearances);
  if ((kind === "title" ? titles : appearances).includes(id)) return null;
  const price = balanceConfig.economy.yuanbaoCosmetics[item];
  const yuanbao = save.yuanbao;
  const revision = save.adminRevision ?? 0;
  if (typeof yuanbao !== "number" || !Number.isSafeInteger(yuanbao) || yuanbao < price ||
      typeof revision !== "number" || !Number.isSafeInteger(revision) ||
      revision < 0 || revision >= Number.MAX_SAFE_INTEGER) return null;
  return { accepted: true, save: { ...save,
    yuanbao: yuanbao - price, adminRevision: revision + 1,
    ownedTitles: kind === "title" ? [...titles, id] : titles,
    ownedAppearances: kind === "appearance" ? [...appearances, id] : appearances,
    selectedTitle: kind === "title" ? id : titles.includes(save.selectedTitle as string) ? save.selectedTitle : legacyRebirthReward(typeof save.legacyRebirthCount === "number" ? save.legacyRebirthCount : 0).titleId ?? "none",
    selectedAppearance: kind === "appearance" ? id : save.selectedAppearance,
    _shopPurchaseIds: [...ids, purchaseId].slice(-MAX_IDS),
  } };
}
