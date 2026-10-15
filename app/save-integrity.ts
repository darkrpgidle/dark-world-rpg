import {canonicalAffixes,affixName,affixOptions,type Item as AffixItem} from "./equipment-affixes";
import {invalidLoadout} from "./equipment-save-policy";
import {normalizeEquipmentSockets} from "./gem-system";
import { invalidSaveField } from "./save-field-schema";
import { balanceConfig } from "./balance-config";
import { dropPowerRange, enhancementGoldCost, enhancementStoneCost, enhancementStoneDismantleYield } from "./balance";
import { GEM_IDS, GEM_TIERS } from "./gem-system";
import { REBIRTH_REWARD_PER_TURN, clampRebirthCount } from "./rebirth-config";
import { findEquipmentDefinition } from "./mythic-data";
import { normalizeItemEpithets } from "./equipment-epithets";
import { elapsedIdleSeconds } from "./idle-claim";

type Save = Record<string, unknown>;
type Credit = "gold" | "experience" | "enhanceStones" | "reforgeStones" | "kills" | "items" | "worldDamage" | "gems" | "drillingStones" | "yuanbao";
type Guard = { at: number; credits: Record<Credit, number>; idleClaimId?: string };
export class SaveIntegrityError extends Error {
  reason: string;
  constructor(reason: string) { super(reason); this.reason = reason; }
}
const qualities = ["普通", "良好", "優秀", "史詩", "傳奇", "神話"];
const credits: Credit[] = ["gold", "experience", "enhanceStones", "reforgeStones", "kills", "items", "worldDamage", "gems", "drillingStones", "yuanbao"];
const object = (value: unknown): Save => value && typeof value === "object" && !Array.isArray(value) ? value as Save : {};
const array = (value: unknown): Save[] => Array.isArray(value) ? value.map(object) : [];
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const number = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const fail = (reason: string): never => { throw new SaveIntegrityError(reason); };
export function guardedExperienceRequired(level: number) {
  const r = balanceConfig.progression.experienceRequired;
  if (level <= r.early.throughLevel) return r.early.base + (level - 1) * r.early.perLevel;
  if (level <= r.mid.throughLevel) return r.mid.base + (level - r.early.throughLevel) * r.mid.perLevel;
  if (level <= r.late.throughLevel) return r.late.base + (level - r.mid.throughLevel) * r.late.perLevel;
  const late = level - 60;
  return r.endgame.base + late * r.endgame.perLevel + late * late * r.endgame.quadratic;
}
function lifetimeExperience(save: Save) {
  const level = number(save.level, 1);
  let total = save.xpSchemaVersion === 2 ? number(save.exp)
    : level >= 100 ? 0 : Math.round(guardedExperienceRequired(level) * Math.min(99, number(save.exp)) / 100);
  for (let level = 1; level < number(save.level, 1); level++) total += guardedExperienceRequired(level);
  return total;
}
function sale(item: Save) {
  const quality = qualities.indexOf(String(item.quality));
  const map = Math.max(1, Math.min(9, number(item.mapId, 1)));
  const bonus = (Array.isArray(item.affixes) ? item.affixes : []).reduce((sum: number, text: unknown) => {
    const match = String(text).match(/^金幣\s*\+?(\d+(?:\.\d+)?)%/); return sum + (match ? Number(match[1]) : 0);
  }, 0);
  return { gold: Math.round(balanceConfig.economy.dismantle.baseByMap[map - 1]
    * (balanceConfig.economy.dismantle.qualityMultiplier[item.quality as keyof typeof balanceConfig.economy.dismantle.qualityMultiplier] ?? 1)
    * (1 + bonus / 100 * balanceConfig.economy.gold.dismantleGoldAffixEffectiveness)),
    stones: enhancementStoneDismantleYield(Math.max(0, quality), number(item.enhance)) };
}
function roster(save: Save) { return [...array(save.items), ...array(save.mails).flatMap(mail => array(object(mail.rewards).items))]; }
function totalTalents(save: Save) { return Object.values(object(save.rebirthTalents)).reduce<number>((sum, value) => sum + number(value), number(save.rebirthPoints)); }

