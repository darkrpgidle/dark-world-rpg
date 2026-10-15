import { balanceConfig } from "./balance-config";

export const IDLE_MAX_SECONDS = 43_200;
export const ONLINE_IDLE_REWARD_RATE = 0.2;
export type IdleTier = "normal" | "elite" | "guardian" | "boss";

export type IdleSnapshot = {
  mapId: number;
  floor: number;
  bestFloor: number;
  level: number;
  combatPower: number;
  recommendedPower: number;
  normalKillSeconds: number;
  measuredCombatPower: number;
  measuredFloor: number;
  expBonus: number;
  goldBonus: number;
  resourceDrop: number;
  enhanceDrop: number;
  reforgeDrop: number;
  equipmentDrop: number;
  setBonus: number;
  goldBlessing: boolean;
  enhanceBlessing: boolean;
  reforgeBlessing: boolean;
  treasureBonus: number;
  treasureUpgraded: boolean;
  highQualityDrop: number;
};

export type IdleSegment = { seconds: number; mode: "online" | "offline"; snapshot: IdleSnapshot };

export type IdleRewards = {
  kills: number;
  tiers: Record<IdleTier, number>;
  experience: number;
  gold: number;
  enhanceStones: number;
  reforgeStones: number;
  equipment: number;
  equipmentDrops: { mapId: number; tier: IdleTier; treasureUpgraded: boolean; treasureBonus: number; highQualityDrop: number }[];
  gemRolls: number[];
  drillingRolls: number;
};
export type IdleDropVoucher = { mapId: number; tier: IdleTier; treasureUpgraded: boolean; treasureBonus: number; highQualityDrop: number; count: number };

const tiers: IdleTier[] = ["normal", "elite", "guardian", "boss"];
const bounded = (value: unknown, minimum: number, maximum: number, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
};

export function normalizeIdleSnapshot(value: unknown): IdleSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<IdleSnapshot>;
  const mapId = Math.floor(bounded(raw.mapId, 1, balanceConfig.maps.length, 1));
  const bestFloor = Math.floor(bounded(raw.bestFloor, 1, 30, 1));
  return {
    mapId,
    floor: Math.floor(bounded(raw.floor, 1, 30, 1)),
    bestFloor,
    level: Math.floor(bounded(raw.level, 1, 100, 1)),
    combatPower: bounded(raw.combatPower, 0, 10_000_000, 0),
    recommendedPower: bounded(raw.recommendedPower, 1, 10_000_000, balanceConfig.maps[mapId - 1].power[0]),
    normalKillSeconds: bounded(raw.normalKillSeconds, 0, 120, 0),
    measuredCombatPower: bounded(raw.measuredCombatPower, 1, 10_000_000, bounded(raw.combatPower, 1, 10_000_000, 1)),
    measuredFloor: Math.floor(bounded(raw.measuredFloor, 1, 30, bestFloor)),
    expBonus: bounded(raw.expBonus, 0, 500, 0),
    goldBonus: bounded(raw.goldBonus, 0, 500, 0),
    resourceDrop: bounded(raw.resourceDrop, 0, 100, 0),
    enhanceDrop: bounded(raw.enhanceDrop, 0, 100, 0),
    reforgeDrop: bounded(raw.reforgeDrop, 0, 100, 0),
    equipmentDrop: bounded(raw.equipmentDrop, 0, 100, 0),
    setBonus: raw.setBonus === 1.2 ? 1.2 : raw.setBonus === 1.1 ? 1.1 : 1,
    goldBlessing: raw.goldBlessing === true,
    enhanceBlessing: raw.enhanceBlessing === true,
    reforgeBlessing: raw.reforgeBlessing === true,
    treasureBonus: bounded(raw.treasureBonus, 0, 0.15, 0),
    treasureUpgraded: raw.treasureUpgraded === true,
    highQualityDrop: bounded(raw.highQualityDrop, 0, 100, 0),
  };
}

export function legacyIdleSnapshot(save: Record<string, unknown>): IdleSnapshot {
  return normalizeIdleSnapshot(save.idleSnapshot ?? {
    mapId: save.mapId, floor: save.wave, level: save.level,
    bestFloor: (save.mapBestFloors as Record<string, number> | undefined)?.[String(save.mapId)] ?? save.wave,
    combatPower: save.combatPower,
    recommendedPower: balanceConfig.maps[Math.floor(bounded(save.mapId, 1, 9, 1)) - 1].power[0],
  })!;
}

