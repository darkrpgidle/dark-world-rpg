import { balanceConfig } from "./balance-config";

const bundle = balanceConfig.economy.yuanbaoReforgeBundle;
const MAX_IDS = 256;

function purchaseIds(save: Record<string, unknown>): string[] {
  if (!Array.isArray(save._shopPurchaseIds)) return [];
  return save._shopPurchaseIds.filter((id): id is string =>
    typeof id === "string" && /^[a-f0-9-]{36}$/.test(id)).slice(-MAX_IDS);
}

// The client can carry pending purchases, but cannot remove or forge server receipts.
export function preserveServerShopPurchases(
  incoming: Record<string, unknown>, server: Record<string, unknown> | null,
): Record<string, unknown> {
  return { ...incoming, _shopPurchaseIds: server ? purchaseIds(server) : [] };
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