// Match the existing login migration for catalog names and ineligible epithets.
function identity(item: Save): Save {
  const definition = findEquipmentDefinition(item as { name?: string; mythicId?: string; legendaryId?: string });
  const normalized = { ...item, quality: String(item.quality), slot: String(item.slot),
    affixes: Array.isArray(item.affixes) ? item.affixes as string[] : [],
    equipmentType: item.quality === "神話" || item.equipmentType === "神話裝備" ? "神話裝備"
      : item.equipmentType === "特殊傳奇" ? "特殊傳奇" : "場景普通裝備" };
  const catalog: Save = definition ? { name: definition.name, slot: definition.slot, set: "",
      quality: definition.kind === "special-legendary" ? "傳奇" : "神話",
      equipmentType: definition.kind === "special-legendary" ? "特殊傳奇" : "神話裝備",
      ...(definition.kind === "special-legendary" ? { legendaryId: definition.id } : { mythicId: definition.id }) } : {};
  return normalizeItemEpithets({ ...normalized, ...catalog });
}

function affixMaximum(name: string, item: Save, map: number, rank: number) {
  if(item.worldBossRewardId&&item.worldBossRewardRank===1&&name==='暴擊傷害')return 30;
  const cfg = balanceConfig.equipment;
  if (["生命", "攻擊", "防禦"].includes(name)) {
    const slot = name === "攻擊" ? "武器" : name === "防禦" ? "胸甲" : "腰帶";
    const base = cfg.baseStats[slot].find(([stat]) => stat === name)!;
    const raw = Math.round((base[1] + map * base[2]) * cfg.baseScaleByMap[map] * cfg.baseQualityMultipliers[rank] * (item.set ? 1.15 : 1));
    // Universal affix pool, including the maximum eligible base-stat prefix.
    const currentMaximum = affixOptions(item as AffixItem).find(option => option.name === name)?.maximum ?? 0;
    return Math.max(1, currentMaximum, Math.round(Math.round(raw * 1.18) * cfg.affixes.flatQualityMultipliers[rank][1]));
  }
  if (name === "攻速") return cfg.affixes.speedQualityBands[rank][1] + Math.floor((map - 1) * cfg.affixes.speedMapGrowth);
  if (name === "命中" || name === "閃避") return cfg.affixes.ratingQualityBands[name][rank][1] + Math.min(2, Math.floor((map - 1) * cfg.affixes.ratingMapGrowth[name]));
  const band = (cfg.affixes.percentQualityBands as Record<string, readonly (readonly [number, number])[]>)[name];
  return band ? band[rank][1] + (name === "元寶掉率" ? 0 : 2) : -1;
}