export function normalizeIdleSegments(value: unknown): IdleSegment[] {
  if (!Array.isArray(value)) return [];
  const segments: IdleSegment[] = [];
  for (const entry of value.slice(-1024)) {
    if (Array.isArray(entry) && entry.length >= 24) {
      const [seconds, mode, mapId, floor, bestFloor, level, combatPower, recommendedPower,
        normalKillSeconds, measuredCombatPower, measuredFloor, expBonus, goldBonus,
        resourceDrop, enhanceDrop, reforgeDrop, equipmentDrop, setBonus, goldBlessing,
        enhanceBlessing, reforgeBlessing, treasureBonus, treasureUpgraded, highQualityDrop] = entry;
      const snapshot = normalizeIdleSnapshot({ mapId, floor, bestFloor, level, combatPower,
        recommendedPower, normalKillSeconds, measuredCombatPower, measuredFloor, expBonus,
        goldBonus, resourceDrop, enhanceDrop, reforgeDrop, equipmentDrop, setBonus,
        goldBlessing: Boolean(goldBlessing), enhanceBlessing: Boolean(enhanceBlessing),
        reforgeBlessing: Boolean(reforgeBlessing), treasureBonus,
        treasureUpgraded: Boolean(treasureUpgraded), highQualityDrop });
      if (snapshot && Number(seconds) > 0 && (mode === 0 || mode === 1))
        segments.push({ seconds: Math.floor(bounded(seconds, 0, IDLE_MAX_SECONDS, 0)),
          mode: mode === 0 ? "online" : "offline", snapshot });
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Partial<IdleSegment>;
    const snapshot = normalizeIdleSnapshot(raw.snapshot);
    if (!snapshot || (raw.mode !== "online" && raw.mode !== "offline")) continue;
    const seconds = Math.floor(bounded(raw.seconds, 0, IDLE_MAX_SECONDS, 0));
    if (seconds) segments.push({ seconds, mode: raw.mode, snapshot });
  }
  let total = segments.reduce((sum, segment) => sum + segment.seconds, 0);
  while (total > IDLE_MAX_SECONDS && segments.length) {
    const excess = Math.min(segments[0].seconds, total - IDLE_MAX_SECONDS);
    segments[0].seconds -= excess;
    total -= excess;
    if (!segments[0].seconds) segments.shift();
  }
  return segments;
}

export function packIdleSegments(segments: IdleSegment[]): number[][] {
  return normalizeIdleSegments(segments).map(({ seconds, mode, snapshot: s }) => [
    seconds, mode === "online" ? 0 : 1, s.mapId, s.floor, s.bestFloor, s.level,
    s.combatPower, s.recommendedPower, s.normalKillSeconds, s.measuredCombatPower,
    s.measuredFloor, s.expBonus, s.goldBonus, s.resourceDrop, s.enhanceDrop,
    s.reforgeDrop, s.equipmentDrop, s.setBonus, Number(s.goldBlessing),
    Number(s.enhanceBlessing), Number(s.reforgeBlessing), s.treasureBonus,
    Number(s.treasureUpgraded), s.highQualityDrop,
  ]);
}

export function normalizeIdleDropVouchers(value: unknown): IdleDropVoucher[] {
  if (!Array.isArray(value)) return [];
  const grouped = new Map<string, IdleDropVoucher>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Partial<IdleDropVoucher>;
    if (!tiers.includes(raw.tier as IdleTier)) continue;
    const mapId = Math.floor(bounded(raw.mapId, 1, 9, 1));
    const count = Math.floor(bounded(raw.count, 0, 25_000, 0));
    if (!count) continue;
    const treasureBonus = bounded(raw.treasureBonus, 0, 0.15, 0);
    const treasureUpgraded = raw.treasureUpgraded === true;
    const highQualityDrop = bounded(raw.highQualityDrop, 0, 100, 0);
    const key = `${mapId}:${raw.tier}:${treasureBonus}:${treasureUpgraded}:${highQualityDrop}`;
    const prior = grouped.get(key);
    grouped.set(key, { mapId, tier: raw.tier!, treasureBonus, treasureUpgraded, highQualityDrop, count: Math.min(25_000, (prior?.count ?? 0) + count) });
  }
  return [...grouped.values()];
}

export function takeIdleDrops(vouchers: IdleDropVoucher[], limit: number) {
  const pending = normalizeIdleDropVouchers(vouchers);
  const delivered: Omit<IdleDropVoucher, "count">[] = [];
  let remaining = Math.max(0, Math.floor(limit));
  for (const voucher of pending) {
    const amount = Math.min(voucher.count, remaining);
    for (let index = 0; index < amount; index += 1)
      delivered.push({ mapId: voucher.mapId, tier: voucher.tier, treasureBonus: voucher.treasureBonus, treasureUpgraded: voucher.treasureUpgraded, highQualityDrop: voucher.highQualityDrop });
    voucher.count -= amount;
    remaining -= amount;
  }
  return { delivered, pending: pending.filter((voucher) => voucher.count > 0) };
}

