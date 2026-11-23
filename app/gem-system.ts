import { balanceConfig } from "./balance-config";

export type GemTier = "beginner" | "intermediate" | "advanced" | "lv4" | "lv5" | "lv6" | "lv7" | "lv8" | "lv9" | "lv10";
export type GemId =
  | "redIron"
  | "azureGuard"
  | "emeraldLife"
  | "thunderlight"
  | "eagleEye"
  | "phantom"
  | "sunburst"
  | "blooddrop"
  | "wisdom"
  | "greed" | "thorns" | "corrosion" | "rift" | "battlewill" | "arcana" | "bastion";

export type GemStack = { gemId: GemId; tier: GemTier; quantity: number; locked?: boolean };
export type SocketedGem = { gemId: GemId; tier: GemTier };
export type EquipmentSockets = { socketCount: 0 | 1 | 2; gems: Array<SocketedGem | null> };

const ICONS: Record<GemId, string> = {
  redIron: "/gems/red-iron.webp",
  azureGuard: "/gems/azure-guard.webp",
  emeraldLife: "/gems/emerald-life.webp",
  thunderlight: "/gems/thunderlight.webp",
  eagleEye: "/gems/eagle-eye.webp",
  phantom: "/gems/phantom.webp",
  sunburst: "/gems/sunburst.webp",
  blooddrop: "/gems/blooddrop.webp",
  wisdom: "/gems/wisdom.webp",
  greed: "/gems/greed.webp",
  thorns: "/gems/thorns.svg",
  corrosion: "/gems/corrosion.svg",
  rift: "/gems/rift.svg",
  battlewill: "/gems/battlewill.svg",
  arcana: "/gems/arcana.svg",
  bastion: "/gems/bastion.svg",

};

const NAMES: Record<GemId, string> = {
  redIron: "赤鐵石",
  azureGuard: "蒼壁石",
  emeraldLife: "翡翠生命石",
  thunderlight: "雷光石",
  eagleEye: "鷹眼石",
  phantom: "幻影石",
  sunburst: "烈陽石",
  blooddrop: "血滴石",
  wisdom: "智慧石",
  greed: "貪婪石",
  thorns: "荊棘石",
  corrosion: "蝕魂石",
  rift: "裂空石",
  battlewill: "戰意石",
  arcana: "秘法石",
  bastion: "壁壘石",

};

export const GEM_IDS = Object.keys(ICONS) as GemId[];
export const GEM_TIERS: GemTier[] = ["beginner", "intermediate", "advanced", "lv4", "lv5", "lv6", "lv7", "lv8", "lv9", "lv10"];

export function getGemDefinition(gemId: GemId, tier: GemTier) {
  const cfg = balanceConfig.gems.values[gemId];
  return {
    id: gemId,
    name: NAMES[gemId],
    tier,
    tierLabel: `Lv.${gemLevel(tier)}`,
    level: gemLevel(tier),
    icon: ICONS[gemId],
    stat: cfg.stat,
    value: cfg[tier],
  };
}

export function gemStackKey(gem: Pick<GemStack, "gemId" | "tier">) {
  return `${gem.gemId}:${gem.tier}`;
}

export function addGemStack(inventory: GemStack[], gem: SocketedGem, quantity = 1) {
  const next = inventory.map((stack) => ({ ...stack }));
  const existing = next.find((stack) => stack.gemId === gem.gemId && stack.tier === gem.tier);
  if (existing) existing.quantity += quantity;
  else next.push({ ...gem, quantity });
  return next.filter((stack) => stack.quantity > 0);
}

export function consumeGemStack(inventory: GemStack[], gem: SocketedGem, quantity = 1) {
  const next = inventory.map((stack) => ({ ...stack }));
  const existing = next.find((stack) => stack.gemId === gem.gemId && stack.tier === gem.tier);
  if (!existing || existing.quantity < quantity) return null;
  existing.quantity -= quantity;
  return next.filter((stack) => stack.quantity > 0);
}

