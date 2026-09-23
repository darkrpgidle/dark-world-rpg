import { balanceConfig } from "./balance-config";

export type GemTier = "beginner" | "intermediate" | "advanced";
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
  | "greed";

export type GemStack = { gemId: GemId; tier: GemTier; quantity: number };
export type SocketedGem = { gemId: GemId; tier: GemTier };
export type EquipmentSockets = { socketCount: 0 | 1 | 2; gems: Array<SocketedGem | null> };

const ICONS: Record<GemId, string> = {
  redIron: "/gems/red-iron.png",
  azureGuard: "/gems/azure-guard.png",
  emeraldLife: "/gems/emerald-life.png",
  thunderlight: "/gems/thunderlight.png",
  eagleEye: "/gems/eagle-eye.png",
  phantom: "/gems/phantom.png",
  sunburst: "/gems/sunburst.png",
  blooddrop: "/gems/blooddrop.png",
  wisdom: "/gems/wisdom.png",
  greed: "/gems/greed.png",
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
};

export const GEM_IDS = Object.keys(ICONS) as GemId[];
export const GEM_TIERS: GemTier[] = ["beginner", "intermediate", "advanced"];

export function getGemDefinition(gemId: GemId, tier: GemTier) {
  const cfg = balanceConfig.gems.values[gemId];
  return {
    id: gemId,
    name: NAMES[gemId],
    tier,
    tierLabel: balanceConfig.gems.tiers[tier].label,
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
    const quantity = Math.max(0, Math.floor(Number((raw as GemStack).quantity ?? 0)));
    if (!GEM_IDS.includes(gemId) || !GEM_TIERS.includes(tier) || !quantity) return result;
    return addGemStack(result, { gemId, tier }, quantity);
  }, []);
}

export function rollGemDrop(mapIndex: number, random = Math.random): SocketedGem | null {
  const map = Math.max(1, Math.min(9, mapIndex));
  const eligible = (["advanced", "intermediate", "beginner"] as GemTier[])
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

export function fuseGem(
  inventory: GemStack[],
  gemId: GemId,
  tier: Exclude<GemTier, "advanced">,
  random = Math.random,
) {
  const required = balanceConfig.gems.fusion.materialCount;
  const current = inventory.find((stack) => stack.gemId === gemId && stack.tier === tier);
  if (!current || current.quantity < required) return null;
  const nextTier: GemTier = tier === "beginner" ? "intermediate" : "advanced";
  const successRate = tier === "beginner"
    ? balanceConfig.gems.fusion.beginnerToIntermediateSuccess
    : balanceConfig.gems.fusion.intermediateToAdvancedSuccess;
  const success = random() < successRate;
  const consumed = success ? required : required - 1;
  const afterConsume = consumeGemStack(inventory, { gemId, tier }, consumed)!;
  return {
    inventory: success ? addGemStack(afterConsume, { gemId, tier: nextTier }) : afterConsume,
    success,
    resultTier: success ? nextTier : tier,
  };
}

export function fuseGemSelection(
  inventory: GemStack[],
  materials: SocketedGem[],
  random = Math.random,
) {
  const required = balanceConfig.gems.fusion.materialCount;
  if (materials.length !== required) return null;
  const tier = materials[0]?.tier;
  if (!tier || tier === "advanced" || materials.some((gem) => gem.tier !== tier)) return null;

  const requiredCounts = new Map<string, number>();
  for (const gem of materials) {
    const key = gemStackKey(gem);
    requiredCounts.set(key, (requiredCounts.get(key) ?? 0) + 1);
  }
  for (const [key, quantity] of requiredCounts) {
    const stack = inventory.find((gem) => gemStackKey(gem) === key);
    if (!stack || stack.quantity < quantity) return null;
  }

  const nextTier: GemTier = tier === "beginner" ? "intermediate" : "advanced";
  const successRate = tier === "beginner"
    ? balanceConfig.gems.fusion.beginnerToIntermediateSuccess
    : balanceConfig.gems.fusion.intermediateToAdvancedSuccess;
  const success = random() < successRate;
  let next = inventory.map((stack) => ({ ...stack }));
  for (const gem of materials) next = consumeGemStack(next, gem, 1)!;

  if (!success) {
    const preserved = materials[Math.min(materials.length - 1, Math.floor(random() * materials.length))];
    return {
      inventory: addGemStack(next, preserved),
      success: false,
      result: null,
      preserved,
      successRate,
    };
  }

  const sameGem = materials.every((gem) => gem.gemId === materials[0].gemId);
  const resultSource = sameGem
    ? materials[0]
    : materials[Math.min(materials.length - 1, Math.floor(random() * materials.length))];
  const result: SocketedGem = { gemId: resultSource.gemId, tier: nextTier };
  return {
    inventory: addGemStack(next, result),
    success: true,
    result,
    preserved: null,
    successRate,
  };
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