export function appendIdleSegment(existing: IdleSegment[], seconds: number, mode: IdleSegment["mode"], snapshot: IdleSnapshot): IdleSegment[] {
  const current = normalizeIdleSegments(existing);
  const room = IDLE_MAX_SECONDS - current.reduce((sum, segment) => sum + segment.seconds, 0);
  const added = Math.min(room, Math.max(0, Math.floor(seconds)));
  if (!added) return current;
  const previous = current[current.length - 1];
  // The current floor changes on every kill; keep the floor where this segment began.
  const newSignature = JSON.stringify({ ...snapshot, floor: undefined });
  if (previous && previous.mode === mode) {
    const oldSignature = JSON.stringify({ ...previous.snapshot, floor: undefined });
    if (oldSignature === newSignature) {
      previous.seconds += added;
      return current;
    }
  }
  current.push({ seconds: added, mode, snapshot });
  // One snapshot per meaningful change fits inside the existing 240 KB save limit.
  if (current.length > 1024) {
    const oldest = current.shift()!;
    current[0].seconds += oldest.seconds;
  }
  return current;
}

export function reconcileClientIdleProgress(input: {
  storedSeconds: number;
  segments: unknown;
  clientStoredSeconds: unknown;
  clientSegments: unknown;
  elapsedSeconds: number;
  online: boolean;
  snapshot: IdleSnapshot;
}) {
  const storedSeconds = Math.floor(bounded(input.storedSeconds, 0, IDLE_MAX_SECONDS, 0));
  let segments = normalizeIdleSegments(input.segments);
  const segmentSeconds = segments.reduce((sum, segment) => sum + segment.seconds, 0);
  if (!segments.length && storedSeconds > 0) {
    segments = appendIdleSegment([], storedSeconds, "offline", input.snapshot);
  } else if (segmentSeconds < storedSeconds) {
    segments = appendIdleSegment(segments, storedSeconds - segmentSeconds, "offline", input.snapshot);
  }

  const elapsed = Math.floor(bounded(input.elapsedSeconds, 0, IDLE_MAX_SECONDS, 0));
  const requestedDelta = Math.max(0,
    Math.floor(bounded(input.clientStoredSeconds, 0, IDLE_MAX_SECONDS, 0)) - storedSeconds,
  );
  const acceptedSeconds = input.online
    ? Math.min(requestedDelta, elapsed, IDLE_MAX_SECONDS - storedSeconds)
    : 0;

  if (acceptedSeconds > 0) {
    // Client segments are historical and can be forged wholesale. Only accept a
    // bounded new interval, tagged with the snapshot attached to this save.
    segments = appendIdleSegment(segments, acceptedSeconds, "online", input.snapshot);
  }

  return {
    storedSeconds: storedSeconds + acceptedSeconds,
    segments,
    acceptedSeconds,
  };
}

export function idleTier(floor: number): IdleTier {
  if (floor === 30) return "boss";
  if (floor % 10 === 0) return "guardian";
  if (floor % 5 === 0) return "elite";
  return "normal";
}

function newRewards(): IdleRewards {
  return { kills: 0, tiers: { normal: 0, elite: 0, guardian: 0, boss: 0 }, experience: 0, gold: 0, enhanceStones: 0, reforgeStones: 0, equipment: 0, equipmentDrops: [], gemRolls: [], drillingRolls: 0 };
}

function newcomerFactor(level: number) {
  const { throughLevel, multiplier, endsAtLevel } = balanceConfig.progression.newcomerExperience;
  return level <= throughLevel ? multiplier : level >= endsAtLevel ? 1 : multiplier - (level - throughLevel) / (endsAtLevel - throughLevel);
}

function floorPower(mapId: number, floor: number) {
  const map = balanceConfig.maps[mapId - 1];
  if (floor >= 30) return map.bossPower;
  const interpolate = (start: number, end: number, index: number, steps: number) =>
    start + (end - start) * index / steps;
  if (floor <= 10) return interpolate(map.power[0], map.phasePower[0], floor - 1, 9);
  if (floor <= 20) return interpolate(map.phasePower[0] * balanceConfig.mapFloors.phaseTwoStartMultiplier,
    map.phasePower[1], floor - 11, 9);
  return interpolate(map.phasePower[1] * balanceConfig.mapFloors.phaseThreeStartMultiplier,
    map.power[1], floor - 21, 8);
}

