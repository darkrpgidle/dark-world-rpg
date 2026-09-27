import { balanceConfig } from "./balance-config";

const bundle = balanceConfig.economy.yuanbaoReforgeBundle;
const MAX_IDS = 256;

function purchaseIds(save: Record<string, unknown>): string[] {
  if (!Array.isArray(save._shopPurchaseIds)) return [];
  return save._shopPurchaseIds.filter((id): id is string =>
    typeof id === "string" && /^[a-f0-9-]{36}$/.test(id)).slice(-MAX_IDS);
}

const knownTitles = ["none", "night-watcher", "ash-conqueror", "abyss-survivor"] as const;
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

export function cosmeticSku(value: unknown): value is CosmeticSku {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(cosmeticIds, value);
}

// The client can carry pending purchases, but cannot remove or forge server receipts.
export function preserveServerShopPurchases(
  incoming: Record<string, unknown>, server: Record<string, unknown> | null,
): Record<string, unknown> {
  const titles = server ? owned(server.ownedTitles, knownTitles) : ["none"];
  const appearances = server ? owned(server.ownedAppearances, knownAppearances) : ["none"];
  const selectedTitle = titles.includes(incoming.selectedTitle as string) ? incoming.selectedTitle
    : titles.includes(server?.selectedTitle as string) ? server?.selectedTitle : "none";
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
  const ids = purchaseIds(save);
  if (ids.includes(purchaseId)) return { save, accepted: false };
  const { kind, id } = cosmeticIds[item];
  const titles = owned(save.ownedTitles, knownTitles);
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
    selectedTitle: kind === "title" ? id : save.selectedTitle,
    selectedAppearance: kind === "appearance" ? id : save.selectedAppearance,
    _shopPurchaseIds: [...ids, purchaseId].slice(-MAX_IDS),
  } };
}