export function normalizeGemInventory(value: unknown): GemStack[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<GemStack[]>((result, raw) => {
    if (!raw || typeof raw !== "object") return result;
    const gemId = (raw as GemStack).gemId;
    const tier = (raw as GemStack).tier;
    const quantity = Number((raw as GemStack).quantity ?? 0);
    if (!GEM_IDS.includes(gemId) || !GEM_TIERS.includes(tier) || !Number.isSafeInteger(quantity) || quantity <= 0) return result;
    const next = addGemStack(result, { gemId, tier }, quantity);
    if ((raw as GemStack).locked) next.find(g => g.gemId === gemId && g.tier === tier)!.locked = true;
    return next;
  }, []);
}

export function rollGemDrop(mapIndex: number, random = Math.random): SocketedGem | null {
  const map = Math.max(1, Math.min(9, mapIndex));
  const eligible = (["advanced", "intermediate", "beginner"] as const)
    .filter((tier) => map >= balanceConfig.gems.tiers[tier].mapFrom);
  const roll = random();
  let cursor = 0;
  for (const tier of eligible) {
    cursor += balanceConfig.gems.tiers[tier].dropChance;
    if (roll < cursor) {
      return { gemId: GEM_IDS[Math.floor(random() * GEM_IDS.length)], tier };
    }
  }
  return null;
}

export function rollDrillingStoneDrop(random = Math.random) {
  return random() < balanceConfig.equipment.sockets.drillingStoneDropChance;
}

export function rollNaturalSockets(random = Math.random): 0 | 1 | 2 {
  const { oneSocket, twoSockets } = balanceConfig.equipment.sockets.naturalDropChance;
  const roll = random();
  if (roll < twoSockets) return 2;
  if (roll < twoSockets + oneSocket) return 1;
  return 0;
}

export function createEquipmentSockets(random = Math.random): EquipmentSockets {
  const socketCount = rollNaturalSockets(random);
  return { socketCount, gems: Array.from({ length: socketCount }, () => null) };
}

export function normalizeEquipmentSockets(value: unknown): EquipmentSockets {
  if (!value || typeof value !== "object") return { socketCount: 0, gems: [] };
  const raw = value as { socketCount?: unknown; gems?: unknown };
  const socketCount = Math.max(0, Math.min(2, Math.floor(Number(raw.socketCount ?? 0)))) as 0 | 1 | 2;
  const source = Array.isArray(raw.gems) ? raw.gems : [];
  const gems = Array.from({ length: socketCount }, (_, index) => {
    const gem = source[index] as SocketedGem | null | undefined;
    if (!gem || !GEM_IDS.includes(gem.gemId) || !GEM_TIERS.includes(gem.tier)) return null;
    return { gemId: gem.gemId, tier: gem.tier };
  });
  return { socketCount, gems };
}

export function drillSocket(current: EquipmentSockets): EquipmentSockets | null {
  const normalized = normalizeEquipmentSockets(current);
  if (normalized.socketCount >= balanceConfig.equipment.sockets.maxSockets) return null;
  const socketCount = (normalized.socketCount + 1) as 1 | 2;
  return { socketCount, gems: [...normalized.gems, null] };
}

export function socketGem(current: EquipmentSockets, socketIndex: number, gem: SocketedGem): EquipmentSockets | null {
  const normalized = normalizeEquipmentSockets(current);
  if (socketIndex < 0 || socketIndex >= normalized.socketCount || normalized.gems[socketIndex]) return null;
  if (normalized.gems.some((existing) => existing?.gemId === gem.gemId)) return null;
  const gems = [...normalized.gems];
  gems[socketIndex] = gem;
  return { ...normalized, gems };
}