// Containment firewall for legacy client-settled gameplay. It is deliberately
// separate from server-owned actions. This is NOT a full authoritative battle engine.
export function validateSaveTransition(incoming: Save, server: Save, now: number, savedAt: number): Save {
  const invalid=invalidSaveField(incoming);
  if(invalid)fail("invalid_save_field");
  const next: Save = { ...incoming, xpSchemaVersion: 2 };
  for (const field of ["gold", "yuanbao", "enhanceStones", "reforgeStones", "drillingStones", "level", "exp", "rebirthCount", "rebirthPoints", "dailyKills", "worldDamage", "combatPower"]) {
    if (!integer(next[field] ?? 0)) fail(`invalid_${field}`);
  }
  const level = number(next.level, 1), previousLevel = number(server.level, 1);
  const unchangedExperience = next.level === server.level && next.exp === server.exp;
  if (level < 1 || level > 100 || (!unchangedExperience && (level === 100 ? number(next.exp) !== 0 : number(next.exp) >= guardedExperienceRequired(level)))) fail("invalid_experience");
  const oldRebirth = clampRebirthCount(server.rebirthCount), rebirth = number(next.rebirthCount);
  const reborn = rebirth !== oldRebirth;
  if (reborn && !(rebirth === oldRebirth + 1 && rebirth <= 5 && previousLevel === 100
    && number(object(server.mapBestFloors)["9"]) >= 30 && server._lastSkillRebirthLegacyCount === oldRebirth
    && level === 1 && number(next.exp) === 0 && number(next.mapId) === 1 && number(next.unlockedMapId) === 1
    && array(next.items).length === 0 && array(next.mails).length === 0)) fail("unissued_rebirth");
  if (!reborn && level < previousLevel) fail("level_regression");
  for (const value of Object.values(object(next.rebirthTalents))) if (!integer(value)) fail("invalid_talents");
  if (totalTalents(next) > totalTalents(server) + (reborn ? REBIRTH_REWARD_PER_TURN.talentPoints : 0)) fail("unissued_talent_points");
  const unlocked = number(server.unlockedMapId, 1);
  if (!reborn) {
    if (!integer(next.unlockedMapId) || number(next.unlockedMapId) < unlocked || number(next.unlockedMapId) > Math.min(9, unlocked + 1)) fail("map_unlock_jump");
    if (number(next.unlockedMapId) > unlocked && number(object(next.mapBestFloors)[String(unlocked)]) < 30) fail("unearned_map_unlock");
    if (!integer(next.mapId) || number(next.mapId) < 1 || number(next.mapId) > number(next.unlockedMapId)
      || !integer(next.wave) || number(next.wave) < 1 || number(next.wave) > 30) fail("invalid_map_position");
  }
  const oldRoster = roster(server), newRoster = roster(next);
  if(invalidLoadout(next))fail("invalid_equipment_loadout");
  const oldItems = new Map<unknown, Save[]>();
  for (const item of oldRoster) oldItems.set(item.id, [...(oldItems.get(item.id) ?? []), item]);
  const oldCounts = new Map([...oldItems].map(([id, items]) => [id, items.length]));
  const newIds = new Map<unknown, number>(); let added = 0, saleGold = 0, saleStones = 0, enhancementGold = 0, enhancementStones = 0;
  for (const item of newRoster) {
    const count = (newIds.get(item.id) ?? 0) + 1;
    if (!integer(item.id) || count > Math.max(1, oldCounts.get(item.id) ?? 0)) fail("duplicate_or_invalid_item");
    newIds.set(item.id, count);
    // Old random IDs could collide during bulk offline drops. Preserve the
    // existing multiplicity, but never allow a new duplicate to enter.
    const candidates = oldItems.get(item.id) ?? [];
    const matching = candidates.findIndex(old => old.power === item.power && identity(old).name === identity(item).name);
    const old = candidates.splice(Math.max(0, matching), 1)[0], rank = qualities.indexOf(String(item.quality)), map = number(item.mapId, 1);
    if(item.worldBossRewardId!==old?.worldBossRewardId || item.worldBossRewardRank!==old?.worldBossRewardRank)fail('forged_world_boss_reward');
    if (rank < 0 || !integer(map) || map < 1 || map > 9 || !integer(item.enhance) || number(item.enhance) > 15 || !integer(item.power)) fail("invalid_equipment");
    if (!old || old.power !== item.power) {
      const range = dropPowerRange(map, rank);
      // Treasure blessing raises the rolled quality one tier and adds 38 power.
      const previousRange = dropPowerRange(map, Math.max(0, rank - 1));
      const raisedQuality = rank > 0 && rank <= 4 && number(item.power) >= previousRange.minimum + 38 && number(item.power) <= previousRange.maximum + 38;
      // At the legendary cap the treasure blessing keeps the quality and
      // still adds its 38 power bonus. This is the actual drop generator rule.
      const cappedQuality = rank === 4 && number(item.power) >= range.minimum + 38 && number(item.power) <= range.maximum + 38;
      const blessed = raisedQuality || cappedQuality;
      if (!blessed && (number(item.power) < range.minimum || number(item.power) > range.maximum)) fail("forged_equipment_power");
      if (old) fail("changed_equipment_power");
    }
    if (!old) { added++; if(number(item.reforgeCount)>0)fail("unissued_reforge"); if (map > number(next.unlockedMapId)) fail("forged_new_equipment"); }
    else {
      if(normalizeEquipmentSockets(item.sockets).socketCount!==normalizeEquipmentSockets(old.sockets).socketCount)fail("unissued_drill");
      const oldIdentity = identity(old), nextIdentity = identity(item);
      for (const field of ["name", "slot", "quality", "mapId", "mythicId", "legendaryId", "prefixId", "suffixId", "set", "equipmentType"]) {
        if (field === "equipmentType" && old[field] === undefined) continue;
        if (!same(oldIdentity[field], nextIdentity[field])) fail("changed_equipment_identity");
      }
    }
    // Drops can be enhanced before the first autosave. Charge their full
    // enhancement path from zero, using the same budget as existing gear.
    for (let step = (old ? number(old.enhance) : 0) + 1; step <= number(item.enhance); step++) {
      enhancementGold += enhancementGoldCost(step, { mapId: map, quality: String(item.quality), slot: String(item.slot) });
      enhancementStones += enhancementStoneCost(step);
    }
    if ((!old || !same(old.affixes, item.affixes)) && Array.isArray(item.affixes)) {
      if (item.affixes.length > balanceConfig.equipment.maxAffixesByQuality[rank]) fail("excessive_affixes");
      for (const text of item.affixes) {
      if (typeof text !== "string" || text.length > 100) fail("invalid_affix");
      const match = text.match(/^(.+?) \+(\d+(?:\.\d+)?)(%)?$/);
      const value = Number(match?.[2]), name = affixName(text);
      if (!match || !Number.isFinite(value) || value > affixMaximum(name, item, map, rank)) fail("forged_affix_value");
      if ((["生命", "攻擊", "防禦", "命中", "閃避"].includes(name) ? false : true) !== Boolean(match[3])) fail("invalid_affix_unit");
      }
    }
    if(old){
      const compatibleAffixes=canonicalAffixes(identity(old) as unknown as Parameters<typeof canonicalAffixes>[0]);
      if(!same(old.affixes,item.affixes)&&!same(compatibleAffixes,item.affixes))fail("unissued_reforge");
      if(number(item.reforgeCount)!==number(old.reforgeCount))fail("unissued_reforge");
    }

  }
  if (!reborn) for (const remaining of oldItems.values()) for (const old of remaining) {
    if(old.worldBossRewardId&&!array(server.items).some(item=>item.id===old.id))continue;
    const reward = sale(old); saleGold += reward.gold; saleStones += reward.stones;
  }
  let mailGold = 0, mailStones = 0, mailYuanbao = 0,mailReforgeStones=0;
  const previousMails = new Map(array(server.mails).map(mail => [mail.id, mail]));
  const mailIds = new Set<unknown>();
  for (const mail of array(next.mails)) {
    if ((typeof mail.id !== "string" && !integer(mail.id)) || mailIds.has(mail.id)) fail("duplicate_or_invalid_mail");
    mailIds.add(mail.id);
    const rewards = object(mail.rewards), old = previousMails.get(mail.id), previousRewards = object(old?.rewards);
    if(old&&String(mail.id).startsWith('world-boss:')){
      if(mail.expiresAt!==old.expiresAt)fail('changed_reward_mail');
      if(Date.parse(String(old.expiresAt))<=now&&(!same(rewards,previousRewards)||mail.claimed!==old.claimed))fail('expired_world_boss_reward');
    }
    if (!old) {
      if (number(rewards.gold) > 0 || number(rewards.stones) > 0 || number(rewards.yuanbao) > 0 || number(rewards.reforgeStones)>0) fail("forged_mail_rewards");
    } else if (!same(rewards, previousRewards)) {
      if (previousRewards.resourcesClaimed && rewards.resourcesClaimed !== true) fail("replayed_mail_rewards");
      for (const field of ["gold", "stones", "yuanbao","reforgeStones"]) if (number(rewards[field]) > number(previousRewards[field])) fail("increased_mail_rewards");
      if (!previousRewards.resourcesClaimed && rewards.resourcesClaimed === true) {
        if(String(mail.id).startsWith('world-boss:')&&Date.parse(String(old?.expiresAt))<=now)fail('expired_world_boss_reward');
        mailReforgeStones+=number(previousRewards.reforgeStones);
        mailGold += number(previousRewards.gold); mailStones += number(previousRewards.stones); mailYuanbao += number(previousRewards.yuanbao);
      }
    }
  }
  for(const mail of array(server.mails).filter(mail=>String(mail.id).startsWith('world-boss:')&&!mail.claimed)){
    if(!array(next.mails).some(nextMail=>nextMail.id===mail.id)){
      if(Date.parse(String(mail.expiresAt))>now)fail('missing_world_reward_mail');
      if(array(object(mail.rewards).items).some(item=>array(next.items).some(nextItem=>nextItem.id===item.id)))fail('expired_world_boss_reward');
    }
  }
  const oldGuard = object(server._saveIntegrity), oldCredits = object(oldGuard.credits);
  const at = number(oldGuard.at, Number.isFinite(savedAt) ? Math.min(savedAt, number(server.lastSeenAt, savedAt)) : now);
  const elapsed = Math.min(90, Math.max(0, (now - at) / 1000));
  // Broad legitimate ceilings; repeated writes share a spent server-side budget.
  const map = Math.max(1, Math.min(9, unlocked));
  const goldPerKill = balanceConfig.economy.gold.monsterDropBaseByMap[map - 1] * 1.87 * 8 * 8;
  const expPerKill = balanceConfig.maps[map - 1].exp[1] * 12 * balanceConfig.progression.experienceMultiplier * 2 * 8;
  const rates: Record<Credit, number> = { gold: goldPerKill * 8, experience: expPerKill * 8,
    enhanceStones: 24, reforgeStones: 8, kills: 8, items: 16, worldDamage: Math.max(100_000, Math.min(10_000_000, number(server.combatPower) * 1000)), gems: 72, drillingStones: 8, yuanbao: 8 };
  const available = Object.fromEntries(credits.map(field => [field, Math.min(number(oldCredits[field]), rates[field] * 30) + rates[field] * elapsed])) as Record<Credit, number>;
  const claimId = typeof server._lastIdleClaimId === "string" ? server._lastIdleClaimId : undefined;
  const idleSeconds = claimId && claimId !== oldGuard.idleClaimId ? Math.min(43200, number(server._lastIdleClaimSeconds)) : 0;
  if (idleSeconds) {
    const kills = Math.floor(idleSeconds / 12); available.kills += kills;
    available.gold += idleSeconds / 3600 * 920 * 16;
    available.experience += kills * balanceConfig.maps[map - 1].exp[1] * 3 * 2 * 16;
    available.enhanceStones += idleSeconds / 3600 * 6 * 2 + kills * 4;
    available.items += kills; available.reforgeStones += kills;
    available.gems += kills * 9; available.drillingStones += kills;
  }
  const today = new Date(now).toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  next.dailyDate = today;
  if (server.dailyDate !== today && incoming.dailyDate !== today) next.dailyKills = 0;
  if (server.dailyDate !== today && incoming.dailyDate !== today) next.worldDamage = 0;
  const kills = Math.max(0, number(next.dailyKills) - (server.dailyDate === today ? number(server.dailyKills) : 0));
  let personalVictories = 0;
  for (const [field, limit] of [["bossTickets", 10], ["worldAttempts", 3]] as const) {
    if (next[field] === undefined && server[field] === undefined) continue;
    const previous = server.dailyDate === today ? number(server[field], limit) : limit;
    if (!integer(next[field]) || number(next[field]) > previous) fail("unissued_boss_attempts");
    if (field === "bossTickets") personalVictories = Math.max(0, previous - number(next[field]));
  }
  // Personal victories yield up to (map * 2) * 4 reforge stones and two items.
  available.reforgeStones += personalVictories * map * 8;
  available.items += personalVictories * 2;
  if (number(next.yuanbao) > number(server.yuanbao) + mailYuanbao + kills + personalVictories) fail("unissued_yuanbao");
  let progressedFloors = 0;
  if (!reborn) for (let id = 1; id <= 9; id++) {
    const floor = object(next.mapBestFloors)[String(id)] ?? 0;
    if (!integer(floor) || floor > 30 || (id > number(next.unlockedMapId) && floor > 0)) fail("invalid_best_floor");
    progressedFloors += Math.max(0, number(floor) - number(object(server.mapBestFloors)[String(id)]));
  }
  const goldSpent = Math.max(0, number(server.gold) - number(next.gold));
  const stonesSpent = Math.max(0, number(server.enhanceStones) - number(next.enhanceStones));
  const goldShopStones = Math.floor(goldSpent / 100_000) * 50;
  const reforgeShopStones = Math.floor(goldSpent / 200_000) * 10;
  const gambleCount = Math.floor(Math.max(0, number(server.yuanbao) - number(next.yuanbao)) / 10);
  const cost: Record<Credit, number> = {
    gold: Math.max(0, number(next.gold) - number(server.gold) + enhancementGold - saleGold - mailGold),
    experience: reborn ? 0 : Math.max(0, lifetimeExperience(next) - lifetimeExperience(server)),
    enhanceStones: Math.max(0, number(next.enhanceStones) - number(server.enhanceStones) + enhancementStones - saleStones - mailStones - goldShopStones),
    reforgeStones: Math.max(0, number(next.reforgeStones) - number(server.reforgeStones) - reforgeShopStones - gambleCount * 10-mailReforgeStones),
    kills: Math.max(kills, progressedFloors), items: Math.max(0, added - gambleCount),
    worldDamage: Math.max(0, number(next.worldDamage) - (server.dailyDate === today ? number(server.worldDamage) : 0)),
    drillingStones: Math.max(0, number(next.drillingStones) - number(server.drillingStones)), gems: 0,
    yuanbao: Math.max(0, number(next.yuanbao) - number(server.yuanbao) - mailYuanbao),
  };
  if (enhancementGold > goldSpent + available.gold + saleGold + mailGold || enhancementStones > stonesSpent + available.enhanceStones + saleStones + mailStones) fail("unfunded_enhancement");
  const gemValue = (save: Save) => {
    let value = 0; const seen = new Set<string>();
    for (const gem of array(save.gemInventory)) {
      const rank = GEM_TIERS.indexOf(gem.tier as typeof GEM_TIERS[number]);
      const key = `${gem.gemId}:${gem.tier}`;
      if (!GEM_IDS.includes(gem.gemId as typeof GEM_IDS[number]) || rank < 0 || !integer(gem.quantity) || seen.has(key)) fail("invalid_gem_inventory");
      seen.add(key); value += number(gem.quantity) * 3 ** rank;
    }
    for (const item of roster(save)) {
      const sockets = object(item.sockets);
      if (Object.keys(sockets).length === 0) continue;
      if (!integer(sockets.socketCount) || number(sockets.socketCount) > 2 || !Array.isArray(sockets.gems) || sockets.gems.length > 2) fail("invalid_sockets");
      for (const entry of sockets.gems as unknown[]) if (entry !== null) {
        const gem = object(entry), rank = GEM_TIERS.indexOf(gem.tier as typeof GEM_TIERS[number]);
        if (!GEM_IDS.includes(gem.gemId as typeof GEM_IDS[number]) || rank < 0) fail("invalid_socket_gem");
        value += 3 ** rank;
      }
    }
    if (!Number.isSafeInteger(value)) fail("invalid_gem_total");
    return value;
  };
  cost.gems = Math.max(0, gemValue(next) - gemValue(server));
  for (const field of credits) if (cost[field] > available[field] + 0.000001) fail(`excessive_${field}`);
  const maximumPower = 50_000 + level * 3000 + array(next.items).reduce((sum, item) => sum + number(item.power) * 100, 0);
  if (number(next.combatPower) > maximumPower && next.combatPower !== server.combatPower) fail("forged_combat_power");
  const guard: Guard = { at: now, credits: Object.fromEntries(credits.map(field => [field, Math.max(0, available[field] - cost[field])])) as Record<Credit, number>, ...(claimId ? { idleClaimId: claimId } : {}) };
  next._saveIntegrity = guard;
  next.lastSeenAt = now;
  // Browser timestamps and offline storage may not mint additional claim time.
  next.storedSeconds = reborn ? 0 : Math.min(43200, number(server.storedSeconds) + elapsedIdleSeconds(server, now));
  return next;
}