export function simulateIdleRewards(segments: IdleSegment[], random = Math.random, preview = false): IdleRewards {
  const result = newRewards();
  let priorMap = 0;
  let floor = 1;
  let remainder = 0;
  for (const segment of normalizeIdleSegments(segments)) {
    const snapshot = segment.snapshot;
    if (snapshot.mapId !== priorMap) { priorMap = snapshot.mapId; floor = snapshot.floor; remainder = 0; }
    const efficiency = Math.min(2, Math.max(0, snapshot.combatPower / snapshot.recommendedPower));
    // A character far below the saved floor requirement cannot farm it for free.
    if (efficiency < 0.45) continue;
    const rate = segment.mode === "online" ? ONLINE_IDLE_REWARD_RATE : 1;
    let budget = remainder + segment.seconds * rate * snapshot.setBonus;
    const map = balanceConfig.maps[snapshot.mapId - 1];
    const bestFloor = Math.min(30, Math.max(snapshot.floor, snapshot.bestFloor));
    const normalSeconds = Math.max(2, Math.min(120,
      snapshot.normalKillSeconds
        ? snapshot.normalKillSeconds * Math.min(2, Math.max(0.5, snapshot.measuredCombatPower / Math.max(1, snapshot.combatPower)))
        : 9 / Math.max(0.5, efficiency),
    ));
    const referenceFloor = snapshot.normalKillSeconds ? snapshot.measuredFloor : bestFloor;
    for (let tries = 0; tries < 25_000; tries += 1) {
      const tier = idleTier(floor);
      const hp = balanceConfig.mapFloors.monsterHealth;
      const floorScale = floorPower(snapshot.mapId, floor) / floorPower(snapshot.mapId, referenceFloor);
      const duration = Math.max(2, normalSeconds * floorScale *
        (hp[tier] * hp.combatMultiplier[tier]) / (hp.normal * hp.combatMultiplier.normal));
      if (budget < duration) break;
      budget -= duration;
      result.kills += 1;
      result.tiers[tier] += 1;
      const baseExp = preview ? (map.exp[0] + map.exp[1]) / 2 : map.exp[0] + Math.floor(random() * (map.exp[1] - map.exp[0] + 1));
      result.experience += Math.round(baseExp * balanceConfig.progression.experienceMultiplier * balanceConfig.mapFloors.experienceTier[tier] * newcomerFactor(snapshot.level) * (1 + snapshot.expBonus / 100));
      const gold = balanceConfig.economy.gold;
      result.gold += Math.round(gold.monsterDropBaseByMap[snapshot.mapId - 1] * (1 + (floor - 1) * gold.floorGrowth) * gold.tierMultiplier[tier] * (snapshot.goldBlessing ? 1.2 : 1) * (1 + snapshot.goldBonus / 100));
      const stoneBase = tier === "boss" || tier === "guardian" ? 1 : tier === "elite" ? 0.3 : 0.06;
      const stoneChance = Math.min(1, (stoneBase + (snapshot.resourceDrop + snapshot.enhanceDrop) / 100 + (snapshot.enhanceBlessing ? 0.1 : 0)) * balanceConfig.economy.enhancementStones.combatDropChanceMultiplier);
      const stoneCount = tier === "boss" || tier === "guardian" ? 2 : 1;
      const reforgeChance = Math.min(1, (tier === "boss" ? 0.35 : tier === "guardian" ? 0.15 : tier === "elite" ? 0.04 : 0.008) + (snapshot.resourceDrop + snapshot.reforgeDrop) / 100 + (snapshot.reforgeBlessing ? 0.05 : 0));
      const equipmentChance = tier === "boss" || tier === "guardian" ? 1 : Math.min(0.9, (tier === "elite" ? 0.55 : 0.3) + snapshot.equipmentDrop / 100 + snapshot.treasureBonus);
      if (preview) {
        result.enhanceStones += stoneChance * stoneCount;
        result.reforgeStones += reforgeChance;
        result.equipment += equipmentChance;
      } else {
        if (random() < stoneChance) result.enhanceStones += stoneCount === 2 ? 1 + Math.floor(random() * 3) : 1;
        if (random() < reforgeChance) result.reforgeStones += 1;
        if (random() < equipmentChance) {
          result.equipment += 1;
          result.equipmentDrops.push({ mapId: snapshot.mapId, tier, treasureBonus: snapshot.treasureBonus, treasureUpgraded: snapshot.treasureUpgraded, highQualityDrop: snapshot.highQualityDrop });
        }
        result.gemRolls.push(snapshot.mapId);
        result.drillingRolls += 1;
      }
      if (floor >= bestFloor) { floor = 1; budget = Math.max(0, budget - 10); }
      else floor += 1;
    }
    remainder = budget;
  }
  if (preview) {
    result.enhanceStones = Math.round(result.enhanceStones);
    result.reforgeStones = Math.round(result.reforgeStones);
    result.equipment = Math.round(result.equipment);
  }
  return result;
}