export function gemLevel(tier: GemTier) { return GEM_TIERS.indexOf(tier) + 1; }
export function fusionRate(tier: GemTier) { return balanceConfig.gems.successRates[gemLevel(tier) - 1] ?? 0; }
export function gemLabel(gem: SocketedGem) {
  const d = getGemDefinition(gem.gemId, gem.tier);
  return `${d.stat.replace(/%$/, "")} +${d.value}${["命中", "閃避"].includes(d.stat) ? "" : "%"}`;
}
export function fuseGem(inventory: GemStack[], gemId: GemId, tier: GemTier, random = Math.random) {
  const level = gemLevel(tier);
  const current = inventory.find(g => g.gemId === gemId && g.tier === tier);
  if (!current || current.locked || current.quantity < 2 || level < 1 || level >= 10) return null;
  const success = random() < fusionRate(tier);
  const after = consumeGemStack(inventory, {gemId, tier}, success ? 2 : 1)!;
  const nextTier = GEM_TIERS[level];
  return {inventory: success ? addGemStack(after, {gemId, tier: nextTier}) : after,
    success, resultTier: success ? nextTier : tier};
}
export function fuseGemSelection(inventory: GemStack[], materials: SocketedGem[], random = Math.random) {
  if (materials.length !== 2 || materials.some(g => g.gemId !== materials[0].gemId || g.tier !== materials[0].tier)) return null;
  const gem = materials[0], fused = fuseGem(inventory, gem.gemId, gem.tier, random);
  if (!fused) return null;
  return {...fused, result: fused.success ? {...gem, tier: fused.resultTier} : null,
    preserved: fused.success ? null : {...gem}, successRate: fusionRate(gem.tier)};
}
export function fuseGemBatch(inventory: GemStack[], options: {gemId?: GemId; targetLevel: number; reserve: number; maxMaterials: number; sourceTier?:GemTier}, random = Math.random) {
  if (!Number.isInteger(options.targetLevel) || options.targetLevel < 2 || options.targetLevel > 10 ||
      !Number.isSafeInteger(options.reserve) || options.reserve < 0 || !Number.isSafeInteger(options.maxMaterials) || options.maxMaterials < 2 || options.maxMaterials > 10000) return null;
  let next = normalizeGemInventory(inventory), successes = 0, failures = 0, consumed = 0, attempts = 0;
  for (let level = 1; level < options.targetLevel; level++) {
    if(options.sourceTier && GEM_TIERS[level-1]!==options.sourceTier)continue;
    for (const gemId of GEM_IDS) {
      if (options.gemId && options.gemId !== gemId) continue;
      const tier = GEM_TIERS[level - 1];
      while (consumed + 2 <= options.maxMaterials) {
        const stack = next.find(g => g.gemId === gemId && g.tier === tier);
        if (!stack || stack.locked || stack.quantity - options.reserve < 2) break;
        const fused = fuseGem(next, gemId, tier, random)!;
        next = fused.inventory; attempts++;
        if (fused.success) { successes++; consumed += 2; } else { failures++; consumed++; }
      }
    }
  }
  return {inventory: next, successes, failures, consumed, attempts};
}
export function gemInventoryDelta(current: GemStack[], before: GemStack[], after: GemStack[]) {
  let next = normalizeGemInventory(current);
  for (const id of GEM_IDS) for (const tier of GEM_TIERS) {
    const count = (list: GemStack[]) => list.find(g => g.gemId === id && g.tier === tier)?.quantity ?? 0;
    const delta = count(after) - count(before);
    if (delta > 0) next = addGemStack(next, {gemId:id,tier}, delta);
    if (delta < 0) { const reduced = consumeGemStack(next,{gemId:id,tier},-delta); if (!reduced) throw new Error("gem_inventory_conflict"); next = reduced; }
  }
  return next;
}

export function getSocketStatBonus(sockets: EquipmentSockets) {
  const totals: Record<string, number> = {};
  for (const gem of normalizeEquipmentSockets(sockets).gems) {
    if (!gem) continue;
    const definition = getGemDefinition(gem.gemId, gem.tier);
    totals[definition.stat] = (totals[definition.stat] ?? 0) + definition.value;
  }
  return totals;
}
