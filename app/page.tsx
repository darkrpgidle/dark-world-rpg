"use client";
import {formatAssessedPower} from "./power-display";
import {saveJsonWithTimeout} from "./save-request";
import { firstChapterPower, firstChapterHealth, secondChapterPower, secondChapterHealth } from "./balance";
import { armorThreshold, armorMitigation, monsterArmorRating, additiveDamageMultiplier } from "./combat-math";

import {retainCombatCadence,type CombatCadence} from "./combat-cadence";
import {advanceIdleStorageClock, reconcileIdleStorageClock, resetIdleStorageClock, type IdleStorageClock} from "./idle-storage-clock";
import {safeLoadouts} from "./equipment-save-policy";
import {affixOptions as sharedAffixOptions,rollAffixes as sharedRollAffixes,equipmentBaseStats as sharedEquipmentBaseStats} from "./equipment-affixes";

import { useGmInbox, GmInboxMessages } from "./gm-mail-ui";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import {
  Backpack,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Crown,
  Flame,
  Heart,
  Gem,
  History,
  LockKeyhole,
  LogOut,
  Mail,
  Map as MapIcon,
  PackageOpen,
  ShoppingCart,
  RefreshCw,
  ScrollText,
  Settings,
  Shield,
  Target,
  Skull,
  Sparkles,
  Swords,
  Trophy,
  WandSparkles,
  Zap,
  Trash2,
  Activity,
  Droplets,
  Gauge,
  ShieldCheck,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import NextImage from "next/image";
import { WebGLBloodRoarHitVfx } from "./webgl-blood-roar-hit-vfx";
import { WebGLBloodRoarVfx } from "./webgl-blood-roar-vfx";
import { BloodRoarBuffVfx } from "./blood-roar-buff-vfx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  classes,
  items as initialItems,
  maps,
  monsterImages,
  NavItem,
  navItems,
  personalBosses,
  qualityColors,
  worldBosses,
  type GameClass,
} from "./game-data";
import {
  dropPowerRange,
  enhancementBonusPercent,
  enhancementFailureLevel,
  enhancementGoldCost,
  enhancementStoneDismantleYield,
  enhancementStoneDropChance,
  enhancementStoneCost,
  equipmentReforgeCost,
  evadeChanceFromRatings,
  gamblePackageReward,
  healthFromPercent,
  healthPercentFromDamage,
  hitChanceFromRatings,
  lateGameMonsterScale,
  monsterRatingsForMap,
  monsterProfile,
  realmSuppression,
  towerCombatValues,
} from "./balance";
import { balanceConfig } from "./balance-config";
import { nextLootId } from "./loot-id";
import { combatStatusLabel } from "./skill-status-label";
import { MAX_REBIRTHS, REBIRTH_REWARD_PER_TURN, clampRebirthCount } from "./rebirth-config";
import {
  addGemStack,
  createEquipmentSockets,
  fuseGemSelection,
  GEM_TIERS,
  gemStackKey,
  getGemDefinition,
  getSocketStatBonus,
  normalizeEquipmentSockets,
  normalizeGemInventory,
  rollDrillingStoneDrop,
  rollGemDrop,
  socketGem,
  type EquipmentSockets,
  type GemStack,
  type SocketedGem,
} from "./gem-system";
import { SkillEffectCanvas } from "./skill-effect-canvas";
import { WebGLBloodBrandVfx } from "./webgl-blood-brand-vfx";
import { WebGLBerserkerStanceVfx } from "./webgl-berserker-stance-vfx";
import { WebGLArmorSmashVfx } from "./webgl-armor-smash-vfx";
import { WebGLTitanEchoVfx, WebGLTitanRiftVfx } from "./webgl-titan-rift-vfx";
import { WebGLBloodBladeVfx } from "./webgl-blood-blade-vfx";
import { WebGLGroundSplitVfx } from "./webgl-ground-split-vfx";
import { RangerTailwindArrowVfx } from "./ranger-tailwind-arrow-vfx";
import { WebGLUnyieldingWillVfx } from "./webgl-unyielding-will-vfx";
import { SkillReworkPanel } from "./skill-rework-panel";
import { SKILL_REWORK_CATALOG, createSkillBuild, restoreSkillBuild, earnedSkillPoints, spentSkillPoints, type SkillBuild } from "./skill-rework";
import { equippedLegacyRebirthReward, legacyRebirthReward } from "./legacy-rebirth-rewards";
import { equippedCosmeticBonuses } from "./cosmetic-bonuses";
import {
  equippedSetAttackMultiplier as calculateEquippedSetAttackMultiplier,
  equippedSetCountAtThreshold,
  equippedSetGroups as groupEquippedSets,
  equippedSetOfflineMultiplier,
} from "./set-bonuses";
import { beginSkillBattleCutover, settleCutoverAction } from "./skill-combat-cutover";
import { createSkillDamageLedger } from "./skill-damage-settlement";
import { refreshCombatStatusCountdowns, type TimedCombatStatus } from "./combat-status-countdown";
import { advanceLiveCombatEvents, liveEnemyControl, liveCombatSpeedBonus, resolveLiveCombatAttack, resolveLiveEnemyAttack, syncLiveCombat, type LiveCombatBattle, type LiveDotDamageEvent } from "./skill-live-combat";
import { splitMythicDamage } from "./skill-mythic-display";
import type { MageCombat } from "./skill-mage-combat";
import type { WarriorCombat } from "./skill-warrior-combat";
import { settleCombatHealth } from "./skill-health-settlement";
import { createBossDamageLedger, settleBossDamageEvent } from "./skill-boss-damage";
import { warriorPassiveDefenses } from "./skill-warrior-passives";
import { rangerPassiveStats } from "./skill-ranger-passives";
import { createCombatVictoryGuard } from "./skill-combat-victory";
import { createSkillAscensions, restoreSkillAscensions, type SkillAscensionState } from "./skill-ascensions";
import type { SkillSaveAction } from "./skill-save-policy";
import { RangerStarbreakSnipeVfx } from "./ranger-starbreak-snipe-vfx";
import { MageElementSigilVfx } from "./mage-element-sigil-vfx";
import { emptyElementSigilVisual, updateElementSigilVisual } from "./element-sigil-frames";
import { MageArcaneOverloadVfx } from "./mage-arcane-overload-vfx";
import { emptyOverloadVisual, updateOverloadVisual } from "./arcane-overload-frames";
import { MageManaShieldVfx } from "./mage-mana-shield-vfx";
import { emptyManaShieldVisual, updateManaShieldVisual, type ManaShieldEvent } from "./mana-shield-frames";
import { MageAstralAnnihilationVfx } from "./mage-astral-annihilation-vfx";
import { astralAmounts, type AstralVisual } from "./astral-annihilation-frames";
import { MageVoidCollapseVfx } from "./mage-void-collapse-vfx";
import { type VoidVisual } from "./void-collapse-frames";
import { MageMeteorStrikeVfx } from "./mage-meteor-strike-vfx";
import { meteorAmounts, type MeteorVisual } from "./meteor-strike-frames";
import { MageLightningChainVfx } from "./mage-lightning-chain-vfx";
import { lightningAmounts, type LightningVisual } from "./lightning-chain-frames";
import { MageFrostfireNovaVfx } from "./mage-frostfire-nova-vfx";
import type { FrostfireVisual, FrostfireStatusVisual } from "./frostfire-nova-frames";
import { RangerPiercingArrowVfx } from "./ranger-piercing-arrow-vfx";
import { RangerWindDomainVfx } from "./ranger-wind-domain-vfx";
import { windDomainVisualState, type WindDomainVisual } from "./ranger-wind-domain-state";
import { RangerPhantomStepVfx } from "./ranger-phantom-step-vfx";
import { RangerHunterMarkVfx, type HunterMarkVisual, type HunterBurstVisual } from "./ranger-hunter-mark-vfx";
import { phantomStepVisualState, type PhantomStepVisual, type PhantomStepEvent } from "./ranger-phantom-state";
import type { RangerCombat } from "./skill-ranger-combat";
import { RangerWindVolleyVfx } from "./ranger-wind-volley-vfx";
import { CombatDamageLayer } from "./combat-damage-layer";
import { splitAsyncDamageForDisplay } from "./combat-float-events";
import type { FloatChannel } from "./combat-float-events";
import type { CombatFloatEvent } from "./combat-float-events";
import { presentEnemyDamage, presentWorldBossDamage, enemyDefeatPresentationDelay } from "./combat-health-presentation";
import { CombatPlaybackGuard } from "./combat-playback-guard";
import { RangerSkyQueenRainVfx } from "./ranger-sky-queen-rain-vfx";
import { skyRainDisplayAmounts } from "./sky-queen-rain-timing";
import { RangerDeadlyMarkVfx } from "./ranger-deadly-mark-vfx";
import { MythicSkillVfx, type MythicVfxPhase } from "./mythic-skill-vfx";
import { DeepAbyssBossVfx } from "./deep-abyss-boss-vfx";
import { amplifyEquipmentStat, epithetDisplayName, equippedEpithetBonuses, getItemEpithets, hasEquippedEpithet, normalizeItemEpithets, rollItemEpithets } from "./equipment-epithets";
import { AdminMonitor } from "./admin-panels";
import { MAINTENANCE_MESSAGE, MAINTENANCE_MODE } from "./maintenance";
import {
  GENERAL_MYTHICS,
  SKILL_MYTHICS,
  SPECIAL_LEGENDARIES,
  catalogStory,
  equippedSkillMythic,
  findEquipmentDefinition,
  hasCatalogItem,
  type EquipmentCatalogDefinition,
} from "./mythic-data";

import { calculateCharacterStats, calculateAssessedCombatPower, normalizeSceneItem } from "./character-power";

type Stage = "welcome" | "create" | "game";
const MAIL_CAPACITY = 50;
const PERSONAL_BOSS_RESET_VERSION = "2026-09-05";
const SAVE_DEBOUNCE_MS = 1_400;
const SAVE_MAX_INTERVAL_MS = 20_000;
const LOGIN_INSTANCE_STORAGE_KEY = "dark-world-login-instance-v1";
const LOGIN_ID_HEADER = "x-dark-world-login-id";
const SET_ELEMENTAL_DAMAGE_PCT = 15;
const SET_ATTACK_BONUS = 1.10;
const SET_SKILL_DAMAGE_PCT = 20;
const WORLD_BOSS_ROUND_MS = 60_000;
const WORLD_BOSS_RESET_VERSION = "2026-09-14-60s";
const SET_RESONANCE_ATTACKS = 10;
const SET_RESONANCE_DAMAGE_PCT = 200;
const loginHeaders = (loginId: string, json = false): Record<string, string> => ({
  [LOGIN_ID_HEADER]: loginId,
  ...(json ? { "content-type": "application/json" } : {}),
});
type LogEntry = { id: number; time: string; type: string; text: string };
type Item = (typeof initialItems)[number] & {
  mapId?: number;
  equipmentType?: "場景普通裝備" | "特殊傳奇" | "神話裝備";
  mythicId?: string;
  legendaryId?: string;
  artKey?: string;
  affixSchemaVersion?: number;
  reforgeCount?: number;
  locked?: boolean;
  sockets?: EquipmentSockets;
  prefixId?: string;
  suffixId?: string;
};
type EquipmentStatName =
  | "生命"
  | "生命%"
  | "攻擊"
  | "攻擊%"
  | "防禦"
  | "防禦%"
  | "攻速"
  | "命中"
  | "閃避"
  | "暴擊"
  | "暴擊傷害"
  | "吸血"
  | "經驗"
  | "金幣"
  | "首領傷害"
  | "傷害減免"
  | "技能傷害"
  | "首領減傷"
  | "資源掉落率"
  | "元寶掉率";
type EquipmentStat = {
  name: EquipmentStatName;
  value: number;
  original: number;
  percent?: boolean;
};
type AffixRoll = {
  name: EquipmentStatName;
  minimum: number;
  maximum: number;
  percent?: boolean;
};
type Skill = {
  name: string;
  desc: string;
  level: number;
  max: number;
  cost: number;
};
type CombatStatus = TimedCombatStatus;
type MailMessage = {
  id: number | string;
  expiresAt?: string;
  title: string;
  body: string;
  claimed: boolean;
  rewards: { gold: number; stones: number; yuanbao?: number; reforgeStones?: number; items: Item[]; resourcesClaimed?: boolean };
};
type Blessing = {
  id: string;
  name: string;
  tag: string;
  description: string;
  kind?: "base" | "upgrade" | "combat" | "support";
  targetId?: string;
  upgraded?: boolean;
};
type BattleDrop = { id: number; item: Item; elite: boolean; collected: boolean };
type RunSummary = {
  outcome: "death" | "complete";
  highestFloor: number;
  kills: number;
  elites: number;
  guardians: number;
  gold: number;
  enhance: number;
  reforge: number;
  gear: number;
  duration: number;
};
type BossBattle = {
  name: string;
  level: number;
  hp: number;
  mode: "personal" | "world";
  reward: string;
  mapId: number;
  baseTier: "elite" | "boss";
  baseFloor: number;
  recommendedPower: number;
  multiplier: number;
};
type CharacterSlot = {
  id: string;
  name: string;
  cls: GameClass;
  account: string;
};

const CHARACTER_SLOTS_KEY = "dark-world-character-slots-v2";
const LEGACY_DATA_RESET_KEY = "dark-world-auth-reset-v1";
const COMBAT_TICK_MS = 50;
function characterSlug(cls: GameClass) {
  return cls === "戰士" ? "warrior" : cls === "遊俠" ? "ranger" : "mage";
}

function characterFullbodyPath(cls: GameClass, rebirthCount: number, skillActive = false) {
  if (cls === "遊俠" && rebirthCount >= 10) {
    return `/characters/ranger-rebirth10-${skillActive ? "open" : "closed"}.webp`;
  }
  return `/characters/${characterSlug(cls)}${rebirthCount > 0 ? "-rebirth" : ""}.webp`;
}

function characterAvatarPath(cls: GameClass, rebirthCount: number) {
  if (cls === "遊俠" && rebirthCount >= 10) {
    return "/characters/ranger-rebirth10-avatar.webp";
  }
  return `/characters/${characterSlug(cls)}${rebirthCount > 0 ? "-rebirth-avatar" : ""}.webp`;
}

function gameEntryImagePaths(cls: GameClass) {
  return [
    "/logo-dark-world.webp",
    `/skills/icons/${characterSlug(cls)}-atlas.webp`,
    characterAvatarPath(cls, 0),
    ...maps.map((map) => map.sceneImage),
  ];
}

function preloadGameEntryImages(
  paths: string[],
  onProgress: (loaded: number, total: number) => void,
) {
  const uniquePaths = [...new Set(paths)];
  let loaded = 0;
  onProgress(0, uniquePaths.length);

  return Promise.all(
    uniquePaths.map(
      (src) =>
        new Promise<void>((resolve) => {
          const image = new Image();
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeout);
            loaded += 1;
            onProgress(loaded, uniquePaths.length);
            resolve();
          };
          const timeout = window.setTimeout(finish, 10_000);
          image.onload = finish;
          image.onerror = finish;
          image.src = src;
          if (image.complete) queueMicrotask(finish);
        }),
    ),
  );
}

function GameEntryLoading({ loaded, total }: { loaded: number; total: number }) {
  const progress = total > 0 ? Math.round((loaded / total) * 100) : 100;
  return (
    <main className="game-entry-loading" role="status" aria-live="polite">
      <div className="game-entry-loading__sigil"><Skull size={30} /></div>
      <p className="game-entry-loading__eyebrow">DARK WORLD · REALM GATE</p>
      <h1>暗黑世界</h1>
      <p className="game-entry-loading__message">正在喚醒戰場圖像</p>
      <div
        className="game-entry-loading__track"
        role="progressbar"
        aria-label="預載遊戲圖像"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="game-entry-loading__meta">
        <span>{loaded} / {total} 項素材</span>
        <strong>{progress}%</strong>
      </div>
      <p className="game-entry-loading__hint">首次載入後，圖像會由瀏覽器快取</p>
    </main>
  );
}

type TitleId = "none" | "night-watcher" | "ash-conqueror" | "abyss-survivor" | "beta-reincarnator" | "seasoned-reincarnator" | "elite-reincarnator" | "abyss-reincarnator";
type AppearanceId = "none" | "ember-aura" | "arcane-aura" | "abyss-aura";
const TITLE_OPTIONS: Record<TitleId, { name: string; color: string; description: string }> = {
  none: { name: "無稱號", color: "#9aa39d", description: "不顯示稱號" },
  "night-watcher": { name: "灰燼守夜人", color: "#d6b36a", description: "灰燼墓園的守望者" },
  "ash-conqueror": { name: "灰燼征服者", color: "#f08a52", description: "裝備時：經驗 +5%" },
  "abyss-survivor": { name: "深淵倖存者", color: "#bd83ff", description: "裝備時：經驗／攻擊／防禦 +10%" },
  "beta-reincarnator": { name: "封測轉生者", color: "#9fc4a6", description: "裝備時：經驗／金幣 +10%，攻擊／防禦 +5%（1 轉以上）" },
  "seasoned-reincarnator": { name: "資深輪迴者", color: "#73cfde", description: "裝備時：經驗／金幣 +15%，攻擊／防禦 +5%，資源掉落 +5%（3 轉以上）" },
  "elite-reincarnator": { name: "菁英輪迴者", color: "#d3a4ff", description: "裝備時：經驗／金幣 +20%，攻擊／防禦 +10%，資源掉落 +10%（5 轉以上）" },
  "abyss-reincarnator": { name: "深淵輪迴者", color: "#ff827a", description: "裝備時：經驗／金幣 +30%，攻擊／防禦 +10%，攻速 +12%，資源掉落 +10%（10 轉以上）" },
};
const APPEARANCE_OPTIONS: Record<AppearanceId, { name: string; description: string; color: string }> = {
  none: { name: "無特效", description: "不顯示外觀特效", color: "#9aa39d" },
  "ember-aura": { name: "灰燼熔翼", description: "暗紅熔岩骨翼與火星彈射；裝備時攻擊 +5%", color: "#e35d3f" },
  "arcane-aura": { name: "奧術星翼", description: "紫色符文能量羽翼；裝備時攻擊／防禦 +10%", color: "#a875ff" },
  "abyss-aura": { name: "深淵黑翼", description: "黑紅破碎深淵蝠翼；裝備時攻擊 +15%、防禦／命中／迴避 +10%", color: "#6d4cff" },
};
function appearanceVfxPath(id: AppearanceId) {
  return id === "ember-aura" ? "ember" : id === "arcane-aura" ? "arcane" : id === "abyss-aura" ? "abyss" : null;
}
function CharacterAppearanceVfx({ id, className = "" }: { id: AppearanceId; className?: string }) {
  const wingSet = appearanceVfxPath(id);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!wingSet) return;
    const timer = window.setInterval(() => setFrame((current) => (current + 1) % 6), 180);
    return () => window.clearInterval(timer);
  }, [wingSet]);
  if (!wingSet) return null;
  const src = `/vfx/appearance-wings/${wingSet}/frame-${String(frame).padStart(2, "0")}.webp`;
  return <span className={`character-appearance-vfx ${className}`} aria-hidden="true"><NextImage unoptimized width={512} height={768} loading="eager" className="character-appearance-frame" src={src} alt="" /></span>;
}

function accountCharacterKey(account: string) {
  return account.trim().toLocaleLowerCase("zh-TW");
}

function findAccountCharacter(slots: Record<string, CharacterSlot>, account: string) {
  return Object.values(slots).find(
    (slot) => accountCharacterKey(slot.account) === accountCharacterKey(account),
  );
}

function readCharacterSlots(): Record<string, CharacterSlot> {
  try {
    return JSON.parse(localStorage.getItem(CHARACTER_SLOTS_KEY) ?? "{}") as Record<
      string,
      CharacterSlot
    >;
  } catch {
    return {};
  }
}

function createCharacterId() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

  const navIcons = {
  主控: Swords,
  地圖: MapIcon,
  背包: Backpack,
  寶石: Gem,
  技能: WandSparkles,
  首領: Skull,
  排行: Trophy,
  商城: ShoppingCart,
  日誌: ScrollText,
};

const dropSlots = [
  "武器",
  "頭盔",
  "胸甲",
  "手套",
  "鞋子",
  "項鍊",
  "戒指",
  "腰帶",
  "護腕",
  "披風",
];
const qualityOrder = ["普通", "良好", "優秀", "史詩", "傳奇", "神話"];
const rebirthTalentDefs = [
  { id: "combatCritRate", path: "戰鬥", label: "炸裂領悟", description: "暴擊率 +4%／點｜點滿 +20%", max: 5 },
  { id: "combatCritDamage", path: "戰鬥", label: "爆擊烙印", description: "暴擊傷害 +10%／點｜點滿 +50%", max: 5 },
  { id: "combatDamageReduction", path: "戰鬥", label: "不畏生死", description: "傷害減免 +3%／點｜點滿 +15%", max: 5 },
  { id: "combatAttackSpeed", path: "戰鬥", label: "超速模式", description: "攻速 +5%／點｜點滿 +25%", max: 5 },
  { id: "combatBoss", path: "戰鬥", label: "征服首領", description: "首領傷害 +5%／點｜點滿 +25%", max: 5 },
  { id: "survivalHp", path: "生存", label: "巨人血脈", description: "生命 +10%／點｜點滿 +50%", max: 5 },
  { id: "survivalDefense", path: "生存", label: "不破壁壘", description: "防禦 +10%／點｜點滿 +50%", max: 5 },
  { id: "growthSkill", path: "成長", label: "奧術增福", description: "技能傷害 +5%／點｜點滿 +25%", max: 5 },
] as const;
type RebirthTalentId = (typeof rebirthTalentDefs)[number]["id"];
type RebirthTalents = Record<RebirthTalentId, number>;
const emptyRebirthTalents: RebirthTalents = {
  combatCritRate: 0,
  combatCritDamage: 0,
  combatDamageReduction: 0,
  combatAttackSpeed: 0,
  combatBoss: 0,
  survivalHp: 0,
  survivalDefense: 0,
  growthSkill: 0,
};
const SCENE_MAX_QUALITY_INDEX = balanceConfig.equipment.sceneMaxQualityIndex;
const equipmentSlotSlugs: Record<string, string> = {
  武器: "weapon",
  頭盔: "helmet",
  胸甲: "chest",
  手套: "gloves",
  鞋子: "boots",
  項鍊: "necklace",
  戒指: "ring",
  腰帶: "belt",
  護腕: "bracer",
  披風: "cloak",
};
const EXPERIENCE_MULTIPLIER = balanceConfig.progression.experienceMultiplier;
const MAP_FLOORS = balanceConfig.progression.mapFloors;

type CatalogDropSource =
  | "normal"
  | "elite"
  | "guardian"
  | "boss"
  | "personal-shadow"
  | "personal-true"
  | "world";

function catalogItemId(item: Item) {
  return item.mythicId ?? item.legendaryId;
}

function createCatalogItem(
  definition: EquipmentCatalogDefinition,
  mapId: number,
  sequence = 0,
): Item {
  const qualityIndex = definition.kind === "special-legendary" ? 4 : 5;
  const powerRange = dropPowerRange(mapId, qualityIndex);
  const item: Item = {
    id: nextLootId(sequence),
    name: definition.name,
    slot: definition.slot,
    quality: qualityOrder[qualityIndex],
    power:
      powerRange.minimum +
      Math.floor(Math.random() * (powerRange.maximum - powerRange.minimum + 1)),
    enhance: 0,
    mapId,
    equipmentType:
      definition.kind === "special-legendary" ? "特殊傳奇" : "神話裝備",
    ...(definition.kind === "special-legendary"
      ? { legendaryId: definition.id }
      : { mythicId: definition.id }),
    artKey: definition.artKey,
    affixSchemaVersion: 7,
    set: "",
    affixes: [],
    sockets: createEquipmentSockets(),
  };
  const affixes = rollAffixes(item);
  return { ...item, affixes, ...rollItemEpithets({ ...item, affixes }) };
}

function rollCatalogDrop(
  mapId: number,
  source: CatalogDropSource,
  className: GameClass,
  sequence = 0,
) {
  const highTierMap = mapId >= 4;
  const chances = {
    general:
      source === "world"
        ? 0.34
        : source === "personal-true"
          ? 0.15
          : source === "personal-shadow"
            ? 0.008
            : source === "boss"
              ? 0.07
              : source === "guardian"
                ? 0.018
                : source === "elite"
                  ? 0.003
                  : highTierMap
                    ? 0.0008
                    : 0.00015,
    skill:
      source === "world"
        ? 0.24
        : source === "personal-true"
          ? 0.1
          : 0,
    legendary:
      source === "world"
        ? 0.18
        : source === "personal-true"
          ? 0.15
          : source === "personal-shadow"
            ? 0.035
            : source === "boss"
              ? 0.12
              : source === "guardian"
                ? 0.05
                : source === "elite"
                  ? 0.012
                  : highTierMap
                    ? 0.002
                    : 0.0004,
  };
  const skillPool =
    source === "world"
      ? SKILL_MYTHICS
      : SKILL_MYTHICS.filter((definition) => definition.className === className);
  const roll = Math.random();
  if (skillPool.length > 0 && roll < chances.skill) {
    return createCatalogItem(
      skillPool[Math.floor(Math.random() * skillPool.length)],
      mapId,
      sequence,
    );
  }
  if (roll < chances.skill + chances.general) {
    return createCatalogItem(
      GENERAL_MYTHICS[Math.floor(Math.random() * GENERAL_MYTHICS.length)],
      mapId,
      sequence,
    );
  }
  if (roll < chances.skill + chances.general + chances.legendary) {
    return createCatalogItem(
      SPECIAL_LEGENDARIES[
        Math.floor(Math.random() * SPECIAL_LEGENDARIES.length)
      ],
      mapId,
      sequence,
    );
  }
  return null;
}

function experienceRequired(level: number) {
  const rules = balanceConfig.progression.experienceRequired;
  if (level <= rules.early.throughLevel) return rules.early.base + (level - 1) * rules.early.perLevel;
  if (level <= rules.mid.throughLevel) return rules.mid.base + (level - rules.early.throughLevel) * rules.mid.perLevel;
  if (level <= rules.late.throughLevel) return rules.late.base + (level - rules.mid.throughLevel) * rules.late.perLevel;
  const lateLevel = level - 60;
  return rules.endgame.base + lateLevel * rules.endgame.perLevel + lateLevel * lateLevel * rules.endgame.quadratic;
}

function newcomerExperienceFactor(level: number) {
  const rules = balanceConfig.progression.newcomerExperience;
  if (level <= rules.throughLevel) return rules.multiplier;
  if (level <= rules.endsAtLevel)
    return Math.max(1, rules.multiplier - (level - rules.throughLevel) / (rules.endsAtLevel - rules.throughLevel));
  return 1;
}

function mapExperienceGain(
  map: (typeof maps)[number],
  tier: "normal" | "elite" | "guardian" | "boss",
  level: number,
) {
  const base =
    map.exp[0] + Math.floor(Math.random() * (map.exp[1] - map.exp[0] + 1));
  const tierMultiplier = balanceConfig.mapFloors.experienceTier[tier];
  return Math.round(
    base * tierMultiplier * EXPERIENCE_MULTIPLIER * newcomerExperienceFactor(level),
  );
}

function recommendedPowerAtFloor(map: (typeof maps)[number], floor: number) {
  if (map.id === 1) return firstChapterPower(floor);
  if (map.id === 2) return secondChapterPower(floor);
  if (floor >= MAP_FLOORS) return map.bossPower;
  const boundedFloor = Math.max(1, Math.min(29, floor));
  const interpolate = (start: number, end: number, step: number, steps: number) =>
    start + (end - start) * (step / steps);
  if (boundedFloor <= 10)
    return Math.round(
      interpolate(map.power[0], map.phasePower[0], boundedFloor - 1, 9),
    );
  if (boundedFloor <= 20)
    return Math.round(
      interpolate(
        Math.round(map.phasePower[0] * balanceConfig.mapFloors.phaseTwoStartMultiplier),
        map.phasePower[1],
        boundedFloor - 11,
        9,
      ),
    );
  return Math.round(
    interpolate(
      Math.round(map.phasePower[1] * balanceConfig.mapFloors.phaseThreeStartMultiplier),
      map.power[1],
      boundedFloor - 21,
      8,
    ),
  );
}

function monsterMaximumHealth(
  recommendedPower: number,
  tier: "normal" | "elite" | "guardian" | "boss",
  monsterName?: string,
) {
  const multiplier = balanceConfig.mapFloors.monsterHealth[tier];
  return Math.max(
    balanceConfig.mapFloors.monsterHealth.minimum,
    Math.round(recommendedPower * multiplier * monsterProfile(monsterName).health),
  );
}

function monsterCombatHealthMultiplier(
  tier: "normal" | "elite" | "guardian" | "boss",
) {
  return balanceConfig.mapFloors.monsterHealth.combatMultiplier[tier];
}

function effectiveMonsterMaximumHealth(
  mapId: number,
  recommendedPower: number,
  tier: "normal" | "elite" | "guardian" | "boss",
  monsterName?: string,
) {
  if (mapId === 1) return firstChapterHealth(recommendedPower, tier, monsterName);
  if (mapId === 2) return secondChapterHealth(recommendedPower, tier, monsterName);
  return Math.max(
    balanceConfig.mapFloors.monsterHealth.minimum,
    Math.round(
      monsterMaximumHealth(recommendedPower, tier, monsterName) *
        monsterCombatHealthMultiplier(tier) *
        lateGameMonsterScale(mapId).health,
    ),
  );
}

function baseMonsterName(name: string) {
  return name.replace(/・(?:精英|菁英|守關者|守關怪|地圖首領|首領|殘影|真身)$/, "");
}

function towerTierLabel(tier: "normal" | "elite" | "guardian" | "boss") {
  return tier === "elite"
    ? "精英強化"
    : tier === "guardian"
      ? "守關強化"
      : tier === "boss"
        ? "首領強化"
        : "普通怪物";
}
const suppressionLabels = {
  none: "",
  light: "輕微境界壓制",
  medium: "中度境界壓制",
  heavy: "重度境界壓制",
  abyss: "深淵境界壓制",
} as const;
const blessingPool: Blessing[] = [
  {
    id: "rapid",
    name: "疾風加護",
    tag: "連擊",
    description: "攻擊速度 +20%，觸發額外攻擊的機率提高。",
  },
  {
    id: "echo",
    name: "奧義餘震",
    tag: "技能",
    description: "技能發動時追加一次 60% 傷害。",
  },
  {
    id: "treasure",
    name: "獵寶直覺",
    tag: "掉落",
    description: "普通怪物裝備掉落率 +20%，較高品質的掉落機率增加。",
  },
  {
    id: "execute",
    name: "死亡標記",
    tag: "斬殺",
    description: "敵人生命低於 30% 時，本輪傷害提高 45%。",
  },
  {
    id: "blood",
    name: "血誓護盾",
    tag: "生存",
    description: "擊敗敵人後回滿生命，下一輪免除反擊傷害。",
  },
];
const blessingUpgradeText: Record<string, string> = {
  rapid: "攻擊速度加成提高至 +35%。",
  echo: "技能回響的實際追加傷害提高至 90%。",
  treasure: "掉落率再 +10%，高品質掉落修正提高至 60%。",
  execute: "觸發線提高至 35%，增傷提高至 60%。",
  blood: "每場第一次受到的傷害降低 90%。",
  "stat-skill": "技能傷害提高至 +40%。",
  "stat-crit": "暴擊提高至 +18%。",
  "stat-hp": "生命提高至 +30%。",
};
const advancedCombatBlessings: Blessing[] = [
  { id: "stat-attack", name: "狂戰意志", tag: "進階・攻擊", description: "本輪攻擊 +15%。", kind: "combat" },
  { id: "stat-speed", name: "疾行刻印", tag: "進階・攻速", description: "本輪攻擊速度 +15%。", kind: "combat" },
  { id: "stat-crit", name: "狂怒時刻", tag: "進階・暴擊", description: "本輪暴擊 +12%。", kind: "combat" },
  { id: "stat-hit", name: "洞察之眼", tag: "進階・命中", description: "本輪命中值 +10。", kind: "combat" },
  { id: "stat-skill", name: "奧術增幅", tag: "進階・技能", description: "本輪技能傷害 +18%。", kind: "combat" },
];
const advancedSupportBlessings: Blessing[] = [
  { id: "stat-hp", name: "巨人血脈", tag: "進階・生命", description: "本輪生命 +15%。", kind: "support" },
  { id: "stat-defense", name: "不破壁壘", tag: "進階・防禦", description: "本輪防禦 +15%。", kind: "support" },
  { id: "stat-lifesteal", name: "鮮血汲取", tag: "進階・吸血", description: "本輪吸血 +8%。", kind: "support" },
  { id: "stat-gold", name: "貪婪契約", tag: "進階・金幣", description: "本輪金幣獲取 +20%。", kind: "support" },
  { id: "stat-enhance", name: "鍛造眷顧", tag: "進階・資源", description: "本輪強化石掉落率 +10%。", kind: "support" },
  { id: "stat-reforge", name: "洗鍊眷顧", tag: "進階・資源", description: "本輪洗鍊石掉落率 +5%。", kind: "support" },
];

function createDrop(
  mapId: number,
  source: "掛機" | "首領" | "戰鬥",
  sequence = 0,
  forcedQualityIndex?: number,
): Item {
  const map = maps[Math.max(0, Math.min(maps.length - 1, mapId - 1))];
  const roll = Math.random();
  const qualityIndex = forcedQualityIndex ?? Math.min(SCENE_MAX_QUALITY_INDEX,
    source === "首領"
      ? roll > 0.82
          ? 4
          : roll > 0.52
            ? 3
            : 2
      : source === "戰鬥"
        ? roll > 0.96
            ? 4
            : roll > 0.81
              ? 3
              : roll > 0.58
                ? 2
                : roll > 0.3
                  ? 1
                  : 0
        : roll > 0.98
          ? 4
          : roll > 0.88
            ? 3
            : roll > 0.6
              ? 2
              : roll > 0.25
                ? 1
                : 0);
  const slot = dropSlots[Math.floor(Math.random() * dropSlots.length)];
  const isSetItem = Math.random() < 0.3;
  const powerRange = dropPowerRange(mapId, qualityIndex);
  const item: Item = {
    id: nextLootId(sequence),
    name: `${isSetItem ? map.set : map.gearPrefix}${slot}`,
    slot,
    quality: qualityOrder[qualityIndex],
    power:
      powerRange.minimum +
      Math.floor(Math.random() * (powerRange.maximum - powerRange.minimum + 1)),
    enhance: 0,
    mapId,
    equipmentType: "場景普通裝備",
    affixSchemaVersion: 7,
    sockets: createEquipmentSockets(),
    set: isSetItem ? map.set : "",
    affixes: [],
  };
  const affixes = rollAffixes(item);
  return { ...item, affixes, ...rollItemEpithets({ ...item, affixes }) };
}

function createGambleReward(mapId: number, roll: number, sequence = 0) {
  const reward = gamblePackageReward(roll);
  if (reward.type === "reforge") return reward;
  // 商城禮包保留 10% 神話品質；普通地圖掉落仍由場景品質上限限制。
  const qualityIndex = reward.qualityIndex;
  const item = createDrop(mapId, "首領", sequence, qualityIndex);
  const quality = qualityOrder[qualityIndex];
  const upgraded = {
    ...item,
    quality,
    equipmentType: qualityIndex === 5 ? "神話裝備" as const : "場景普通裝備" as const,
  };
  const affixes = rollAffixes(upgraded);
  return { type: "equipment" as const, item: {
    ...upgraded,
    affixes,
    ...rollItemEpithets({ ...upgraded, affixes }),
  } };
}

function equipmentMapId(item: Item) {
  const inferredMap = maps.findIndex(
    (map) =>
      item.set === map.set ||
      item.name.startsWith(map.set) ||
      item.name.startsWith(map.gearPrefix),
  );
  return Math.max(
    1,
    Math.min(maps.length, item.mapId ?? (inferredMap >= 0 ? inferredMap + 1 : 1)),
  );
}

function equipmentIconPath(item: Item) {
  const definition = findEquipmentDefinition(item);
  if (definition) {
    const folder = definition.kind === "special-legendary" ? "legendary" : "mythic";
    return `/equipment/${folder}/${definition.artKey}.webp`;
  }
  const mapId = equipmentMapId(item);
  const slot = equipmentSlotSlugs[item.slot] ?? "weapon";
  return `/equipment/map-${mapId}/${slot}.webp`;
}


function equipmentBaseStats(item: Item, enhanceLevel = item.enhance): EquipmentStat[] {
  return sharedEquipmentBaseStats(item, enhanceLevel);
}

function equipmentCombatRating(item: Item) {
  const combat = {
    hp: 0,
    attack: 0,
    defense: 0,
    speed: 0,
    hit: 0,
    dodge: 0,
    crit: 0,
    critDamage: 0,
    lifesteal: 0,
    damageReduction: 0,
    skillDamage: 0,
    bossDamage: 0,
    bossReduction: 0,
    hpPct: 0,
    attackPct: 0,
    defensePct: 0,
  };

  const addStat = (name: EquipmentStatName, value: number, isPercent = false) => {
    if (name === "生命") {
      if (isPercent) combat.hpPct += value;
      else combat.hp += value;
    }
    if (name === "生命%") combat.hpPct += value;
    if (name === "攻擊") {
      if (isPercent) combat.attackPct += value;
      else combat.attack += value;
    }
    if (name === "攻擊%") combat.attackPct += value;
    if (name === "防禦") {
      if (isPercent) combat.defensePct += value;
      else combat.defense += value;
    }
    if (name === "防禦%") combat.defensePct += value;
    if (name === "攻速") combat.speed += value;
    if (name === "命中") combat.hit += value;
    if (name === "閃避") combat.dodge += value;
    if (name === "暴擊") combat.crit += value;
    if (name === "暴擊傷害") combat.critDamage += value;
    if (name === "吸血") combat.lifesteal += value;
    if (name === "傷害減免") combat.damageReduction += value;
    if (name === "技能傷害") combat.skillDamage += value;
    if (name === "首領傷害") combat.bossDamage += value;
    if (name === "首領減傷") combat.bossReduction += value;
  };

  for (const stat of equipmentBaseStats(item)) addStat(stat.name, stat.value, stat.percent);
  for (const [index, affix] of item.affixes.entries()) {
    const name = affixName(affix);
    const value = Number(affix.match(/\d+(?:\.\d+)?/)?.[0] ?? 0);
    addStat(name, index === 0 ? amplifyEquipmentStat(item, name, value, "core") : value, affix.includes("%"));
  }
  const epithets = equippedEpithetBonuses([item]);
  combat.hpPct += epithets.hpPct ?? 0;
  combat.attackPct += epithets.attackPct ?? 0;
  combat.defensePct += epithets.defensePct ?? 0;
  combat.speed += epithets.speed ?? 0;
  combat.hit += epithets.hit ?? 0;
  combat.crit += epithets.crit ?? 0;
  combat.critDamage += epithets.critDamage ?? 0;
  combat.lifesteal += epithets.lifesteal ?? 0;
  combat.skillDamage += epithets.skillDamage ?? 0;
  for (const [name, value] of Object.entries(getSocketStatBonus(item.sockets ?? { socketCount: 0, gems: [] }))) {
    addStat(name as EquipmentStatName, value, name.endsWith("%"));
  }

  combat.hp = Math.round(combat.hp * (1 + combat.hpPct / 100));
  combat.attack = Math.round(combat.attack * (1 + combat.attackPct / 100));
  combat.defense = Math.round(combat.defense * (1 + combat.defensePct / 100));

  // 評級只代表戰鬥價值；經驗、金幣、資源與元寶掉率刻意不納入。
  const damageScore =
    combat.attack * 4 +
    combat.speed * 4 +
    combat.hit * 5 +
    combat.crit * 8 +
    combat.critDamage * 5 +
    combat.skillDamage * 7 +
    combat.bossDamage * 7;
  const enduranceScore =
    combat.hp * 0.25 +
    combat.defense * 3 +
    combat.dodge * 8 +
    combat.lifesteal * 10 +
    combat.damageReduction * 10 +
    combat.bossReduction * 9;
  return Math.max(1, Math.round(damageScore + enduranceScore));
}

function equipmentDisplayRating(item: Item) {
  return equipmentCombatRating(item);
}

function itemSetAccent(item: Item) {
  return maps.find((map) => map.set === item.set)?.tone ?? "transparent";
}

function gemEffectLabel(definition: ReturnType<typeof getGemDefinition>) {
  const stat = definition.stat.replace(/%$/, "");
  const percentageStats = ["吸血", "經驗", "金幣"];
  const isPercentage = definition.stat.endsWith("%") || percentageStats.includes(stat);
  return `${stat} +${definition.value}${isPercentage ? "%" : ""}`;
}

function EquipmentIcon({ item, className = "" }: { item: Item; className?: string }) {
  return (
    <NextImage unoptimized width={256} height={256}
      className={`equipment-art ${className}`}
      src={equipmentIconPath(item)}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}

function bloodRoarDamageBonus(level: number) {
  const bonuses = [20, 26, 32, 38, 44, 50, 55, 60];
  return bonuses[Math.min(8, Math.max(1, level)) - 1];
}

function bloodRoarLifesteal(level: number) {
  const boundedLevel = Math.min(8, Math.max(1, level));
  return Math.ceil(8 * 1.2 ** (boundedLevel - 1));
}

function deadlyMarkBonusPct(level: number) {
  return [0, 10, 14, 18, 22, 24][Math.min(5, Math.max(1, level))] ?? 10;
}

function deadlyMarkExplosionMultiplier(level: number) {
  return 1.2 + Math.max(1, Math.min(5, level)) * 0.2;
}

function windVolleyDamageMultiplier(level: number) {
  return [0.9, 1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3][Math.min(8, Math.max(1, level)) - 1] ?? 1;
}

function skillChance(skill?: Skill | null) {
  if (!skill || skill.level <= 0) return 0;
  const lv = skill.level;
  const base: Record<string, number> = {
    裂地斬: 0.04, 處決: 0.04, 穿雲箭: 0.03, 疾風連射: 0.04,
    致命標記: 0.05, 霜火新星: 0.06, 奧術回響: 0.04, 隕星術: 0.03,
  };
  const step: Record<string, number> = {
    裂地斬: 0.02, 處決: 0.02, 穿雲箭: 0.01, 疾風連射: 0.02,
    致命標記: 0.02, 霜火新星: 0.02, 奧術回響: 0.03, 隕星術: 0.0125,
  };
  return Math.min(0.3, (base[skill.name] ?? 0) + lv * (step[skill.name] ?? 0));
}

function skillProcChance(name: string, level: number) {
  if (level <= 0) return 0;
  if (name === "鋼鐵壁壘") return Math.min(0.25, 0.06 + level * 0.01);
  if (name === "魔力護盾") return Math.min(0.25, 0.04 + level * 0.01);
  if (name === "獵手本能") return Math.min(0.3, 0.06 + level * 0.01);
  return 0;
}

function skillReduction(name: string, level: number) {
  if (name === "魔力護盾") return Math.min(0.85, 0.45 + level * 0.0375);
  return 0;
}

function skillMultiplier(name: string, level: number) {
  switch (name) {
    case "裂地斬": return 1.2 + level * 0.2;
    // 處決標示的是「追加」傷害，故倍率必須包含原本那一擊。
    case "處決": return [1.6, 1.8, 2, 2.2, 2.5][Math.min(5, Math.max(1, level)) - 1] ?? 1.6;
    case "穿雲箭": return 1.2 + level * 0.2;
    case "疾風連射": return 1;
    case "霜火新星": return 1.4 + level * 0.2;
    case "奧術回響": return 1.1 + level * 0.2;
    case "隕星術": return 3 + level * 0.5;
    default: return 1;
  }
}


function equippedSetPieceCount(gear: Item[]) {
  return groupEquippedSets(gear).reduce((maximum, group) => Math.max(maximum, group.count), 0);
}

function equippedSetAttackMultiplier(gear: Item[]) {
  return calculateEquippedSetAttackMultiplier(gear, SET_ATTACK_BONUS - 1);
}

function calculateCombatPower(
  playerClass: GameClass,
  level: number,
  gear: Item[],
  skills: Skill[],
  permanentBonuses: { hp: number; attack: number; defense: number } = { hp: 0, attack: 0, defense: 0 },
  legacyBonuses: { attack: number; defense: number } = { attack: 0, defense: 0 },
) {
  const naked = calculateCharacterStats(playerClass, level, [], []);
  const statSkills = skills.filter((skill) =>
    ["鋼鐵壁壘", "獵手本能", "魔力護盾"].includes(skill.name),
  );
  const current = calculateCharacterStats(playerClass, level, gear, statSkills);
  const setAttackMultiplier = equippedSetAttackMultiplier(gear);
  const permanentAttackMultiplier = (1 + (permanentBonuses.attack + legacyBonuses.attack) / 100) * setAttackMultiplier;
  const statPower =
    (current.hp - naked.hp) * 0.25 +
    (current.attack - naked.attack) * permanentAttackMultiplier * 4 +
    (current.defense - naked.defense) * (1 + legacyBonuses.defense / 100) * 3 +
    (current.speed - naked.speed) * 4 +
    (current.hit - naked.hit) * 5 +
    (current.dodge - naked.dodge) * 8 +
    (current.crit - naked.crit) * 8 +
    (current.critDamage - naked.critDamage) * 5 +
    (current.lifesteal - naked.lifesteal) * 10 +
    (current.bossDamage - naked.bossDamage) * 7 +
    (current.damageReduction - naked.damageReduction) * 10 +
    current.skillDamage * 7 +
    current.bossReduction * 9;
  const permanentPower =
    naked.hp * (permanentBonuses.hp / 100) * 0.25 +
    naked.attack * (permanentAttackMultiplier - 1) * 4 +
    naked.defense * (permanentBonuses.defense / 100) * 3;
  return Math.max(
    1,
    Math.round(
      balanceConfig.character.combatPower.base +
        level * balanceConfig.character.combatPower.perLevel +
        statPower +
        permanentPower,
    ),
  );
}


function personalBossCombatValues({
  mapId = 1,
  localFloor = 30,
  attack,
  crit,
  critDamage,
  hit,
  bossDamage,
  defense,
  damageReduction,
  dodge,
  skillDamage,
  bossReduction,
  lowHealthDamage,
  lowHealthReduction,
  lowHealth,
  bossLevel,
  monsterName,
  roll,
  attackRoll,
  counterRoll,
  playerDamageMultiplier,
  skillTriggered = false,
  monsterAttack,
  monsterDefense,
  monsterMultiplier = 1,
  defenseIgnore = 0,
  guaranteedCritical = false,
  critDamageBonus = 0,
}: {
  mapId?: number;
  localFloor?: number;
  attack: number;
  speed: number;
  crit: number;
  critDamage: number;
  hit: number;
  bossDamage: number;
  defense: number;
  damageReduction: number;
  dodge: number;
  skillDamage: number;
  comboChance: number;
  bossReduction: number;
  lowHealthDamage: number;
  lowHealthReduction: number;
  lowHealth: boolean;
  playerLevel: number;
  bossLevel: number;
  monsterName?: string;
  roll: number;
  attackRoll: number;
  counterRoll: number;
  playerDamageMultiplier?: number;
  skillTriggered?: boolean;
  monsterAttack?: number;
  monsterDefense?: number;
  monsterMultiplier?: number;
  defenseIgnore?: number;
  guaranteedCritical?: boolean;
  critDamageBonus?: number;
}) {
  const profile = monsterProfile(monsterName);
  const evasionRules = balanceConfig.combat.evasionModel;
  const bossEvasionRating = evasionRules.monsterEvasionBase + bossLevel * evasionRules.bossEvasionPerLevel;
  const bossAccuracyRating =
    evasionRules.monsterAccuracyBase + bossLevel * evasionRules.bossAccuracyPerLevel;
  const playerHitChance = hitChanceFromRatings(hit, bossEvasionRating);
  const playerEvasionRating =
    Math.max(0, dodge) * evasionRules.statToRating;
  const bossHitChance = hitChanceFromRatings(bossAccuracyRating, playerEvasionRating);
  const defenseThreshold = armorThreshold(mapId, localFloor);
  const bossDefense = (monsterDefense ?? monsterArmorRating((18 + bossLevel * 2.5) * profile.defense,
    defenseThreshold)) * monsterMultiplier;
  const bossDamageReduction = armorMitigation(bossDefense, defenseThreshold, defenseIgnore);
  const isCritical = guaranteedCritical || roll < Math.min(1, crit / 100);
  const criticalMultiplier = isCritical ? 1 + (critDamage + critDamageBonus) / 100 : 1;
  const playerDamage = attackRoll * 100 > playerHitChance
    ? 0
    : Math.max(
        3,
        Math.round(
          attack *
            (1 - bossDamageReduction) *
            additiveDamageMultiplier({ bossDamage, skillDamage, lowHealthDamage,
              bossTarget: true, skillTriggered, lowHealth }) *
            Math.max(0, playerDamageMultiplier ?? 1) *
            criticalMultiplier,
        ),
      );
  const defenseMitigation = armorMitigation(defense, defenseThreshold);
  const counterDamage = counterRoll * 100 > bossHitChance
    ? 0
    : Math.max(
        2,
        Math.round(
          (monsterAttack ?? (5 + bossLevel * 0.28 + roll * 7) * profile.attack) *
            monsterMultiplier *
            (1 - defenseMitigation) *
            (1 - Math.min(balanceConfig.progression.damageReductionCap, damageReduction) / 100) *
            (1 - Math.min(balanceConfig.progression.damageReductionCap, bossReduction) / 100) *
            (lowHealth ? 1 - Math.min(balanceConfig.progression.damageReductionCap, lowHealthReduction) / 100 : 1),
        ),
      );
  return {
    playerDamage,
    critical: isCritical,
    counterDamage,
    bossAttackSpeed: profile.speed * 100,
    playerHitChance,
    bossHitChance,
  };
}

function saleReturn(item: Item) {
  const rank = Math.max(0, qualityOrder.indexOf(item.quality));
  const mapId = equipmentMapId(item);
  const economy = balanceConfig.economy;
  const base = economy.dismantle.baseByMap[mapId - 1] ?? economy.dismantle.baseByMap[0];
  const qualityMultiplier = economy.dismantle.qualityMultiplier[item.quality as keyof typeof economy.dismantle.qualityMultiplier] ?? 1;
  const goldAffix = (item.affixes ?? []).reduce((total, affix) => {
    const match = affix.match(/^金幣\s*\+?(\d+(?:\.\d+)?)%/);
    return total + (match ? Number(match[1]) : 0);
  }, 0);
  return {
    gold: Math.round(base * qualityMultiplier * (1 + (goldAffix / 100) * economy.gold.dismantleGoldAffixEffectiveness)),
    stones: enhancementStoneDismantleYield(rank, item.enhance),
  };
}

function affixOptions(item: Item): AffixRoll[] { return sharedAffixOptions(item); }

function affixName(affix: string) {
  const [rawName] = affix.split(" ");
  if (rawName === "生命力") return affix.includes("%") ? "生命%" : "生命";
  if (rawName === "生命%") return "生命%";
  if (rawName === "攻擊力") return affix.includes("%") ? "攻擊%" : "攻擊";
  if (rawName === "攻擊%") return "攻擊%";
  if (rawName === "防禦力") return affix.includes("%") ? "防禦%" : "防禦";
  if (rawName === "防禦%") return "防禦%";
  if (rawName === "攻擊速度" || rawName === "攻速") return "攻速";
  return rawName as EquipmentStatName;
}

function displayAffix(affix: string) {
  const name = affixName(affix);
  const value = affix.match(/\d+/)?.[0] ?? "0";
  const labels: Partial<Record<EquipmentStatName, string>> = {
    生命: "生命力",
    "生命%": "生命力",
    攻擊: "攻擊力",
    "攻擊%": "攻擊力",
    防禦: "防禦力",
    "防禦%": "防禦力",
    攻速: "攻擊速度",
  };
  return `${labels[name] ?? name} +${value}${name !== "命中" && name !== "閃避" && (affix.includes("%") || name === "攻速" || name.endsWith("%")) ? "%" : ""}`;
}

function amplifiedAffix(item: Item, affix: string, index: number) {
  if (index !== 0) return affix;
  const name = affixName(affix);
  const raw = Number(affix.match(/\d+(?:\.\d+)?/)?.[0] ?? 0);
  const value = amplifyEquipmentStat(item, name, raw, "core");
  return value === raw ? affix : affix.replace(/\d+(?:\.\d+)?/, String(value));
}

function EquipmentName({ item }: { item: Item }) {
  const adjective = epithetDisplayName(item);
  return <>{adjective && <span className="equipment-epithet">{adjective}的</span>}<span className="equipment-base-name">{item.name}</span></>;
}

function EquipmentEpithetDetails({ item }: { item: Item }) {
  const { prefix, suffix } = getItemEpithets(item);
  if (!prefix && !suffix) return null;
  return <>
    {[prefix, suffix].filter((effect) => effect !== undefined).map((effect) => (
      <span key={effect.id} className="gear-epithet-stat">
        <b><em className="equipment-epithet">{effect.name}</em></b>
        <small>{effect.description}</small>
      </span>
    ))}
    {["chase", "charge"].includes(suffix?.id ?? "") && (
      <small className="gear-epithet-note">觸發型效果未計入靜態戰力評級。</small>
    )}
  </>;
}

function affixRange(item: Item, affix: string) {
  return affixOptions(item).find((roll) => roll.name === affixName(affix));
}

function affixRangeLabel(item: Item, affix: string) {
  const range = affixRange(item, affix);
  if (!range) return "專屬詞綴";
  const suffix = range.percent && range.name !== "命中" && range.name !== "閃避" ? "%" : "";
  return `${item.quality}範圍 ${range.minimum}～${range.maximum}${suffix}`;
}


function rollAffixes(item: Item) { return sharedRollAffixes(item); }

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`panel ${className}`}>{children}</section>;
}

function Meter({
  value,
  color = "var(--gold)",
  className = "",
  ariaLabel,
}: {
  value: number;
  color?: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={`meter ${className}`} aria-label={ariaLabel}>
      <span
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          background: color,
        }}
      />
    </div>
  );
}

function GearTooltip({
  item,
  equippedItem,
  powerDifference,
}: {
  item: Item;
  equippedItem?: Item;
  powerDifference?: number;
}) {
  const compared =
    equippedItem && equippedItem.id !== item.id ? equippedItem : undefined;
  const catalogDefinition = findEquipmentDefinition(item);
  return (
    <div className="gear-tooltip">
      <small style={{ color: qualityColors[item.quality] }}>
        {item.quality} · {item.slot}
      </small>
      <span className="equipment-type-label">
        {item.equipmentType ?? "場景普通裝備"}
      </span>
      <h4>
        {item.set && <span className="set-name-prefix">【{item.set}】</span>} <EquipmentName item={item} /> {item.enhance > 0 && `+${item.enhance}`}
      </h4>
      <b>裝備評級 {equipmentDisplayRating(item).toLocaleString()}</b>
      <div className="gear-base-stats">
        <strong>基礎屬性</strong>
        {equipmentBaseStats(item).map((stat) => (
          <span key={stat.name}>
            <b>{stat.name} {stat.value.toLocaleString()}</b>
            {item.enhance > 0 && (
              <small>
                原始 {stat.original.toLocaleString()}・強化 +
                {(stat.value - stat.original).toLocaleString()}
              </small>
            )}
          </span>
        ))}
        <EquipmentEpithetDetails item={item} />
      </div>
      <div className="affix-divider"><span>詞綴加成</span></div>
      <ul className="gear-affixes">
        {item.affixes.map((affix, index) => (
          <li key={`${affix}-${index}`}>
            <span>{displayAffix(amplifiedAffix(item, affix, index))}</span>
            <small>{amplifiedAffix(item, affix, index) !== affix ? `前後綴放大・原 ${affix}` : affixRangeLabel(item, affix)}</small>
          </li>
        ))}
      </ul>
      {catalogDefinition && (
        <>
          <div className="catalog-story">
            <strong>裝備故事</strong>
            <p>{catalogStory(catalogDefinition)}</p>
          </div>
          <div className={`catalog-effect ${catalogDefinition.kind}`}>
            <strong>
            {catalogDefinition.kind === "skill-mythic"
              ? `技能神話・【${catalogDefinition.effectTitle}】`
              : catalogDefinition.kind === "general-mythic"
                ? `世界神話・【${catalogDefinition.effectTitle}】`
                : `特殊傳奇・【${catalogDefinition.effectTitle}】`}
            </strong>
            <p>效果：{catalogDefinition.effectDescription}</p>
          </div>
        </>
      )}
      {compared && (
        <div className="gear-compare">
          <span>目前穿著：{compared.name}</span>
          <strong className={(powerDifference ?? 0) >= 0 ? "gain" : "loss"}>
            {(powerDifference ?? 0) >= 0 ? "▲" : "▼"} 實際戰力{" "}
            {formatAssessedPower(Math.abs(powerDifference ?? 0))}
          </strong>
        </div>
      )}
    </div>
  );
}

function Welcome({
  onAccount,
}: {
  onAccount: (name: string, password: string, mode: "login" | "register") => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  return (
    <main className="entry-shell">
      <div className="entry-fog" />
      <section className="entry-card">
        <div className="sigil">
          <Skull size={38} />
        </div>
        <p className="eyebrow">DARK MEDIEVAL IDLE RPG</p>
        <h1>暗黑世界</h1>
        <p className="entry-copy">
          {MAINTENANCE_MODE ? "長夜暫歇，伺服器正在進行維護作業。" : "當長夜吞沒王國，唯有狩獵、鍛造與輪迴能讓你活到黎明。"}
        </p>
        {MAINTENANCE_MODE && <div className="maintenance-notice" role="status"><strong>伺服器維護中</strong><span>{MAINTENANCE_MESSAGE}</span></div>}
        <form
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault();
            onAccount(name, password, mode);
          }}
        >
          <strong>{MAINTENANCE_MODE ? "管理員登入" : mode === "login" ? "正式帳號登入" : "建立正式帳號"}</strong>
            <label>
              帳號
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="3～24 個字元"
              />
            </label>
            <label>
              密碼
              <input
                required
                type="password"
                minLength={6}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 個字元"
              />
            </label>
            <button className="btn btn-primary" type="submit">
              {MAINTENANCE_MODE ? "登入管理介面" : mode === "login" ? "登入黑暗世界" : "註冊並開始遊戲"}
            </button>
            {!MAINTENANCE_MODE && <button
              className="text-btn"
              type="button"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? "還沒有帳號？建立帳號" : "已有帳號？返回登入"}
            </button>}
          </form>
        <div className="entry-meta">
          <span>{MAINTENANCE_MODE ? "維護作業中" : "完全免費"}</span>
          <span>玩家資料保留</span>
          <span>{MAINTENANCE_MODE ? "暫停登入" : "不販售道具"}</span>
        </div>
      </section>
    </main>
  );
}

function CharacterCreate({
  accountName,
  onCreate,
}: {
  accountName: string;
  onCreate: (name: string, cls: GameClass, slot?: CharacterSlot) => void;
}) {
  const [selected, setSelected] = useState<GameClass>("戰士");
  const selectedIndex = classes.findIndex((item) => item.name === selected);
  const selectRelativeClass = (offset: number) => {
    const next = (selectedIndex + offset + classes.length) % classes.length;
    setSelected(classes[next].name);
  };
  const [slots, setSlots] = useState<Record<string, CharacterSlot>>({});
  const [name, setName] = useState(accountName);
  useEffect(() => {
    queueMicrotask(() => {
      const stored = readCharacterSlots();
      setSlots(stored);
      const existingAccountCharacter = findAccountCharacter(stored, accountName);
      if (existingAccountCharacter) {
        setSelected(existingAccountCharacter.cls);
        setName(existingAccountCharacter.name);
      } else {
        setName(accountName);
      }
    });
  }, [accountName]);

  const accountCharacter = findAccountCharacter(slots, accountName);
  const selectedSlot = accountCharacter?.cls === selected ? accountCharacter : undefined;

  return (
    <main className="create-shell">
      <header className="create-head">
        <div>
          <p className="eyebrow">THE LAST OATH</p>
          <h1>選擇你的宿命</h1>
        </div>
        <span>每個帳號限一名角色</span>
      </header>
      <div className="class-carousel-controls">
        <button className="class-arrow" onClick={() => selectRelativeClass(-1)} aria-label="上一個職業">‹</button>
        <span>{selectedIndex + 1} / {classes.length}</span>
        <button className="class-arrow" onClick={() => selectRelativeClass(1)} aria-label="下一個職業">›</button>
      </div>
      <div className="class-grid">
        {classes.map((cls) => (
          <button
            key={cls.name}
            className={`class-card ${selected === cls.name ? "selected" : ""}`}
            onClick={() => {
              if (!accountCharacter || accountCharacter.cls === cls.name) setSelected(cls.name);
            }}
            disabled={Boolean(accountCharacter && accountCharacter.cls !== cls.name)}
          >
            <div className="class-card-head">
              <span className="class-rune">{cls.icon}</span>
              <div>
                <small>{cls.role}</small>
                <h2>{cls.name}</h2>
              </div>
            </div>
            <div className="class-portrait-frame">
              <NextImage unoptimized width={1024} height={1536} loading="eager" className="class-portrait" src={`/characters/${cls.name === "戰士" ? "warrior" : cls.name === "遊俠" ? "ranger" : "mage"}.webp`} alt={`${cls.name}角色`} />
            </div>
            <div className="starter-skill">
              <Sparkles size={15} />
              <div>
                <small>起始技能</small>
                <strong>{cls.skill}</strong>
              </div>
            </div>
            {accountCharacter?.cls === cls.name && (
              <span className="existing-character">已有角色</span>
            )}
          </button>
        ))}
      </div>
      <div className="name-bar">
        {selectedSlot ? (
          <div className="existing-name-display">
            <small>角色暱稱</small>
            <strong>{selectedSlot.name}</strong>
            <span>此職業已建立，暱稱固定無法修改</span>
          </div>
        ) : (
          <label>
            角色暱稱
            <input value={name} maxLength={12} onChange={(e) => setName(e.target.value)} />
            <small>暱稱全站唯一，角色建立後無法修改</small>
          </label>
        )}
        <button
          className="btn btn-primary"
          onClick={() =>
            onCreate(
              selectedSlot?.name ?? (name.trim() || "無名旅人"),
              selected,
              selectedSlot,
            )
          }
        >
          {selectedSlot ? "繼續冒險" : "建立角色"} <ChevronRight size={18} />
        </button>
      </div>
    </main>
  );
}

const skillVisualByName: Record<string, string> = {
  裂地斬: "warrior-ground-split",
  鮮血怒吼: "warrior-blood-roar",
  疾風連射: "ranger-wind-volley",
  魔力護盾: "mage-mana-shield",
  隕星術: "mage-meteor",
};

function normalizeCombatEffectName(name: string) {
  return name.endsWith("・回響") ? name.slice(0, -3) : name;
}

const SKILL_BANNER_DURATION_MS = 750;

function skillBannerDuration() {
  return SKILL_BANNER_DURATION_MS;
}

function impactTier(name: string) {
  if (["處決", "致命標記・爆炸", "隕星術"].includes(normalizeCombatEffectName(name))) {
    return "full";
  }
  return "medium";
}

function Game({
  playerName,
  playerClass,
  characterId,
  isGm,
  loginId,
  onExit,
  onSessionEnded,
}: {
  playerName: string;
  playerClass: GameClass;
  characterId: string;
  isGm: boolean;
  loginId: string;
  onExit: () => void;
  onSessionEnded: (reason: "replaced" | "suspended" | "expired" | "maintenance") => void;
}) {
  const [tab, setTab] = useState<NavItem>("主控");
  const [level, setLevel] = useState(1);
  const [exp, setExp] = useState(0);
  const [gold, setGold] = useState(1200);
  const [yuanbao, setYuanbao] = useState(0);
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [enhanceStones, setEnhanceStones] = useState(6);
  const [reforgeStones, setReforgeStones] = useState(2);
  const [drillingStones, setDrillingStones] = useState(0);
  const [gemInventory, setGemInventory] = useState<GemStack[]>([]);
  const [mapId, setMapId] = useState(1);
  const [unlockedMapId, setUnlockedMapId] = useState(1);
  const [mapBestFloors, setMapBestFloors] = useState<Record<number, number>>({
    1: 1,
  });
  const [battleOn, setBattleOn] = useState(true);
  const [wave, setWave] = useState(1);
  const [enemyName, setEnemyName] = useState<string>(() => maps[0].monsters[0]);
  const [enemyHp, setEnemyHp] = useState(100);
  const towerCadenceRef=useRef<CombatCadence|null>(null);
  const bossCadenceRef=useRef<CombatCadence|null>(null);
  const [presentedEnemyHealth,setPresentedEnemyHealth]=useState<{token: string | object | null;percent:number;viewKey:string}>({token:null,percent:100,viewKey:"boot"});
  const pendingEnemyDefeatRef=useRef<{token: string | object;queuedAt:number;shownAt?:number;volleyKey?:number;finish:()=>void}|null>(null);
  const [documentVisible,setDocumentVisible]=useState(true);
  useEffect(()=>{
    const update=()=>setDocumentVisible(document.visibilityState!=="hidden");
    update();document.addEventListener("visibilitychange",update);
    return()=>document.removeEventListener("visibilitychange",update);
  },[]);
  const [playerHp, setPlayerHp] = useState(100);
  const [battlePulse, setBattlePulse] = useState(0);
  const [enemyDefeated, setEnemyDefeated] = useState(false);
  const [, setRound] = useState(1);
  const [skillEffect, setSkillEffect] = useState<{
    name: string;
    key: number;
  } | null>(null);
  const [skillBannerEffect, setSkillBannerEffect] = useState<{
    name: string;
    key: number;
  } | null>(null);
  const [skillVisualEffects, setSkillVisualEffects] = useState<{ name: string; key: number }[]>([]);
  const [mythicVfxEffects, setMythicVfxEffects] = useState<{
    skill: string;
    key: number;
    phase: MythicVfxPhase;
    variant?: "normal" | "detonation";
  }[]>([]);
  // Ranger image VFX own their lifetime. A following combat round may update
  // the skill banner without cutting off an arrow sequence already in flight.
  const [rangerPiercingEffect, setRangerPiercingEffect] = useState<{ key: number; hit: boolean } | null>(null);
  const pendingPiercingDamageRef = useRef(new Map<number, () => void>());
  const publishPiercingImpactDamage = (eventKey: number) => {
    const publish = pendingPiercingDamageRef.current.get(eventKey);
    pendingPiercingDamageRef.current.delete(eventKey);
    publish?.();
  };
  const finishPiercingVisual = (eventKey: number) => {
    pendingPiercingDamageRef.current.delete(eventKey);
    setRangerPiercingEffect((current) => current?.key === eventKey ? null : current);
  };
  const [starbreakVisuals, setStarbreakVisuals] = useState<{ key: number; hit: boolean; ascended: boolean; chargeRecovered: boolean }[]>([]);
  const pendingStarbreakDamageRef = useRef(new Map<number, () => void>());
  const publishStarbreakImpact = (key: number) => {
    const publish = pendingStarbreakDamageRef.current.get(key);
    pendingStarbreakDamageRef.current.delete(key); publish?.();
  };
  const finishStarbreakVisual = (key: number) => {
    pendingStarbreakDamageRef.current.delete(key);
    setStarbreakVisuals((current) => current.filter((item) => item.key !== key));
  };
  const updateStarbreakVisual = useCallback((battle: LiveCombatBattle, action: ReturnType<typeof resolveLiveCombatAttack>, key: number) => {
    if (action.name !== "破星狙擊") return;
    setStarbreakVisuals((current) => [...current.filter((item) => item.key !== key),
      { key, hit: action.hits.some((part) => part.hit), ascended: battle.ascended.has("破星狙擊"),
        chargeRecovered: action.starbreakChargeRecovered }]);
  }, []);
  const [tailwindVisuals, setTailwindVisuals] = useState<{
    key: number; hit: boolean; echo: { hit: boolean } | null; chargeRecovered: boolean;
  }[]>([]);
  const [tailwindEchoVisuals, setTailwindEchoVisuals] = useState<{ key: number; hit: boolean }[]>([]);
  const [tailwindChargeVisuals, setTailwindChargeVisuals] = useState<{ key: number }[]>([]);
  const pendingTailwindDamageRef = useRef(new Map<number, () => void>());
  const pendingTailwindEchoDamageRef = useRef(new Map<number, () => void>());
  const publishTailwindImpactDamage = (eventKey: number, echo: { hit: boolean } | null, chargeRecovered: boolean) => {
    const publish = pendingTailwindDamageRef.current.get(eventKey);
    pendingTailwindDamageRef.current.delete(eventKey);
    publish?.();
    if (echo) setTailwindEchoVisuals((current) => [...current.filter((item) => item.key !== eventKey), { key: eventKey, hit: echo.hit }]);
    if (chargeRecovered) setTailwindChargeVisuals((current) => [...current.filter((item) => item.key !== eventKey), { key: eventKey }]);
  };
  const publishTailwindEchoDamage = (eventKey: number) => {
    const publish = pendingTailwindEchoDamageRef.current.get(eventKey);
    pendingTailwindEchoDamageRef.current.delete(eventKey);
    publish?.();
  };
  const finishTailwindVisual = (eventKey: number) => {
    pendingTailwindDamageRef.current.delete(eventKey);
    setTailwindVisuals((current) => current.filter((item) => item.key !== eventKey));
  };
  const finishTailwindEchoVisual = (eventKey: number) => {
    pendingTailwindEchoDamageRef.current.delete(eventKey);
    setTailwindEchoVisuals((current) => current.filter((item) => item.key !== eventKey));
  };
  const finishTailwindChargeVisual = (eventKey: number) => {
    setTailwindChargeVisuals((current) => current.filter((item) => item.key !== eventKey));
  };
  const [rangerWindVolleyEffect, setRangerWindVolleyEffect] = useState<{
    key: number;
    shotCount: number;
    arrows?: ReturnType<typeof resolveLiveCombatAttack>["volleyArrows"];
  }[]>([]);
  const pendingVolleyDamageRef = useRef(new Map<number, ((index: number) => void)>());
  const publishVolleyImpact = (eventKey: number, index: number) => {
    pendingVolleyDamageRef.current.get(eventKey)?.(index);
  };
  const finishVolleyVisual = (eventKey: number) => {
    pendingVolleyDamageRef.current.delete(eventKey);
    setRangerWindVolleyEffect((current) => current.filter((effect) => effect.key !== eventKey));
  };
  const updateVolleyVisual = useCallback((action: ReturnType<typeof resolveLiveCombatAttack>, key: number) => {
    if (action.name !== "疾風連射") return;
    setRangerWindVolleyEffect((current) => [...current.filter((effect) => effect.key !== key),
      { key, shotCount: action.volleyArrows.length, arrows: action.volleyArrows }]);
  }, []);
  const queueVolleyNumbers = (key: number, action: ReturnType<typeof resolveLiveCombatAttack>,
    total: number, publishExtras: () => void) => {
    const arrows = action.volleyArrows;
    const weights = arrows.map((arrow) => arrow.hit ? arrow.damagePercent : 0);
    const sum = weights.reduce((value, weight) => value + weight, 0);
    const amounts = weights.map((weight) => sum > 0 ? Math.floor(total * weight / sum) : 0);
    let remainder = sum > 0 ? total - amounts.reduce((value, amount) => value + amount, 0) : 0;
    for (let index = 0; remainder > 0; index = (index + 1) % arrows.length) {
      if (weights[index] > 0) { amounts[index]++; remainder--; }
    }
    const published = new Set<number>();
    let extrasPublished = false;
    pendingVolleyDamageRef.current.set(key, (index) => {
      if (published.has(index)) return;
      published.add(index);
      if (!extrasPublished && (arrows[index]?.hit || published.size === arrows.length)) {
        extrasPublished = true; publishExtras();
      }
      if (!arrows[index]?.hit || amounts[index] <= 0) return;
      const groupKey = -key - (index + 1) / 16;
      setBattleHitGroups((current) => [...current, { key: groupKey, skillName: "疾風連射",
        hits: [{ damage: amounts[index], critical: arrows[index].critical,
          label: arrows[index].sixth ? "六重風葬" : undefined, delayMs: 0 }] }]);
      window.setTimeout(() => setBattleHitGroups((current) => current.filter((group) => group.key !== groupKey)), 1200);
    });
  };
  const [astralVisual, setAstralVisual] = useState<AstralVisual | null>(null);
  const astralKeyRef = useRef<number | null>(null);
  const pendingAstralDamageRef = useRef(new Map<number, { count: number; publish: (index: number) => void }>());
  const pendingAstralVictoryRef = useRef(new Map<number, () => void>());
  const updateAstralVisual = useCallback((battle: LiveCombatBattle,
    action: ReturnType<typeof resolveLiveCombatAttack>, key: number) => {
    if (action.name !== "星界寂滅") return;
    astralKeyRef.current = key;
    setAstralVisual({ key, ascended: battle.ascended.has("星界寂滅"), segments: action.astralSegments });
  }, []);
  const publishAstralImpact = (key: number, index: number) => pendingAstralDamageRef.current.get(key)?.publish(index);
  const queueAstralNumbers = useCallback((key: number, action: ReturnType<typeof resolveLiveCombatAttack>,
    total: number, publishExtras: () => void) => {
    const segments = action.astralSegments;
    const amounts = astralAmounts(segments, total);
    const published = new Set<number>();
    pendingAstralDamageRef.current.set(key, { count: segments.length, publish: index => {
      if (published.has(index) || !segments[index]) return;
      published.add(index);
      if (index === 6) publishExtras();
      const part = segments[index];
      if (part.hit && amounts[index] <= 0) return;
      const groupKey = -key - (index + 1) / 128;
      setBattleHitGroups(current => [...current, { key: groupKey, skillName: "星界寂滅", ultimate: index === 6,
        hits: [{ damage: amounts[index], critical: part.critical, label: part.label,
          channel: index === 6 ? "ultimate" : index > 6 ? "extra" : "primary", delayMs: 0,
          ...(!part.hit ? { text: "未命中！" } : {}) }] }]);
      window.setTimeout(() => setBattleHitGroups(current => current.filter(group => group.key !== groupKey)), 1500);
    } });
  }, []);
  const finishAstralVisual = (key: number) => {
    pendingAstralDamageRef.current.delete(key);
    setAstralVisual(current => current?.key === key ? null : current);
    if (astralKeyRef.current === key) astralKeyRef.current = null;
    if (ultimateAnimationLockRef.current === key) ultimateAnimationLockRef.current = null;
    ultimatePlaybackGuardRef.current.complete(key);
    const victory = pendingAstralVictoryRef.current.get(key);
    pendingAstralVictoryRef.current.delete(key); victory?.();
  };
  const [skyRainVisual, setSkyRainVisual] = useState<{ key: number; ascended: boolean;
    arrows: ReturnType<typeof resolveLiveCombatAttack>["skyArrows"] } | null>(null);
  const skyRainKeyRef = useRef<number | null>(null);
  const pendingSkyDamageRef = useRef(new Map<number, (index: number) => void>());
  const pendingSkyVictoryRef = useRef(new Map<number, () => void>());
  const updateSkyRainVisual = useCallback((battle: LiveCombatBattle,
    action: ReturnType<typeof resolveLiveCombatAttack>, key: number) => {
    if (action.name !== "蒼穹箭雨") return;
    skyRainKeyRef.current = key;
    setSkyRainVisual({ key, ascended: battle.ascended.has("蒼穹箭雨"), arrows: action.skyArrows });
  }, []);
  const publishSkyRainImpact = (key: number, index: number) => pendingSkyDamageRef.current.get(key)?.(index);
  const queueSkyRainNumbers = (key: number, action: ReturnType<typeof resolveLiveCombatAttack>,
    total: number, publishExtras: () => void, ascended: boolean) => {
    const arrows = action.skyArrows;
    const extraWeight = Math.max(0, action.damagePercent
      - arrows.reduce((sum, arrow) => sum + arrow.damagePercent, 0)
      - (action.hunterExplosion?.damagePercent ?? 0));
    const amounts = skyRainDisplayAmounts(total, arrows, extraWeight);
    const published = new Set<number>();
    pendingSkyDamageRef.current.set(key, (index) => {
      if (published.has(index)) return;
      published.add(index);
      if (index === 8) publishExtras();
      const hits = [
        ...(arrows[index] && !arrows[index].hit ? [{damage:0,critical:false,text:"未命中！",
          label:index===8?(ascended?"天罰主箭":"蒼穹主箭"):"聖箭",delayMs:0,skyIndex:index}] : []),
        ...(arrows[index]?.hit && amounts[index] > 0 ? [{ damage: amounts[index],
          critical: arrows[index].critical, label: index === 8 ? (ascended ? "天罰主箭" : "蒼穹主箭") : "聖箭",
          delayMs: 0, skyIndex: index }] : []),
        ...(index === 8 && amounts[9] > 0 ? [{ damage: amounts[9], critical: false,
          label: "追加", delayMs: 80 }] : []),
      ];
      if (!hits.length) return;
      const groupKey = -key - (index + 1) / 32;
      setBattleHitGroups((current) => [...current, { key: groupKey, skillName: ascended ? "天罰箭雨" : "蒼穹箭雨", hits }]);
      window.setTimeout(() => setBattleHitGroups((current) => current.filter((group) => group.key !== groupKey)), 1500);
    });
  };
  const finishSkyRainVisual = (key: number) => {
    pendingSkyDamageRef.current.delete(key);
    setSkyRainVisual((current) => current?.key === key ? null : current);
    if (skyRainKeyRef.current === key) skyRainKeyRef.current = null;
    if (ultimateAnimationLockRef.current === key) ultimateAnimationLockRef.current = null;
    ultimatePlaybackGuardRef.current.complete(key);
    const victory = pendingSkyVictoryRef.current.get(key);
    pendingSkyVictoryRef.current.delete(key); victory?.();
  };
  const [deadlyMarkEffect, setDeadlyMarkEffect] = useState<{
    key: number;
    detonationKey: number | null;
  } | null>(null);
  const [rangerImpactPulse, setRangerImpactPulse] = useState(false);
  const rangerImpactPulseTimerRef = useRef<number | null>(null);

  const triggerRangerImpact = () => {
    setRangerImpactPulse(false);
    window.requestAnimationFrame(() => setRangerImpactPulse(true));
    if (rangerImpactPulseTimerRef.current !== null) {
      window.clearTimeout(rangerImpactPulseTimerRef.current);
    }
    rangerImpactPulseTimerRef.current = window.setTimeout(() => {
      setRangerImpactPulse(false);
      rangerImpactPulseTimerRef.current = null;
    }, 190);
  };

  const queueMythicVfx = useCallback((effect: { name: string; key: number }) => {
    const skill = effect.name.startsWith("致命標記")
      ? "致命標記"
      : effect.name.replace(/・(?:回響|爆炸|強化斬擊|血爆|裂痕引爆|灼燒引爆)$/, "");
    // Frostfire now owns one WebGL canvas; never mount its legacy CSS sprites.
    if (skill === "霜火新星") return;
    if (skill === "閃電鏈" || skill === "元素蝕印" || skill === "隕星術") return;
    if (skill !== "霜火新星" && skill !== "隕星術" && skill !== "奧術回響" && !equippedSkillMythic(equippedGearRef.current, skill)) return;
    const phase: MythicVfxPhase = /(?:爆炸|血爆|引爆)/.test(effect.name)
      ? "impact"
      : effect.name.includes("回響")
        ? "echo"
        : "impact";
    const variant = effect.name.includes("灼燒引爆") ? "detonation" : "normal";
    setMythicVfxEffects((current) => [...current, { skill, key: effect.key, phase, variant }]);
    window.setTimeout(() => {
      setMythicVfxEffects((current) => current.filter((item) => item.key !== effect.key));
    }, skill === "霜火新星" && variant === "normal"
      ? 2_400
      : (phase as MythicVfxPhase) === "loop" ? 2_600 : 1_700);
  }, []);

  const queueSkillVisual = useCallback((
    effect: { name: string; key: number },
    options: { showVisual?: boolean; showBanner?: boolean } = {},
  ) => {
    const showVisual = options.showVisual ?? true;
    const ultimate = SKILL_REWORK_CATALOG[playerClass].some((skill) =>
      skill.category === "ultimate" && skill.name === effect.name.split("・")[0]);
    const showBanner = (options.showBanner ?? true) && !ultimate;
    if (showVisual) queueMythicVfx(effect);
    const baseName = effect.name.replace(/・(?:回響|爆炸|強化斬擊|血爆|裂痕引爆|灼燒引爆)$/, "");
    setSkillEffect(showVisual ? effect : null);
    if (ultimate) {
      setSkillBannerEffect(null);
    } else if (showBanner) {
      setSkillBannerEffect(effect);
      window.setTimeout(() => {
        setSkillBannerEffect((current) => (current?.key === effect.key ? null : current));
      }, skillBannerDuration());
    }
    if (!showVisual) return;
    if (["裂地斬", "處決", "穿雲箭", "追風箭", "獵殺標記", "風行領域", "破星狙擊", "疾風連射", "致命標記", "致命標記・爆炸", "霜火新星", "閃電鏈", "元素蝕印", "隕星術", "虛空崩解", "奧術超載", "血戰烙印", "碎甲猛擊", "泰坦斷界斬", "蒼穹箭雨", "星界寂滅"].includes(baseName) || baseName.endsWith("・共鳴斬")) return;
    setSkillVisualEffects((current) => [...current, effect]);
    window.setTimeout(() => {
      setSkillVisualEffects((current) => current.filter((item) => item.key !== effect.key));
    }, 2_200);
  }, [playerClass, queueMythicVfx]);
  // Ground-split owns its own lifetime so a dying/changing enemy or a normal
  // attack cannot unmount the fissure before its visual timeout.
  const [groundSplitEffect, setGroundSplitEffect] = useState<{ key: number; hit: boolean } | null>(null);
  const [groundShockEffects, setGroundShockEffects] = useState<{ key: number }[]>([]);
  const pendingGroundDamageRef = useRef(new Map<number, () => void>());
  const pendingGroundShockDamageRef = useRef(new Map<number, () => void>());
  const publishGroundImpactDamage = (eventKey: number) => {
    const publish = pendingGroundDamageRef.current.get(eventKey);
    pendingGroundDamageRef.current.delete(eventKey);
    publish?.();
  };
  const publishGroundShockDamage = (eventKey: number) => {
    const publish = pendingGroundShockDamageRef.current.get(eventKey);
    pendingGroundShockDamageRef.current.delete(eventKey);
    publish?.();
  };
  const [executionEffect, setExecutionEffect] = useState<{
    key: number;
  } | null>(null);
  const [executionImpactPulse, setExecutionImpactPulse] = useState(false);
  const [unyieldingVisual, setUnyieldingVisual] = useState({
    eventKey: 0, active: false, activated: false, blocked: false, countered: false,
    remainingEnemyAttacks: 0, ascendedCounterStacks: 0,
  });
  const [bloodBrandVisual, setBloodBrandVisual] = useState<{ castKey: number; expiresAt: number; burstKey: number } | null>(null);
  const [bloodRoarVisualActive, setBloodRoarVisualActive] = useState(false);
  const [bloodRoarSlashKey, setBloodRoarSlashKey] = useState(0);
  const [bloodReturnKey, setBloodReturnKey] = useState(0);
  const [berserkerStanceVisual, setBerserkerStanceVisual] = useState({ active: false, activationKey: 0, pulseKey: 0, attackKey: 0, attackHit: false, attackTarget: "", ascended: false, extensions: 0 });
  const berserkerStanceExtensionsRef = useRef(0);
  const [armorSmashVisual, setArmorSmashVisual] = useState<{ key: number; hit: boolean; enhanced: boolean; ascended: boolean } | null>(null);
  const [titanUltimateVisual, setTitanUltimateVisual] = useState<{ key: number; hit: boolean; ascended: boolean } | null>(null);
  const ultimateAnimationLockRef = useRef<number | null>(null);
  const ultimatePlaybackGuardRef = useRef(new CombatPlaybackGuard());
  const beginUltimateAnimation = useCallback((eventKey:number) => {
    ultimateAnimationLockRef.current=eventKey;
    ultimatePlaybackGuardRef.current.begin(eventKey,performance.now());
  },[]);
  const [titanEchoVisuals, setTitanEchoVisuals] = useState<{ key: number; slashIndex: number }[]>([]);
  // Queue display only: combat has already settled this damage. The loaded
  // sprite calls this publisher at frame 15, even when image loading is slow.
  const pendingTitanDamageRef = useRef(new Map<number, () => void>());
  const titanDamageTimersRef = useRef(new Map<number, number>());
  const publishTitanImpactDamage = (eventKey: number) => {
    const publish = pendingTitanDamageRef.current.get(eventKey);
    pendingTitanDamageRef.current.delete(eventKey);
    publish?.();
  };
  const [comboCount, setComboCount] = useState(1);
  const [, setLastDamage] = useState(0);
  const [, setBattleHits] = useState<
    { damage: number; critical: boolean; volley?: boolean }[]
  >([]);
  const [battleHitGroups, setBattleHitGroups] = useState<{
    key: number;
    titan?: boolean; ultimate?: boolean; skillName?: string;
    hits: { damage: number; critical: boolean; delayMs?: number; label?: string; text?: string; skyIndex?: number; channel?: FloatChannel }[];
  }[]>([]);
  const [setElementalHits, setSetElementalHits] = useState<{
    key: number;
    hits: { damage: number; label: string; delayMs?: number }[];
    volley: boolean;
  }[]>([]);
  const [enemyHitFeedback, setEnemyHitFeedback] = useState<{
    damage: number;
    dodged: boolean;
    key: number;
  } | null>(null);
  const [playerHitFeedback, setPlayerHitFeedback] = useState<{
    damage: number;
    dodged: boolean;
    blocked?: boolean;
    label?: string;
    key: number;
  } | null>(null);
  const [unyieldingCounterFeedback, setUnyieldingCounterFeedback] = useState<number | null>(null);
  const [missFeedback, setMissFeedback] = useState<number | null>(null);
  const [elementSigilVisual, setElementSigilVisual] = useState(emptyElementSigilVisual);
  const [manaShieldVisual, setManaShieldVisual] = useState(emptyManaShieldVisual);
  const [overloadVisual, setOverloadVisual] = useState(emptyOverloadVisual);
  const [voidVisuals, setVoidVisuals] = useState<VoidVisual[]>([]);
  const pendingVoidRef = useRef(new Map<number, { at: number; publish: () => void }>());
  const publishVoidImpact = (key: number) => pendingVoidRef.current.get(key)?.publish();
  const finishVoidVisual = (key: number) => {
    pendingVoidRef.current.delete(key);
    setVoidVisuals(current => current.filter(effect => effect.key !== key));
  };
  const queueVoidNumbers = useCallback((key: number, action: ReturnType<typeof resolveLiveCombatAttack>,
    total: number, publishExtras: () => void, ascended: boolean) => {
    const hit = action.hits.some(part => part.hit);
    let published = false;
    setVoidVisuals(current => [...current.filter(effect => effect.key !== key), { key, hit, ascended }]);
    pendingVoidRef.current.set(key, { at: performance.now(), publish: () => {
      if (published) return;
      published = true; publishExtras();
      if (hit && total <= 0) return;
      const groupKey = -key - 7 / 64;
      setBattleHitGroups(current => [...current, { key: groupKey, skillName: "虛空崩解",
        hits: [{ damage: total, critical: action.critical, channel: "primary", delayMs: 0,
          ...(!hit ? { text: "未命中！" } : {}) }] }]);
      window.setTimeout(() => setBattleHitGroups(current => current.filter(group => group.key !== groupKey)), 1200);
    } });
  }, []);
  const [meteorVisuals, setMeteorVisuals] = useState<MeteorVisual[]>([]);
  const pendingMeteorRef = useRef(new Map<number, { at: number; publish: (index: number) => void }>());
  const publishMeteorImpact = (key: number, index: number) => pendingMeteorRef.current.get(key)?.publish(index);
  const finishMeteorVisual = (key: number) => {
    pendingMeteorRef.current.delete(key);
    setMeteorVisuals(current => current.filter(effect => effect.key !== key));
  };
  const queueMeteorNumbers = useCallback((key: number, action: ReturnType<typeof resolveLiveCombatAttack>,
    total: number, publishExtras: () => void) => {
    const hit = action.hits.some(part => part.hit), afterburst = action.meteorAfterburst;
    const ascended = liveCombatRef.current?.ascended.has("隕星術") ?? false;
    const amounts = meteorAmounts(total, action.damagePercent, afterburst);
    const published = new Set<number>();
    const burnExpiry = action.statuses.includes("burn") ? liveCombatRef.current?.combat.session.enemy.burn?.expiresAt : undefined;
    if (burnExpiry !== undefined) frostfireGatesRef.current.burn = burnExpiry;
    setMeteorVisuals(current => [...current.filter(effect => effect.key !== key), { key, hit, afterburst, ascended }]);
    pendingMeteorRef.current.set(key, { at: performance.now(), publish: index => {
      if (index > (afterburst ? 1 : 0) || published.has(index)) return;
      published.add(index);
      if (index === 0) {
        publishExtras();
        if (burnExpiry !== undefined && frostfireGatesRef.current.burn === burnExpiry) delete frostfireGatesRef.current.burn;
      }
      const landed = index === 0 ? hit : afterburst!.hit;
      if (landed && amounts[index] <= 0) return;
      const groupKey = -key - (index + 1) / 64;
      setBattleHitGroups(current => [...current, { key: groupKey, skillName: "隕星術",
        hits: [{ damage: amounts[index], critical: index === 0 ? action.critical : afterburst!.critical,
          channel: index === 0 ? "primary" : "extra", delayMs: 0,
          label: index === 1 ? "天火墜星" : undefined, ...(!landed ? { text: "未命中！" } : {}) }] }]);
      window.setTimeout(() => setBattleHitGroups(current => current.filter(group => group.key !== groupKey)), 1200);
    } });
  }, []);
  const updateMeteorVisual = useCallback((action: ReturnType<typeof resolveLiveCombatAttack>, key: number) => {
    if (action.name === "隕星術") queueMeteorNumbers(key, action, 0, () => {});
  }, [queueMeteorNumbers]);
  const [lightningVisuals, setLightningVisuals] = useState<LightningVisual[]>([]);
  const [lightningParalysis, setLightningParalysis] = useState<number | undefined>();
  const pendingLightningRef = useRef(new Map<number, (index: number) => void>());
  const lightningParalysisGateRef = useRef<number | undefined>(undefined);
  const publishLightningImpact = (key: number, index: number) => pendingLightningRef.current.get(key)?.(index);
  const finishLightningVisual = (key: number) => {
    pendingLightningRef.current.delete(key);
    setLightningVisuals(current => current.filter(effect => effect.key !== key));
  };
  const queueLightningNumbers = useCallback((key: number, action: ReturnType<typeof resolveLiveCombatAttack>,
    total: number, publishExtras: () => void, ascended: boolean) => {
    const segments = action.lightningSegments;
    const amounts = lightningAmounts(segments, total);
    const published = new Set<number>(); let extrasPublished = false;
    if (action.statuses.includes("paralysis")) lightningParalysisGateRef.current = liveCombatRef.current?.combat.session.enemy.paralysis?.expiresAt;
    setLightningVisuals(current => [...current.filter(effect => effect.key !== key), { key, segments, ascended }]);
    pendingLightningRef.current.set(key, index => {
      const part = segments[index];
      if (!part || published.has(index)) return;
      published.add(index);
      if (!extrasPublished && (part.hit || published.size === segments.length)) {
        extrasPublished = true; publishExtras(); lightningParalysisGateRef.current = undefined;
      }
      if (part.hit && amounts[index] <= 0) return;
      const groupKey = -key - (index + 1) / 32;
      setBattleHitGroups(current => [...current, { key: groupKey, skillName: index === 3 ? "雷環共鳴" : "閃電鏈",
        hits: [{ damage: amounts[index], critical: part.critical, delayMs: 0,
          channel: index === 3 ? "extra" : "primary", label: index === 3 ? "雷環共鳴" : undefined,
          ...(!part.hit ? { text: "未命中！" } : {}) }] }]);
      window.setTimeout(() => setBattleHitGroups(current => current.filter(group => group.key !== groupKey)), 1200);
    });
  }, []);
  const [frostfireVisuals, setFrostfireVisuals] = useState<FrostfireVisual[]>([]);
  const [frostfireStatuses, setFrostfireStatuses] = useState<FrostfireStatusVisual>({});
  const pendingFrostfireDamageRef = useRef(new Map<number, () => void>());
  const frostfireGatesRef = useRef<FrostfireStatusVisual>({});
  const publishFrostfireImpact = (key: number) => {
    const publish = pendingFrostfireDamageRef.current.get(key);
    pendingFrostfireDamageRef.current.delete(key); publish?.();
    const effect = frostfireVisuals.find(item => item.key === key);
    if (effect?.status && frostfireGatesRef.current[effect.status.kind] === effect.status.expiresAt)
      delete frostfireGatesRef.current[effect.status.kind];
    if (effect?.afterburst) setFrostfireVisuals(current => [...current,
      { key: effect.afterburst!.key, kind: "afterburst", hit: effect.afterburst!.hit }]);
  };
  const finishFrostfireVisual = (key: number) => {
    pendingFrostfireDamageRef.current.delete(key);
    setFrostfireVisuals(current => current.filter(item => item.key !== key));
  };
  const publishFrostfireNumber = useCallback((key: number, damage: number, critical: boolean, label?: string, missed = false) => {
    if (!(damage > 0) && !missed) return;
    setBattleHitGroups(current => [...current, { key, skillName: label ? undefined : "霜火新星", hits: [{ damage, critical, label,
      channel: label ? "extra" : "primary", delayMs: 0, ...(missed ? { text: "未命中！" } : {}) }] }]);
    window.setTimeout(() => setBattleHitGroups(current => current.filter(group => group.key !== key)), 1200);
  }, []);
  const updateFrostfireVisual = useCallback((battle: LiveCombatBattle, action: ReturnType<typeof resolveLiveCombatAttack>, key: number) => {
    if (action.name !== "霜火新星") return;
    const kind = action.statuses.includes("freeze") ? "freeze" : action.statuses.includes("burn") ? "burn" : null;
    const expiresAt = kind ? battle.combat.session.enemy[kind]?.expiresAt : undefined;
    if (kind && expiresAt !== undefined) frostfireGatesRef.current[kind] = expiresAt;
    const hit = action.hits.some(part => part.hit);
    const afterburst = action.frostfireAfterburst;
    setFrostfireVisuals(current => [...current.filter(item => item.key !== key), { key, kind: "main", hit,
      ...(kind && expiresAt !== undefined ? { status: { kind, expiresAt } } : {}),
      ...(afterburst ? { afterburst: { key: -key - .75, hit: afterburst.hit } } : {}) }]);
    if (!hit) pendingFrostfireDamageRef.current.set(key, () => publishFrostfireNumber(key, 0, false, undefined, true));
  }, [publishFrostfireNumber]);
  const queueFrostfireAfterburstNumber = useCallback((key: number, damage: number, extra: ReturnType<typeof resolveLiveCombatAttack>["frostfireAfterburst"]) => {
    if (!extra) return;
    const burstKey = -key - .75;
    pendingFrostfireDamageRef.current.set(burstKey, () => publishFrostfireNumber(burstKey, damage, extra.critical, "灼燒餘爆", !extra.hit));
  }, [publishFrostfireNumber]);
  const queueFrostfireShatter = useCallback((group: { key: number; kind: "freeze"; damage: number; critical?: boolean }) => {
    const key = -group.key - .25;
    pendingFrostfireDamageRef.current.set(key, () => {
      setDotDamageGroups(current => [...current, group]);
      window.setTimeout(() => setDotDamageGroups(current => current.filter(item => item.key !== group.key)), 1200);
    });
    setFrostfireVisuals(current => [...current, { key, kind: "shatter", hit: true }]);
  }, []);
  const [dotDamageGroups, setDotDamageGroups] = useState<{
    key: number; kind: "bleed" | "burn" | "freeze" | "echo"; damage: number; critical?: boolean;
  }[]>([]);
  const dotDamageKeyRef = useRef(0);
  const showDotDamage = useCallback((events: readonly LiveDotDamageEvent[], actualDamage: number) => {
    const groups = splitAsyncDamageForDisplay(events, actualDamage)
      .map((event) => ({ ...event, key: ++dotDamageKeyRef.current }));
    if (!groups.length) return;
    for (const group of groups) if (group.kind === "freeze") queueFrostfireShatter({ ...group, kind: "freeze" });
    setDotDamageGroups((current) => [...current, ...groups.filter(group => group.kind !== "freeze")]);
    window.setTimeout(() => setDotDamageGroups((current) => current.filter((item) =>
      !groups.some((group) => group.key === item.key))), 1_200);
  }, [queueFrostfireShatter]);
  const counterDamageKeyRef=useRef(0);
  const showCounterDamage=(damage:number,label="反擊")=>{
    if(damage<=0)return;
    const key=-(++counterDamageKeyRef.current)-.9375;
    setBattleHitGroups((current)=>[...current,{key,hits:[{damage,critical:false,label,channel:"extra",delayMs:0}]}]);
    window.setTimeout(()=>setBattleHitGroups((current)=>current.filter((group)=>group.key!==key)),1200);
  };
  const showMythicDamage = (hits: ReturnType<typeof splitMythicDamage>["hits"]) => {
    const shown = hits.filter(hit => hit.damage > 0);
    if (!shown.length) return;
    const key = -(++counterDamageKeyRef.current) - .875;
    setBattleHitGroups(current => [...current, { key,
      hits: shown.map(hit => ({ damage: hit.damage, label: hit.label, critical: hit.critical,
        channel: "extra" as const, delayMs: 0 })) }]);
    window.setTimeout(() => setBattleHitGroups(current => current.filter(group => group.key !== key)), 1200);
  };
  const updateLiveBloodRoar = (battle: LiveCombatBattle, action: ReturnType<typeof resolveLiveCombatAttack>, key: number) => {
    if (battle.characterClass !== "戰士" || !action.bloodRoarEmpowered) return;
    const remaining = (battle.combat as WarriorCombat).buffs.bloodRoarRemaining;
    if (action.bloodRoarActivated) {
      bloodRoarVisualTokenRef.current++;
      setBloodRoarVisualActive(true);
      queueSkillVisual({ name: "鮮血怒吼", key });
    }
    if (action.currentHealthCostPercent && action.equipmentHits.some(hit => hit.label === "血神降臨"))
      queueSkillVisual({ name: "鮮血怒吼・血爆", key: key + .125 }, { showBanner: false });
    if (remaining === 0) {
      const token = bloodRoarVisualTokenRef.current;
      if (bloodRoarHideTimerRef.current !== null) window.clearTimeout(bloodRoarHideTimerRef.current);
      bloodRoarHideTimerRef.current = window.setTimeout(() => {
        if (token === bloodRoarVisualTokenRef.current) setBloodRoarVisualActive(false);
        bloodRoarHideTimerRef.current = null;
      }, 700);
    }
  };
  const [combatStatuses, setCombatStatuses] = useState<CombatStatus[]>([]);
  const showCombatStatus = (status: CombatStatus) => {
    setCombatStatuses((current) => [
      ...current.filter((item) => !(item.name === status.name && item.target === status.target)),
      status.unit === "秒" ? { ...status, expiresAt: status.expiresAt ?? Date.now() + status.remaining * 1000 } : status,
    ]);
  };
  const [hunterMarkVisual, setHunterMarkVisual] = useState<HunterMarkVisual | null>(null);
  const [hunterBursts, setHunterBursts] = useState<HunterBurstVisual[]>([]);
  const pendingHunterBurstRef = useRef(new Map<number, HunterBurstVisual>());
  const pendingHunterDamageRef = useRef(new Map<number, () => void>());
  const publishHunterImpact = (eventKey: number) => {
    const publish = pendingHunterDamageRef.current.get(eventKey);
    if (!publish) return;
    pendingHunterDamageRef.current.delete(eventKey); publish();
  };
  const finishHunterBurst = (eventKey: number) => {
    pendingHunterDamageRef.current.delete(eventKey);
    setHunterBursts((current) => current.filter((item) => item.key !== eventKey));
  };
  const expireHunterMark = (castKey: number) => {
    setHunterMarkVisual((current) => current?.castKey === castKey && !current.pending
      && current.expiresAt <= Date.now() ? null : current);
  };
  const triggerHunterBurst = useCallback((eventKey: number) => {
    const burst = pendingHunterBurstRef.current.get(eventKey);
    if (!burst) return;
    pendingHunterBurstRef.current.delete(eventKey);
    setHunterBursts((current) => [...current.filter((item) => item.key !== eventKey), burst]);
  }, []);
  const updateHunterVisual = useCallback((battle: LiveCombatBattle, action: ReturnType<typeof resolveLiveCombatAttack>, eventKey: number) => {
    if (battle.characterClass !== "遊俠") return;
    const mark = action.hunterMark;
    setHunterMarkVisual((current) => mark ? { ...mark,
      castKey: mark.activated ? eventKey : current?.castKey ?? eventKey,
      pulseKey: !mark.activated && action.hits.some(part => part.hit) ? eventKey : current?.pulseKey ?? 0 } : null);
    if (action.hunterExplosion) {
      pendingHunterBurstRef.current.set(eventKey, { key: eventKey, hit: action.hunterExplosion.hit });
      if (action.damagePercent <= 0) triggerHunterBurst(eventKey);
    }
  }, [triggerHunterBurst]);
  const queueHunterBurstNumber = (eventKey: number, damage: number, critical: boolean) => {
    if (damage <= 0) return;
    pendingHunterDamageRef.current.set(eventKey, () => {
      const key = -eventKey - .75;
      setBattleHitGroups((current) => [...current, { key,
        hits: [{ damage, critical, label: "死亡鎖定", delayMs: 0 }] }]);
      window.setTimeout(() => setBattleHitGroups((current) => current.filter((group) => group.key !== key)), 1200);
    });
  };
  const [windDomainVisual, setWindDomainVisual] = useState<WindDomainVisual | null>(null);
  const updateWindDomainVisual = useCallback((battle: LiveCombatBattle,
    action: ReturnType<typeof resolveLiveCombatAttack>, key: number) => {
    if (battle.characterClass !== "遊俠") return;
    const domain = (battle.combat as RangerCombat).windDomain;
    const activated = action.name === "風行領域";
    const attacking = !activated && action.name !== "獵殺標記" && action.hits.length > 0;
    setWindDomainVisual((current) => windDomainVisualState(domain, current, key, activated, attacking));
  }, []);
  const finishWindDomain = (key: number) => {
    setWindDomainVisual((current) => current?.castKey === key && current.ending ? null : current);
  };
  const [phantomStepVisual, setPhantomStepVisual] = useState<PhantomStepVisual | null>(null);
  const updatePhantomStepVisual = (battle: LiveCombatBattle, eventKey: number, event?: PhantomStepEvent) => {
    if (battle.characterClass !== "遊俠") return;
    const defense = (battle.combat as RangerCombat).defense;
    setPhantomStepVisual((current) => phantomStepVisualState(defense, current, eventKey, event));
  };
  const finishPhantomStepBurst = (eventKey: number) => {
    setPhantomStepVisual((current) => {
      if (!current || current.eventKey !== eventKey) return current;
      return current.active || current.nextHitReady || current.nextSkillReady
        ? { ...current, eventKey: 0, burst: null } : null;
    });
  };
  const updateUnyieldingVisual = (event: NonNullable<ReturnType<typeof resolveLiveEnemyAttack>["unyielding"]>, eventKey: number) => {
    setUnyieldingVisual((current) => {
      if (!event.active && !event.activated && !current.active) return current;
      return { ...event, eventKey };
    });
  };
  const finishUnyieldingVisual = (eventKey: number) => {
    setUnyieldingVisual((current) => current.eventKey === eventKey && !current.active
      ? { eventKey: 0, active: false, activated: false, blocked: false, countered: false,
        remainingEnemyAttacks: 0, ascendedCounterStacks: 0 }
      : current);
  };
  const updateBloodBrandVisual = (action: ReturnType<typeof resolveLiveCombatAttack>, eventKey: number) => {
    if (action.name === "血戰烙印" && action.statuses.includes("bloodBrand") && action.bloodBrandExpiresAt) {
      setBloodBrandVisual((current) => ({ castKey: eventKey, expiresAt: action.bloodBrandExpiresAt!,
        burstKey: action.bloodBrandBurst ? eventKey : current?.burstKey ?? 0 }));
    } else if (action.bloodBrandBurst) {
      setBloodBrandVisual((current) => current && current.expiresAt > Date.now()
        ? { ...current, burstKey: eventKey } : current);
    }
  };
  const finishBloodBrandVisual = (castKey: number) => {
    setBloodBrandVisual((current) => current?.castKey === castKey && current.expiresAt <= Date.now()
      ? null : current);
  };
  const updateBerserkerStanceVisual = (battle: LiveCombatBattle, action: ReturnType<typeof resolveLiveCombatAttack>, eventKey: number) => {
    if (battle.characterClass !== "戰士") return;
    const buffs = (battle.combat as WarriorCombat).buffs;
    const activated = action.name === "狂戰姿態";
    const extended = !activated && buffs.stanceExtensions > berserkerStanceExtensionsRef.current;
    berserkerStanceExtensionsRef.current = buffs.stanceExtensions;
    setBerserkerStanceVisual((current) => ({
      active: buffs.stanceRemaining > 0,
      activationKey: activated ? eventKey : current.activationKey,
      pulseKey: extended ? eventKey : current.pulseKey,
      attackKey: action.stanceEmpowered ? eventKey : current.attackKey,
      attackHit: action.stanceEmpowered ? action.hits.some(part => part.hit) : current.attackHit,
      attackTarget: action.stanceEmpowered ? battle.target : current.attackTarget,
      ascended: battle.ascended.has("狂戰姿態"),
      extensions: buffs.stanceExtensions,
    }));
  };
  const updateArmorSmashVisual = (battle: LiveCombatBattle, action: ReturnType<typeof resolveLiveCombatAttack>, eventKey: number) => {
    if (action.name !== "碎甲猛擊") return;
    const hit = action.hits.some((part) => part.hit);
    setArmorSmashVisual({ key: eventKey, hit, enhanced: hit && action.repeatedArmorBreakBonusPercent > 0, ascended: battle.ascended.has("碎甲猛擊") });
  };
  const updateGroundSplitVisuals = (action: ReturnType<typeof resolveLiveCombatAttack>, eventKey: number) => {
    if (action.name === "裂地斬")
      setGroundSplitEffect({ key: eventKey, hit: action.hits.some((part) => part.hit) });
    if (action.groundShockDamagePercent > 0)
      setGroundShockEffects((current) => [...current.filter((effect) => effect.key !== eventKey), { key: eventKey }]);
  };
  const updatePiercingVisual = (action: ReturnType<typeof resolveLiveCombatAttack>, eventKey: number) => {
    if (action.name === "穿雲箭")
      setRangerPiercingEffect({ key: eventKey, hit: action.hits.some((part) => part.hit) });
  };
  const updateTailwindVisual = (action: ReturnType<typeof resolveLiveCombatAttack>, eventKey: number) => {
    if (action.name !== "追風箭") return;
    setTailwindVisuals((current) => [...current.filter((item) => item.key !== eventKey), {
      key: eventKey, hit: action.hits.some((part) => part.hit),
      echo: action.tailwindEcho, chargeRecovered: action.tailwindChargeRecovered,
    }]);
  };
  const queueTailwindEchoNumber = (eventKey: number, damage: number, critical: boolean) => {
    if (damage <= 0) return;
    pendingTailwindEchoDamageRef.current.set(eventKey, () => {
      const key = -eventKey - .5;
      setBattleHitGroups((current) => [...current, { key,
        hits: [{ damage, critical, label: "追擊", delayMs: 0 }] }]);
      window.setTimeout(() => setBattleHitGroups((current) => current.filter((group) => group.key !== key)), 1200);
    });
  };
  const finishGroundSplitVisual = (eventKey: number) => {
    pendingGroundDamageRef.current.delete(eventKey);
    setGroundSplitEffect((current) => current?.key === eventKey ? null : current);
  };
  const finishGroundShockVisual = (eventKey: number) => {
    pendingGroundShockDamageRef.current.delete(eventKey);
    setGroundShockEffects((current) => current.filter((effect) => effect.key !== eventKey));
  };
  const queueGroundShockNumber = (eventKey: number, damage: number) => {
    if (damage <= 0) return;
    pendingGroundShockDamageRef.current.set(eventKey, () => {
      const key = -eventKey;
      setBattleHitGroups((current) => [...current, { key,
        hits: [{ damage, critical: false, label: "震地", delayMs: 0 }] }]);
      window.setTimeout(() => setBattleHitGroups((current) => current.filter((group) => group.key !== key)), 1200);
    });
  };
  const finishArmorSmashVisual = (eventKey: number) => {
    setArmorSmashVisual((current) => current?.key === eventKey ? null : current);
  };
  const updateTitanVisuals = (battle: LiveCombatBattle, action: ReturnType<typeof resolveLiveCombatAttack>, eventKey: number) => {
    if (action.name === "泰坦斷界斬") {
      pendingTitanDamageRef.current.clear();
      setTitanUltimateVisual({ key: eventKey, hit: action.hits.some((part) => part.hit), ascended: battle.ascended.has("泰坦斷界斬") });
    }
    if (action.titanSlashHits > 0 && action.titanSlashIndex !== null)
      setTitanEchoVisuals((current) => [...current.filter((item) => item.key !== eventKey),
        { key: eventKey, slashIndex: action.titanSlashIndex! }]);
  };
  const finishTitanUltimateVisual = (eventKey: number) => {
    pendingTitanDamageRef.current.delete(eventKey);
    setTitanUltimateVisual((current) => current?.key === eventKey ? null : current);
    if (ultimateAnimationLockRef.current === eventKey) ultimateAnimationLockRef.current = null;
    ultimatePlaybackGuardRef.current.complete(eventKey);
  };
  const finishUltimateAnimation = (eventKey: number) => {
    if (ultimateAnimationLockRef.current === eventKey) ultimateAnimationLockRef.current = null;
    ultimatePlaybackGuardRef.current.complete(eventKey);
  };
  const recoverInterruptedUltimate = useEffectEvent(() => {
    if(!saveReady || sessionSuperseded)return;
    const visible=tab==="主控" && documentVisible;
    const key=ultimatePlaybackGuardRef.current.takeRecovery(performance.now(),visible);
    if(key===null || ultimateAnimationLockRef.current!==key)return;
    // Only publish settled display amounts. Never reroll, deal new damage or
    // award a second kill; the existing keyed publishers/victory guard own it.
    publishTitanImpactDamage(key);
    for(let index=0;index<9;index++)pendingSkyDamageRef.current.get(key)?.(index);
    for (let index=0;index<(pendingAstralDamageRef.current.get(key)?.count ?? 0);index++) pendingAstralDamageRef.current.get(key)?.publish(index);
    finishAstralVisual(key);
    finishSkyRainVisual(key);
    finishTitanUltimateVisual(key);
    finishUltimateAnimation(key);
    setSkillVisualEffects((current)=>current.filter((effect)=>effect.key!==key));
  });
  useEffect(()=>{
    recoverInterruptedUltimate();
    const timer=window.setInterval(recoverInterruptedUltimate,100);
    return()=>window.clearInterval(timer);
  },[tab,documentVisible]);
  const finishTitanEchoVisual = (eventKey: number) => {
    setTitanEchoVisuals((current) => current.filter((item) => item.key !== eventKey));
  };
  const [battleDrops, setBattleDrops] = useState<BattleDrop[]>([]);
  const [lootInspect, setLootInspect] = useState<BattleDrop | null>(null);
  const [blessings, setBlessings] = useState<Blessing[]>([]);
  const [bloodShieldReady, setBloodShieldReady] = useState(true);
  const [blessingChoices, setBlessingChoices] = useState<Blessing[]>([]);
  const [blessingOpen, setBlessingOpen] = useState(false);
  const [blessingDrawing, setBlessingDrawing] = useState(false);
  const [blessingUnavailable, setBlessingUnavailable] = useState(false);
  const [blessingCountdown, setBlessingCountdown] = useState(5);
  const [, setCausePrompt] = useState("");
  const [resourceDrop, setResourceDrop] = useState<{
    key: number;
    gold: number;
    enhance: number;
    reforge: number;
    yuanbao: number;
  } | null>(null);
  const [runKills, setRunKills] = useState(0);
  const [runElites, setRunElites] = useState(0);
  const [runGuardians, setRunGuardians] = useState(0);
  const [runGold, setRunGold] = useState(0);
  const [runEnhance, setRunEnhance] = useState(0);
  const [runReforge, setRunReforge] = useState(0);
  const [runGear, setRunGear] = useState(0);
  const [runStartedAt, setRunStartedAt] = useState(() => Date.now());
  const [highestFloor, setHighestFloor] = useState(1);
  const [completedRuns, setCompletedRuns] = useState(0);
  const [rebirthCount, setRebirthCount] = useState(0);
  const [legacyRebirthCount, setLegacyRebirthCount] = useState(0);
  const [selectedTitle, setSelectedTitle] = useState<TitleId>("none");
  const [selectedAppearance, setSelectedAppearance] = useState<AppearanceId>("none");
  const [ownedTitles, setOwnedTitles] = useState<TitleId[]>(["none"]);
  const [ownedAppearances, setOwnedAppearances] = useState<AppearanceId[]>(["none"]);
  const [rebirthPoints, setRebirthPoints] = useState(0);
  const [rebirthTalents, setRebirthTalents] = useState<RebirthTalents>(emptyRebirthTalents);
  const [finalBossDefeated, setFinalBossDefeated] = useState(false);
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [rebirthOpen, setRebirthOpen] = useState(false);
  const [restartCountdown, setRestartCountdown] = useState(10);
  const [storedSeconds, setStoredSeconds] = useState(0);
  const idleStorageClockRef = useRef<IdleStorageClock | null>(null);
  const resetStoredTime = useCallback((seconds: number, updatedAt?: string | null) => {
    const clock = resetIdleStorageClock(idleStorageClockRef.current, seconds, performance.now(), updatedAt);
    idleStorageClockRef.current = clock;
    setStoredSeconds(clock.seconds);
  }, []);
  const reconcileStoredTime = useCallback((seconds: number, epoch: number, updatedAt?: string | null) => {
    const clock = idleStorageClockRef.current;
    if (!clock) return;
    const next = reconcileIdleStorageClock(clock, seconds, performance.now(), epoch, updatedAt);
    idleStorageClockRef.current = next;
    setStoredSeconds(next.seconds);
  }, []);
  const [offlineClaimPending, setOfflineClaimPending] = useState(false);
  const offlineClaimPendingRef = useRef(false);
  const pendingIdleClaimIdRef = useRef<string | null>(null);
  const lastIdleClaimIdRef = useRef<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [bagCategory, setBagCategory] = useState<"全部" | "武器" | "防具" | "飾品" | "套裝" | "未查看">("全部");
  const [bagSort, setBagSort] = useState<"戰力" | "品質" | "強化" | "最新">("戰力");
  const [mobileItemDetailOpen, setMobileItemDetailOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(0);
  const [equipFeedback, setEquipFeedback] = useState<{ slot: string; id: number } | null>(null);
  useEffect(() => {
    if (!equipFeedback) return;
    const timeout = window.setTimeout(() => setEquipFeedback(null), 620);
    return () => window.clearTimeout(timeout);
  }, [equipFeedback]);
  const [activeLoadout, setActiveLoadout] = useState<1 | 2>(1);
  const [loadouts, setLoadouts] = useState<Record<1 | 2, number[]>>({
    1: [],
    2: [],
  });
  const [skillReworkBuild, setSkillReworkBuild] = useState<SkillBuild>(createSkillBuild);
  const availableSkillPoints = Math.max(0,
    Math.max(earnedSkillPoints(level), skillReworkBuild.adminPointLimit ?? earnedSkillPoints(level))
      - spentSkillPoints(skillReworkBuild));
  const bloodRoarLevel = skillReworkBuild.ranks["鮮血怒吼"] ?? 0;
  const liveCombatRef = useRef<LiveCombatBattle | null>(null);
  const updateOverload = useCallback((battle: LiveCombatBattle | null) => {
    if (!battle || battle.characterClass !== "法師") { setOverloadVisual(previous => previous.enabled ? emptyOverloadVisual() : previous); return; }
    const mage = battle.combat as MageCombat, overload = mage.overload;
    const snapshot = { owner: `${battle.owner}:${battle.signature}`, enabled: (battle.build.ranks["奧術超載"] ?? 0) > 0 && battle.build.activeSlots.includes("奧術超載"),
      phase: overload.phase, charge: mage.session.charge.charges["奧術超載"] ?? 0,
      remaining: overload.phase === "overloaded" ? overload.remainingSuccessfulCasts : 0,
      stability: overload.phase === "overloaded" ? overload.stabilityStacks : 0,
      ascended: overload.phase === "overloaded" ? overload.ascended : battle.ascended.has("奧術超載"),
      expiresAt: overload.phase === "exhausted" ? overload.expiresAt ?? 0 : 0 };
    const now = Date.now();
    setOverloadVisual(previous => updateOverloadVisual(previous, snapshot, now));
  }, []);
  const updateElementSigil = useCallback((battle: LiveCombatBattle, action: ReturnType<typeof resolveLiveCombatAttack>) => {
    if (battle.characterClass !== "法師") return;
    const mage = battle.combat as MageCombat;
    const snapshot = { target: battle.target, expiresAt: mage.session.enemy.elementSigil?.expiresAt ?? 0,
      ascended: mage.sigil.markedAscended, firstAnomalyUsed: mage.sigil.firstAnomalyUsed };
    const visualAction = { name: action.name, hit: action.hits.some(part => part.hit), statuses: action.statuses };
    const now = Date.now();
    setElementSigilVisual(previous => updateElementSigilVisual(previous, snapshot, now, visualAction));
  }, []);
  const updateManaShield = useCallback((battle: LiveCombatBattle | null, event?: ManaShieldEvent) => {
    if (!battle || battle.characterClass !== "法師") return;
    const shield = (battle.combat as MageCombat).shield;
    const target = battle.target, value = shield.value, ascended = shield.ascended, now = Date.now();
    setManaShieldVisual(previous => updateManaShieldVisual(previous, target, value, ascended, now, event));
  }, []);
  const [skillAscensions, setSkillAscensions] = useState<SkillAscensionState>(createSkillAscensions);
  const [skillActionBusy, setSkillActionBusy] = useState(false);
  const skillActionInFlightRef = useRef(false);
  const skillActionRetryRef = useRef<{ key: string; id: string } | null>(null);
  const [skills] = useState<Skill[]>([]);
  const [bossTickets, setBossTickets] = useState(10);
  const [worldAttempts, setWorldAttempts] = useState(3);
  const [selectedBoss, setSelectedBoss] = useState(personalBosses[0]);
  const [bossMode, setBossMode] = useState<"personal" | "world">("personal");
  const [battleReport, setBattleReport] = useState<string[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [mailOpen, setMailOpen] = useState(false);
  const [offlineReportOpen, setOfflineReportOpen] = useState(false);
  const [reforgeOpen, setReforgeOpen] = useState(false);
  const [gemWorkshopOpen, setGemWorkshopOpen] = useState(false);
  const [selectedGemKey, setSelectedGemKey] = useState<string | null>(null);
  const [gemFusionSlots, setGemFusionSlots] = useState<Array<SocketedGem | null>>([null, null, null]);
  const [gemPageMode, setGemPageMode] = useState<"寶石庫" | "寶石合成" | "裝備鑲嵌">("寶石合成");
  const [gemTierFilter, setGemTierFilter] = useState<"全部" | "beginner" | "intermediate" | "advanced">("全部");
  const [gemStatFilter, setGemStatFilter] = useState<"全部" | "戰鬥" | "生存" | "收益">("全部");
  const [gemFusionResult, setGemFusionResult] = useState<{ success: boolean; gem: SocketedGem } | null>(null);
  const [bulkSalvageOpen, setBulkSalvageOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [bulkQualities, setBulkQualities] = useState<string[]>(["普通", "良好"]);
  const [autoSalvage, setAutoSalvage] = useState(false);
  const [autoSalvageQuality, setAutoSalvageQuality] = useState("良好");
  const [protectSetGear, setProtectSetGear] = useState(true);
  const [protectPowerUpgrade, setProtectPowerUpgrade] = useState(true);
  const [targetedAffix, setTargetedAffix] = useState<number | null>(null);
  const [reforgeMode, setReforgeMode] = useState<"idle" | "target">("idle");
  const [unseenItemIds, setUnseenItemIds] = useState<number[]>([]);
  const [activeBossBattle, setActiveBossBattle] = useState<BossBattle | null>(
    null,
  );
  const [bossEnemyHp, setBossEnemyHp] = useState(100);
  const [bossPlayerHp, setBossPlayerHp] = useState(100);
  const bossEnemyHpRef = useRef(bossEnemyHp);
  const bossPlayerHpRef = useRef(bossPlayerHp);
  bossEnemyHpRef.current = bossEnemyHp;
  bossPlayerHpRef.current = bossPlayerHp;
  const [, setLastBossDamage] = useState(0);
  const [, setLastBossCounterDamage] = useState(0);
  const [bossOutcome, setBossOutcome] = useState<"win" | "loss" | "timeout" | null>(null);
  const [abyssBossEffect, setAbyssBossEffect] = useState<{ key: number } | null>(null);
  const [abyssImpactPulse, setAbyssImpactPulse] = useState(false);
  const playerId = characterId;
  const [saveReady, setSaveReady] = useState(false);
  const [saveReloadTick,setSaveReloadTick] = useState(0);
  const integrityRecoveryUsedRef = useRef(false);
  const [saveStatus, setSaveStatus] = useState("載入存檔");
  const [saveUpdatedAt, setSaveUpdatedAt] = useState<string | null>(null);
  const [sessionSuperseded, setSessionSuperseded] = useState(false);
  const [sessionEndedReason, setSessionEndedReason] = useState<"replaced" | "suspended" | "expired" | "conflict" | "maintenance">("replaced");
  const [saveRetryTick, setSaveRetryTick] = useState(0);
  const equipmentBusyRef = useRef(false);
  const equipmentPendingRef = useRef<{id:string;kind:"reforge"|"drill";itemId:number;targetIndex?:number}|null>(null);
  const [equipmentBusy,setEquipmentBusy] = useState(false);
  const saveInFlightRef = useRef(false);
  const saveRequestIdRef = useRef<string | null>(null);
  const saveClientIdRef = useRef("");
  const saveSequenceRef = useRef(0);
  const saveQueuedRef = useRef(false);
  const saveRetryAfterRef = useRef(0);
  const saveFailureCountRef = useRef(0);
  const lastSaveStartedAtRef = useRef(0);
  const saveCadenceStartedAtRef = useRef(0);
  const prioritySaveRef = useRef(false);
  const [adminRevision, setAdminRevision] = useState(0);
  const [dailyKills, setDailyKills] = useState(0);
  const [dailyDate, setDailyDate] = useState("");
  const [dailyRewardClaimed, setDailyRewardClaimed] = useState(false);
  const [dailyClaimBusy, setDailyClaimBusy] = useState(false);
  const dailyClaimInFlightRef = useRef(false);
  const [shopPurchaseBusy, setShopPurchaseBusy] = useState(false);
  const shopPurchaseInFlightRef = useRef(false);
  const shopPurchaseRetryRef = useRef<{ id: string; item: string } | null>(null);
  const [worldDamage, setWorldDamage] = useState(0);
  const [worldRoundDamage, setWorldRoundDamage] = useState(0);
  const [presentedWorldScore, setPresentedWorldScore] = useState<{token: BossBattle | null; damage: number; viewKey: string}>({token: null, damage: 0, viewKey: "boot"});
  const [worldBossSecondsLeft, setWorldBossSecondsLeft] = useState(WORLD_BOSS_ROUND_MS / 1_000);
  const [worldRank, setWorldRank] = useState<number | null>(null);
  const [worldBossMailDeliveryId,setWorldBossMailDeliveryId]=useState("");
  const [worldPeriodDamage,setWorldPeriodDamage]=useState(0);
  const [worldLeaderDamage, setWorldLeaderDamage] = useState(0);
  const [worldTopRanks, setWorldTopRanks] = useState<Array<{
    name?: string; cls?: string; damage?: number;
  }>>([]);
  const logIdRef = useRef(10_000);
  const lootIdRef = useRef(20_000);
  const towerDeathPendingRef = useRef(false);
  const towerVictoryGuardRef = useRef(createCombatVictoryGuard());
  const bloodRoarStateRef = useRef({ battleKey: "", remaining: 0, used: false });
  const bloodRoarHideTimerRef = useRef<number | null>(null);
  const bloodRoarVisualTokenRef = useRef(0);
  const bossMarkedRemainingRef = useRef(0);
  const bossMarkExplosionPendingRef = useRef(false);
  const worldBossBurnRef = useRef({ until: 0, nextAt: 0, damagePerSecond: 0 });
  const abyssBossSequenceRef = useRef(0);
  const bossCinematicLockRef = useRef(false);
  const bossRoundEndedRef = useRef(false);
  const worldBossDeadlineRef = useRef<number | null>(null);
  const equippedGearRef = useRef<Item[]>([]);
  const nextEnemyMarkStacksRef = useRef(0);
  const combatPerksRef = useRef({
    killBuffRemaining: 0,
    nextAttackMultiplier: 1,
    nextBasicAttackMultiplier: 1,
    nextAttackCritDamage: 0,
    revengeStacks: 0,
    dodgeSpeedAttacks: 0,
    firstEnemyAttackReady: true,
    ironWallBonus: 0,
    arcaneStacks: 0,
    arcaneEchoReady: false,
  });
  const resetCombatPerks = () => {
    pendingEnemyDefeatRef.current=null;
    towerCadenceRef.current=null;bossCadenceRef.current=null;
    towerDeathPendingRef.current=false;
    ultimateAnimationLockRef.current=null;
    ultimatePlaybackGuardRef.current.clear();
    setSkillVisualEffects([]);
    astralKeyRef.current = null; setAstralVisual(null);
    pendingAstralDamageRef.current.clear(); pendingAstralVictoryRef.current.clear();
    skyRainKeyRef.current = null; setSkyRainVisual(null);
    pendingSkyDamageRef.current.clear(); pendingSkyVictoryRef.current.clear();
    pendingTailwindDamageRef.current.clear();
    pendingTailwindEchoDamageRef.current.clear();
    setTailwindVisuals([]); setTailwindEchoVisuals([]); setTailwindChargeVisuals([]);
    pendingVolleyDamageRef.current.clear(); setRangerWindVolleyEffect([]);
    pendingStarbreakDamageRef.current.clear(); setStarbreakVisuals([]);
    pendingPiercingDamageRef.current.clear();
    setRangerPiercingEffect(null);
    pendingVoidRef.current.clear();
    pendingMeteorRef.current.clear();
    pendingLightningRef.current.clear(); lightningParalysisGateRef.current = undefined;
    pendingFrostfireDamageRef.current.clear(); frostfireGatesRef.current = {};
    setVoidVisuals([]);
    setMeteorVisuals([]);
    setFrostfireVisuals([]); setFrostfireStatuses({}); setLightningVisuals([]); setLightningParalysis(undefined);
    setElementSigilVisual(emptyElementSigilVisual());
    setManaShieldVisual(emptyManaShieldVisual());
    setOverloadVisual(emptyOverloadVisual());
    setWindDomainVisual(null);
    setPhantomStepVisual(null);
    setHunterMarkVisual(null); setHunterBursts([]);
    pendingHunterBurstRef.current.clear(); pendingHunterDamageRef.current.clear();
    pendingGroundDamageRef.current.clear();
    pendingGroundShockDamageRef.current.clear();
    setGroundSplitEffect(null);
    setGroundShockEffects([]);
    pendingTitanDamageRef.current.clear();
    titanDamageTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    titanDamageTimersRef.current.clear();
    setTitanUltimateVisual(null);
    setTitanEchoVisuals([]);
    setBattleHitGroups([]); setSetElementalHits([]); setDotDamageGroups([]);
    setPlayerHitFeedback(null); setEnemyHitFeedback(null); setMissFeedback(null);
    setUnyieldingCounterFeedback(null);
    combatPerksRef.current = {
      killBuffRemaining: 0,
      nextAttackMultiplier: 1,
      nextBasicAttackMultiplier: 1,
      nextAttackCritDamage: 0,
      revengeStacks: 0,
      dodgeSpeedAttacks: 0,
      firstEnemyAttackReady: true,
      ironWallBonus: 0,
      arcaneStacks: 0,
      arcaneEchoReady: false,
    };
  };

  useEffect(() => {
    const pendingTitanDamage = pendingTitanDamageRef.current;
    const pendingGroundDamage = pendingGroundDamageRef.current;
    const pendingGroundShockDamage = pendingGroundShockDamageRef.current;
    const pendingAstralDamage = pendingAstralDamageRef.current;
    const pendingAstralVictory = pendingAstralVictoryRef.current;
    const pendingSkyDamage = pendingSkyDamageRef.current;
    const pendingSkyVictory = pendingSkyVictoryRef.current;
    const pendingVolleyDamage = pendingVolleyDamageRef.current;
    const pendingStarbreakDamage = pendingStarbreakDamageRef.current;
    const pendingPiercingDamage = pendingPiercingDamageRef.current;
    const pendingFrostfireDamage = pendingFrostfireDamageRef.current;
    const pendingLightning = pendingLightningRef.current;
    const pendingVoid = pendingVoidRef.current;
    const pendingMeteor = pendingMeteorRef.current;
    const pendingTailwindDamage = pendingTailwindDamageRef.current;
    const pendingTailwindEchoDamage = pendingTailwindEchoDamageRef.current;
    const pendingHunterBurst = pendingHunterBurstRef.current;
    const pendingHunterDamage = pendingHunterDamageRef.current;
    const titanDamageTimers = titanDamageTimersRef.current;
    const playbackGuard=ultimatePlaybackGuardRef.current;
    return () => {
      playbackGuard.clear();
      pendingTailwindDamage.clear();
      pendingTailwindEchoDamage.clear();
      pendingHunterBurst.clear(); pendingHunterDamage.clear();
      pendingAstralDamage.clear(); pendingAstralVictory.clear();
      pendingSkyDamage.clear(); pendingSkyVictory.clear();
      pendingVolleyDamage.clear();
      pendingStarbreakDamage.clear();
      pendingPiercingDamage.clear();
      pendingFrostfireDamage.clear(); pendingLightning.clear(); pendingVoid.clear(); pendingMeteor.clear();
      pendingGroundDamage.clear();
      pendingGroundShockDamage.clear();
      pendingTitanDamage.clear();
      titanDamageTimers.forEach((timer) => window.clearTimeout(timer));
      titanDamageTimers.clear();
      if (bloodRoarHideTimerRef.current !== null) {
        window.clearTimeout(bloodRoarHideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (battleOn) return;
    bloodRoarVisualTokenRef.current += 1;
    if (bloodRoarHideTimerRef.current !== null) {
      window.clearTimeout(bloodRoarHideTimerRef.current);
      bloodRoarHideTimerRef.current = null;
    }
    const resetTimer = window.setTimeout(() => setBloodRoarVisualActive(false), 0);
    return () => window.clearTimeout(resetTimer);
  }, [battleOn]);

  useEffect(() => {
    if (liveCombatRef.current || !battleOn || playerClass !== "戰士" || playerHp >= 40 || bloodRoarLevel <= 0) return;
    const battleKey = `${mapId}:${wave}`;
    if (bloodRoarStateRef.current.battleKey !== battleKey) {
      bloodRoarStateRef.current = { battleKey, remaining: 0, used: false };
    }
    if (bloodRoarStateRef.current.used) return;
    bloodRoarStateRef.current.used = true;
    const bloodRoarCount = hasCatalogItem(equippedGearRef.current, "skill-warrior-blood-heart") ? 7 : 5;
    bloodRoarStateRef.current.remaining = bloodRoarCount;
    bloodRoarVisualTokenRef.current += 1;
    if (bloodRoarHideTimerRef.current !== null) {
      window.clearTimeout(bloodRoarHideTimerRef.current);
      bloodRoarHideTimerRef.current = null;
    }
    setBloodRoarVisualActive(true);
    queueSkillVisual({ name: "鮮血怒吼", key: Date.now() });
    showCombatStatus({
      name: `鮮血怒吼：${bloodRoarCount} 次／傷害 +${bloodRoarDamageBonus(bloodRoarLevel)}%／吸血 ${bloodRoarLifesteal(bloodRoarLevel)}%`,
      target: "player",
      remaining: bloodRoarStateRef.current.remaining,
      unit: "攻擊",
      tone: "red",
    });
    setCausePrompt("生命低於 40% → 鮮血怒吼立刻發動");
  }, [battleOn, bloodRoarLevel, mapId, playerClass, playerHp, queueSkillVisual, wave]);

  const gmInbox = useGmInbox(loginId);
  const [mails, setMails] = useState<MailMessage[]>(() => [
    {
      id: 1,
      title: "守夜人補給",
      body: "歡迎踏入暗黑世界。這些物資能協助你完成前期鍛造。",
      claimed: false,
      rewards: { gold: 3000, stones: 16, yuanbao: 100, items: [] },
    },
  ]);
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 1,
      time: "現在",
      type: "系統",
      text: "角色以無裝備狀態進入灰燼墓園",
    },
  ]);
  const currentMap = maps.find((m) => m.id === mapId)!;
  const requiredExperience = experienceRequired(level);
  const experienceProgress =
    level >= 100 ? 100 : Math.min(100, (exp / requiredExperience) * 100);
  const currentItem = items[selectedItem] ?? null;
  const currentReforgeCount = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(Number(currentItem?.reforgeCount ?? 0) || 0)));
  const normalReforgeCost = equipmentReforgeCost(currentReforgeCount, false);
  const targetedReforgeCost = equipmentReforgeCost(currentReforgeCount, true);
  const equipped = loadouts[activeLoadout];
  const bagItems = items.filter((item) => !equipped.includes(item.id));
  const defensiveSlots = new Set(["頭盔", "胸甲", "手套", "鞋子", "腰帶", "護腕", "披風"]);
  const accessorySlots = new Set(["項鍊", "戒指"]);
  useEffect(() => {
    const normalizeTimer = window.setTimeout(() => {
      setSelectedItem((index) =>
        items.length ? Math.max(0, Math.min(index, items.length - 1)) : 0,
      );
      setUnseenItemIds((old) => old.filter((id) => items.some((item) => item.id === id)));
    }, 0);
    return () => window.clearTimeout(normalizeTimer);
  }, [items]);
  const updateEquipped = (update: (old: number[]) => number[]) =>
    setLoadouts((old) => ({
      ...old,
      [activeLoadout]: update(old[activeLoadout]),
    }));
  const equippedGear = items.filter((item) => equipped.includes(item.id));
  equippedGearRef.current = equippedGear;
  const equippedCatalogKey = equippedGear
    .map((item) => catalogItemId(item) ?? String(item.id))
    .sort()
    .join("|");
  const rebirthTier = Math.min(MAX_REBIRTHS, rebirthCount);
  const rebirthCombatBonus = rebirthTier * REBIRTH_REWARD_PER_TURN.coreStats;
  const rebirthBonuses = {
    hp: rebirthCombatBonus + rebirthTalents.survivalHp * 10,
    attack: rebirthCombatBonus,
    defense: rebirthCombatBonus + rebirthTalents.survivalDefense * 10,
  };
  const legacyTitleReward = legacyRebirthReward(legacyRebirthCount);
  const legacyBonuses = equippedLegacyRebirthReward(legacyRebirthCount, selectedTitle);
  const legacyBonusesActive = legacyTitleReward.titleId !== null && selectedTitle === legacyTitleReward.titleId;
  const cosmeticBonuses = equippedCosmeticBonuses(selectedTitle, selectedAppearance);
  const titleCosmeticBonuses = equippedCosmeticBonuses(selectedTitle, "none");
  const selectedTitleBonus = [
        legacyBonusesActive ? [
        legacyBonuses.experience > 0 ? `經驗 +${legacyBonuses.experience}%` : null,
        legacyBonuses.gold > 0 ? `金幣 +${legacyBonuses.gold}%` : null,
        legacyBonuses.attack > 0 ? `攻擊 +${legacyBonuses.attack}%` : null,
        legacyBonuses.defense > 0 ? `防禦 +${legacyBonuses.defense}%` : null,
        legacyBonuses.attackSpeed > 0 ? `攻速 +${legacyBonuses.attackSpeed}%` : null,
        legacyBonuses.resourceDrop > 0 ? `資源掉落 +${legacyBonuses.resourceDrop}%` : null,
        ] : [],
        titleCosmeticBonuses.experience > 0 ? `經驗 +${titleCosmeticBonuses.experience}%` : null,
        titleCosmeticBonuses.attack > 0 ? `攻擊 +${titleCosmeticBonuses.attack}%` : null,
        titleCosmeticBonuses.defense > 0 ? `防禦 +${titleCosmeticBonuses.defense}%` : null,
      ].flat().filter((value): value is string => value !== null).join("・") || "無";
  const combatBonuses = {
    attack: legacyBonuses.attack + cosmeticBonuses.attack,
    defense: legacyBonuses.defense + cosmeticBonuses.defense,
  };
  const combatPower = calculateCombatPower(
    playerClass,
    level,
    equippedGear,
    skills,
    rebirthBonuses,
    combatBonuses,
  );
  const assessGearPower = (gear: Item[]) => calculateAssessedCombatPower(
    playerClass, level, gear, skills, skillReworkBuild, skillAscensions,
    rebirthBonuses, combatBonuses, rebirthTalents, legacyBonuses.attackSpeed, cosmeticBonuses,
  );
  const assessedCombatPower = assessGearPower(equippedGear);
  const powerDifferenceForItem = (item: Item) => {
    const isEquipped = equipped.includes(item.id);
    const projectedGear = isEquipped
      ? equippedGear.filter((gear) => gear.id !== item.id)
      : [
          ...equippedGear.filter((gear) => gear.slot !== item.slot),
          item,
        ];
    return (
      assessGearPower(projectedGear) - assessedCombatPower
    );
  };
  const visibleBagItems = [...bagItems]
    .filter((item) => {
      if (bagCategory === "套裝") return Boolean(item.set);
      if (bagCategory === "武器") return item.slot === "武器";
      if (bagCategory === "防具") return defensiveSlots.has(item.slot);
      if (bagCategory === "飾品") return accessorySlots.has(item.slot);
      if (bagCategory === "未查看") return unseenItemIds.includes(item.id);
      return true;
    })
    .sort((a, b) => {
      if (bagSort === "品質") return qualityOrder.indexOf(b.quality) - qualityOrder.indexOf(a.quality);
      if (bagSort === "強化") return b.enhance - a.enhance || powerDifferenceForItem(b) - powerDifferenceForItem(a) || equipmentDisplayRating(b) - equipmentDisplayRating(a);
      if (bagSort === "最新") return items.indexOf(b) - items.indexOf(a);
      return powerDifferenceForItem(b) - powerDifferenceForItem(a) || equipmentDisplayRating(b) - equipmentDisplayRating(a);
    });
  // 批次分解後強制以實際背包內容重建列表，避免手機瀏覽器保留舊的卡片節點。
  const bagRenderKey = visibleBagItems.length
    ? visibleBagItems.map((item, index) => `${item.id}:${index}`).join("|")
    : "empty";
  const hasBlessing = useCallback((id: string) =>
    blessings.some((blessing) => blessing.id === id), [blessings]);
  const blessingUpgraded = useCallback((id: string) =>
    blessings.some((blessing) => blessing.id === id && blessing.upgraded), [blessings]);
  const baseCharacterStats = calculateCharacterStats(
    playerClass,
    level,
    equippedGear,
    skills,
  );
  const activeSetCount = equippedSetPieceCount(equippedGear);
  const activeSetAttackMultiplier = equippedSetAttackMultiplier(equippedGear);
  const activeSetAttackBonusPct = Math.round((activeSetAttackMultiplier - 1) * 100);
  const warriorPassiveStats = playerClass === "戰士" ? warriorPassiveDefenses(skillReworkBuild, playerHp) : null;
  const rangerBaseStats = playerClass === "遊俠" ? rangerPassiveStats(skillReworkBuild) : null;
  const characterStats = {
    ...baseCharacterStats,
    hp: Math.round(baseCharacterStats.hp * (1 + rebirthBonuses.hp / 100) * (hasBlessing("stat-hp") ? (blessingUpgraded("stat-hp") ? 1.3 : 1.15) : 1)),
    attack: Math.round(
      baseCharacterStats.attack * (1 + (rebirthBonuses.attack + legacyBonuses.attack + cosmeticBonuses.attack) / 100) *
      (hasBlessing("stat-attack") ? 1.15 : 1) *
      activeSetAttackMultiplier,
    ),
    defense: Math.round(
      (baseCharacterStats.defense + (warriorPassiveStats?.defenseBonusFlat ?? 0)) *
        (1 + (rebirthBonuses.defense + legacyBonuses.defense + cosmeticBonuses.defense) / 100) *
        (hasBlessing("stat-defense") ? 1.15 : 1),
    ),
    speed: baseCharacterStats.speed + rebirthTalents.combatAttackSpeed * 5 + (hasBlessing("stat-speed") ? 15 : 0),
    hit: Math.round((baseCharacterStats.hit + (hasBlessing("stat-hit") ? 10 : 0)) * (1 + cosmeticBonuses.hit / 100)),
    dodge: Math.round(baseCharacterStats.dodge * (1 + cosmeticBonuses.dodge / 100)),
    crit: baseCharacterStats.crit + rebirthTalents.combatCritRate * 4 + (hasBlessing("stat-crit") ? (blessingUpgraded("stat-crit") ? 18 : 12) : 0) + (rangerBaseStats?.criticalChancePoints ?? 0),
    critDamage: baseCharacterStats.critDamage + rebirthTalents.combatCritDamage * 10,
    lifesteal:
      baseCharacterStats.lifesteal +
      (hasBlessing("stat-lifesteal") ? 8 : 0),
    bossDamage: baseCharacterStats.bossDamage + rebirthTalents.combatBoss * 5,
    damageReduction: baseCharacterStats.damageReduction + rebirthTalents.combatDamageReduction * 3,
    equipmentDrop: baseCharacterStats.equipmentDrop + rebirthTier * REBIRTH_REWARD_PER_TURN.equipmentDrop,
    expBonus: baseCharacterStats.expBonus + rebirthTier * REBIRTH_REWARD_PER_TURN.experience + legacyBonuses.experience + cosmeticBonuses.experience,
    goldBonus: baseCharacterStats.goldBonus + rebirthTier * REBIRTH_REWARD_PER_TURN.gold + legacyBonuses.gold,
    resourceDrop: baseCharacterStats.resourceDrop + rebirthTier * REBIRTH_REWARD_PER_TURN.resourceDrop + legacyBonuses.resourceDrop,
    enhanceDrop: baseCharacterStats.enhanceDrop,
    reforgeDrop: baseCharacterStats.reforgeDrop,
    highQualityDrop: rebirthTier * REBIRTH_REWARD_PER_TURN.highQualityDrop,
    skillDamage: baseCharacterStats.skillDamage + rebirthTalents.growthSkill * 5,
  };
  const combatAttackSpeed =
    characterStats.speed * (1 + ((rangerBaseStats?.attackSpeedBonusPercent ?? 0) + legacyBonuses.attackSpeed +
      (liveCombatRef.current ? liveCombatSpeedBonus(liveCombatRef.current) : 0)) / 100) +
    (hasBlessing("rapid") ? (blessingUpgraded("rapid") ? 35 : 20) : 0);
  const currentWaveBoss = wave === MAP_FLOORS;
  const currentWaveGuardian = wave % 10 === 0 && !currentWaveBoss;
  const currentWaveElite = wave % 5 === 0 && !currentWaveGuardian && !currentWaveBoss;
  const currentCombatTier = currentWaveBoss
    ? "boss"
    : currentWaveGuardian
      ? "guardian"
      : currentWaveElite
        ? "elite"
        : "normal";
  const currentEnemyBaseName = baseMonsterName(enemyName);
  const currentRecommendedPower = recommendedPowerAtFloor(currentMap, wave);
  const currentSuppression = realmSuppression(combatPower, currentRecommendedPower);
  const evasionRules = balanceConfig.combat.evasionModel;
  const currentMonsterRatings = monsterRatingsForMap(mapId);
  const monsterAccuracyRating = currentMonsterRatings.accuracy;
  const playerEvasionRating =
    Math.max(0, characterStats.dodge) * evasionRules.statToRating;
  const effectiveDodge = evadeChanceFromRatings(monsterAccuracyRating, playerEvasionRating);
  const currentEnemyMaximumHealth = effectiveMonsterMaximumHealth(
    mapId,
    currentRecommendedPower,
    currentCombatTier,
    currentEnemyBaseName,
  );
  const enemyPresentationToken=activeBossBattle ?? `${runStartedAt}:${mapId}:${wave}`;
  const settledEnemyPercent=activeBossBattle?bossEnemyHp:enemyHp;
  const presentedEnemyPercent=presentedEnemyHealth.token===enemyPresentationToken
    ? presentedEnemyHealth.percent:settledEnemyPercent;
  const presentedEnemyMaximum=activeBossBattle?.hp ?? currentEnemyMaximumHealth;
  const presentationViewKey=`${tab}:${documentVisible}`;
  if(presentedEnemyHealth.token!==enemyPresentationToken || presentedEnemyHealth.viewKey!==presentationViewKey) {
    setPresentedEnemyHealth({token:enemyPresentationToken,percent:settledEnemyPercent,viewKey:presentationViewKey});
  }
  const worldScoreToken = activeBossBattle?.mode === "world" ? activeBossBattle : null;
  const worldScoreViewKey = `${presentationViewKey}:${bossOutcome ?? "active"}`;
  const visibleWorldScore = tab === "主控" && documentVisible && !bossOutcome;
  const presentedWorldRoundDamage = visibleWorldScore && presentedWorldScore.token === worldScoreToken
    && presentedWorldScore.viewKey === worldScoreViewKey ? presentedWorldScore.damage : worldRoundDamage;
  // Switching view/background, finishing or retrying synchronizes the display;
  // pending floats from a previous encounter cannot affect the new counter.
  if (presentedWorldScore.token !== worldScoreToken || presentedWorldScore.viewKey !== worldScoreViewKey) {
    setPresentedWorldScore({token: worldScoreToken, damage: worldRoundDamage, viewKey: worldScoreViewKey});
  }
  const onEnemyDamageShown=useCallback((events: readonly CombatFloatEvent[],token:string|object)=>{
    if(token!==enemyPresentationToken)return;
    setPresentedEnemyHealth((current)=>({token,viewKey:current.viewKey,
      percent:presentEnemyDamage(current.token===token?current.percent:settledEnemyPercent,
        presentedEnemyMaximum,events,settledEnemyPercent)}));
    if (worldScoreToken && token === worldScoreToken && visibleWorldScore) {
      setPresentedWorldScore((current) => current.token === token && current.viewKey === worldScoreViewKey
        ? {...current, damage: presentWorldBossDamage(current.damage, events, worldRoundDamage)} : current);
    }
  },[enemyPresentationToken,presentedEnemyMaximum,settledEnemyPercent,worldScoreToken,visibleWorldScore,worldScoreViewKey,worldRoundDamage]);
  const recoverPendingEnemyDefeat=useEffectEvent(()=>{
    if(!saveReady || sessionSuperseded)return;
    const pending=pendingEnemyDefeatRef.current;
    if(!pending || pending.token!==enemyPresentationToken || settledEnemyPercent>0)return;
    const visible=tab==="主控" && documentVisible;
    const volleyPending=pending.volleyKey!==undefined && pendingVolleyDamageRef.current.has(pending.volleyKey);
    const now=performance.now();
    if(presentedEnemyPercent<=0 && !volleyPending)pending.shownAt??=now;
    else pending.shownAt=undefined;
    const delay=enemyDefeatPresentationDelay(visible,volleyPending?Math.max(1,presentedEnemyPercent):presentedEnemyPercent,
      pending.queuedAt,now,pending.volleyKey!==undefined?240:120,pending.shownAt);
    if(delay>0 || pendingEnemyDefeatRef.current!==pending)return;
    setPresentedEnemyHealth((current)=>current.token===pending.token?{...current,percent:0}:current);
    pendingEnemyDefeatRef.current=null;pending.finish();
  });
  useEffect(()=>{
    const timer=window.setInterval(recoverPendingEnemyDefeat,50);
    return()=>window.clearInterval(timer);
  },[]);
  useEffect(() => {
    pendingVoidRef.current.clear();
    pendingMeteorRef.current.clear();
    pendingLightningRef.current.clear(); lightningParalysisGateRef.current = undefined;
    pendingFrostfireDamageRef.current.clear(); frostfireGatesRef.current = {};
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) { setVoidVisuals([]); setMeteorVisuals([]); setFrostfireVisuals([]); setFrostfireStatuses({}); setLightningVisuals([]); setLightningParalysis(undefined); }
    });
    return () => { cancelled = true; };
  }, [enemyPresentationToken]);
  const recoverVoidDisplay = useEffectEvent(() => {
    const visible = tab === "主控" && documentVisible && !sessionSuperseded && !(activeBossBattle ? bossOutcome : runSummary);
    for (const [key, pending] of pendingVoidRef.current) {
      if (visible && performance.now() - pending.at < 4000) continue;
      pendingVoidRef.current.delete(key);
      if (!sessionSuperseded) pending.publish();
      setVoidVisuals(current => current.filter(effect => effect.key !== key));
    }
  });
  useEffect(() => {
    const immediate = window.setTimeout(recoverVoidDisplay, 0);
    const timer = window.setInterval(recoverVoidDisplay, 100);
    return () => { window.clearTimeout(immediate); window.clearInterval(timer); };
  }, [tab, documentVisible, sessionSuperseded, activeBossBattle, bossOutcome, runSummary]);
  const recoverMeteorDisplay = useEffectEvent(() => {
    const visible = tab === "主控" && documentVisible && !sessionSuperseded && !(activeBossBattle ? bossOutcome : runSummary);
    for (const [key, pending] of pendingMeteorRef.current) {
      if (visible && performance.now() - pending.at < 4000) continue;
      pendingMeteorRef.current.delete(key);
      if (!sessionSuperseded) { pending.publish(0); pending.publish(1); }
      setMeteorVisuals(current => current.filter(effect => effect.key !== key));
    }
  });
  useEffect(() => {
    const immediate = window.setTimeout(recoverMeteorDisplay, 0);
    const timer = window.setInterval(recoverMeteorDisplay, 100);
    return () => { window.clearTimeout(immediate); window.clearInterval(timer); };
  }, [tab, documentVisible, sessionSuperseded, activeBossBattle, bossOutcome, runSummary]);
  const recoverFrostfireDisplay = useEffectEvent(() => {
    if (tab === "主控" && documentVisible && !sessionSuperseded && !(activeBossBattle ? bossOutcome : runSummary)) return;
    if (!sessionSuperseded) {
      const lightning = [...pendingLightningRef.current.values()]; pendingLightningRef.current.clear();
      lightning.forEach(publish => { for (let index = 0; index < 4; index++) publish(index); });
      const pending = [...pendingFrostfireDamageRef.current.values()];
      pendingFrostfireDamageRef.current.clear(); pending.forEach(publish => publish());
    } else { pendingFrostfireDamageRef.current.clear(); pendingLightningRef.current.clear(); }
    setFrostfireVisuals(current => current.length ? [] : current);
    setLightningVisuals(current => current.length ? [] : current); lightningParalysisGateRef.current = undefined;
    frostfireGatesRef.current = {};
  });
  useEffect(() => {
    const immediate = window.setTimeout(recoverFrostfireDisplay, 0);
    const timer = window.setInterval(recoverFrostfireDisplay, 100);
    return () => { window.clearTimeout(immediate); window.clearInterval(timer); };
  }, [tab, documentVisible, sessionSuperseded, activeBossBattle, bossOutcome, runSummary]);
  const equippedSetGroups = groupEquippedSets(equippedGear);
  const activeSet = equippedSetGroups[0];
  const setTier = activeSet
    ? Math.min(
        3,
        Math.floor(activeSet.count / 2),
      )
    : 0;
  const setEffectDescription = (count: number) => [
    ...(count >= 2 ? [`攻擊 +${Math.round((SET_ATTACK_BONUS - 1) * 100)}%`] : []),
    ...(count >= 4 ? ["離線收益 +10%"] : []),
    ...(count >= 6 ? [`元素傷害 +${SET_ELEMENTAL_DAMAGE_PCT}%`] : []),
    ...(count >= 8 ? [`技能傷害 +${SET_SKILL_DAMAGE_PCT}%`] : []),
    ...(count >= 10 ? [`每 ${SET_RESONANCE_ATTACKS} 次攻擊觸發元素爆發（${SET_RESONANCE_DAMAGE_PCT}%）`] : []),
  ].join(" · ") || "再穿 1 件啟用套裝效果";
  const monsterEvasionRating = currentMonsterRatings.evasion;
  const effectiveHit = Math.max(
    evasionRules.minimumHitChance,
    hitChanceFromRatings(characterStats.hit, monsterEvasionRating) - currentSuppression.hitBonus,
  );
  const unclaimedMail = mails.filter((mail) => !mail.claimed).length;
  const enhancementTargetLevel = Math.min(
    balanceConfig.progression.maxEnhancement,
    (currentItem?.enhance ?? 0) + 1,
  );
  const goldCost = enhancementGoldCost(enhancementTargetLevel, currentItem ?? undefined);
  const stoneCost = enhancementStoneCost(enhancementTargetLevel);
  const currentSaleReturn = currentItem
    ? saleReturn(currentItem)
    : { gold: 0, stones: 0 };
  const equippedAcrossLoadouts = new Set(Object.values(loadouts).flat());
  const selectedGem = selectedGemKey
    ? gemInventory.find((stack) => gemStackKey(stack) === selectedGemKey) ?? null
    : null;
  const gemFusionMaterials = gemFusionSlots.filter((gem): gem is SocketedGem => Boolean(gem));
  const gemFusionTier = gemFusionMaterials[0]?.tier;
  const gemFusionSuccessRate = gemFusionTier === "beginner"
    ? balanceConfig.gems.fusion.beginnerToIntermediateSuccess
    : gemFusionTier === "intermediate"
      ? balanceConfig.gems.fusion.intermediateToAdvancedSuccess
      : 0;
  const gemFusionKeepsType = gemFusionMaterials.length === 3 &&
    gemFusionMaterials.every((gem) => gem.gemId === gemFusionMaterials[0].gemId);
  const filteredGemInventory = [...gemInventory]
    .filter((stack) => gemTierFilter === "全部" || stack.tier === gemTierFilter)
    .filter((stack) => {
      if (gemStatFilter === "全部") return true;
      const stat = getGemDefinition(stack.gemId, stack.tier).stat.replace(/%$/, "");
      if (gemStatFilter === "戰鬥") return ["攻擊", "攻速", "命中", "暴擊"].includes(stat);
      if (gemStatFilter === "生存") return ["生命", "防禦", "閃避", "吸血"].includes(stat);
      return ["經驗", "金幣"].includes(stat);
    })
    .sort((a, b) => GEM_TIERS.indexOf(b.tier) - GEM_TIERS.indexOf(a.tier) || a.gemId.localeCompare(b.gemId));
  const fusionPreviewGem = gemFusionKeepsType && gemFusionTier
    ? getGemDefinition(gemFusionMaterials[0].gemId, gemFusionTier === "beginner" ? "intermediate" : "advanced")
    : null;
  const bulkCandidates = items.filter(
    (item) =>
      bulkQualities.includes(item.quality) &&
      !item.locked &&
      !equippedAcrossLoadouts.has(item.id),
  );
  const bulkReturn = bulkCandidates.reduce(
    (total, item) => {
      const reward = saleReturn(item);
      return { gold: total.gold + reward.gold, stones: total.stones + reward.stones };
    },
    { gold: 0, stones: 0 },
  );
  const canClaim = storedSeconds >= 60;
  const offlineSetMultiplier = equippedSetOfflineMultiplier(equippedGear, 0.1);
  // 首波只開放深淵王；其餘世界首領保留預告卡。
  const worldBossOpen = true;
  const refreshSeconds = 3600 - (now.getMinutes() * 60 + now.getSeconds());
  const refreshIn = `${String(Math.floor(refreshSeconds / 60)).padStart(2, "0")}:${String(refreshSeconds % 60).padStart(2, "0")}`;

  useEffect(() => {
    if (tab !== "首領" || bossMode !== "world") return;
    let cancelled = false;
    const loadWorldRanking = () => {
      void fetch("/api/ranking", { cache: "no-store" })
        .then((response) => response.json())
        .then((data) => {
          if (cancelled) return;
          const ranks = Array.isArray(data.worldRanks)
            ? data.worldRanks as { name?: string; cls?: string; damage?: number }[]
            : [];
          setWorldTopRanks(ranks.slice(0, 5));
          const rankIndex = ranks.findIndex((rank) => rank.name === playerName);
          setWorldRank(rankIndex >= 0 ? rankIndex + 1 : null);
          setWorldPeriodDamage(Math.max(0,Number(rankIndex>=0?ranks[rankIndex]?.damage:0)));
          setWorldLeaderDamage(Math.max(0, Number(ranks[0]?.damage ?? 0)));
        })
        .catch(() => {
          if (!cancelled) {
            setWorldRank(null);
            setWorldLeaderDamage(0);
            setWorldTopRanks([]);
          }
        });
    };
    loadWorldRanking();
    const timer = window.setInterval(loadWorldRanking, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [bossMode, playerName, tab]);

  useEffect(() => {
    let cancelled=false;
    const controller=new AbortController();
    queueMicrotask(() => {
      if(cancelled)return;
      if(saveReloadTick>0){
        resetCombatPerks();liveCombatRef.current=null;
        setBlessings([]);setBlessingOpen(false);setBlessingUnavailable(false);
        setBattleDrops([]);setRunSummary(null);setActiveBossBattle(null);setBossOutcome(null);
        setRunStartedAt(Date.now());
      }
      fetch(`/api/save?playerId=${encodeURIComponent(playerId)}`, {
        cache: "no-store",
        headers: loginHeaders(loginId),
        signal:controller.signal,
      })
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then(({ save, updatedAt }) => {
          if(cancelled)return;
          setSaveUpdatedAt(updatedAt ?? null);
          const today = new Date().toLocaleDateString("en-CA", {
            timeZone: "Asia/Taipei",
          });
          setDailyDate(today);
          if (save) {
            const savedClass = save.playerClass;
            if (savedClass && savedClass !== playerClass) {
              setSaveStatus("職業存檔不符");
              setSaveReady(false);
              setBattleOn(false);
              setCausePrompt("偵測到其他職業的存檔，已停止載入以避免覆蓋");
              toast.error("已阻止錯誤職業存檔", {
                description: `這份進度屬於${savedClass}，不會套用到${playerClass}。`,
              });
              return;
            }
            const savedLevel = save.level ?? 1;
            setLevel(savedLevel);
            setExp(
              save.xpSchemaVersion === 2
                ? save.exp ?? 0
                : Math.round(
                    experienceRequired(savedLevel) *
                      Math.min(99, save.exp ?? 0) /
                      100,
                  ),
            );
            setGold(save.gold ?? 1200);
            setYuanbao(save.yuanbao ?? 0);
            setEnhanceStones(save.enhanceStones ?? 6);
            setReforgeStones(save.reforgeStones ?? 2);
            setDrillingStones(Math.max(0, Math.floor(Number(save.drillingStones ?? 0))));
            setGemInventory(normalizeGemInventory(save.gemInventory));
            setAdminRevision(Number(save.adminRevision ?? 0));
            setRebirthCount(clampRebirthCount(save.rebirthCount));
            const savedLegacyRebirthCount = Math.max(0, Math.min(20, Number(save.legacyRebirthCount ?? 0)));
            const legacyTitles = legacyRebirthReward(savedLegacyRebirthCount);
            setLegacyRebirthCount(savedLegacyRebirthCount);
            const legacyTitleIds: TitleId[] = ["beta-reincarnator", "seasoned-reincarnator", "elite-reincarnator", "abyss-reincarnator"];
            const savedTitles: TitleId[] = Array.isArray(save.ownedTitles) ? save.ownedTitles as TitleId[] : ["none"];
            const availableTitles = [...new Set<TitleId>([
              "none",
              ...savedTitles.filter((id) => !legacyTitleIds.includes(id)),
              ...legacyTitles.unlockedTitleIds as TitleId[],
            ])];
            const savedSelectedTitle = typeof save.selectedTitle === "string" ? save.selectedTitle as TitleId : legacyTitles.titleId ?? "none";
            setSelectedTitle(availableTitles.includes(savedSelectedTitle) ? savedSelectedTitle : legacyTitles.titleId ?? "none");
            setSelectedAppearance((save.selectedAppearance ?? "none") as AppearanceId);
            setOwnedTitles(availableTitles);
            setOwnedAppearances(Array.isArray(save.ownedAppearances) ? save.ownedAppearances : ["none"]);
            setRebirthPoints(Math.max(0, Number(save.rebirthPoints ?? 0)));
            setRebirthTalents({ ...emptyRebirthTalents, ...(save.rebirthTalents ?? {}) });
            setFinalBossDefeated(Boolean(save.finalBossDefeated));
            const legacyWave = Math.max(1, Math.min(90, save.wave ?? 1));
            const savedMapId = Math.max(
              1,
              Math.min(9, save.mapId ?? Math.ceil(legacyWave / 10)),
            );
            const savedWave = Math.max(
              1,
              Math.min(
                MAP_FLOORS,
                save.mapId ? save.wave ?? 1 : ((legacyWave - 1) % 10) + 1,
              ),
            );
            setWave(savedWave);
            setMapId(savedMapId);
            setUnlockedMapId(
              Math.max(
                savedMapId,
                Math.min(
                  9,
                  save.unlockedMapId ??
                    Math.ceil((save.highestFloor ?? legacyWave) / 10),
                ),
              ),
            );
            setMapBestFloors(
              save.mapBestFloors ?? { [savedMapId]: savedWave },
            );
            const savedPlayerHp = Number(save.playerHp ?? 100);
            if (savedPlayerHp <= 0) {
              // A save captured on the lethal frame resumes as a clean retry,
              // never as an active battle with a dead character.
              setWave(1);
              setEnemyHp(100);
              setPlayerHp(100);
              setBlessings([]);
              towerDeathPendingRef.current = false;
            } else {
              setEnemyHp(save.enemyHp ?? 100);
              setPresentedEnemyHealth((current)=>({...current,percent:save.enemyHp ?? 100}));
              setPlayerHp(savedPlayerHp);
            }
            const normalizedSavedItems = Array.isArray(save.items)
              ? save.items.map((item: Item) => normalizeSceneItem(item))
              : [];
            if (Array.isArray(save.items)) setItems(normalizedSavedItems);
            if (save.loadouts) setLoadouts(safeLoadouts({items:normalizedSavedItems,loadouts:save.loadouts}) as Record<1|2,number[]>);
            if (save.activeLoadout === 1 || save.activeLoadout === 2) {
              setActiveLoadout(save.activeLoadout);
            }
            setSkillReworkBuild(restoreSkillBuild(save.skillReworkBuild, playerClass, savedLevel));
            setSkillAscensions(restoreSkillAscensions(save.skillAscensions, playerClass));
            const needsBossTicketReset = save.bossTicketResetVersion !== PERSONAL_BOSS_RESET_VERSION;
            setBossTickets(needsBossTicketReset ? 10 : (save.bossTickets ?? 10));
            setHighestFloor(save.highestFloor ?? savedWave);
            setCompletedRuns(save.completedRuns ?? 0);
            // Idle time is settled by the server after this load. Keeping the
            // raw saved value here prevents a background tab and the server
            // from crediting the same seconds twice.
            resetStoredTime(save.storedSeconds ?? 0, updatedAt);
            lastIdleClaimIdRef.current = typeof save._lastIdleClaimId === "string" ? save._lastIdleClaimId : null;
            setIdleSeconds(Math.max(0, Math.min(599, save.idleSeconds ?? 0)));
            // The manual pause control has been removed; resume older paused saves.
            setBattleOn(true);
            setWorldBossMailDeliveryId(typeof save._worldBossMailDeliveryId==="string"?save._worldBossMailDeliveryId:"");
            if (Array.isArray(save.mails))
              setMails(
                save.mails.slice(0, MAIL_CAPACITY).map((mail: MailMessage) => ({
                    ...mail,
                    rewards: {
                      ...mail.rewards,
                      items: (mail.rewards?.items ?? []).map((item: Item) =>
                        normalizeSceneItem(item),
                      ),
                    },
                  })),
              );
            const savedForToday = save.dailyDate === today;
            const needsWorldBossReset = save.worldBossResetVersion !== WORLD_BOSS_RESET_VERSION;
            if (!savedForToday) {
              setBossTickets(10);
            }
            setWorldAttempts(savedForToday && !needsWorldBossReset ? save.worldAttempts ?? 3 : 3);
            setDailyKills(savedForToday ? save.dailyKills ?? 0 : 0);
            setDailyRewardClaimed(
              savedForToday && Boolean(save.dailyRewardClaimed),
            );
            setWorldDamage(savedForToday && !needsWorldBossReset ? save.worldDamage ?? 0 : 0);
            setAutoSalvage(save.autoSalvage ?? false);
            setAutoSalvageQuality(save.autoSalvageQuality === "套裝以下" ? "全分解" : (save.autoSalvageQuality ?? "良好"));
            setProtectSetGear(save.protectSetGear ?? true);
            setProtectPowerUpgrade(save.protectPowerUpgrade ?? true);
            setUnseenItemIds(
              (Array.isArray(save.unseenItemIds) ? save.unseenItemIds : [])
                .filter((id: number) => normalizedSavedItems.some((item: Item) => item.id === id)),
            );
            if (Array.isArray(save.logs)) setLogs(save.logs.slice(0, 30));
          }
          setSaveStatus("雲端已同步");
          setSaveReady(true);
        })
        .catch(() => {
          if(cancelled)return;
          // Never mark a failed load as save-ready: the default in-memory
          // state could otherwise overwrite the player's cloud progress.
          setSaveStatus("讀檔失敗，已停止存檔");
          setSaveReady(false);
        });
    });
    return ()=>{cancelled=true;controller.abort();};
  }, [loginId, playerClass, playerId,saveReloadTick,resetStoredTime]);

  const pauseSupersededSession = useCallback((reason: "replaced" | "suspended" | "expired" | "maintenance" = "replaced") => {
    setSessionEndedReason(reason);
    setSessionSuperseded(true);
    setBattleOn(false);
    setSaveStatus(
      reason === "maintenance"
        ? "伺服器維護中"
        : reason === "suspended"
        ? "帳號已停權"
        : reason === "expired"
          ? "登入狀態已失效"
          : "舊視窗已停止存檔",
    );
    queueMicrotask(() => onSessionEnded(reason));
  }, [onSessionEnded]);

  const requestPrioritySave = useCallback(() => {
    prioritySaveRef.current = true;
    setSaveRetryTick((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!saveReady || !playerId || sessionSuperseded) return;
    const initial = idleStorageClockRef.current ?? resetIdleStorageClock(null, 0, performance.now());
    idleStorageClockRef.current = { ...initial, at: performance.now() };
    const advanceStoredTime = () => {
      const clock = idleStorageClockRef.current;
      if (!clock) return;
      const next = advanceIdleStorageClock(clock, performance.now());
      idleStorageClockRef.current = next;
      setStoredSeconds(next.seconds);
    };
    const timer = window.setInterval(advanceStoredTime, 1000);
    document.addEventListener("visibilitychange", advanceStoredTime);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", advanceStoredTime);
      const clock = idleStorageClockRef.current;
      if (clock) idleStorageClockRef.current = { ...clock, epoch: clock.epoch + 1 };
    };
  }, [saveReady, playerId, sessionSuperseded]);

  const settleBackgroundProgress = useCallback(() => {
    if (!saveReady || !playerId || sessionSuperseded || offlineClaimPendingRef.current) return;
    const idleEpoch = idleStorageClockRef.current?.epoch ?? 0;
    void fetch("/api/save", {
      method: "POST",
      headers: loginHeaders(loginId, true),
      body: JSON.stringify({ playerId, action: "settle_idle" }),
    })
      .then(async (response) => ({ response, result: await response.json() }))
      .then(({ response, result }) => {
        if (response.status === 401 || result?.error === "maintenance") {
          pauseSupersededSession(
            result?.error === "maintenance"
              ? "maintenance"
              : result?.error === "session_replaced"
              ? "replaced"
              : result?.error === "account_suspended"
                ? "suspended"
                : "expired",
          );
          return;
        }
        if (!response.ok || result?.ok !== true) return;
        if (!offlineClaimPendingRef.current && typeof result?.save?.storedSeconds === "number") {
          reconcileStoredTime(result.save.storedSeconds, idleEpoch, result.updatedAt);
        }
        setSaveUpdatedAt(result.updatedAt ?? null);
        setSaveStatus("雲端已同步");
      })
      .catch(() => undefined);
  }, [loginId, pauseSupersededSession, playerId, saveReady, sessionSuperseded, reconcileStoredTime]);

  useEffect(() => {
    if (!saveReady || !playerId || sessionSuperseded) return;
    settleBackgroundProgress();
  }, [playerId, saveReady, sessionSuperseded, settleBackgroundProgress]);

  useEffect(() => {
    if (!playerId || sessionSuperseded) return;
    let cancelled = false;
    const checkSession = () => {
      void fetch("/api/auth", { cache: "no-store", headers: loginHeaders(loginId) })
        .then(async (response) => ({ response, result: await response.json().catch(() => ({})) }))
        .then(({ response, result }) => {
          if (cancelled || (response.ok && result?.account)) return;
          if (result?.error === "maintenance") pauseSupersededSession("maintenance");
          else if (response.status === 403 && result?.error === "account_suspended") pauseSupersededSession("suspended");
          else if (response.status === 401 && result?.error === "session_replaced") pauseSupersededSession("replaced");
          else if (response.status === 401) pauseSupersededSession("expired");
        })
        .catch(() => undefined);
    };
    checkSession();
    const timer = window.setInterval(checkSession, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loginId, pauseSupersededSession, playerId, sessionSuperseded]);

  useEffect(() => {
    if (!saveReady || !playerId || sessionSuperseded || adminOpen || skillActionBusy || offlineClaimPending || equipmentBusy || equipmentPendingRef.current) return;
    if (saveInFlightRef.current) {
      saveQueuedRef.current = true;
      return;
    }
    const elapsedSinceLastSave = lastSaveStartedAtRef.current
      ? Date.now() - lastSaveStartedAtRef.current
      : 0;
    const maxWait = lastSaveStartedAtRef.current
      ? Math.max(0, SAVE_MAX_INTERVAL_MS - elapsedSinceLastSave)
      : SAVE_DEBOUNCE_MS;
    const delay = Math.max(
      Math.max(0, saveRetryAfterRef.current - Date.now()),
      prioritySaveRef.current ? 0 : Math.min(SAVE_DEBOUNCE_MS, maxWait),
    );
    const timer = setTimeout(() => {
      if (offlineClaimPendingRef.current || skillActionInFlightRef.current || equipmentBusyRef.current || equipmentPendingRef.current) return;
      // Do not persist an intermediate zero-HP target before its kill/loot
      // and next wave have committed; a reload cannot restore that callback.
      if(!activeBossBattle && enemyHp<=0 && towerDeathPendingRef.current)return;
      if (saveInFlightRef.current) {
        saveQueuedRef.current = true;
        return;
      }
      saveInFlightRef.current = true;
      const idleEpoch = idleStorageClockRef.current?.epoch ?? 0;
      prioritySaveRef.current = false;
      lastSaveStartedAtRef.current = Date.now();
      setSaveStatus("儲存中");
      const saveRequestId = saveRequestIdRef.current ?? crypto.randomUUID();
      saveRequestIdRef.current = saveRequestId;
      if (!saveClientIdRef.current) {
        const clientKey = `dark-world-save-client:${playerId}`;
        saveClientIdRef.current = sessionStorage.getItem(clientKey) || crypto.randomUUID();
        sessionStorage.setItem(clientKey, saveClientIdRef.current);
      }
      const sequenceKey = `dark-world-save-sequence:${playerId}`;
      saveSequenceRef.current = Math.max(
        saveSequenceRef.current,
        Number(sessionStorage.getItem(sequenceKey) ?? 0),
      ) + 1;
      sessionStorage.setItem(sequenceKey, String(saveSequenceRef.current));
      const payload = {
        _saveRequestId: saveRequestId,
        _saveClientId: saveClientIdRef.current,
        _saveSequence: saveSequenceRef.current,
        saveSchemaVersion: 7,
        playerName,
        playerClass,
        combatPower,
        xpSchemaVersion: 2,
        level,
        exp,
        gold,
        yuanbao,
        enhanceStones,
        reforgeStones,
        drillingStones,
        gemInventory,
        wave,
        mapId,
        unlockedMapId,
        mapBestFloors,
        enemyHp,
        playerHp,
        items: items.map(normalizeSceneItem),
        loadouts:safeLoadouts({items,loadouts}),
        activeLoadout,
        skillReworkBuild,
        skillAscensions,
        bossTickets,
        bossTicketResetVersion: PERSONAL_BOSS_RESET_VERSION,
        worldAttempts,
        worldBossResetVersion: WORLD_BOSS_RESET_VERSION,
        highestFloor,
        completedRuns,
        storedSeconds,
        _lastIdleClaimId: lastIdleClaimIdRef.current,
        battleOn,
        idleSeconds,
        mails,
        _worldBossMailDeliveryId:worldBossMailDeliveryId,
        dailyKills,
        dailyDate,
        dailyRewardClaimed,
        worldDamage,
        autoSalvage,
        autoSalvageQuality,
        protectSetGear,
        protectPowerUpgrade,
        adminRevision,
        rebirthCount,
        legacyRebirthCount,
        selectedTitle,
        selectedAppearance,
        ownedTitles,
        ownedAppearances,
        rebirthPoints,
        rebirthTalents,
        finalBossDefeated,
        lastSeenAt: Date.now(),
        unseenItemIds,
        logs,
      };
      saveJsonWithTimeout("/api/save", {
        method: "POST",
        headers: loginHeaders(loginId, true),
        body: JSON.stringify({ playerId, save: payload }),
      })
        .then(({ response, result }) => {
          if (response.status === 401 || result?.error === "maintenance") {
            saveRequestIdRef.current = null;
            pauseSupersededSession(
              result?.error === "maintenance"
                ? "maintenance"
                : result?.error === "session_replaced"
                ? "replaced"
                : result?.error === "account_suspended"
                  ? "suspended"
                  : "expired",
            );
            return;
          }
          if (response.status === 409 && result?.error === "save_integrity_rejected") {
            saveQueuedRef.current = false; saveRequestIdRef.current = null;
            setSaveReady(false);
            setBattleOn(false); setSaveStatus("資料不一致，重新同步中");
            const retry=()=>{setSaveStatus("正在重新同步");setSaveReloadTick(v=>v+1);};
            toast.error("進度需要重新同步", { description: "雲端進度已保留，登入狀態不受影響。", action:{label:"重新同步",onClick:retry} });
            if(!integrityRecoveryUsedRef.current){integrityRecoveryUsedRef.current=true;retry();}
            else setSaveStatus("存檔暫停，請重新同步");
            return;
          }
          if (response.status === 409 && result?.error === "save_conflict") {
            saveQueuedRef.current = false;
            saveRequestIdRef.current = null;
            setSaveReady(false);setBattleOn(false);setSaveStatus("正在重新同步");setSaveReloadTick(v=>v+1);
            return;
          }
          if (response.status === 409) {
            saveQueuedRef.current = false;
            saveRequestIdRef.current = null;
            setSaveStatus("存檔資料驗證失敗");
            return;
          }
          if (!response.ok) throw new Error();
          if (result?.ok !== true) throw new Error();
          saveFailureCountRef.current = 0;
          saveRetryAfterRef.current = 0;
          if (result?.accepted === false) {
            // Duplicate/idempotent writes mean the authoritative server save
            // already contains this operation. Confirm it silently instead of
            // remounting the whole game and resetting the visible battle UI.
            if(result.save){setSaveReady(false);setBattleOn(false);setSaveReloadTick(v=>v+1);}
            setSaveUpdatedAt((current) => result.updatedAt ?? current);
            saveRequestIdRef.current = null;
            setSaveStatus("雲端已同步");
            sessionStorage.removeItem(`dark-world-save-conflict-recovery:${playerId}`);
            return;
          }
          setSaveUpdatedAt((current) => result.updatedAt ?? current);
          setSaveStatus("雲端已同步");
          if (typeof result.idleClock?.storedSeconds === "number")
            reconcileStoredTime(result.idleClock.storedSeconds, idleEpoch, result.updatedAt);
          saveRequestIdRef.current = null;
          sessionStorage.removeItem(`dark-world-save-conflict-recovery:${playerId}`);
        })
        .catch(() => {
          setSaveStatus("等待連線");
          saveQueuedRef.current = true;
          saveFailureCountRef.current += 1;
          const backoff = Math.min(30_000, 1_000 * 2 ** Math.min(5, saveFailureCountRef.current - 1));
          saveRetryAfterRef.current = Date.now() + backoff * (0.8 + Math.random() * 0.4);
        })
        .finally(() => {
          saveInFlightRef.current = false;
          if (saveQueuedRef.current) {
            saveQueuedRef.current = false;
            setSaveRetryTick((value) => value + 1);
          }
        });
    }, delay);
    return () => clearTimeout(timer);
  }, [
    saveReady,
    adminOpen,
    reconcileStoredTime,
    equipmentBusy,
    activeBossBattle,
    offlineClaimPending,
    skillActionBusy,
    loginId,
    sessionSuperseded,
    saveRetryTick,
    pauseSupersededSession,
    playerId,
    playerName,
    playerClass,
    combatPower,
    level,
    exp,
    gold,
    yuanbao,
    enhanceStones,
    reforgeStones,
    drillingStones,
    gemInventory,
    wave,
    mapId,
    unlockedMapId,
    mapBestFloors,
    enemyHp,
    playerHp,
    items,
    loadouts,
    activeLoadout,
    skillReworkBuild,
    skillAscensions,
    bossTickets,
    worldAttempts,
    highestFloor,
    completedRuns,
    storedSeconds,
    battleOn,
    idleSeconds,
    mails,
    worldBossMailDeliveryId,
    dailyKills,
    dailyDate,
    dailyRewardClaimed,
    worldDamage,
    autoSalvage,
    autoSalvageQuality,
    protectSetGear,
    protectPowerUpgrade,
    adminRevision,
    rebirthCount,
    legacyRebirthCount,
    selectedTitle,
    selectedAppearance,
    ownedTitles,
    ownedAppearances,
    rebirthPoints,
    rebirthTalents,
    finalBossDefeated,
    unseenItemIds,
    logs,
  ]);

  useEffect(() => {
    if (!saveReady || !playerId || sessionSuperseded) return;
    const queueBackup = () => requestPrioritySave();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") queueBackup();
      else settleBackgroundProgress();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", queueBackup);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", queueBackup);
    };
  }, [playerId, requestPrioritySave, saveReady, sessionSuperseded, settleBackgroundProgress]);

  useEffect(() => {
    if (!saveReady || !playerId || sessionSuperseded) return;
    saveCadenceStartedAtRef.current = Date.now();
    const timer = window.setInterval(() => {
      if (saveInFlightRef.current || prioritySaveRef.current) return;
      const baseline = lastSaveStartedAtRef.current || saveCadenceStartedAtRef.current;
      if (Date.now() - baseline >= SAVE_MAX_INTERVAL_MS) requestPrioritySave();
    }, 500);
    return () => window.clearInterval(timer);
  }, [playerId, requestPrioritySave, saveReady, sessionSuperseded]);

  useEffect(() => {
    if (!saveReady || !playerId) return;
    const timer = window.setInterval(() => {
      void fetch(`/api/save?playerId=${encodeURIComponent(playerId)}`, {
        cache: "no-store",
        headers: loginHeaders(loginId),
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((result) => {
          const save = result?.save;
          const revision = Number(save?.adminRevision ?? 0);
          if (!save || revision <= adminRevision || equipmentBusyRef.current || equipmentPendingRef.current) return;
          setGold(save.gold ?? 0);
          setYuanbao(save.yuanbao ?? 0);
          setEnhanceStones(save.enhanceStones ?? 0);
          setReforgeStones(save.reforgeStones ?? 0);
          setLevel(Math.min(100, save.level ?? level));
          setExp(save.exp ?? 0);
          setAdminRevision(revision);
          toast.info("GM 已更新你的角色資源");
        })
        .catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [adminRevision, level, loginId, playerId, saveReady]);

  const pushLog = useCallback((type: string, text: string) =>
    setLogs((old) =>
      [
        {
          id: ++logIdRef.current,
          time: new Date().toLocaleTimeString("zh-TW", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          type,
          text,
        },
        ...old,
      ].slice(0, 30),
  ), []);

  useEffect(() => {
    const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
    if (!dailyDate || dailyDate === today) return;
    const resetTimer = window.setTimeout(() => {
      setDailyDate(today);
      setDailyKills(0);
      setDailyRewardClaimed(false);
      setBossTickets(10);
      setWorldAttempts(3);
      setWorldDamage(0);
      setWorldRank(null);
      toast.success("每日首領挑戰次數已重置", {
        description: "個人首領恢復 10 次；世界首領恢復 3 次並重置今日傷害",
      });
    }, 0);
    return () => window.clearTimeout(resetTimer);
  }, [dailyDate, now]);

  const claimDailyHuntReward = async () => {
    const reward = balanceConfig.economy.dailyHuntReward;
    if (dailyKills < reward.kills)
      return toast.info("今日獵殺尚未完成", {
        description: `還需擊敗 ${reward.kills - dailyKills} 隻怪物`,
      });
    if (dailyRewardClaimed) return toast.info("今日獎勵已領取");
    if (!saveReady || sessionSuperseded || dailyClaimInFlightRef.current) return;
    dailyClaimInFlightRef.current = true;
    setDailyClaimBusy(true);
    try {
      const response = await fetch("/api/save", {
        method: "POST",
        headers: loginHeaders(loginId, true),
        body: JSON.stringify({ playerId, action: "claim_daily", dailyDate, dailyKills }),
      });
      const result = await response.json();
      if (response.status === 401 || result?.error === "maintenance") {
        pauseSupersededSession(result?.error === "maintenance" ? "maintenance"
          : result?.error === "session_replaced" ? "replaced" : "expired");
        return;
      }
      if (!response.ok || result?.ok !== true || result?.dailyRewardClaimed !== true) {
        toast.error(result?.error === "daily_claim_rejected"
          ? "擊殺進度仍在同步，請稍候再領取"
          : "今日獵殺獎勵未領取，請重新載入確認進度");
        return;
      }
      if (result.accepted === false) {
        if (Number.isSafeInteger(result.gold)) setGold(result.gold);
        if (Number.isSafeInteger(result.enhanceStones)) setEnhanceStones(result.enhanceStones);
        if (Number.isSafeInteger(result.reforgeStones)) setReforgeStones(result.reforgeStones);
        if (Number.isSafeInteger(result.yuanbao)) setYuanbao(result.yuanbao);
        toast.info("今日獎勵已領取");
      } else {
        setGold((value) => value + reward.gold);
        setEnhanceStones((value) => value + reward.enhanceStones);
        setReforgeStones((value) => value + reward.reforgeStones);
        setYuanbao((value) => value + reward.yuanbao);
        const summary = `金幣 +${reward.gold.toLocaleString()}・強化石 +${reward.enhanceStones}・洗鍊石 +${reward.reforgeStones}・元寶 +${reward.yuanbao}`;
        pushLog("收益", `完成今日獵殺 ${reward.kills} 隻：${summary}`);
        toast.success("今日獵殺獎勵已領取", { description: summary });
      }
      setDailyRewardClaimed(true);
      if (Number.isSafeInteger(result.adminRevision)) setAdminRevision(result.adminRevision);
      setSaveUpdatedAt(result.updatedAt ?? null);
    } catch {
      toast.error("連線中斷，請重試今日獵殺獎勵");
    } finally {
      dailyClaimInFlightRef.current = false;
      setDailyClaimBusy(false);
    }
  };

  useEffect(() => {
    if (!saveReady || !playerId || sessionSuperseded) return;
    let cancelled = false;
    let inFlight = false;
    const heartbeat = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/save", {
          method: "POST",
          headers: loginHeaders(loginId, true),
          body: JSON.stringify({ playerId, action: "heartbeat_online" }),
        });
        const result = await response.json();
        if (cancelled) return;
        if (response.status === 401 || result?.error === "maintenance") {
          pauseSupersededSession(result?.error === "maintenance" ? "maintenance"
            : result?.error === "session_replaced" ? "replaced" : "expired");
          return;
        }
        if (!response.ok || result?.ok !== true || result.accepted !== true) return;
        if (Number.isSafeInteger(result.idleSeconds)) setIdleSeconds(result.idleSeconds);
        const reward = Number(result.reward);
        if (Number.isSafeInteger(reward) && reward > 0) {
          setYuanbao((value) => value + reward);
          if (Number.isSafeInteger(result.adminRevision)) setAdminRevision(result.adminRevision);
          pushLog("收益", `泡點模式達成，獲得元寶 +${reward}`);
          toast.success("泡點收益已發放", { description: `元寶 +${reward}` });
        }
        setSaveUpdatedAt(result.updatedAt ?? null);
      } catch {
        // The next heartbeat resumes accrual without paying for the full gap.
      } finally {
        inFlight = false;
      }
    };
    void heartbeat();
    const timer = window.setInterval(() => { void heartbeat(); }, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [saveReady, playerId, loginId, sessionSuperseded, pauseSupersededSession, pushLog]);

  const buyShopItem = async (item: "reforge" | "gamble" | "title-ash" | "title-abyss" | "appearance-ember" | "appearance-arcane" | "appearance-abyss" | "gold-reforge" | "gold-enhance") => {
    const cosmeticPrices: Partial<Record<typeof item, number>> = balanceConfig.economy.yuanbaoCosmetics;
    const cosmeticPrice = cosmeticPrices[item];
    if (item === "reforge" || cosmeticPrice !== undefined) {
      if (shopPurchaseInFlightRef.current || equipmentBusyRef.current || equipmentPendingRef.current) return;
      if (!saveReady || !playerId || sessionSuperseded) return toast.error("請先完成存檔載入");
      const price = item === "reforge" ? balanceConfig.economy.yuanbaoReforgeBundle.price : (cosmeticPrice ?? 0);
      if (yuanbao < price) return toast.error("元寶不足", { description: `需要 ${price} 元寶` });
      if (shopPurchaseRetryRef.current && shopPurchaseRetryRef.current.item !== item)
        return toast.error("請先重試尚未確認的上一筆購買");
      shopPurchaseInFlightRef.current = true;
      setShopPurchaseBusy(true);
      const purchaseId = shopPurchaseRetryRef.current?.id ?? crypto.randomUUID();
      shopPurchaseRetryRef.current = { id: purchaseId, item };
      try {
        const response = await fetch("/api/save", {
          method: "POST",
          headers: loginHeaders(loginId, true),
          body: JSON.stringify({
            playerId, action: item === "reforge" ? "shop_reforge" : "shop_cosmetic",
            purchaseId, ...(item === "reforge" ? {} : { shopItem: item }),
          }),
        });
        const result = await response.json();
        if (response.status === 401) {
          pauseSupersededSession(result?.error === "session_replaced" ? "replaced" : "expired");
          return;
        }
        if (!response.ok || result?.ok !== true || typeof result.accepted !== "boolean") {
          toast.error(result?.error === "purchase_rejected" ? "元寶不足、已擁有或存檔異常" : "購買失敗，請重試");
          return;
        }
        if (result.accepted) {
          setYuanbao((value) => value - price);
          if (item === "reforge") {
            const stones = balanceConfig.economy.yuanbaoReforgeBundle.stones;
            setReforgeStones((value) => value + stones);
            pushLog("收益", `商城購買洗鍊石 ×${stones}，消耗元寶 ${price}`);
            toast.success("購買成功", { description: `洗鍊石 +${stones}` });
          } else {
            toast.success("外觀或稱號已解鎖並裝備");
          }
        } else {
          if (Number.isSafeInteger(result.yuanbao)) setYuanbao(result.yuanbao);
          if (item === "reforge" && Number.isSafeInteger(result.reforgeStones))
            setReforgeStones(result.reforgeStones);
          toast.info("該筆購買已完成");
        }
        if (Array.isArray(result.ownedTitles)) setOwnedTitles(result.ownedTitles);
        if (Array.isArray(result.ownedAppearances)) setOwnedAppearances(result.ownedAppearances);
        if (typeof result.selectedTitle === "string" && result.ownedTitles?.includes(result.selectedTitle))
          setSelectedTitle(result.selectedTitle as TitleId);
        if (typeof result.selectedAppearance === "string" && result.ownedAppearances?.includes(result.selectedAppearance))
          setSelectedAppearance(result.selectedAppearance as AppearanceId);
        if (Number.isSafeInteger(result.adminRevision)) setAdminRevision(result.adminRevision);
        setSaveUpdatedAt(result.updatedAt ?? null);
        shopPurchaseRetryRef.current = null;
      } catch {
        toast.error("連線中斷，請重試同一筆購買");
      } finally {
        shopPurchaseInFlightRef.current = false;
        setShopPurchaseBusy(false);
      }
      return;
    }
    const goldPrices: Partial<Record<typeof item, number>> = { "gold-reforge": 200000, "gold-enhance": 100000 };
    const goldPrice = goldPrices[item];
    if (goldPrice) {
      if (gold < goldPrice) return toast.error("金幣不足", { description: `需要 ${goldPrice.toLocaleString()} 金幣` });
      setGold((value) => value - goldPrice);
      if (item === "gold-reforge") setReforgeStones((value) => value + 10);
      if (item === "gold-enhance") setEnhanceStones((value) => value + 50);
      toast.success("購買成功");
      return;
    }
    if (yuanbao < 10) return toast.error("元寶不足", { description: "需要 10 元寶" });
    setYuanbao((value) => value - 10);
    const targetMap = Math.max(1, unlockedMapId);
    const reward = createGambleReward(targetMap, Math.random(), Date.now());
    if (reward.type === "reforge") {
      setReforgeStones((value) => value + reward.amount);
      pushLog("收益", `開啟賭狗禮包，獲得洗鍊石 ×${reward.amount}`);
      toast.success("賭狗禮包已開啟", { description: `洗鍊石 +${reward.amount}` });
      return;
    }
    addLoot([reward.item], "賭狗禮包");
    pushLog("收益", `開啟賭狗禮包，獲得【${reward.item.quality}】${reward.item.name}`);
    toast.success("賭狗禮包已開啟", { description: `獲得${reward.item.quality}裝備` });
  };

  const grantExperience = useCallback(
    (amount: number) => {
      setExp((current) => {
        let remaining = current + amount;
        let nextLevel = level;
        let levelUps = 0;
        while (
          nextLevel < 100 &&
          remaining >= experienceRequired(nextLevel)
        ) {
          remaining -= experienceRequired(nextLevel);
          nextLevel += 1;
          levelUps += 1;
        }
        if (levelUps > 0) {
          setLevel(nextLevel);
          // The reworked skill budget is derived from level; there is no
          // separate skill-points state to update during combat.
          pushLog("成長", `經驗累積完成，角色提升至 Lv.${nextLevel}`);
        }
        return nextLevel >= 100 ? 0 : remaining;
      });
    },
    [level, pushLog],
  );

  const addLoot = useCallback((loot: Item[], source: string) => {
    const cleanLoot = loot.map(normalizeSceneItem);
    const autoLimit = qualityOrder.indexOf(autoSalvageQuality);
    const salvaged = autoSalvage
      ? cleanLoot.filter((item) => {
          if (item.locked) return false;
          // Named drops are always kept so a low combat rating cannot silently destroy them.
          if (getItemEpithets(item).prefix || getItemEpithets(item).suffix) return false;
          // 神話與特殊傳奇是可組流派的核心裝備，不讓自動分解把它們吃掉。
          if (findEquipmentDefinition(item)) return false;
          if (autoSalvageQuality === "全分解") {
            // 全分解仍遵守鎖定、套裝保留與戰力提升保留規則。
          } else if (autoSalvageQuality === "傳奇以下") {
            if (qualityOrder.indexOf(item.quality) >= qualityOrder.indexOf("傳奇")) return false;
          } else {
            if (qualityOrder.indexOf(item.quality) > autoLimit) return false;
            if (["傳奇", "神話"].includes(item.quality)) return false;
          }
          if (protectSetGear && item.set) return false;
          const worn = items.find(
            (gear) => gear.slot === item.slot && equipped.includes(gear.id),
          );
          if (
            protectPowerUpgrade &&
            (!worn || powerDifferenceForItem(item) > 0)
          )
            return false;
          return true;
        })
      : [];
    const salvagedIds = new Set(salvaged.map((item) => item.id));
    const retained = cleanLoot.filter((item) => !salvagedIds.has(item.id));
    if (salvaged.length) {
      const reward = salvaged.reduce(
        (total, item) => {
          const value = saleReturn(item);
          return { gold: total.gold + value.gold, stones: total.stones + value.stones };
        },
        { gold: 0, stones: 0 },
      );
      setGold((value) => value + reward.gold);
      setEnhanceStones((value) => value + reward.stones);
      pushLog(
        "分解",
        `${source}自動分解 ${salvaged.length} 件裝備，獲得 ${reward.gold.toLocaleString()} 金幣與 ${reward.stones} 顆強化石`,
      );
      toast.info(`自動分解 ${salvaged.length} 件裝備`, {
        description: `金幣 +${reward.gold.toLocaleString()}・強化石 +${reward.stones}`,
      });
    }
    const freeSlots = Math.max(
      0,
      60 - items.filter((item) => !equipped.includes(item.id)).length,
    );
    const bagLoot = retained.slice(0, freeSlots),
      overflow = retained.slice(freeSlots);
    if (bagLoot.length) {
      setItems((old) => [...old, ...bagLoot]);
      setUnseenItemIds((old) => [
        ...new Set([...old, ...bagLoot.map((item) => item.id)]),
      ]);
    }
    if (overflow.length) {
      const overflowMails = Array.from(
        { length: Math.ceil(overflow.length / 60) },
        (_, index) => ({
          id: nextLootId(index),
          title: "背包溢出獎勵",
          body: `${source}獲得的物品因背包已滿而轉入郵件，保存 7 天。可依背包空間分批領取。`,
          claimed: false,
          rewards: {
            gold: 0,
            stones: 0,
            items: overflow.slice(index * 60, (index + 1) * 60),
          },
        }),
      );
      setMails((old) => [...overflowMails.reverse(), ...old].slice(0, MAIL_CAPACITY));
    }
    if (retained.length)
      pushLog(
        "掉落",
        `${source}獲得 ${retained.length} 件裝備${overflow.length ? `，其中 ${overflow.length} 件轉入郵件` : ""}`,
      );
    return { bag: bagLoot.length, mail: overflow.length, salvaged: salvagedIds };
  }, [
    autoSalvage,
    autoSalvageQuality,
    equipped,
    items,
    protectPowerUpgrade,
    protectSetGear,
    pushLog,
  ]);

  const claimMail = (mail: MailMessage) => {
    if (mail.claimed) return;
    if(mail.expiresAt&&Date.parse(mail.expiresAt)<=Date.now())return toast.error("郵件已過期");
    const freeSlots = Math.max(0, 60 - items.filter((item) => !equipped.includes(item.id)).length);
    if (mail.rewards.items.length > 0 && freeSlots === 0)
      return toast.error("背包空間不足", {
        description: "請先整理至少 1 格背包，再繼續分批領取。",
      });
    const claimedItems = mail.rewards.items.slice(0, freeSlots);
    const remainingItems = mail.rewards.items.slice(claimedItems.length);
    const claimResources = !mail.rewards.resourcesClaimed;
    if (claimResources) {
      setGold((v) => v + mail.rewards.gold);
      setEnhanceStones((v) => v + mail.rewards.stones);
      setYuanbao((v) => v + (mail.rewards.yuanbao ?? 0));
      setReforgeStones(v=>v+(mail.rewards.reforgeStones??0));
    }
    if (claimedItems.length) {
      setItems((old) => [...old, ...claimedItems]);
      setUnseenItemIds((old) => [
        ...new Set([...old, ...claimedItems.map((item) => item.id)]),
      ]);
    }
    setMails((old) =>
      old.map((m) => m.id === mail.id ? {
        ...m,
        claimed: remainingItems.length === 0,
        rewards: {
          ...m.rewards,
          gold: claimResources ? 0 : m.rewards.gold,
          stones: claimResources ? 0 : m.rewards.stones,
          yuanbao: claimResources ? 0 : m.rewards.yuanbao,
          reforgeStones: claimResources ? 0 : m.rewards.reforgeStones,
          items: remainingItems,
          resourcesClaimed: true,
        },
      } : m),
    );
    pushLog("收益", `領取郵件「${mail.title}」：裝備 +${claimedItems.length}${claimResources ? `、金幣 +${mail.rewards.gold}、強化石 +${mail.rewards.stones}、元寶 +${mail.rewards.yuanbao ?? 0}` : ""}`);
    toast.success(remainingItems.length ? `已領取 ${claimedItems.length} 件，剩餘 ${remainingItems.length} 件` : "郵件獎勵已領取");
  };

  const claimAllMail = () => {
    const unclaimed = mails.filter((mail) => !mail.claimed);
    if (!unclaimed.length) return toast.info("目前沒有可領取的郵件");
    let freeSlots = Math.max(0, 60 - items.filter((item) => !equipped.includes(item.id)).length);
    const claimedItems: Item[] = [];
    let goldGain = 0;
    let stonesGain = 0;
    let yuanbaoGain = 0;
    let reforgeGain=0;
    const nextMails = mails.map((mail) => {
      if (mail.claimed || mail.expiresAt&&Date.parse(mail.expiresAt)<=Date.now()) return mail;
      const itemsToClaim = mail.rewards.items.slice(0, freeSlots);
      freeSlots -= itemsToClaim.length;
      claimedItems.push(...itemsToClaim);
      const remainingItems = mail.rewards.items.slice(itemsToClaim.length);
      const claimResources = !mail.rewards.resourcesClaimed;
      if (claimResources) {
        goldGain += mail.rewards.gold;
        stonesGain += mail.rewards.stones;
        yuanbaoGain += mail.rewards.yuanbao ?? 0;
        reforgeGain+=mail.rewards.reforgeStones??0;
      }
      return {
        ...mail,
        claimed: remainingItems.length === 0,
        rewards: {
          ...mail.rewards,
          gold: claimResources ? 0 : mail.rewards.gold,
          stones: claimResources ? 0 : mail.rewards.stones,
          yuanbao: claimResources ? 0 : mail.rewards.yuanbao,
          reforgeStones: claimResources ? 0 : mail.rewards.reforgeStones,
          items: remainingItems,
          resourcesClaimed: true,
        },
      };
    });
    if (goldGain) setGold((value) => value + goldGain);
    if (stonesGain) setEnhanceStones((value) => value + stonesGain);
    if (yuanbaoGain) setYuanbao((value) => value + yuanbaoGain);
    if(reforgeGain)setReforgeStones(value=>value+reforgeGain);
    if (claimedItems.length) {
      setItems((old) => [...old, ...claimedItems]);
      setUnseenItemIds((old) => [...new Set([...old, ...claimedItems.map((item) => item.id)])]);
    }
    setMails(nextMails);
    pushLog("收益", `一鍵領取郵件：裝備 +${claimedItems.length}、金幣 +${goldGain}、強化石 +${stonesGain}、元寶 +${yuanbaoGain}`);
    toast.success(`已領取全部可領獎勵${claimedItems.length ? `，裝備 +${claimedItems.length}` : ""}`, {
      description: nextMails.some((mail) => !mail.claimed) ? "背包已滿，剩餘裝備保留在郵件中。" : "所有郵件獎勵已領取。",
    });
  };

  const revealBattleDrop = useCallback(
    (
      tier: "normal" | "elite" | "guardian" | "boss",
      defeatedWave: number,
    ) => {
      if (tier === "elite") setBattleDrops([]);
      const treasure = hasBlessing("treasure");
      const treasureUpgraded = blessingUpgraded("treasure");
      const treasureBonus = treasure ? (treasureUpgraded ? 0.3 : 0.2) : 0;
      const dropChance =
        tier === "guardian" || tier === "boss"
          ? 1
          : tier === "elite"
            ? 0.7 + treasureBonus + characterStats.equipmentDrop / 100
            : 0.4 + treasureBonus + characterStats.equipmentDrop / 100;
      if (Math.random() > dropChance) return;
      const catalogSource: CatalogDropSource =
        tier === "boss" ? "boss" : tier === "guardian" ? "guardian" : tier;
      const catalogItem = rollCatalogDrop(
        mapId,
        catalogSource,
        playerClass,
        defeatedWave,
      );
      let item = catalogItem ?? createDrop(
        mapId,
        tier === "guardian" || tier === "boss" ? "首領" : "戰鬥",
        defeatedWave,
      );
      if (!catalogItem && treasure && Math.random() < Math.min(1, (treasureUpgraded ? 0.6 : 0.45) + characterStats.highQualityDrop / 100)) {
        const rank = Math.min(
          SCENE_MAX_QUALITY_INDEX,
          qualityOrder.indexOf(item.quality) + 1,
        );
        // 昇華後仍保留傳奇稀有度：史詩升傳奇只保留 50% 成功率，
        // 使已掉落裝備中的傳奇比例由 8% 降至約 5%。
        if (rank < 4 || Math.random() < 0.5) {
          const quality = qualityOrder[rank];
          item = {
            ...item,
            quality,
            power: item.power + 38,
            affixes: rollAffixes({ ...item, quality }),
          };
          item = { ...item, prefixId: undefined, suffixId: undefined, ...rollItemEpithets(item) };
        }
      }
      const drop = {
        id: ++lootIdRef.current,
        item,
        elite: tier !== "normal",
        collected: true,
      };
      const result = addLoot(
        [item],
        tier === "boss" ? "地圖首領掉落" : tier === "guardian" ? "守關者掉落" : "戰鬥掉落",
      );
      if (!result.salvaged.has(item.id))
        setBattleDrops((old) => [drop, ...old].slice(0, 6));
      setRunGear((value) => value + 1);
      pushLog(
        "掉落",
        `${tier === "boss" ? "地圖首領" : tier === "guardian" ? "守關者" : tier === "elite" ? "精英" : "怪物"}掉落【${item.quality}】${item.name}`,
      );
    },
    [addLoot, blessingUpgraded, characterStats.equipmentDrop, characterStats.highQualityDrop, hasBlessing, mapId, playerClass, pushLog],
  );

  const offerBlessings = useCallback(() => {
    const available = blessingPool.filter(
      (choice) => !blessings.some((blessing) => blessing.id === choice.id),
    );
    let pool: Blessing[];
    if (available.length > 0) {
      pool = [...available].sort(() => Math.random() - 0.5).slice(0, 3);
    } else {
      const upgradeable = blessings
        .filter(
          (blessing) =>
            blessingPool.some((base) => base.id === blessing.id) &&
            !blessing.upgraded,
        )
        .map((blessing) => ({
          id: `upgrade-${blessing.id}`,
          targetId: blessing.id,
          name: `${blessing.name}・昇華`,
          tag: "進階・強化",
          description: blessingUpgradeText[blessing.id],
          kind: "upgrade" as const,
        }));
      const combat = advancedCombatBlessings.filter(
        (choice) => !blessings.some((blessing) => blessing.id === choice.id),
      );
      const support = advancedSupportBlessings.filter(
        (choice) => !blessings.some((blessing) => blessing.id === choice.id),
      );
      pool = [
        upgradeable.sort(() => Math.random() - 0.5)[0],
        combat.sort(() => Math.random() - 0.5)[0],
        support.sort(() => Math.random() - 0.5)[0],
      ].filter(Boolean);
    }
    if (pool.length === 0) {
      setBlessingChoices([]);
      setBlessingOpen(true);
      setBlessingDrawing(false);
      setBlessingUnavailable(true);
      setBlessingCountdown(3);
      setBattleOn(false);
      return;
    }
    setBlessingChoices([]);
    setBlessingOpen(true);
    setBlessingDrawing(true);
    setBlessingUnavailable(false);
    setBlessingCountdown(5);
    setBattleOn(false);
    setTimeout(() => {
      setBlessingChoices(pool);
      setBlessingDrawing(false);
    }, 850);
  }, [blessings]);

  const chooseBlessing = (blessing: Blessing) => {
    if (blessingDrawing) return;
    setBlessings((old) => {
      if (blessing.kind === "upgrade" && blessing.targetId)
        return old.map((item) =>
          item.id === blessing.targetId ? { ...item, upgraded: true } : item,
        );
      return old.some((item) => item.id === blessing.id)
        ? old
        : [...old, blessing];
    });
    setBlessingOpen(false);
    setBattleOn(true);
    pushLog("系統", `取得戰場祝福「${blessing.name}」`);
    toast.success(`取得 ${blessing.name}`, {
      description: blessing.description,
    });
  };

  useEffect(() => {
    if (!blessingOpen || !blessingUnavailable) return;
    const timer = setTimeout(() => {
      if (blessingCountdown <= 1) {
        setBlessingOpen(false);
        setBlessingUnavailable(false);
        setBattleOn(true);
      } else {
        setBlessingCountdown((value) => value - 1);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [blessingOpen, blessingUnavailable, blessingCountdown]);

  const chooseTimedBlessing = useEffectEvent(chooseBlessing);

  useEffect(() => {
    if (!blessingOpen || blessingDrawing || blessingChoices.length === 0)
      return;
    const timer = setTimeout(() => {
      if (blessingCountdown <= 1)
        chooseTimedBlessing(
          blessingChoices[Math.floor(Math.random() * blessingChoices.length)],
        );
      else setBlessingCountdown((value) => value - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [blessingOpen, blessingDrawing, blessingChoices, blessingCountdown]);

  const beginNewRun = () => {
    towerDeathPendingRef.current = false;
    resetCombatPerks();
    const completed = runSummary?.outcome === "complete";
    setWave(1);
    setEnemyName(currentMap.monsters[0]);
    setEnemyHp(100);
    setPlayerHp(100);
    setBloodShieldReady(true);
    setBattlePulse(0);
    setRound(1);
    // Blessings belong to a single 30-floor expedition and never carry over.
    setBlessings([]);
    setBattleDrops([]);
    setRunKills(0);
    setRunElites(0);
    setRunGuardians(0);
    setRunGold(0);
    setRunEnhance(0);
    setRunReforge(0);
    setRunGear(0);
    setRunStartedAt(() => Date.now());
    setRunSummary(null);
    setRestartCountdown(10);
    setBattleOn(true);
    setCausePrompt(
      completed ? `${currentMap.name}新一輪遠征開始，祝福已重置` : "戰敗後重新整備，祝福已清除",
    );
  };

  const finishRun = useEffectEvent((outcome: "death" | "complete", floor: number) => {
    setBattleOn(false);
    if (outcome === "death" && playerId && !sessionSuperseded) {
      void fetch("/api/analytics/deaths", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playerId,
          mapId,
          floor,
          playerClass,
          playerLevel: level,
          combatPower,
        }),
      }).catch(() => undefined);
    }
    if (outcome === "complete" && mapId === 9 && floor === MAP_FLOORS)
      setFinalBossDefeated(true);
    setHighestFloor((value) => Math.max(value, floor));
    setMapBestFloors((old) => ({
      ...old,
      [mapId]: Math.max(old[mapId] ?? 0, floor),
    }));
    if (outcome === "complete") {
      setCompletedRuns((value) => value + 1);
      setUnlockedMapId((value) => Math.max(value, Math.min(9, mapId + 1)));
    }
    setRunSummary({
      outcome,
      highestFloor: floor,
      kills: runKills,
      elites: runElites,
      guardians: runGuardians,
      gold: runGold,
      enhance: runEnhance,
      reforge: runReforge,
      gear: runGear,
      duration: Math.max(1, Math.floor((now.getTime() - runStartedAt) / 1000)),
    });
    setRestartCountdown(10);
    pushLog(
      "戰鬥",
      outcome === "complete"
        ? `擊敗${currentMap.name}第 30 層首領，下一張地圖已解鎖；10 秒後在原地展開新一輪`
        : "角色戰敗，10 秒後從第 1 層重新挑戰",
    );
  });

  const canRebirth = level >= 100 && (mapBestFloors[9] ?? 0) >= MAP_FLOORS && rebirthCount < MAX_REBIRTHS;
  const runSkillAction = async (action: SkillSaveAction): Promise<boolean> => {
    if (!saveReady || sessionSuperseded || skillActionInFlightRef.current || equipmentBusyRef.current || equipmentPendingRef.current) return false;
    skillActionInFlightRef.current = true;
    setSkillActionBusy(true);
    const key = JSON.stringify(action);
    const id = skillActionRetryRef.current?.key === key
      ? skillActionRetryRef.current.id : crypto.randomUUID();
    skillActionRetryRef.current = { key, id };
    try {
      if(action.kind === "begin_rebirth"){
        for(let wait=0;saveInFlightRef.current&&wait<100;wait++)await new Promise(resolve=>window.setTimeout(resolve,100));
        if(saveInFlightRef.current)throw new Error("save_busy");
      }
      const response = await fetch("/api/save", {
        method: "POST",
        headers: loginHeaders(loginId, true),
        body: JSON.stringify({ playerId, action: "skill", skillAction: action, skillActionId: id }),
      });
      const result = await response.json();
      if (response.status === 401 || result?.error === "maintenance") {
        pauseSupersededSession(result?.error === "maintenance" ? "maintenance"
          : result?.error === "session_replaced" ? "replaced" : "expired");
        return false;
      }
      if (!response.ok || result?.ok !== true) {
        skillActionRetryRef.current = null;
        toast.error("新版技能操作未完成，請重新載入後再試");
        return false;
      }
      if (action.kind === "paid_reset" || action.kind === "begin_rebirth") {
        if (Number.isSafeInteger(result.yuanbao)) setYuanbao(result.yuanbao);
        if (Number.isSafeInteger(result.adminRevision)) setAdminRevision(result.adminRevision);
      }
      setSkillReworkBuild(restoreSkillBuild(result.skillReworkBuild, playerClass, level));
      setSkillAscensions(restoreSkillAscensions(result.skillAscensions, playerClass));
      setSaveUpdatedAt(result.updatedAt ?? null);
      skillActionRetryRef.current = null;
      return true;
    } catch {
      toast.error("連線中斷，請重試新版技能操作");
      return false;
    } finally {
      skillActionInFlightRef.current = false;
      setSkillActionBusy(false);
    }
  };

  const rebirth = async () => {
    if (!canRebirth) return;
    // Progression and ascension reset commit together on the server.
    // Pause until the canonical reset has been loaded before resuming battle.
    setBattleOn(false);
    if (!(await runSkillAction({ kind: "begin_rebirth" }))){setBattleOn(true);return;}
    setSaveReady(false);
    towerDeathPendingRef.current = false;
    resetCombatPerks();
    setRebirthCount((value) => Math.min(MAX_REBIRTHS, value + 1));
    setRebirthPoints((value) => value + REBIRTH_REWARD_PER_TURN.talentPoints);
    setLevel(1);
    setExp(0);
    setMapId(1);
    setUnlockedMapId(1);
    setMapBestFloors({ 1: 1 });
    setWave(1);
    setEnemyName(maps[0].monsters[0]);
    setEnemyHp(100);
    setPlayerHp(100);
    setItems([]);
    // 輪迴會清除本輪所有信件，避免未領取的最後地圖裝備或資源帶入下一輪。
    setMails([]);
    setUnseenItemIds([]);
    setLoadouts({ 1: [], 2: [] });
    setSelectedItem(0);
    setCompletedRuns(0);
    resetStoredTime(0);
    setBlessings([]);
    setDailyKills(0);
    setDailyDate(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }));
    setDailyRewardClaimed(false);
    setFinalBossDefeated(false);
    setBattleDrops([]);
    setRunSummary(null);
    setBattleOn(false);
    setSaveReloadTick(v=>v+1);
    setCausePrompt(`第 ${rebirthCount + 1} 轉開始，裝備、信件與地圖進度已重置`);
    pushLog("系統", `完成第 ${rebirthCount + 1} 次輪迴，獲得輪迴天賦點 +${REBIRTH_REWARD_PER_TURN.talentPoints}`);
    toast.success("輪迴完成", { description: "等級、地圖、技能、掛機、祝福、全部裝備與信件已重置；資源與輪迴成長保留。" });
  };
  const spendRebirthTalent = (id: RebirthTalentId) => {
    const definition = rebirthTalentDefs.find((talent) => talent.id === id);
    if (!definition || rebirthPoints <= 0 || rebirthTalents[id] >= definition.max)
      return;
    setRebirthPoints((value) => value - 1);
    setRebirthTalents((value) => ({ ...value, [id]: value[id] + 1 }));
  };
  const resetRebirthTalents = () => {
    const investedPoints = Object.values(rebirthTalents).reduce((total, points) => total + points, 0);
    if (investedPoints <= 0) return;
    setRebirthPoints((value) => value + investedPoints);
    setRebirthTalents(emptyRebirthTalents);
    toast.success("輪迴配點已重置", { description: `退回 ${investedPoints} 點，可重新自由分配。` });
  };

  const enterMap = (targetMapId: number) => {
    if (targetMapId > unlockedMapId) return;
    const target = maps[targetMapId - 1];
    towerDeathPendingRef.current = false;
    resetCombatPerks();
    setMapId(targetMapId);
    setWave(1);
    setEnemyName(target.monsters[0]);
    setEnemyHp(100);
    setPlayerHp(100);
    setBloodShieldReady(true);
    setBattlePulse(0);
    setRound(1);
    setBlessings([]);
    setBattleDrops([]);
    setRunKills(0);
    setRunElites(0);
    setRunGuardians(0);
    setRunGold(0);
    setRunEnhance(0);
    setRunReforge(0);
    setRunGear(0);
    setRunStartedAt(() => Date.now());
    setRunSummary(null);
    setRestartCountdown(10);
    setBattleOn(true);
    setTab("主控");
    setCausePrompt(`已前往${target.name}，祝福重新累積`);
    pushLog("系統", `前往${target.name}，從第 1 層開始定點掛機`);
  };

  const restartRun = useEffectEvent(beginNewRun);
  // HP changes on every hit; read its current value without resetting attack clocks.
  const readTowerHealth = useEffectEvent(() => playerHp);

  useEffect(() => {
    if (!runSummary) return;
    const timer = setTimeout(() => {
      if (restartCountdown <= 1) restartRun();
      else setRestartCountdown((value) => value - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [runSummary, restartCountdown]);

  useEffect(() => {
    if (!saveReady || sessionSuperseded || !battleOn || activeBossBattle || runSummary) return;
    const cutoverRoute = beginSkillBattleCutover({
      battleId: `tower:${runStartedAt}:${mapId}`,
      encounter: "tower",
      enableRework: true,
      reworkReady: true,
    });
    let actionSequence = 0;
    liveCombatRef.current = syncLiveCombat(liveCombatRef.current, `tower:${runStartedAt}:${mapId}`,
      `${runStartedAt}:${mapId}:${wave}`, skillReworkBuild, playerClass, level, skillAscensions);
    const tickMs = COMBAT_TICK_MS;
    const monsterAttackSpeed = monsterProfile(currentEnemyBaseName).speed * 100;
    const cadence=retainCombatCadence(towerCadenceRef.current,`${runStartedAt}:${mapId}:${wave}`);
    towerCadenceRef.current=cadence;
    let skillCooldown = 0;
    let defenseBreakRemaining = 0;
    let markedRemaining = nextEnemyMarkStacksRef.current;
    let markExplosionPending = markedRemaining > 0;
    nextEnemyMarkStacksRef.current = 0;
    let burningUntil = 0;
    let nextBurnAt = 0;
    let magicShieldCooldown = 0;
    let magicShieldExplosionPending = false;
    let warriorAttackCount = 0;
    let playerAttackCount = 0;
    let enemyAttackCount = 0;
    let fissureRemaining = 0;
    const hasPerk = (id: string) => hasCatalogItem(equippedGearRef.current, id);
    const hasSkillMythic = (skill: string) => Boolean(equippedSkillMythic(equippedGearRef.current, skill));
    if (markedRemaining > 0 && hasSkillMythic("致命標記")) {
      showCombatStatus({ name: "致命標記 ×2", target: "enemy", remaining: markedRemaining + 1, unit: "攻擊", tone: "gold" });
    }
    const targetKey = `${runStartedAt}:${mapId}:${wave}`;
    const resolveTowerKill = (executionFinisher: boolean, markExplosionWasActive: boolean, tier: "normal" | "elite" | "guardian" | "boss") => {
      if (!towerVictoryGuardRef.current.claim(targetKey)) return executionFinisher ? 0 : 100;
      if (hasPerk("special-bloodfang")) combatPerksRef.current.killBuffRemaining = 5;
      combatPerksRef.current.firstEnemyAttackReady = true;
      combatPerksRef.current.revengeStacks = 0;
      combatPerksRef.current.ironWallBonus = 0;
      combatPerksRef.current.arcaneEchoReady = false;
      combatPerksRef.current.arcaneStacks = 0;
      if (markExplosionWasActive && hasPerk("skill-ranger-queen-contract")) {
        nextEnemyMarkStacksRef.current = 2;
      }
      // A mark belongs to its current target. Clear an un detonated
      // mark immediately when that target dies; an explosion already
      // in progress is allowed to finish independently.
      setDeadlyMarkEffect((current) => current?.detonationKey === null ? null : current);
      setHunterMarkVisual(null);
      setEnemyDefeated(true);
      window.setTimeout(() => setEnemyDefeated(false), executionFinisher ? 980 : 320);
      setEnemyHitFeedback(null);
      const enemy = baseMonsterName(enemyName);
      const goldRules = balanceConfig.economy.gold;
      const goldTier = currentWaveBoss ? "boss" : currentWaveGuardian ? "guardian" : currentWaveElite ? "elite" : "normal";
      const goldBase = goldRules.monsterDropBaseByMap[mapId - 1] ?? goldRules.monsterDropBaseByMap[0];
      const goldGain = Math.round(
        goldBase * (1 + Math.max(0, wave - 1) * goldRules.floorGrowth) *
        goldRules.tierMultiplier[goldTier] *
        (hasBlessing("stat-gold") ? 1.2 : 1) *
        (1 + (characterStats.goldBonus / 100) * goldRules.goldAffixEffectiveness),
      );
      const enhanceGain =
        Math.random() <
        enhancementStoneDropChance(
          currentWaveBoss || currentWaveGuardian ? 1 : currentWaveElite ? 0.3 : 0.06,
          characterStats.resourceDrop + characterStats.enhanceDrop,
          hasBlessing("stat-enhance") ? 0.1 : 0,
        )
          ? currentWaveBoss || currentWaveGuardian
            ? 1 + Math.floor(Math.random() * 3)
            : 1
          : 0;
      const reforgeGain =
        Math.random() <
        Math.min(
          1,
          (currentWaveBoss ? 0.35 : currentWaveGuardian ? 0.15 : currentWaveElite ? 0.04 : 0.008) +
            (characterStats.resourceDrop + characterStats.reforgeDrop) / 100 +
            (hasBlessing("stat-reforge") ? 0.05 : 0),
        )
          ? 1
          : 0;
      const yuanbaoGain =
        Math.random() * 100 < characterStats.yuanbaoDrop ? 1 : 0;
      const gemDrop = rollGemDrop(mapId);
      const drillingStoneDrop = rollDrillingStoneDrop();
      setGold((value) => value + goldGain);
      setEnhanceStones((value) => value + enhanceGain);
      setReforgeStones((value) => value + reforgeGain);
      setYuanbao((value) => value + yuanbaoGain);
      if (gemDrop) {
        setGemInventory((inventory) => addGemStack(inventory, gemDrop));
        const gem = getGemDefinition(gemDrop.gemId, gemDrop.tier);
        pushLog("掉落", `獲得${gem.tierLabel}${gem.name}`);
      }
      if (drillingStoneDrop) {
        setDrillingStones((value) => value + 1);
        pushLog("掉落", "獲得打孔石 ×1");
      }
      setRunKills((value) => value + 1);
      setDailyKills((value) => value + 1);
      const experienceGain = Math.round(
        mapExperienceGain(currentMap, tier, level) *
          (1 + characterStats.expBonus / 100),
      );
      grantExperience(experienceGain);
      setRunGold((value) => value + goldGain);
      setRunEnhance((value) => value + enhanceGain);
      setRunReforge((value) => value + reforgeGain);
      if (currentWaveElite) setRunElites((value) => value + 1);
      if (currentWaveGuardian || currentWaveBoss)
        setRunGuardians((value) => value + 1);
      setResourceDrop({
        key: Date.now(),
        gold: goldGain,
        enhance: enhanceGain,
        reforge: reforgeGain,
        yuanbao: yuanbaoGain,
      });
      setPlayerHp(100);
      enemyAttackCount = 0;
      setCombatStatuses([]);
      setBloodBrandVisual(null);
      defenseBreakRemaining = 0;
      markedRemaining = 0;
      markExplosionPending = false;
      fissureRemaining = 0;
      burningUntil = 0;
      setBloodShieldReady(true);
      setRound(1);
      revealBattleDrop(tier, wave);
      pushLog(
        "戰鬥",
        `第 ${wave} 層擊敗${enemy}，金幣 +${goldGain}${enhanceGain ? `・強化石 +${enhanceGain}` : ""}${reforgeGain ? `・洗鍊石 +${reforgeGain}` : ""}${yuanbaoGain ? `・元寶 +${yuanbaoGain}` : ""}`,
      );
      pushLog("成長", `獲得 ${experienceGain.toLocaleString()} 經驗`);
      if (wave >= MAP_FLOORS) {
        setMapBestFloors((old) => ({ ...old, [mapId]: MAP_FLOORS }));
        setTimeout(() => finishRun("complete", MAP_FLOORS), 250);
        return 100;
      }
      const nextWave = wave + 1;
      const nextEnemy = nextWave >= MAP_FLOORS
        ? currentMap.monsters[4]
        : nextWave % 10 === 0 || nextWave % 5 === 0
          ? currentMap.monsters[4]
          : currentMap.monsters[Math.floor(Math.random() * 4)];
      setHighestFloor((value) => Math.max(value, nextWave));
      setMapBestFloors((old) => ({
        ...old,
        [mapId]: Math.max(old[mapId] ?? 0, nextWave),
      }));
      const advanceToNextEnemy = () => {
        setWave(nextWave);
        setEnemyName(baseMonsterName(nextEnemy));
        if (executionFinisher) setEnemyHp(100);
        towerDeathPendingRef.current = false;
        if (currentWaveGuardian) setTimeout(offerBlessings, 450);
      };
      if (executionFinisher) {
        towerDeathPendingRef.current = true;
        window.setTimeout(advanceToNextEnemy, 1_050);
        return 0;
      }
      advanceToNextEnemy();
      return 100;
    };
    const queueTowerKill = (executionFinisher: boolean, markExplosion: boolean, tier: "normal"|"elite"|"guardian"|"boss", volleyKey?:number) => {
      towerDeathPendingRef.current=true;
      pendingEnemyDefeatRef.current={token:targetKey,queuedAt:performance.now(),volleyKey,finish:()=>{
        setEnemyHp(resolveTowerKill(executionFinisher,markExplosion,tier));
      }};
      return 0;
    };
    const timer = setInterval(
      () => {
        const playerHp = readTowerHealth();
        if (ultimateAnimationLockRef.current !== null) return;
        if (towerDeathPendingRef.current) return;
        if (towerVictoryGuardRef.current.has(targetKey)) return;
        const dotTicks = liveCombatRef.current ? advanceLiveCombatEvents(liveCombatRef.current, Date.now()) : [];
        const tickDamage = dotTicks.reduce((sum, event) => sum + event.damage, 0);
        if (tickDamage > 0) {
          const tickTier = currentWaveGuardian ? "guardian" : currentWaveBoss ? "boss" : currentWaveElite ? "elite" : "normal";
          const maximum = effectiveMonsterMaximumHealth(mapId, currentRecommendedPower, tickTier, currentEnemyBaseName);
          setEnemyHp((health) => {
            if(towerDeathPendingRef.current)return 0;
            if (towerVictoryGuardRef.current.has(targetKey)) return 100;
            const settled = settleCombatHealth(health, maximum, tickDamage);
            showDotDamage(dotTicks, settled.actualDamage);
            return settled.defeated ? queueTowerKill(false, false, tickTier) : settled.remainingPercent;
          });
        }
        const battleKey = `${mapId}:${wave}`;
        if (bloodRoarStateRef.current.battleKey !== battleKey) {
          bloodRoarStateRef.current = { battleKey, remaining: 0, used: false };
          bloodRoarVisualTokenRef.current += 1;
          if (bloodRoarHideTimerRef.current !== null) {
            window.clearTimeout(bloodRoarHideTimerRef.current);
            bloodRoarHideTimerRef.current = null;
          }
          setBloodRoarVisualActive(false);
        }
        cadence.player += tickMs;
        const enemyControl = liveEnemyControl(liveCombatRef.current, Date.now());
        cadence.enemy = enemyControl.frozen ? 0 : cadence.enemy + tickMs * enemyControl.speedMultiplier;
        const activeCombatAttackSpeed = combatAttackSpeed * (
          combatPerksRef.current.dodgeSpeedAttacks > 0 ? 1.12 : 1
        );
        const playerInterval = 100000 / Math.max(1, activeCombatAttackSpeed);
        const monsterInterval = 100000 / monsterAttackSpeed;
        const playerActs = cadence.player >= playerInterval;
        let monsterActs = !enemyControl.frozen && cadence.enemy >= monsterInterval;
        if (!playerActs && !monsterActs) return;
        if (playerActs) cadence.player %= playerInterval;
        if (monsterActs) cadence.enemy %= monsterInterval;
        if (burningUntil > Date.now() && Date.now() >= nextBurnAt) {
          nextBurnAt = Date.now() + 1000;
          const burnLevel = skills.find((skill) => skill.name === "霜火新星")?.level ?? 1;
          const burnTier = currentWaveGuardian ? "guardian" : currentWaveBoss ? "boss" : currentWaveElite ? "elite" : "normal";
          const maximumHealth = effectiveMonsterMaximumHealth(mapId, currentRecommendedPower, burnTier, currentEnemyBaseName);
          setEnemyHp((health) => {
            if(towerDeathPendingRef.current)return 0;
            if (towerVictoryGuardRef.current.has(targetKey)) return towerDeathPendingRef.current ? 0 : 100;
            const settled = settleCombatHealth(health, maximumHealth, maximumHealth * (1.5 + burnLevel * 0.5) / 100);
            showDotDamage([{kind:"burn",damage:settled.actualDamage}],settled.actualDamage);
            return settled.defeated ? queueTowerKill(false, false, burnTier) : settled.remainingPercent;
          });
        }
        const dynamicDamageReduction = characterStats.damageReduction +
          (hasPerk("special-ashguard") && playerHp < 40 ? 8 : 0);
        const dynamicLifesteal = characterStats.lifesteal +
          (hasPerk("special-blood-prayer") && playerHp < 30 ? 3 : 0);
        const offensiveAttack = Math.round(
          characterStats.attack *
          (hasPerk("special-warhelm") && playerHp > 80 ? 1.1 : 1),
        );
        setBattlePulse((p) => {
          const next = p + 1;
          setEnemyHitFeedback(null);
          setPlayerHitFeedback(null);
          setEnemyDefeated(false);
          setRound((value) => value + 1);
          const tier = currentWaveGuardian
            ? "guardian"
            : currentWaveBoss
              ? "boss"
              : currentWaveElite
                ? "elite"
                : "normal";
          if (!playerActs) {
            const monsterOnlyValues = towerCombatValues({
              secondChapterTuning: mapId === 2,
              combatPower,
              recommendedPower: currentRecommendedPower,
              mapId,
              localFloor: wave,
              tier,
              attacks: 1,
              skillTriggered: false,
              setTier: 0,
              echoMultiplier: 1,
              skillMultiplier: 1,
              skillDamage: 0,
              eliteDamage: 0,
              bossReduction: characterStats.bossReduction,
              lowHealthDamage: characterStats.lowHealthDamage,
              lowHealthReduction: characterStats.lowHealthReduction,
              lowHealth: playerHp <= 35,
              roll: Math.random(),
              monsterName: currentEnemyBaseName,
              playerDefense: characterStats.defense,
              playerAttack: offensiveAttack,
              defenseIgnore: hasPerk("special-blackfang") ? 8 : 0,
              playerDamageMultiplier: 1,
            });
            setPlayerHp((playerHealth) => {
              const shieldWasActive = magicShieldCooldown > 0;
              if (magicShieldCooldown > 0) magicShieldCooldown -= 1;
              const shieldExpired = shieldWasActive && magicShieldCooldown <= 0;
              let monsterDamage = Math.max(
                1,
                Math.round(
                  monsterOnlyValues.monsterDamage *
                    (hasBlessing("stat-hp") ? 0.84 : 1) *
                    (hasBlessing("stat-defense") ? 0.87 : 1) *
                    (1 - Math.min(balanceConfig.progression.damageReductionCap, dynamicDamageReduction) / 100),
                ),
              );
              if (!liveCombatRef.current && Math.random() * 100 < effectiveDodge) {
                if (hasPerk("special-shadowwalker")) {
                  combatPerksRef.current.dodgeSpeedAttacks = 3;
                  showCombatStatus({ name: "疾影 +12%攻速", target: "player", remaining: 3, unit: "次", tone: "green" });
                }
                setPlayerHitFeedback({ damage: 0, dodged: true, key: next });
                setEnemyHitFeedback(null);
                setCausePrompt(`實際閃避 ${effectiveDodge}% → 完全避開反擊`);
                return playerHealth;
              }
              const ironWallLevel = skills.find((skill) => skill.name === "鋼鐵壁壘")?.level ?? 0;
              if (playerClass === "戰士" && ironWallLevel > 0 && Math.random() < skillProcChance("鋼鐵壁壘", ironWallLevel)) {
                showCombatStatus({ name: "完全格擋", target: "player", remaining: 1, unit: "次", tone: "blue" });
                if (hasPerk("skill-warrior-fallen-city")) {
                  combatPerksRef.current.ironWallBonus = Math.round(characterStats.defense * 1.5);
                  queueSkillVisual({ name: "鋼鐵壁壘", key: next });
                  showCombatStatus({ name: `絕對防禦 +${combatPerksRef.current.ironWallBonus}`, target: "player", remaining: 1, unit: "次", tone: "gold" });
                }
                setPlayerHitFeedback({ damage: 0, dodged: false, blocked: true, key: next });
                setEnemyHitFeedback(null);
                setCausePrompt("鋼鐵壁壘觸發 → 完全格擋");
                return playerHealth;
              }
              const magicShieldLevel = skills.find((skill) => skill.name === "魔力護盾")?.level ?? 0;
              if (!liveCombatRef.current && playerClass === "法師" && !shieldExpired && magicShieldCooldown <= 0 && magicShieldLevel > 0 && Math.random() < skillProcChance("魔力護盾", magicShieldLevel)) {
                monsterDamage = Math.max(1, Math.round(monsterDamage * (1 - skillReduction("魔力護盾", magicShieldLevel))));
                magicShieldCooldown = 4 + Math.floor(Math.random() * 3);
                queueSkillVisual({ name: "魔力護盾", key: next });
                showCombatStatus({ name: `魔力護盾 -${Math.round(skillReduction("魔力護盾", magicShieldLevel) * 100)}%`, target: "player", remaining: 1, unit: "次", tone: "blue" });
                setCausePrompt(`魔力護盾觸發 → 下一次傷害降低 ${Math.round(skillReduction("魔力護盾", magicShieldLevel) * 100)}%`);
              }
              if (!liveCombatRef.current && shieldExpired && hasPerk("skill-mage-eternal-core")) {
                magicShieldExplosionPending = true;
                queueSkillVisual({ name: "魔力護盾・爆炸", key: next });
                showCombatStatus({ name: "過載爆炸", target: "player", remaining: 1, unit: "次", tone: "gold" });
              }
              if (hasBlessing("blood") && bloodShieldReady) {
                const reduction = blessingUpgraded("blood") ? 0.9 : 0.8;
                monsterDamage = Math.max(1, Math.round(monsterDamage * (1 - reduction)));
                setBloodShieldReady(false);
                setCausePrompt(`血誓護盾觸發 → 首次傷害降低 ${Math.round(reduction * 100)}%`);
              }
              if (liveCombatRef.current) {
                const liveDefense = resolveLiveEnemyAttack(liveCombatRef.current, {
                  healthPercent: playerHealth, maxHealth: characterStats.hp,
                  damage: monsterDamage, baseDodgeChance: effectiveDodge,
                   defense: characterStats.defense, equippedItems: equippedGearRef.current,
                });
                updateManaShield(liveCombatRef.current, liveDefense.manaShield);
                updatePhantomStepVisual(liveCombatRef.current, next, liveDefense.phantomStep);
                if (liveDefense.unyielding) {
                  updateUnyieldingVisual(liveDefense.unyielding, next);
                  setUnyieldingCounterFeedback(liveDefense.unyielding.countered ? next : null);
                }
                monsterDamage = liveDefense.damage;
                if (liveDefense.counterDamagePercent > 0 || (liveDefense.equipmentDamage ?? 0) > 0) {
                  const counter = characterStats.attack * liveDefense.counterDamagePercent / 100 + (liveDefense.equipmentDamage ?? 0);
                  const maximum = effectiveMonsterMaximumHealth(mapId, currentRecommendedPower, tier, currentEnemyBaseName);
                  setEnemyHp((health) => {
                    if(towerDeathPendingRef.current)return 0;
                    if (towerVictoryGuardRef.current.has(targetKey)) return 100;
                    const settled = settleCombatHealth(health, maximum, counter);
                    showCounterDamage(settled.actualDamage, liveDefense.equipmentDamage ? "過載爆炸" : "反擊");
                    return settled.defeated ? queueTowerKill(false, false, tier) : settled.remainingPercent;
                  });
                }
                if (liveDefense.blocked || liveDefense.dodged) {
                  setPlayerHitFeedback({ damage: 0, dodged: liveDefense.dodged && !liveDefense.blocked,
                    blocked: liveDefense.blocked, label: liveDefense.unyielding?.blocked ? "格擋成功！" : undefined, key: next });
                  setCausePrompt(liveDefense.unyielding?.blocked
                    ? `不屈戰意格擋${liveDefense.unyielding.countered ? "並反擊" : "成功"} · 尚餘 ${liveDefense.unyielding.remainingEnemyAttacks} 次`
                    : liveDefense.blocked ? "新版格擋成功" : "新版閃避成功");
                  return playerHealth;
                }
              }
              const healthSettlement = settleCombatHealth(playerHealth, characterStats.hp, monsterDamage);
              const actualDamage = healthSettlement.actualDamage;
              if (hasPerk("special-revenge-thorn")) {
                combatPerksRef.current.revengeStacks = Math.min(3, combatPerksRef.current.revengeStacks + 1);
              }
              setPlayerHitFeedback({ damage: actualDamage, dodged: false, key: next });
              setEnemyHitFeedback({ damage: actualDamage, dodged: false, key: next });
              if (healthSettlement.defeated) {
                if (!towerDeathPendingRef.current) {
                  towerDeathPendingRef.current = true;
                  setBattleOn(false);
                  setCausePrompt("生命歸零 → 戰鬥已停止");
                  window.setTimeout(() => finishRun("death", wave), 0);
                }
                return 0;
              }
              return healthSettlement.remainingPercent;
            });
            return next;
          }
          if (playerActs) {
            setCombatStatuses((current) =>
              current
                .map((status) => status.unit !== "秒" ? { ...status, remaining: status.remaining - 1 } : status)
                .filter((status) => status.remaining > 0),
            );
          }
          const activeAttackPerks = playerActs
            ? {
                nextAttackMultiplier: combatPerksRef.current.nextAttackMultiplier,
                nextBasicAttackMultiplier: combatPerksRef.current.nextBasicAttackMultiplier,
                nextAttackCritDamage: combatPerksRef.current.nextAttackCritDamage,
                revengeStacks: combatPerksRef.current.revengeStacks,
                ironWallBonus: combatPerksRef.current.ironWallBonus,
                firstEnemyAttackReady: combatPerksRef.current.firstEnemyAttackReady,
                killBuffRemaining: combatPerksRef.current.killBuffRemaining,
                arcaneEchoReady: combatPerksRef.current.arcaneEchoReady,
              }
            : null;
          if (activeAttackPerks) {
            combatPerksRef.current.nextAttackMultiplier = 1;
            combatPerksRef.current.nextBasicAttackMultiplier = 1;
            combatPerksRef.current.nextAttackCritDamage = 0;
            combatPerksRef.current.revengeStacks = 0;
            combatPerksRef.current.ironWallBonus = 0;
            combatPerksRef.current.firstEnemyAttackReady = false;
            if (combatPerksRef.current.dodgeSpeedAttacks > 0)
              combatPerksRef.current.dodgeSpeedAttacks -= 1;
            if (combatPerksRef.current.killBuffRemaining > 0)
              combatPerksRef.current.killBuffRemaining -= 1;
          }
          if (playerActs) {
            playerAttackCount += 1;
            enemyAttackCount += 1;
          }
          const setTriggered =
            activeSetCount >= SET_RESONANCE_ATTACKS &&
            playerAttackCount % SET_RESONANCE_ATTACKS === 0;
          const liveCombat = liveCombatRef.current;
          const liveAction = playerActs && liveCombat ? resolveLiveCombatAttack(liveCombat, {
            now: Date.now(), healthPercent: playerHp, attack: characterStats.attack,
            hitChance: effectiveHit, criticalChance: characterStats.crit,
            criticalDamage: characterStats.critDamage, equippedItems: equippedGearRef.current,
          }) : null;
          if (liveAction?.currentHealthCostPercent) setPlayerHp(health => Math.max(
            healthPercentFromDamage(1, characterStats.hp), health * (1 - liveAction.currentHealthCostPercent / 100)));
          if (liveEnemyControl(liveCombat, Date.now()).frozen) { monsterActs = false; cadence.enemy = 0; }
          if (liveAction?.name && SKILL_REWORK_CATALOG[playerClass].some((skill) =>
            skill.category === "ultimate" && skill.name === liveAction.name)) {
            beginUltimateAnimation(next);
            if ((liveAction.name === "蒼穹箭雨" || liveAction.name === "星界寂滅") && monsterActs) cadence.enemy += monsterInterval;
          }
          if (liveAction && liveCombat) {
            updateLiveBloodRoar(liveCombat, liveAction, next);
            updateBloodBrandVisual(liveAction, next);
            updateBerserkerStanceVisual(liveCombat, liveAction, next);
            updateArmorSmashVisual(liveCombat, liveAction, next);
            updateTitanVisuals(liveCombat, liveAction, next);
            updateGroundSplitVisuals(liveAction, next);
            updatePiercingVisual(liveAction, next);
            updateStarbreakVisual(liveCombat, liveAction, next);
            updateElementSigil(liveCombat, liveAction);
          updateFrostfireVisual(liveCombat, liveAction, next);
          updateMeteorVisual(liveAction, next);
          updateOverload(liveCombat);
            updateVolleyVisual(liveAction, next);
            updateAstralVisual(liveCombat, liveAction, next);
            updateSkyRainVisual(liveCombat, liveAction, next);
            updateWindDomainVisual(liveCombat, liveAction, next);
            updateTailwindVisual(liveAction, next);
            updatePhantomStepVisual(liveCombat, next);
            updateHunterVisual(liveCombat, liveAction, next);
          }
          let triggered: Skill | null = null;
          const actionDotDamage = liveAction?.ticks.reduce((sum, event) => sum + event.damage, 0) ?? 0;
          let triggeredMultiplier = liveAction?.damagePercent ? liveAction.damagePercent / 100 : 1;
          let triggeredDefenseIgnore = liveAction?.defenseIgnore ?? (defenseBreakRemaining > 0 ? 35 : 0);
          let frostfireDetonationDamage = 0;
          let meteorSecondTriggered = false;
          const bloodRoarWasActive = !liveAction && bloodRoarStateRef.current.remaining > 0;
          if (playerActs && (bloodRoarWasActive || liveAction?.bloodRoarEmpowered)) setBloodRoarSlashKey(next);
          const markedWasActive = markedRemaining > 0;
          const markExplosionWasActive = markedRemaining === 0 && markExplosionPending;
          let fissureDetonationThisAttack = false;
          let fissureWasActive = false;
          if (playerActs) {
            if (playerClass === "戰士") warriorAttackCount += 1;
            if (skillCooldown > 0) skillCooldown -= 1;
            if (bloodRoarWasActive) {
              bloodRoarStateRef.current.remaining -= 1;
              // 強化攻擊各自播放一次鮮血斬擊；神話裝備會將總數提高至七次。
              // Blade playback is queued after the resolved attack below.
              // 最後一次強化攻擊的命中回饋結束後才收起血焰邊框。
              if (bloodRoarStateRef.current.remaining <= 0) {
                const visualToken = bloodRoarVisualTokenRef.current;
                if (bloodRoarHideTimerRef.current !== null) {
                  window.clearTimeout(bloodRoarHideTimerRef.current);
                }
                bloodRoarHideTimerRef.current = window.setTimeout(() => {
                  if (bloodRoarVisualTokenRef.current === visualToken) {
                    setBloodRoarVisualActive(false);
                    bloodRoarHideTimerRef.current = null;
                  }
                }, 260);
              }
            }
            if (defenseBreakRemaining > 0) defenseBreakRemaining -= 1;
            if (markedRemaining > 0) markedRemaining -= 1;
            else if (markExplosionPending) markExplosionPending = false;
            const learned = skills.filter((skill) => skill.level > 0);
            const hasSkill = (name: string) => liveCombat ? undefined : learned.find((skill) => skill.name === name);
            const executionThreshold = hasPerk("skill-warrior-executioner") ? 8 : 10;
            const executionSkill = playerClass === "戰士" && warriorAttackCount % executionThreshold === 0
              ? hasSkill("處決")
              : undefined;
            const executionReady = Boolean(executionSkill);
            if (!liveCombat && (skillCooldown <= 0 || executionReady)) {
              const candidates = playerClass === "戰士"
                ? [
                    ...(executionSkill ? [{ skill: executionSkill, chance: 1 }] : []),
                    ...(hasSkill("裂地斬") ? [{ skill: hasSkill("裂地斬")!, chance: skillChance(hasSkill("裂地斬")) }] : []),
                  ]
                : playerClass === "遊俠"
                  ? [
                      ...(hasSkill("穿雲箭") ? [{ skill: hasSkill("穿雲箭")!, chance: skillChance(hasSkill("穿雲箭")) }] : []),
                      ...(hasSkill("疾風連射") ? [{ skill: hasSkill("疾風連射")!, chance: skillChance(hasSkill("疾風連射")) }] : []),
                      ...(hasSkill("致命標記") && markedRemaining <= 0 && !markExplosionPending ? [{ skill: hasSkill("致命標記")!, chance: skillChance(hasSkill("致命標記")) }] : []),
                    ]
                  : [
                      ...(hasSkill("霜火新星") ? [{ skill: hasSkill("霜火新星")!, chance: skillChance(hasSkill("霜火新星")) }] : []),
                      ...(hasSkill("奧術回響") ? [{ skill: hasSkill("奧術回響")!, chance: skillChance(hasSkill("奧術回響")) }] : []),
                      ...(hasSkill("隕星術") ? [{ skill: hasSkill("隕星術")!, chance: skillChance(hasSkill("隕星術")) }] : []),
                    ];
              let procRoll = Math.random();
              for (const candidate of candidates) {
                if (procRoll < candidate.chance) {
                  triggered = candidate.skill;
                  break;
                }
                procRoll -= candidate.chance;
              }
              const cooldownRange = playerClass === "戰士" ? 3 : playerClass === "遊俠" ? 6 : 4;
              skillCooldown = cooldownRange + Math.floor(Math.random() * 3);
            }
            if (triggered?.name === "裂地斬") {
              defenseBreakRemaining = 2 + Math.ceil(triggered.level / 2);
              triggeredDefenseIgnore = hasPerk("skill-warrior-titan-axe") ? 35 : 20 + triggered.level * 5;
              triggeredMultiplier = skillMultiplier(triggered.name, triggered.level);
              fissureRemaining = 3;
              showCombatStatus({ name: `破防 ${triggeredDefenseIgnore}%`, target: "enemy", remaining: defenseBreakRemaining + 1, unit: "攻擊", tone: "red" });
            }
            if (triggered?.name === "處決" || triggered?.name === "穿雲箭" || triggered?.name === "霜火新星" || triggered?.name === "奧術回響" || triggered?.name === "隕星術") triggeredMultiplier = skillMultiplier(triggered.name, triggered.level);
            if (triggered?.name === "致命標記") {
              markedRemaining = 5;
              markExplosionPending = true;
              showCombatStatus({ name: `致命標記 +${deadlyMarkBonusPct(triggered.level)}%／爆炸 ${Math.round(deadlyMarkExplosionMultiplier(triggered.level) * 100)}%`, target: "enemy", remaining: 6, unit: "攻擊", tone: "gold" });
            }
            if (triggered?.name === "霜火新星") {
              const burnLevel = triggered.level;
              const burnDamagePerSecond = 1.5 + burnLevel * 0.5;
              if (hasPerk("skill-mage-polar-staff") && burningUntil > Date.now()) {
                const remainingBurnSeconds = Math.max(
                  1,
                  Math.ceil((burningUntil - Date.now()) / 1000),
                );
                frostfireDetonationDamage = Math.round(
                  remainingBurnSeconds * burnDamagePerSecond * 1.5,
                );
                burningUntil = 0;
                nextBurnAt = 0;
              } else {
                burningUntil = Date.now() + 5000;
                nextBurnAt = Date.now() + 1000;
              }
              showCombatStatus({ name: `灼燒 ${1.5 + triggered.level * 0.5}%`, target: "enemy", remaining: 5, unit: "秒", tone: "red" });
            }
            if (fissureRemaining > 0 && !triggered) {
              fissureWasActive = true;
              fissureRemaining -= 1;
              if (fissureRemaining === 0) {
                fissureDetonationThisAttack = true;
              }
            }
            if (
              triggered?.name === "隕星術" &&
              hasPerk("skill-mage-cataclysm-crown") &&
              Math.random() < 0.35
            ) {
              meteorSecondTriggered = true;
              showCombatStatus({ name: "滅世星雨・第二顆隕星", target: "enemy", remaining: 1, unit: "次", tone: "gold" });
            }
          }
          const bloodRoarFinalAttack = playerActs && bloodRoarWasActive && bloodRoarStateRef.current.remaining <= 0;
          const magicShieldExplosionWasActive = playerActs && magicShieldExplosionPending;
          if (magicShieldExplosionWasActive) magicShieldExplosionPending = false;
          let attacks = 1;
          const secondChance = Math.min(
            0.88,
            Math.max(0, (combatAttackSpeed - 100) / 120),
          );
          const thirdChance = Math.min(
            0.42,
            Math.max(0, (combatAttackSpeed - 175) / 170),
          );
          const comboBonus = characterStats.comboChance / 100;
          if (Math.random() < secondChance) attacks++;
          if (Math.random() < comboBonus) attacks++;
          if (Math.random() < thirdChance) attacks++;
          const windVolleyTriggered = triggered?.name === "疾風連射";
          const hunterLevel = skills.find((skill) => skill.name === "獵手本能")?.level ?? 0;
          const critical = liveAction?.critical ?? Math.random() * 100 < Math.min(100, characterStats.crit);
          const hunterChance = hasPerk("skill-ranger-hunter-eye") ? 0.2 : skillProcChance("獵手本能", hunterLevel);
          const hunterBonus = playerClass === "遊俠" && critical && Math.random() < hunterChance;
          if (hunterBonus && !windVolleyTriggered) attacks += 1;
          const windVolleyShotCount = hasPerk("skill-ranger-thousand-feathers") ? 7 : 5;
          const windVolleyCriticals: boolean[] = windVolleyTriggered
            ? Array.from(
                { length: windVolleyShotCount },
                (_, index) =>
                  index === windVolleyShotCount - 1 || Math.random() * 100 < Math.min(100, characterStats.crit),
              )
            : [];
          if (windVolleyTriggered) {
            attacks = windVolleyCriticals.length;
            triggeredMultiplier = windVolleyDamageMultiplier(triggered?.level ?? 1) *
              (hasPerk("skill-ranger-thousand-feathers") ? 1.2 : 1);
            setBattleHits([]);
          }
          // The live skill adapter already rolls hit and critical for every original segment.
          // Legacy random combo segments must not multiply the same skill damage again.
          if (liveAction) attacks = 1;
          const arcaneEchoTriggered = Boolean(
            triggered &&
              hasPerk("skill-mage-akasha-pages") &&
              activeAttackPerks?.arcaneEchoReady,
          );
          if (triggered && hasPerk("skill-mage-akasha-pages")) {
            if (arcaneEchoTriggered) {
              combatPerksRef.current.arcaneEchoReady = false;
              showCombatStatus({ name: "魔法回響・免費施放", target: "player", remaining: 1, unit: "次", tone: "gold" });
            } else {
              combatPerksRef.current.arcaneStacks += 1;
              if (combatPerksRef.current.arcaneStacks >= 4) {
                combatPerksRef.current.arcaneStacks = 0;
                combatPerksRef.current.arcaneEchoReady = true;
                showCombatStatus({ name: "奧術 ×4・下一技能回響", target: "player", remaining: 1, unit: "次", tone: "gold" });
              }
            }
          }
          if (triggered?.name === "穿雲箭") {
            triggeredDefenseIgnore = hasPerk("skill-ranger-sky-piercer")
              ? 60
              : 20 + triggered.level * 5;
          }
          const windCriticalMultiplier = liveAction ? 1 : windVolleyTriggered
            ? windVolleyCriticals.reduce<number>(
                (total, isCritical) => total + (isCritical ? 1 + (characterStats.critDamage + (activeAttackPerks?.nextAttackCritDamage ?? 0)) / 100 : 1),
                0,
              ) / Math.max(1, windVolleyCriticals.length)
            : critical
              ? 1 + (characterStats.critDamage + (activeAttackPerks?.nextAttackCritDamage ?? 0)) / 100
              : 1;
          const skillDamageTriggered = Boolean(triggered || liveAction?.name);
          const blessingEchoMultiplier =
            triggered && hasBlessing("echo")
              ? blessingUpgraded("echo")
                ? 1.9
                : 1.6
              : 1;
          const echoMultiplier = blessingEchoMultiplier * (arcaneEchoTriggered ? 1.6 : 1);
          const attackPerkMultiplier = activeAttackPerks
            ? activeAttackPerks.nextAttackMultiplier *
              (!triggered ? activeAttackPerks.nextBasicAttackMultiplier : 1) *
              (1 + activeAttackPerks.revengeStacks * 0.08) *
              (activeAttackPerks.killBuffRemaining > 0 ? 1.12 : 1) *
              (activeAttackPerks.firstEnemyAttackReady ? 1.3 : 1)
            : 1;
          const hitRoll = Math.random() * 100;
          const combatValues = towerCombatValues({
            secondChapterTuning: mapId === 2,
            combatPower,
            recommendedPower: currentRecommendedPower,
            mapId,
            localFloor: wave,
            tier,
            attacks,
            skillTriggered: skillDamageTriggered,
            setTier: setTriggered ? setTier : 0,
            echoMultiplier,
            skillMultiplier:
              triggeredMultiplier *
              (skillDamageTriggered && hasBlessing("stat-skill") ? (blessingUpgraded("stat-skill") ? 1.4 : 1.18) : 1) *
              (markExplosionWasActive
                ? deadlyMarkExplosionMultiplier(skills.find((skill) => skill.name === "致命標記")?.level ?? 0) * (hasPerk("skill-ranger-queen-contract") ? 1.5 : 1)
                : markedWasActive
                  ? 1 + (deadlyMarkBonusPct(skills.find((skill) => skill.name === "致命標記")?.level ?? 0) * (6 - markedRemaining)) / 100
                  : 1) *
              (bloodRoarWasActive ? 1 + bloodRoarDamageBonus(bloodRoarLevel) / 100 : 1),
            skillDamage: characterStats.skillDamage +
              (activeSetCount >= 8 ? SET_SKILL_DAMAGE_PCT : 0) +
              (!liveAction && skillDamageTriggered && magicShieldCooldown > 0 && hasPerk("skill-mage-eternal-core") ? 25 : 0),
            eliteDamage: 0,
            bossDamage: characterStats.bossDamage,
            bossReduction: characterStats.bossReduction,
            lowHealthDamage: characterStats.lowHealthDamage,
            lowHealthReduction: characterStats.lowHealthReduction,
            lowHealth: playerHp <= 35,
            roll: liveAction ? 0 : hitRoll / 100,
            monsterName: currentEnemyBaseName,
            playerDefense: characterStats.defense,
            playerAttack: offensiveAttack,
            defenseIgnore: triggeredDefenseIgnore,
            playerHit: characterStats.hit,
            monsterEvasionRating:
              monsterRatingsForMap(mapId).evasion,
            playerDamageMultiplier:
              attackPerkMultiplier *
              (fissureWasActive ? 1.3 : 1) *
              (enemyAttackCount === 1 && hasEquippedEpithet(equippedGearRef.current, "chase") ? 1.1 : 1) *
              (critical && enemyAttackCount <= 3 && hasEquippedEpithet(equippedGearRef.current, "charge")
                ? (100 + characterStats.critDamage + 8) / (100 + characterStats.critDamage)
                : 1),
          });
          const baseHpDamage = Math.round(
            combatValues.playerDamage *
              windCriticalMultiplier,
          );
          const setElementalDamage = activeSetCount >= 6
            ? Math.round(combatValues.playerDamage * SET_ELEMENTAL_DAMAGE_PCT / 100) : 0;
          const setResonanceDamage = setTriggered
            ? Math.round(combatValues.playerDamage * SET_RESONANCE_DAMAGE_PCT / 100) : 0;
          let hpDamage = baseHpDamage + setElementalDamage + setResonanceDamage + actionDotDamage;
          if (fissureDetonationThisAttack) hpDamage += Math.round(combatValues.playerDamage);
          if (activeAttackPerks?.ironWallBonus) hpDamage += activeAttackPerks.ironWallBonus;
          if (bloodRoarFinalAttack) hpDamage += Math.round(combatValues.playerDamage * 2.5);
          if (magicShieldExplosionWasActive) hpDamage += Math.round(characterStats.hp * 0.15);
          if (frostfireDetonationDamage > 0) hpDamage += frostfireDetonationDamage;
          if (meteorSecondTriggered) {
            hpDamage += Math.round(
              combatValues.playerDamage * 0.7 * (1 + characterStats.critDamage / 100),
            );
          }
          const effectName = liveAction?.name ?? (bloodRoarFinalAttack
            ? "鮮血怒吼・血爆"
            : magicShieldExplosionWasActive
              ? "魔力護盾・爆炸"
                : fissureDetonationThisAttack
                  ? "裂地斬・裂痕引爆"
                : frostfireDetonationDamage > 0
                  ? "霜火新星・灼燒引爆"
            : setTriggered
            ? "套裝共鳴"
            : markExplosionWasActive
              ? "致命標記・爆炸"
              : triggered
              ? `${triggered.name}${echoMultiplier > 1 ? "・回響" : ""}`
              : null);
          const bloodRoarBurstMissed = bloodRoarFinalAttack && hitRoll > effectiveHit;
          setComboCount(attacks);
          if (effectName) {
            queueSkillVisual(
              { name: effectName, key: next },
              { showVisual: !(effectName === "鮮血怒吼・血爆" && bloodRoarBurstMissed) },
            );
          }
          // A triggering skill can share the empowered final attack. Keep both
          // visuals, but only show the blood burst after the final hit lands.
          if (bloodRoarFinalAttack && !bloodRoarBurstMissed && effectName !== "鮮血怒吼・血爆") {
            queueSkillVisual({ name: "鮮血怒吼・血爆", key: Date.now() }, { showBanner: false });
          }
          else setSkillEffect(null);
          if (!liveAction && triggered?.name === "穿雲箭") {
            setRangerPiercingEffect({ key: next, hit: hitRoll <= effectiveHit });
          }
          if (!liveAction && triggered?.name === "疾風連射") {
            setRangerWindVolleyEffect((current) => [...current, { key: next, shotCount: windVolleyCriticals.length }]);
          }
          if (triggered?.name === "致命標記") {
            setDeadlyMarkEffect({ key: next, detonationKey: null });
            window.setTimeout(triggerRangerImpact, 270);
          }
          if (markExplosionWasActive) {
            setDeadlyMarkEffect((current) => current ? { ...current, detonationKey: next } : current);
            window.setTimeout(triggerRangerImpact, 240);
          }
          if (!liveAction && triggered?.name === "裂地斬") setGroundSplitEffect({ key: next, hit: hitRoll <= effectiveHit });
          if (triggered?.name === "處決") {
            setExecutionEffect({ key: next });
            window.setTimeout(() => {
              setExecutionImpactPulse(true);
              window.setTimeout(() => setExecutionImpactPulse(false), 360);
            }, 750);
          }
          if (liveAction && liveAction.damagePercent <= 0 && actionDotDamage <= 0) {
            if (liveAction.name === "星界寂滅") queueAstralNumbers(next, liveAction, 0, () => {});
            if(liveAction.name==="蒼穹箭雨")
              queueSkyRainNumbers(next,liveAction,0,()=>{},liveCombat?.ascended.has("蒼穹箭雨")??false);
            if (liveAction.name === "閃電鏈") queueLightningNumbers(next, liveAction, 0, () => {}, liveCombat?.ascended.has("閃電鏈") ?? false);
            if (liveAction.name === "虛空崩解") queueVoidNumbers(next, liveAction, 0, () => {}, liveCombat?.ascended.has("虛空崩解") ?? false);
            setMissFeedback(liveAction.name!=="蒼穹箭雨" && liveAction.name!=="星界寂滅" && liveAction.name!=="霜火新星" && liveAction.name!=="閃電鏈" && liveAction.name!=="隕星術" && liveAction.name!=="虛空崩解" && liveAction.hits.length > 0 && liveAction.hits.every((hit) => !hit.hit) ? next : null);
            setLastDamage(0);
            setBattleHits([]);
            setCausePrompt(liveAction.name ? `${liveAction.name}已施放` : "攻擊落空");
            return next;
          }
          if (!liveAction && hitRoll > effectiveHit) {
            setMissFeedback(next);
            setLastDamage(0);
            setBattleHits([]);
            setCausePrompt(
              `命中 ${effectiveHit.toFixed(0)}% − 敵方閃避 ${(100 - effectiveHit).toFixed(0)}% → 攻擊落空`,
            );
            return next;
          }
          setMissFeedback(null);
          const attackDebugParts = [
            effectName ? `特效：${effectName}` : "特效：普通攻擊",
            `命中：${effectiveHit.toFixed(0)}%`,
            critical ? "暴擊" : "普通傷害",
            `攻擊段數：${attacks}`,
            echoMultiplier > 1 ? `奧義餘震：追加 ${Math.round((echoMultiplier - 1) * 100)}%` : null,
            bloodRoarWasActive ? "鮮血怒吼：強化中" : null,
            setTriggered ? `套裝共鳴：${activeSet?.name ?? "未知套裝"}` : null,
            activeSetCount >= 6 ? `元素追加：+${SET_ELEMENTAL_DAMAGE_PCT}%` : null,
            windVolleyTriggered ? `疾風連射：${windVolleyCriticals.length} 段分段` : null,
            markExplosionWasActive ? "致命標記：爆炸段" : null,
            bloodRoarFinalAttack ? "血神降臨：血爆" : null,
            magicShieldExplosionWasActive ? "魔力護盾：過載爆炸" : null,
            fissureDetonationThisAttack ? "大地崩解：裂痕引爆" : null,
          ].filter(Boolean).join("｜");
          setCausePrompt(attackDebugParts);
          const currentAction = ++actionSequence;
          setEnemyHp((h) => {
            if(towerDeathPendingRef.current)return 0;
            if (towerVictoryGuardRef.current.has(targetKey)) return towerDeathPendingRef.current ? 0 : 100;
            const execution =
              hasBlessing("execute") &&
              h <= (blessingUpgraded("execute") ? 35 : 30);
            const executionMythicBonus =
              triggered?.name === "處決" &&
              hasPerk("skill-warrior-executioner") &&
              h <= 25
                ? 2
                : 1;
            const finalMultiplier =
              (execution ? (blessingUpgraded("execute") ? 1.6 : 1.45) : 1) *
              executionMythicBonus *
              (liveAction?.name === "泰坦斷界斬" && hasPerk("skill-warrior-executioner") && h < 25 ? 2 : 1);
            const enemyMaximumHealth = effectiveMonsterMaximumHealth(
              mapId,
              currentRecommendedPower,
              tier,
              currentEnemyBaseName,
            );
            const currentHealth = healthFromPercent(h, enemyMaximumHealth);
            const actionLedger = createSkillDamageLedger(cutoverRoute.battleId, targetKey,
              enemyMaximumHealth, currentHealth);
            const cutover = settleCutoverAction(cutoverRoute, {
              battleId: cutoverRoute.battleId,
              sequence: currentAction,
              rework: {
                ledger: { ...actionLedger, lastActionSequence: currentAction - 1 },
                segments: [{ key: "resolved-player-action", source: "original", hit: hpDamage > 0,
                  damage: Math.round((hpDamage - actionDotDamage) * finalMultiplier) + Math.round(actionDotDamage) }],
              },
            });
            if (cutover.mode !== "rework") throw new Error("Tower battle left the reworked damage route");
            const healthSettlement = settleCombatHealth(h, enemyMaximumHealth, cutover.damage);
            const actualPercentDamage = healthSettlement.percentDamage;
            const totalDisplayedDamage = Math.max(
              1,
              Math.round(healthSettlement.actualDamage),
            );
            let mainDisplayedDamage = Math.min(totalDisplayedDamage,
              Math.round((hpDamage - actionDotDamage - setElementalDamage - setResonanceDamage) * finalMultiplier));
            const elementalDisplayed = Math.min(totalDisplayedDamage - mainDisplayedDamage,
              Math.round(setElementalDamage * finalMultiplier));
            const resonanceDisplayed = Math.min(totalDisplayedDamage - mainDisplayedDamage - elementalDisplayed,
              Math.round(setResonanceDamage * finalMultiplier));
            const dotDisplayedDamage = Math.min(totalDisplayedDamage - mainDisplayedDamage - elementalDisplayed - resonanceDisplayed,
              Math.round(actionDotDamage));
            mainDisplayedDamage += totalDisplayedDamage - mainDisplayedDamage - elementalDisplayed - resonanceDisplayed - dotDisplayedDamage;
            const mythicDisplay = splitMythicDamage(liveAction, mainDisplayedDamage);
            mainDisplayedDamage = mythicDisplay.remaining;
            const groundShockDisplayed = liveAction && liveAction.damagePercent > 0
              ? Math.min(mainDisplayedDamage, Math.round(mainDisplayedDamage * liveAction.groundShockDamagePercent / liveAction.damagePercent)) : 0;
            mainDisplayedDamage -= groundShockDisplayed;
            queueGroundShockNumber(next, groundShockDisplayed);
            const tailwindEchoDisplayed = liveAction && liveAction.damagePercent > 0
              ? Math.min(mainDisplayedDamage, Math.round(mainDisplayedDamage * (liveAction.tailwindEcho?.damagePercent ?? 0) / liveAction.damagePercent)) : 0;
            mainDisplayedDamage -= tailwindEchoDisplayed;
            queueTailwindEchoNumber(next, tailwindEchoDisplayed, liveAction?.tailwindEcho?.critical ?? false);
            const hunterBurstDisplayed = liveAction && liveAction.damagePercent > 0
              ? Math.min(mainDisplayedDamage, Math.round((mainDisplayedDamage + tailwindEchoDisplayed)
                * (liveAction.hunterExplosion?.damagePercent ?? 0) / liveAction.damagePercent)) : 0;
            mainDisplayedDamage -= hunterBurstDisplayed;
            queueHunterBurstNumber(next, hunterBurstDisplayed, liveAction?.hunterExplosion?.critical ?? false);
            const frostfireAfterburstDisplayed = liveAction && liveAction.damagePercent > 0
              ? Math.min(mainDisplayedDamage, Math.round(mainDisplayedDamage * (liveAction.frostfireAfterburst?.damagePercent ?? 0) / liveAction.damagePercent)) : 0;
            mainDisplayedDamage -= frostfireAfterburstDisplayed;
            queueFrostfireAfterburstNumber(next, frostfireAfterburstDisplayed, liveAction?.frostfireAfterburst ?? null);
            const baseHitDamage = Math.floor(mainDisplayedDamage / attacks);
            const remainder = Math.max(0, mainDisplayedDamage - baseHitDamage * attacks);
            const hitDamages = windVolleyTriggered
              ? (() => {
                  const weights = windVolleyCriticals.map((isCritical) =>
                    isCritical ? 1 + (characterStats.critDamage + (activeAttackPerks?.nextAttackCritDamage ?? 0)) / 100 : 1);
                  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
                  const amounts = weights.map((weight) => Math.floor(mainDisplayedDamage * weight / weightTotal));
                  let leftover = mainDisplayedDamage - amounts.reduce((sum, amount) => sum + amount, 0);
                  for (let index = 0; leftover > 0; index = (index + 1) % amounts.length, leftover--) amounts[index]++;
                  return amounts;
                })()
              : Array.from({ length: attacks }, (_, index) =>
                  baseHitDamage + (index < remainder ? 1 : 0),
                );
            const perHitDamage = hitDamages[0] ?? baseHitDamage;
            const publishDamageDisplay = () => {
              showMythicDamage(mythicDisplay.hits);
              if (liveAction?.name === "霜火新星" && liveAction.hits.every(part => !part.hit))
                publishFrostfireNumber(next, 0, false, undefined, true);
              triggerHunterBurst(next);
              if (dotDisplayedDamage > 0) showDotDamage(liveAction?.ticks ?? [], dotDisplayedDamage);
              const elementalHits = [
                ...(elementalDisplayed > 0 ? [{ damage: elementalDisplayed, label: "元素" }] : []),
                ...(resonanceDisplayed > 0 ? [{ damage: resonanceDisplayed, label: "元素爆發" }] : []),
              ];
              if (elementalHits.length) {
                setSetElementalHits((current) => [...current, { key: next,
                  hits: liveAction?.name==="疾風連射"?elementalHits.map((hit)=>({...hit,delayMs:0})):elementalHits,
                  volley: windVolleyTriggered && liveAction?.name!=="疾風連射" }]);
                window.setTimeout(() => setSetElementalHits((current) => current.filter((hit) => hit.key !== next)),
                  windVolleyTriggered ? 1_800 : 1_200);
              }
              if (liveAction?.name === "疾風連射" || liveAction?.name === "星界寂滅" || liveAction?.name === "蒼穹箭雨" || liveAction?.name === "閃電鏈" || liveAction?.name === "隕星術" || liveAction?.name === "虛空崩解") {
                setLastDamage(mainDisplayedDamage);
                return;
              }
              if (windVolleyTriggered) {
                const groupKey = next;
                setBattleHitGroups((current) => [
                  ...current,
                  {
                    key: groupKey,
                    hits: hitDamages.map((damage, index) => ({
                      damage,
                      critical: windVolleyCriticals[index] ?? false,
                      delayMs: 495 + index * 250,
                    })),
                  },
                ]);
                window.setTimeout(() => {
                  setBattleHitGroups((current) => current.filter((group) => group.key !== groupKey));
                }, 495 + (windVolleyCriticals.length - 1) * 250 + 1_200);
              } else {
                const groupKey = next;
                const titan = liveAction?.name === "泰坦斷界斬";
                const ultimate = Boolean(liveAction?.name && SKILL_REWORK_CATALOG[playerClass].some((skill) =>
                  skill.category === "ultimate" && skill.name === liveAction.name));
                setBattleHitGroups((current) => [
                  ...current,
                  {
                    key: groupKey,
                    titan, ultimate, skillName: liveAction?.name ?? undefined,
                    hits: hitDamages.map((damage) => ({
                      damage,
                      critical: critical || triggered?.name === "處決",
                      label: liveAction?.name === "破星狙擊" ? (liveCombat?.ascended.has("破星狙擊") ? "星隕" : "破星") : undefined,
                    })),
                  },
                ]);
                const timer = window.setTimeout(() => {
                  setBattleHitGroups((current) => current.filter((group) => group.key !== groupKey));
                  titanDamageTimersRef.current.delete(groupKey);
                }, titan ? 1_500 : 1_200);
                if (titan) titanDamageTimersRef.current.set(groupKey, timer);
              }
              setLastDamage(perHitDamage);
            };
            // Delay the number until each dedicated VFX reaches its impact:
            // execution frame 6 at 750ms; ground-split frame 5 at 540ms.
            const damageDisplayDelay = triggered?.name === "處決"
              ? 750
              : triggered?.name === "裂地斬"
                ? 540
                : triggered?.name === "隕星術"
                  ? 650
                : markExplosionWasActive || magicShieldExplosionWasActive
                  ? 240
                : 0;
            if (liveAction?.name === "疾風連射") {
              queueVolleyNumbers(next, liveAction, mainDisplayedDamage, publishDamageDisplay);
            } else if (liveAction?.name === "星界寂滅") {
              queueAstralNumbers(next, liveAction, mainDisplayedDamage, publishDamageDisplay);
            } else if (liveAction?.name === "蒼穹箭雨") {
              queueSkyRainNumbers(next, liveAction, mainDisplayedDamage, publishDamageDisplay, liveCombat?.ascended.has("蒼穹箭雨") ?? false);
            } else if (liveAction?.name === "閃電鏈") {
              queueLightningNumbers(next, liveAction, mainDisplayedDamage, publishDamageDisplay, liveCombat?.ascended.has("閃電鏈") ?? false);
            } else if (liveAction?.name === "虛空崩解") {
              queueVoidNumbers(next, liveAction, mainDisplayedDamage, publishDamageDisplay, liveCombat?.ascended.has("虛空崩解") ?? false);
            } else if (liveAction?.name === "隕星術") {
              queueMeteorNumbers(next, liveAction, mainDisplayedDamage, publishDamageDisplay);
            } else if (liveAction?.name === "泰坦斷界斬") {
              pendingTitanDamageRef.current.set(next, publishDamageDisplay);
            } else if (liveAction?.name === "裂地斬") {
              pendingGroundDamageRef.current.set(next, publishDamageDisplay);
            } else if (liveAction?.name === "霜火新星") {
              pendingFrostfireDamageRef.current.set(next, publishDamageDisplay);
            } else if (liveAction?.name === "穿雲箭") {
              pendingPiercingDamageRef.current.set(next, publishDamageDisplay);
            } else if (liveAction?.name === "破星狙擊") {
              pendingStarbreakDamageRef.current.set(next, publishDamageDisplay);
            } else if (liveAction?.name === "追風箭") {
              pendingTailwindDamageRef.current.set(next, publishDamageDisplay);
            } else if (damageDisplayDelay > 0) {
              window.setTimeout(publishDamageDisplay, damageDisplayDelay);
            } else {
              publishDamageDisplay();
            }
            setCausePrompt(
              `${windVolleyTriggered ? "疾風連射：" : ""}攻擊 ${characterStats.attack.toLocaleString()} × 技能 ${Math.round(triggeredMultiplier * 100)}%${combatValues.damageBonusMultiplier > 1 ? ` × 一般增傷 ${combatValues.damageBonusMultiplier.toFixed(2)}` : ""}${critical ? ` × 暴擊 ${(1 + (characterStats.critDamage + (activeAttackPerks?.nextAttackCritDamage ?? 0)) / 100).toFixed(2)}` : ""} × 怪物減傷${activeAttackPerks?.ironWallBonus ? ` × 絕對防禦 +${activeAttackPerks.ironWallBonus}` : ""} → ${attacks} 段，共 ${totalDisplayedDamage.toLocaleString()} 傷害`,
            );
            const temporaryLifesteal = bloodRoarWasActive
              ? bloodRoarLifesteal(bloodRoarLevel)
              : 0;
            const totalLifesteal = Math.min(100, dynamicLifesteal + temporaryLifesteal + (liveAction?.lifestealPercent ?? 0));
            if (bloodRoarFinalAttack) {
              setPlayerHp((health) => Math.max(healthPercentFromDamage(1, characterStats.hp), health * 0.9));
            }
            if ((bloodRoarWasActive || liveAction?.bloodRoarEmpowered) && totalLifesteal > 0 && actualPercentDamage > 0 && playerHp < 100) setBloodReturnKey(next);
            if (totalLifesteal > 0 && actualPercentDamage > 0)
              setPlayerHp((health) =>
                Math.min(
                  100,
                  health + healthPercentFromDamage(
                    (healthFromPercent(actualPercentDamage, enemyMaximumHealth) * totalLifesteal) / 100,
                    characterStats.hp,
                  ),
                ),
              );
            if (triggered?.name === "穿雲箭" && hasPerk("skill-ranger-sky-piercer")) {
              combatPerksRef.current.nextAttackMultiplier = 1.3;
              showCombatStatus({ name: "貫星・下一擊 +30%", target: "player", remaining: 1, unit: "次", tone: "gold" });
            }
            const criticalHitOccurred = windVolleyTriggered
              ? windVolleyCriticals.some(Boolean)
              : critical;
            if (criticalHitOccurred && hasPerk("special-berserker-fist")) {
              combatPerksRef.current.nextBasicAttackMultiplier = 1.2;
              showCombatStatus({ name: "狂擊・下一次普攻 +20%", target: "player", remaining: 1, unit: "次", tone: "red" });
            }
            if (hunterBonus && hasPerk("skill-ranger-hunter-eye")) {
              combatPerksRef.current.nextAttackCritDamage = 40;
              showCombatStatus({ name: "完美獵殺・下一擊暴傷 +40%", target: "player", remaining: 1, unit: "次", tone: "gold" });
            }
            if (healthSettlement.defeated && (liveAction?.name === "蒼穹箭雨" || liveAction?.name === "星界寂滅")) {
              towerDeathPendingRef.current = true;
              const victoryRef = liveAction.name === "星界寂滅" ? pendingAstralVictoryRef : pendingSkyVictoryRef;
              victoryRef.current.set(next, () => {
                towerDeathPendingRef.current = false;
                const health = resolveTowerKill(false, markExplosionWasActive, tier);
                setEnemyHp(health);
              });
              return 0;
            }
            if (healthSettlement.defeated) return queueTowerKill(triggered?.name === "處決", markExplosionWasActive, tier,
              liveAction?.name==="疾風連射"?next:undefined);
            if (!monsterActs || liveAction?.name === "蒼穹箭雨" || liveAction?.name === "星界寂滅") return healthSettlement.remainingPercent;
            setPlayerHp((playerHealth) => {
              const shieldWasActive = magicShieldCooldown > 0;
              if (magicShieldCooldown > 0) magicShieldCooldown -= 1;
              const shieldExpired = shieldWasActive && magicShieldCooldown <= 0;
              let monsterDamage = Math.max(
                1,
                Math.round(
                  combatValues.monsterDamage *
                    (hasBlessing("stat-hp") ? 0.84 : 1) *
                    (hasBlessing("stat-defense") ? 0.87 : 1) *
                    (1 - Math.min(balanceConfig.progression.damageReductionCap, dynamicDamageReduction) / 100),
                ),
              );
              if (!liveCombatRef.current && Math.random() * 100 < effectiveDodge) {
                if (hasPerk("special-shadowwalker")) {
                  combatPerksRef.current.dodgeSpeedAttacks = 3;
                  showCombatStatus({ name: "疾影 +12%攻速", target: "player", remaining: 3, unit: "次", tone: "green" });
                }
                setPlayerHitFeedback({ damage: 0, dodged: true, key: next });
                setEnemyHitFeedback(null);
                setCausePrompt(`實際閃避 ${effectiveDodge}% → 完全避開反擊`);
                return playerHealth;
              }
              const ironWallLevel = skills.find((skill) => skill.name === "鋼鐵壁壘")?.level ?? 0;
              if (playerClass === "戰士" && ironWallLevel > 0 && Math.random() < skillProcChance("鋼鐵壁壘", ironWallLevel)) {
                showCombatStatus({ name: "完全格擋", target: "player", remaining: 1, unit: "次", tone: "blue" });
                if (hasPerk("skill-warrior-fallen-city")) {
                  combatPerksRef.current.ironWallBonus = Math.round(characterStats.defense * 1.5);
                  queueSkillVisual({ name: "鋼鐵壁壘", key: next });
                  showCombatStatus({ name: `絕對防禦 +${combatPerksRef.current.ironWallBonus}`, target: "player", remaining: 1, unit: "次", tone: "gold" });
                }
                setPlayerHitFeedback({ damage: 0, dodged: false, blocked: true, key: next });
                setEnemyHitFeedback(null);
                setCausePrompt("鋼鐵壁壘觸發 → 完全格擋");
                return playerHealth;
              }
              const magicShieldLevel = skills.find((skill) => skill.name === "魔力護盾")?.level ?? 0;
              if (!liveCombatRef.current && playerClass === "法師" && !shieldExpired && magicShieldCooldown <= 0 && magicShieldLevel > 0 && Math.random() < skillProcChance("魔力護盾", magicShieldLevel)) {
                monsterDamage = Math.max(1, Math.round(monsterDamage * (1 - skillReduction("魔力護盾", magicShieldLevel))));
                magicShieldCooldown = 4 + Math.floor(Math.random() * 3);
                queueSkillVisual({ name: "魔力護盾", key: next });
                showCombatStatus({ name: `魔力護盾 -${Math.round(skillReduction("魔力護盾", magicShieldLevel) * 100)}%`, target: "player", remaining: 1, unit: "次", tone: "blue" });
                setCausePrompt(`魔力護盾觸發 → 下一次傷害降低 ${Math.round(skillReduction("魔力護盾", magicShieldLevel) * 100)}%`);
              }
              if (!liveCombatRef.current && shieldExpired && hasPerk("skill-mage-eternal-core")) {
                magicShieldExplosionPending = true;
                queueSkillVisual({ name: "魔力護盾・爆炸", key: next });
                showCombatStatus({ name: "過載爆炸", target: "player", remaining: 1, unit: "次", tone: "gold" });
              }
              if (hasBlessing("blood") && bloodShieldReady) {
                const reduction = blessingUpgraded("blood") ? 0.9 : 0.8;
                monsterDamage = Math.max(
                  1,
                  Math.round(monsterDamage * (1 - reduction)),
                );
                setBloodShieldReady(false);
                setCausePrompt(
                  `血誓護盾觸發 → 首次傷害降低 ${Math.round(reduction * 100)}%`,
                );
              }
              if (liveCombatRef.current) {
                const liveDefense = resolveLiveEnemyAttack(liveCombatRef.current, {
                  healthPercent: playerHealth, maxHealth: characterStats.hp,
                  damage: monsterDamage, baseDodgeChance: effectiveDodge,
                   defense: characterStats.defense, equippedItems: equippedGearRef.current,
                });
                updateManaShield(liveCombatRef.current, liveDefense.manaShield);
                updatePhantomStepVisual(liveCombatRef.current, next, liveDefense.phantomStep);
                if (liveDefense.unyielding) {
                  updateUnyieldingVisual(liveDefense.unyielding, next);
                  setUnyieldingCounterFeedback(liveDefense.unyielding.countered ? next : null);
                }
                monsterDamage = liveDefense.damage;
                if (liveDefense.counterDamagePercent > 0 || (liveDefense.equipmentDamage ?? 0) > 0) {
                  const counter = characterStats.attack * liveDefense.counterDamagePercent / 100 + (liveDefense.equipmentDamage ?? 0);
                  const maximum = effectiveMonsterMaximumHealth(mapId, currentRecommendedPower, tier, currentEnemyBaseName);
                  setEnemyHp((health) => {
                    if(towerDeathPendingRef.current)return 0;
                    if (towerVictoryGuardRef.current.has(targetKey)) return 100;
                    const settled = settleCombatHealth(health, maximum, counter);
                    showCounterDamage(settled.actualDamage, liveDefense.equipmentDamage ? "過載爆炸" : "反擊");
                    return settled.defeated ? queueTowerKill(false, false, tier) : settled.remainingPercent;
                  });
                }
                if (liveDefense.blocked || liveDefense.dodged) {
                  setPlayerHitFeedback({ damage: 0, dodged: liveDefense.dodged && !liveDefense.blocked,
                    blocked: liveDefense.blocked, label: liveDefense.unyielding?.blocked ? "格擋成功！" : undefined, key: next });
                  setCausePrompt(liveDefense.unyielding?.blocked
                    ? `不屈戰意格擋${liveDefense.unyielding.countered ? "並反擊" : "成功"} · 尚餘 ${liveDefense.unyielding.remainingEnemyAttacks} 次`
                    : liveDefense.blocked ? "新版格擋成功" : "新版閃避成功");
                  return playerHealth;
                }
              }
              const healthSettlement = settleCombatHealth(playerHealth, characterStats.hp, monsterDamage);
              const actualDamage = healthSettlement.actualDamage;
              setEnemyHitFeedback({
                damage: actualDamage,
                dodged: false,
                key: next,
              });
              setPlayerHitFeedback({ damage: actualDamage, dodged: false, key: next });
              if (hasPerk("special-revenge-thorn")) {
                combatPerksRef.current.revengeStacks = Math.min(3, combatPerksRef.current.revengeStacks + 1);
              }
              if (healthSettlement.defeated) {
                if (!towerDeathPendingRef.current) {
                  towerDeathPendingRef.current = true;
                  setBattleOn(false);
                  setCausePrompt("生命歸零 → 戰鬥已停止");
                  window.setTimeout(() => finishRun("death", wave), 0);
                }
                return 0;
              }
              return healthSettlement.remainingPercent;
            });
            return healthSettlement.remainingPercent;
          });
          return next;
        });
      },
      tickMs,
    );
    return () => clearInterval(timer);
  }, [
    activeBossBattle,
    blessingUpgraded,
    beginUltimateAnimation,
    bloodRoarLevel,
    characterStats.critDamage,
    characterStats.defense,
    characterStats.enhanceDrop,
    characterStats.hp,
    characterStats.reforgeDrop,
    currentEnemyBaseName,
    currentRecommendedPower,
    equippedCatalogKey,
    hasBlessing,
    playerClass,
    pushLog,
    updateManaShield,
    updateOverload,
    queueSkillVisual,
    triggerHunterBurst,
    updateHunterVisual,
    updateVolleyVisual,
    updateAstralVisual,
    queueAstralNumbers,
    updateSkyRainVisual,
    updateWindDomainVisual,
    updateStarbreakVisual,
    queueLightningNumbers,
    queueVoidNumbers,
    queueMeteorNumbers,
    updateMeteorVisual,
    updateElementSigil,
    updateFrostfireVisual,
    queueFrostfireAfterburstNumber,
    publishFrostfireNumber,
    showDotDamage,
    skills,
    saveReady,
    sessionSuperseded,
    battleOn,
    runSummary,
    currentMap,
    combatPower,
    baseCharacterStats.attack,
    characterStats.attack,
    characterStats.hit,
    characterStats.crit,
    characterStats.dodge,
    characterStats.lifesteal,
    characterStats.expBonus,
    characterStats.goldBonus,
    characterStats.bossDamage,
    characterStats.damageReduction,
    characterStats.skillDamage,
    characterStats.comboChance,
    characterStats.bossReduction,
    characterStats.eliteDamage,
    characterStats.lowHealthDamage,
    characterStats.lowHealthReduction,
    characterStats.resourceDrop,
    characterStats.yuanbaoDrop,
    bloodShieldReady,
    combatAttackSpeed,
    skillReworkBuild,
    skillAscensions,
    blessings,
    currentWaveElite,
    currentWaveGuardian,
    currentWaveBoss,
    wave,
    runStartedAt,
    enemyName,
    mapId,
    level,
    grantExperience,
    setTier,
    activeSetCount,
    activeSet?.name,
    offerBlessings,
    revealBattleDrop,
    effectiveHit,
    effectiveDodge,
  ]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const claim = () => {
    if (!canClaim) return toast.info("至少累積 1 分鐘後才能領取收益");
    setBattleOn(false);
    setOfflineReportOpen(true);
  };

  const claimOfflineReport = async () => {
    if (offlineClaimPendingRef.current || equipmentBusyRef.current || equipmentPendingRef.current) return;
    offlineClaimPendingRef.current = true;
    setOfflineClaimPending(true);
    let claimSeconds = storedSeconds;
    const claimId = pendingIdleClaimIdRef.current ?? crypto.randomUUID();
    pendingIdleClaimIdRef.current = claimId;
    try {
      // Finish a pending autosave before attempting the conditional claim.
      for (let wait = 0; saveInFlightRef.current && wait < 100; wait += 1)
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      if (saveInFlightRef.current) throw new Error("save_busy");
      let claimed = false;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const response = await fetch("/api/save", {
            method: "POST",
            headers: loginHeaders(loginId, true),
            body: JSON.stringify({ playerId, action: "claim_idle", claimId }),
          });
          const result = await response.json().catch(() => ({}));
          if (response.status === 401 || result?.error === "maintenance") {
            pauseSupersededSession(result?.error === "maintenance" ? "maintenance" :
              result?.error === "session_replaced" ? "replaced" : "expired");
            throw new Error(result?.error ?? "session_expired");
          }
          if (response.status === 503 && attempt < 3) {
            await new Promise((resolve) => window.setTimeout(resolve, 200 * (attempt + 1)));
            continue;
          }
          if (!response.ok || result?.ok !== true) throw new Error(result?.error ?? "claim_failed");
          claimSeconds = Math.max(0, Math.min(43200, Number(result.claimedSeconds ?? 0)));
          lastIdleClaimIdRef.current = claimId;
          resetStoredTime(0, result.updatedAt);
          setSaveUpdatedAt(result.updatedAt ?? saveUpdatedAt);
          setSaveStatus("雲端已同步");
          claimed = true;
          break;
        } catch (error) {
          if (error instanceof Error && ["session_replaced", "session_expired", "maintenance"].includes(error.message))
            throw error;
          if (attempt === 3) throw error;
          await new Promise((resolve) => window.setTimeout(resolve, 200 * (attempt + 1)));
        }
      }
      if (!claimed) throw new Error("claim_retry_required");
    } catch {
      offlineClaimPendingRef.current = false;
      setOfflineClaimPending(false);
      toast.error("離線戰果領取失敗", { description: "存檔同步忙碌，請稍候在此視窗再試一次。" });
      return;
    }
    if (!claimSeconds) {
      pendingIdleClaimIdRef.current = null;
      offlineClaimPendingRef.current = false;
      setOfflineClaimPending(false);
      setOfflineReportOpen(false);
      setBattleOn(true);
      toast.info("目前沒有尚未領取的離線收益");
      return;
    }
    const hours = claimSeconds / 3600;
    const simulatedKills = Math.floor(claimSeconds / 12);
    const gainedGold = Math.floor(
      hours * 920 * (1 + characterStats.goldBonus / 100) * offlineSetMultiplier,
    );
    const gainedStones = Math.floor(hours * 6 * offlineSetMultiplier);
    const averageMonsterExp = Math.round(
      (currentMap.exp[0] + currentMap.exp[1]) / 2,
    );
    const gainedExp = Math.round(
      simulatedKills *
        averageMonsterExp *
        EXPERIENCE_MULTIPLIER *
        newcomerExperienceFactor(level) *
        (1 + characterStats.expBonus / 100) *
        offlineSetMultiplier,
    );
    const equipmentCount = Array.from({ length: simulatedKills }).filter(
      () => Math.random() < 0.15,
    ).length;
    const offlineFinds = Array.from({ length: equipmentCount }, (_, index) =>
      createDrop(mapId, "掛機", Date.now() + index),
    );
    let offlineGems: GemStack[] = [];
    let offlineDrillingStones = 0;
    for (let index = 0; index < simulatedKills; index += 1) {
      const gem = rollGemDrop(mapId);
      if (gem) offlineGems = addGemStack(offlineGems, gem);
      if (rollDrillingStoneDrop()) offlineDrillingStones += 1;
    }
    grantExperience(gainedExp);
    setGold((g) => g + gainedGold);
    setEnhanceStones((v) => v + gainedStones);
    if (offlineGems.length) {
      setGemInventory((inventory) =>
        offlineGems.reduce(
          (next, stack) => addGemStack(next, stack, stack.quantity),
          inventory,
        ),
      );
    }
    if (offlineDrillingStones) setDrillingStones((value) => value + offlineDrillingStones);
    addLoot(offlineFinds, "離線戰報");
    setOfflineReportOpen(false);
    setBattleOn(true);
    pushLog(
      "收益",
      `領取離線戰果：擊敗 ${simulatedKills} 隻怪物，獲得 ${gainedExp.toLocaleString()} 經驗、${offlineFinds.length} 件裝備、${offlineGems.reduce((sum, stack) => sum + stack.quantity, 0)} 顆寶石與 ${offlineDrillingStones} 顆打孔石`,
    );
    toast.success("離線戰果已領取", {
      description: `經驗 +${gainedExp.toLocaleString()}・金幣 +${gainedGold.toLocaleString()}・強化石 +${gainedStones}・裝備 +${offlineFinds.length}・寶石 +${offlineGems.reduce((sum, stack) => sum + stack.quantity, 0)}・打孔石 +${offlineDrillingStones}`,
    });
    pendingIdleClaimIdRef.current = null;
    offlineClaimPendingRef.current = false;
    setOfflineClaimPending(false);
  };

  const enhance = () => {
    if (!currentItem) return;
    if (currentItem.enhance >= balanceConfig.progression.maxEnhancement)
      return toast.info("這件裝備已達 +15 強化上限");
    if (gold < goldCost || enhanceStones < stoneCost)
      return toast.error("強化資源不足", {
        description: `需要 ${goldCost.toLocaleString()} 金幣與 ${stoneCost} 顆強化石`,
      });
    const chance = balanceConfig.equipment.enhancementAttempt.successByCurrentLevel[currentItem.enhance] ?? 0;
    const nextEnhance = currentItem.enhance + 1;
    const currentBase = equipmentBaseStats(currentItem);
    const nextBase = equipmentBaseStats(currentItem, nextEnhance);
    const gains = nextBase
      .map((stat, index) => `${stat.name} +${stat.value - currentBase[index].value}`)
      .join("・");
    setGold((g) => g - goldCost);
    setEnhanceStones((v) => v - stoneCost);
    if (Math.random() * 100 <= chance) {
      setItems((old) =>
        old.map((it, i) =>
          i === selectedItem
            ? { ...it, enhance: nextEnhance }
            : it,
        ),
      );
      toast.success(`強化成功！+${nextEnhance}`, {
        description: `${gains}・角色面板已同步更新`,
      });
      pushLog("強化", `${currentItem.name}強化至 +${nextEnhance}，${gains}`);
    } else {
      const failedEnhance = enhancementFailureLevel(currentItem.enhance);
      if (failedEnhance !== currentItem.enhance) {
        setItems((old) =>
          old.map((it, index) =>
            index === selectedItem ? { ...it, enhance: failedEnhance } : it,
          ),
        );
      }
      toast.error("強化失敗", {
        description: failedEnhance < currentItem.enhance
          ? `材料與金幣已消耗，強化降至 +${failedEnhance}。`
          : `材料與金幣已消耗，強化維持 +${failedEnhance}。`,
      });
      pushLog("強化", `${currentItem.name}強化失敗，${failedEnhance < currentItem.enhance ? `降至 +${failedEnhance}` : `維持 +${failedEnhance}`}`);
    }
  };

  const toggleEquip = () => {
    if (!currentItem) return;
    setEquipFeedback({ slot: currentItem.slot, id: Date.now() });
    const isEquipped = equipped.includes(currentItem.id);
    const actualDifference = powerDifferenceForItem(currentItem);
    if (isEquipped) {
      updateEquipped((old) => old.filter((id) => id !== currentItem.id));
      toast.info(`已卸下${currentItem.name}`, {
        description: `綜合戰力 ${actualDifference >= 0 ? "+" : ""}${formatAssessedPower(actualDifference)}`,
      });
      pushLog(
        "裝備",
        `卸下${currentItem.name}，綜合戰力更新為 ${formatAssessedPower(assessedCombatPower + actualDifference)}`,
      );
      return;
    }

    const replaced = items.find(
      (item) => item.slot === currentItem.slot && equipped.includes(item.id),
    );
    updateEquipped((old) => [
      ...old.filter(
        (id) => items.find((item) => item.id === id)?.slot !== currentItem.slot,
      ),
      currentItem.id,
    ]);
    setUnseenItemIds((old) => old.filter((id) => id !== currentItem.id));
    toast.success(`已穿上${currentItem.name}`, {
      description: `${replaced ? `替換${replaced.name}・` : ""}綜合戰力 ${actualDifference >= 0 ? "+" : ""}${formatAssessedPower(actualDifference)}`,
    });
    pushLog(
      "裝備",
      `穿上${currentItem.name}，綜合戰力更新為 ${formatAssessedPower(assessedCombatPower + actualDifference)}`,
    );
  };

  const submitEquipmentAction = async (kind:"reforge"|"drill",targetIndex?:number) => {
    if(!currentItem || !saveReady || equipmentBusyRef.current || skillActionInFlightRef.current || shopPurchaseInFlightRef.current || offlineClaimPendingRef.current || sessionSuperseded)return;
    if(saveInFlightRef.current){requestPrioritySave();return toast.info("進度正在同步，請稍後再試");}
    const pending=equipmentPendingRef.current;
    if(pending&&(pending.kind!==kind||pending.itemId!==currentItem.id||pending.targetIndex!==targetIndex))return toast.info("請先重試上一筆裝備操作，或重新登入確認結果");
    const action=pending??{id:crypto.randomUUID(),kind,itemId:currentItem.id,...(targetIndex===undefined?{}:{targetIndex})};
    equipmentPendingRef.current=action;equipmentBusyRef.current=true;setEquipmentBusy(true);
    try{
      const response=await fetch("/api/save",{method:"POST",headers:loginHeaders(loginId,true),body:JSON.stringify({playerId,action:"equipment",equipmentAction:action})});
      const result=await response.json();
      if(response.status===401){equipmentPendingRef.current=null;pauseSupersededSession(result.error==="session_replaced"?"replaced":"expired");return;}
      if(response.status>=500||response.status===429)throw new Error("equipment_pending");
      if(!response.ok||!result.ok){equipmentPendingRef.current=null;requestPrioritySave();toast.error("裝備操作未完成",{description:"請確認雲端進度已同步、資源充足，且裝備尚有可操作空間。"});return;}
      const updated=result.item as Item;
      setItems(old=>old.map(i=>i.id!==action.itemId?i:kind==="reforge"?{...i,affixes:updated.affixes,affixSchemaVersion:7,reforgeCount:updated.reforgeCount}:{...i,sockets:{socketCount:updated.sockets!.socketCount,gems:Array.from({length:updated.sockets!.socketCount},(_,index)=>normalizeEquipmentSockets(i.sockets).gems[index]??null)}}));
      if(kind==="reforge"){setGold(v=>Math.max(0,v-result.receipt.gold));setReforgeStones(v=>Math.max(0,v-result.receipt.stones));}else setDrillingStones(v=>Math.max(0,v-result.receipt.stones));
      setAdminRevision(result.adminRevision);setSaveUpdatedAt(result.updatedAt);equipmentPendingRef.current=null;
      pushLog("裝備",`${currentItem.name}完成${kind==="drill"?"打孔":targetIndex===undefined?"一般洗鍊":"定向洗鍊"}`);
      toast.success(kind==="drill"?"裝備新增 1 個孔位":"洗鍊完成",{description:kind==="reforge"?`${currentItem.quality}裝備只會產生${currentItem.quality}數值區間・可繼續洗鍊`:"已消耗 1 顆打孔石"});requestPrioritySave();
    }catch{setSaveStatus("等待裝備操作確認");toast.error("連線中斷，請重試相同裝備操作",{description:"重試沿用同一筆操作，不會重複扣費；也可重新登入確認結果。"});}
    finally{equipmentBusyRef.current=false;setEquipmentBusy(false);}
  };
  const reforge = (targeted:boolean) => {
    if(targeted&&targetedAffix===null)return toast.info("請先點選要定向替換的詞綴");
    void submitEquipmentAction("reforge",targeted?targetedAffix??undefined:undefined);
  };
  const drillCurrentItem = () => { void submitEquipmentAction("drill"); };

  const socketSelectedGem = (socketIndex: number) => {
    if (!currentItem || !selectedGem) return toast.info("請先選擇一顆寶石");
    const gem: SocketedGem = { gemId: selectedGem.gemId, tier: selectedGem.tier };
    const currentSockets = normalizeEquipmentSockets(currentItem.sockets);
    if (currentSockets.gems.some((existing) => existing?.gemId === gem.gemId)) {
      return toast.info("同一件裝備不可重複鑲嵌同種類寶石");
    }
    const nextSockets = socketGem(currentSockets, socketIndex, gem);
    if (!nextSockets) return toast.error("這個孔位無法鑲嵌");
    const nextInventory = normalizeGemInventory(gemInventory).map((stack) => ({ ...stack }));
    const source = nextInventory.find((stack) => stack.gemId === gem.gemId && stack.tier === gem.tier);
    if (!source || source.quantity <= 0) return toast.error("寶石數量不足");
    source.quantity -= 1;
    setGemInventory(nextInventory.filter((stack) => stack.quantity > 0));
    setItems((old) => old.map((item) => item.id === currentItem.id ? { ...item, sockets: nextSockets } : item));
    if (source.quantity <= 0) setSelectedGemKey(null);
    const definition = getGemDefinition(gem.gemId, gem.tier);
    pushLog("裝備", `${currentItem.name}鑲嵌${definition.tierLabel}${definition.name}`);
    toast.success("鑲嵌完成", { description: `${gemEffectLabel(definition)}，鑲嵌後不可拆卸` });
  };

  const addGemToFusionCircle = (stack: GemStack) => {
    if (stack.tier === "advanced") return toast.info("高階寶石已達最高階");
    const placed = gemFusionSlots.filter(
      (gem) => gem?.gemId === stack.gemId && gem.tier === stack.tier,
    ).length;
    if (placed >= stack.quantity) return toast.info("這種寶石已全部放入魔法陣");
    const occupiedTier = gemFusionSlots.find(Boolean)?.tier;
    if (occupiedTier && occupiedTier !== stack.tier)
      return toast.info("魔法陣只能放入相同階級的寶石");
    const emptyIndex = gemFusionSlots.findIndex((gem) => !gem);
    if (emptyIndex < 0) return toast.info("三個魔法陣槽位已放滿");
    setGemFusionResult(null);
    setGemFusionSlots((slots) => slots.map((gem, index) =>
      index === emptyIndex ? { gemId: stack.gemId, tier: stack.tier } : gem,
    ));
  };

  const autoFillGemCircle = (mode: "same" | "mixed") => {
    const candidates = [...gemInventory]
      .filter((stack) => stack.tier !== "advanced")
      .sort((a, b) => GEM_TIERS.indexOf(a.tier) - GEM_TIERS.indexOf(b.tier));
    if (mode === "same") {
      const stack = candidates.find((candidate) => candidate.quantity >= 3);
      if (!stack) return toast.info("目前沒有可自動放入的三顆同名寶石");
      setGemFusionSlots(Array.from({ length: 3 }, () => ({ gemId: stack.gemId, tier: stack.tier })));
      setGemFusionResult(null);
      return;
    }
    for (const tier of ["beginner", "intermediate"] as const) {
      const pool = candidates.filter((candidate) => candidate.tier === tier);
      const materials: SocketedGem[] = [];
      for (const stack of pool) {
        for (let index = 0; index < stack.quantity && materials.length < 3; index += 1) {
          materials.push({ gemId: stack.gemId, tier: stack.tier });
        }
      }
      if (materials.length === 3) {
        setGemFusionSlots(materials);
        setGemFusionResult(null);
        return;
      }
    }
    toast.info("目前沒有可自動放入的三顆同階寶石");
  };

  const fuseMagicCircle = () => {
    const materials = gemFusionSlots.filter((gem): gem is SocketedGem => Boolean(gem));
    if (materials.length !== 3) return toast.info("請先在魔法陣放入 3 顆同階寶石");
    const result = fuseGemSelection(gemInventory, materials);
    if (!result) return toast.error("寶石數量或階級不符合合成條件");
    setGemInventory(result.inventory);
    setGemFusionSlots([null, null, null]);
    if (result.success && result.result) {
      const outcome = getGemDefinition(result.result.gemId, result.result.tier);
      setGemFusionResult({ success: true, gem: result.result });
      pushLog("合成", `魔法陣合成成功，獲得${outcome.tierLabel}${outcome.name}`);
      toast.success("魔法陣合成成功", { description: `${outcome.tierLabel}${outcome.name} ×1` });
    } else {
      const preserved = result.preserved
        ? getGemDefinition(result.preserved.gemId, result.preserved.tier)
        : null;
      if (result.preserved) setGemFusionResult({ success: false, gem: result.preserved });
      pushLog("合成", `魔法陣合成失敗，保留${preserved?.tierLabel ?? "原階"}${preserved?.name ?? "寶石"} ×1`);
      toast.error("魔法陣合成失敗", { description: `消耗 2 顆，保留${preserved?.name ?? "原階寶石"} ×1` });
    }
  };

  const sellCurrentItem = () => {
    if (!currentItem) return;
    const usedByLoadout = Object.values(loadouts).some((ids) =>
      ids.includes(currentItem.id),
    );
    if (usedByLoadout) {
      return toast.error("已裝備的物品不能出售", {
        description: "請先從兩套配裝中卸下這件裝備。",
      });
    }
    const reward = saleReturn(currentItem);
    setGold((value) => value + reward.gold);
    setEnhanceStones((value) => value + reward.stones);
    setItems((old) => old.filter((item) => item.id !== currentItem.id));
    setUnseenItemIds((old) => old.filter((id) => id !== currentItem.id));
    setSelectedItem((index) => Math.max(0, Math.min(index, items.length - 2)));
    pushLog(
      "裝備",
      `出售${currentItem.name}，回收 ${reward.gold.toLocaleString()} 金幣與 ${reward.stones} 顆強化石`,
    );
    toast.success("裝備已回收", {
      description: `金幣 +${reward.gold.toLocaleString()}・強化石 +${reward.stones}`,
    });
  };

  const salvageSelectedQualities = () => {
    if (!bulkCandidates.length) {
      setBulkSalvageOpen(false);
      return toast.info("沒有符合條件且未穿戴的裝備");
    }
    const ids = new Set(bulkCandidates.map((item) => item.id));
    setGold((value) => value + bulkReturn.gold);
    setEnhanceStones((value) => value + bulkReturn.stones);
    setItems((old) => old.filter((item) => !ids.has(item.id)));
    setUnseenItemIds((old) => old.filter((id) => !ids.has(id)));
    setSelectedItem(0);
    setBulkSalvageOpen(false);
    pushLog(
      "分解",
      `一鍵分解 ${bulkCandidates.length} 件裝備，獲得 ${bulkReturn.gold.toLocaleString()} 金幣與 ${bulkReturn.stones} 顆強化石`,
    );
    toast.success(`已分解 ${bulkCandidates.length} 件裝備`, {
      description: `金幣 +${bulkReturn.gold.toLocaleString()}・強化石 +${bulkReturn.stones}`,
    });
  };

  const resolveBattleDrop = (action: "keep" | "equip" | "salvage") => {
    if (!lootInspect) return;
    const item = lootInspect.item;
    setBattleDrops((old) => old.filter((drop) => drop.id !== lootInspect.id));
    setLootInspect(null);
    setBattleOn(true);
    if (action === "salvage") {
      const reward = saleReturn(item);
      setGold((value) => value + reward.gold);
      setEnhanceStones((value) => value + reward.stones);
      setItems((old) => old.filter((existing) => existing.id !== item.id));
      setLoadouts(old=>({1:old[1].filter(id=>id!==item.id),2:old[2].filter(id=>id!==item.id)}));
      setUnseenItemIds((old) => old.filter((id) => id !== item.id));
      pushLog(
        "裝備",
        `戰場分解${item.name}，獲得 ${reward.gold} 金幣與 ${reward.stones} 強化石`,
      );
      return toast.success("已轉化為鍛造資源");
    }
    if (action === "equip") {
      if (!items.some((existing) => existing.id === item.id))
        return toast.info("背包已滿，裝備已寄至郵件");
      setLoadouts((old) => ({
        ...old,
        [activeLoadout]: [
          ...old[activeLoadout].filter(
            (id) =>
              items.find((existing) => existing.id === id)?.slot !== item.slot,
          ),
          item.id,
        ],
      }));
      setUnseenItemIds((old) => old.filter((id) => id !== item.id));
      const actualDifference = powerDifferenceForItem(item);
      pushLog(
        "裝備",
        `戰場即時穿上${item.name}，綜合戰力 ${actualDifference >= 0 ? "+" : ""}${formatAssessedPower(actualDifference)}`,
      );
      toast.success(`已穿上${item.name}`, {
        description: `綜合戰力 ${actualDifference >= 0 ? "+" : ""}${formatAssessedPower(actualDifference)}，下一輪生效。`,
      });
    } else {
      setUnseenItemIds((old) => old.filter((id) => id !== item.id));
      toast.success("裝備已自動收入背包");
    }
  };

  const fightBoss = (worldBoss = worldBosses[0]) => {
    if (bossMode === "personal" && bossTickets <= 0)
      return toast.error("今日挑戰次數已用完");
    if (bossMode === "world" && worldAttempts <= 0)
      return toast.error("世界首領攻擊次數已用完");
    if (bossMode === "personal" && (mapBestFloors[selectedBoss.mapId] ?? 0) < selectedBoss.baseFloor)
      return toast.error(`需要通過第 ${selectedBoss.baseFloor} 層才能挑戰`);
    bossMarkedRemainingRef.current = 0;
    bossMarkExplosionPendingRef.current = false;
    setBloodBrandVisual(null);
    worldBossBurnRef.current = { until: 0, nextAt: 0, damagePerSecond: 0 };
    resetCombatPerks();
    if (bossMode === "world") {
      if (!worldBossOpen)
        return toast.error("世界首領僅於每日 12:00—13:00 開放");
      if (!worldBoss.active)
        return toast.info(`${worldBoss.name}尚未降臨`);
      if (level < worldBoss.level)
        return toast.error(`需要 Lv.${worldBoss.level} 才能挑戰${worldBoss.name}`);
      setWorldAttempts((v) => v - 1);
      setWorldRoundDamage(0);
      setWorldBossSecondsLeft(WORLD_BOSS_ROUND_MS / 1_000);
      worldBossDeadlineRef.current = Date.now() + WORLD_BOSS_ROUND_MS;
      setActiveBossBattle({
        name: worldBoss.name,
        level: worldBoss.level,
        hp: worldBoss.hp,
        mode: "world",
        reward: "傷害排名獎勵",
        mapId: 9,
        baseTier: "boss",
        baseFloor: 30,
        recommendedPower: worldBoss.recommendedPower,
        multiplier: 1,
      });
    } else {
      worldBossDeadlineRef.current = null;
      setActiveBossBattle({
        name: selectedBoss.name,
        level: selectedBoss.level,
        hp: selectedBoss.hp,
        mode: "personal",
        reward: selectedBoss.reward,
        mapId: selectedBoss.mapId,
        baseTier: selectedBoss.baseTier,
        baseFloor: selectedBoss.baseFloor,
        recommendedPower: selectedBoss.recommendedPower,
        multiplier: selectedBoss.multiplier,
      });
    }
    setBattleOn(false);
    setBossEnemyHp(100);
    setPresentedEnemyHealth((current)=>({...current,percent:100}));
    setBossPlayerHp(100);
    setLastBossDamage(0);
    setLastBossCounterDamage(0);
    abyssBossSequenceRef.current += 1;
    bossCinematicLockRef.current = false;
    bossRoundEndedRef.current = false;
    setAbyssBossEffect(null);
    setAbyssImpactPulse(false);
    setBossOutcome(null);
    setBattleReport([]);
    setTab("主控");
    setCausePrompt("首領戰接管自動戰鬥");
  };

  useEffect(() => {
    if (
      activeBossBattle?.mode !== "world" ||
      activeBossBattle.name !== "深淵王" ||
      bossOutcome ||
      worldBossDeadlineRef.current === null
    ) return;

    const updateCountdown = () => {
      if (skyRainKeyRef.current !== null || astralKeyRef.current !== null) return;
      const remainingMs = Math.max(0, worldBossDeadlineRef.current! - Date.now());
      setWorldBossSecondsLeft(Math.ceil(remainingMs / 1_000));
      if (remainingMs > 0 || bossRoundEndedRef.current || bossEnemyHpRef.current<=0) return;

      bossRoundEndedRef.current = true;
      worldBossDeadlineRef.current = null;
      const sequence = ++abyssBossSequenceRef.current;
      const executionDamage = 999_999;
      bossCinematicLockRef.current = true;
      setAbyssBossEffect({ key: Date.now() });
      setCausePrompt("時間到——深淵王降下終焉・萬觸葬界");

      window.setTimeout(() => {
        if (abyssBossSequenceRef.current !== sequence) return;
        setAbyssImpactPulse(true);
        window.setTimeout(() => setAbyssImpactPulse(false), 520);
        setPlayerHitFeedback({ damage: executionDamage, dodged: false, key: Date.now() });
        setLastBossCounterDamage(executionDamage);
        setBossPlayerHp(0);
        setBossOutcome("timeout");
        setBattleReport([
          "60 秒到——深淵王施放終焉・萬觸葬界。",
          `萬觸葬界造成 ${executionDamage.toLocaleString()} 傷害，玩家遭到處決。`,
          `本回合對深淵王造成 ${worldRoundDamage.toLocaleString()} 傷害。`,
          `今日累積 ${worldDamage.toLocaleString()} 傷害，已列入世界排行。`,
        ]);
        setCausePrompt(`萬觸葬界命中 → 造成 ${executionDamage.toLocaleString()} 傷害`);
        pushLog("首領", `深淵王以萬觸葬界終結回合・本回合傷害 ${worldRoundDamage}`);
        requestPrioritySave();
      }, 1_030);

      window.setTimeout(() => {
        if (abyssBossSequenceRef.current !== sequence) return;
        bossCinematicLockRef.current = false;
        setAbyssBossEffect(null);
      }, 2_200);
    };

    updateCountdown();
    const countdownTimer = window.setInterval(updateCountdown, 100);
    return () => window.clearInterval(countdownTimer);
  }, [activeBossBattle, bossOutcome, pushLog, requestPrioritySave, worldDamage, worldRoundDamage]);

  // Presentation clock only: never settle DOT damage or mutate the combat session here.
  // It stays independent of attack cadence and ultimate animation locks.
  useEffect(() => {
    if (!saveReady || sessionSuperseded) return;
    const timer = window.setInterval(() => {
      const active = activeBossBattle ? !bossOutcome : battleOn && !runSummary;
      const mage = active && liveCombatRef.current?.characterClass === "法師" ? liveCombatRef.current : null;
      updateOverload(mage);
      const sigilSnapshot = mage ? { target: mage.target,
        expiresAt: mage.combat.session.enemy.elementSigil?.expiresAt ?? 0,
        ascended: (mage.combat as MageCombat).sigil.markedAscended,
        firstAnomalyUsed: (mage.combat as MageCombat).sigil.firstAnomalyUsed } : null;
      const sigilNow = Date.now();
      setElementSigilVisual(previous => {
        if (!sigilSnapshot) return previous.target ? emptyElementSigilVisual() : previous;
        if (previous.target === sigilSnapshot.target &&
          (previous.expiresAt === sigilSnapshot.expiresAt || (!sigilSnapshot.expiresAt && previous.expiresAt <= sigilNow)) &&
          previous.ascended === sigilSnapshot.ascended && previous.firstAnomalyUsed === sigilSnapshot.firstAnomalyUsed) return previous;
        return updateElementSigilVisual(previous, sigilSnapshot, sigilNow);
      });
      setManaShieldVisual(previous => {
        if (!mage) return previous.target ? emptyManaShieldVisual() : previous;
        const shield = (mage.combat as MageCombat).shield;
        if (previous.target === mage.target && previous.value === shield.value && previous.ascended === shield.ascended) return previous;
        return updateManaShieldVisual(previous, mage.target, shield.value, shield.ascended, Date.now());
      });
      const paralysisExpiry = active ? liveCombatRef.current?.combat.session.enemy.paralysis?.expiresAt : undefined;
      setLightningParalysis(current => {
        const next = paralysisExpiry !== undefined && paralysisExpiry > Date.now()
          ? lightningParalysisGateRef.current === paralysisExpiry ? current : paralysisExpiry : undefined;
        return next !== undefined && next > Date.now() ? next : undefined;
      });
      setFrostfireStatuses(current => {
        const next: FrostfireStatusVisual = {};
        for (const kind of ["burn", "freeze"] as const) {
          const expiresAt = active ? liveCombatRef.current?.combat.session.enemy[kind]?.expiresAt : undefined;
          if (expiresAt !== undefined && expiresAt > Date.now()) {
            const visibleExpiry = frostfireGatesRef.current[kind] === expiresAt ? current[kind] : expiresAt;
            if (visibleExpiry !== undefined && visibleExpiry > Date.now()) next[kind] = visibleExpiry;
          }
        }
        return current.burn === next.burn && current.freeze === next.freeze ? current : next;
      });
      setCombatStatuses((current) => {
        const next = refreshCombatStatusCountdowns(current, active ? liveCombatRef.current : null, Date.now());
        return JSON.stringify(current) === JSON.stringify(next) ? current : next;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [saveReady, sessionSuperseded, activeBossBattle, bossOutcome, battleOn, runSummary, updateOverload]);

  const addBossLoot = useEffectEvent(addLoot);

  useEffect(() => {
    if (!saveReady || sessionSuperseded || !activeBossBattle || bossOutcome) return;
    const cutoverRoute = beginSkillBattleCutover({
      battleId: `boss:${activeBossBattle.mode}:${activeBossBattle.name}:${worldBossDeadlineRef.current ?? "personal"}`,
      encounter: activeBossBattle.mode === "world" ? "world-boss" : "personal-boss",
      enableRework: true,
      reworkReady: true,
    });
    let actionSequence = 0;
    liveCombatRef.current = syncLiveCombat(liveCombatRef.current, activeBossBattle,
      activeBossBattle.name, skillReworkBuild, playerClass, level, skillAscensions);
    const tickMs = COMBAT_TICK_MS;
    const bossMonsterName = baseMonsterName(activeBossBattle.name);
    // 個人首領採固定節奏，避免沿用各怪物原始攻速而造成首領間的壓力落差。
    // 殘影：每秒 1 次；真身：每秒 1.25 次（每 0.8 秒一次）。
    const bossAttackSpeed = activeBossBattle.mode === "world"
      ? balanceConfig.combat.worldBoss.attacksPerSecond * 100
      : activeBossBattle.name.endsWith("・真身") ? 125 : 100;
    const cadence=retainCombatCadence(bossCadenceRef.current,activeBossBattle);
    bossCadenceRef.current=cadence;
    let bossSkillCooldown = 0;
    let warriorBossAttackCount = 0;
    let bossPlayerAttackCount = 0;
    const hasPerk = (id: string) => hasCatalogItem(equippedGearRef.current, id);
    const resolveBossVictory = (source: "attack" | "burn") => {
      if (bossRoundEndedRef.current) return 0;
      bossRoundEndedRef.current = true;
      worldBossDeadlineRef.current = null;
      abyssBossSequenceRef.current += 1;
      bossCinematicLockRef.current = false;
      setAbyssBossEffect(null);
      setAbyssImpactPulse(false);
      setDeadlyMarkEffect((current) => current?.detonationKey === null ? null : current);
      setHunterMarkVisual(null);
      setBloodBrandVisual(null);
      setBossOutcome("win");
      setBossPlayerHp(100);
      const report = [
        `每秒攻擊 ${(baseCharacterStats.speed / 100).toFixed(2)} 次，你取得先手（遠征祝福未生效）。`,
        source === "burn" ? "灼燒造成最後一擊。" : "技能與裝備造成最後一擊。",
        `戰鬥勝利｜${activeBossBattle.name}倒下。`,
      ];
      setBattleReport(report);
      if (activeBossBattle.mode === "personal") {
        setBossTickets((value) => value - 1);
        const bossParts = activeBossBattle.name.endsWith("・殘影");
        const bossMapId = Math.max(
          1,
          Number(personalBosses.find((boss) => boss.name === activeBossBattle.name)?.id.split("-")[0] ?? 1),
        );
        const dropCount = Math.random() > 0.55 ? 2 : 1;
        const bossDrops = Array.from({ length: dropCount }, (_, index) =>
          rollCatalogDrop(
            bossMapId,
            bossParts ? "personal-shadow" : "personal-true",
            playerClass,
            index,
          ) ?? createDrop(bossMapId, "首領", index, bossParts ? 3 : 4),
        );
        addBossLoot(
          bossDrops,
          `擊敗${activeBossBattle.name}`,
        );
        const reforgeGain =
          (Number(bossMapId) * 2 - (bossParts ? 1 : 0)) * 4;
        const yuanbaoGain =
          Math.random() * 100 < characterStats.yuanbaoDrop ? 1 : 0;
        setReforgeStones((value) => value + reforgeGain);
        setYuanbao((value) => value + yuanbaoGain);
        setBattleReport((lines) => [
          ...lines,
          `獲得${bossDrops.some((item) => findEquipmentDefinition(item)) ? "神話／特殊傳奇／高階" : bossParts ? "史詩" : "傳奇"}裝備 ${dropCount} 件・洗鍊石 +${reforgeGain}${yuanbaoGain ? `・元寶 +${yuanbaoGain}` : ""}`,
        ]);
      } else {
        const dropCount = 2;
        const worldDrops = Array.from({ length: dropCount }, (_, index) =>
          rollCatalogDrop(9, "world", playerClass, index) ?? createDrop(9, "首領", index, 4),
        );
        addBossLoot(worldDrops, `擊敗${activeBossBattle.name}`);
        setBattleReport((lines) => [
          ...lines,
          `世界首領獎勵：${worldDrops.some((item) => findEquipmentDefinition(item)) ? "神話／特殊傳奇／高階" : "傳奇"}裝備 ${dropCount} 件`,
        ]);
      }
      pushLog("首領", `擊敗 ${activeBossBattle.name}`);
      bossEnemyHpRef.current = 0;
      return 0;
    };
    let bossDamageLedger = createBossDamageLedger(activeBossBattle.hp, bossEnemyHpRef.current);
    let skillDamageLedger = createSkillDamageLedger(cutoverRoute.battleId, activeBossBattle.name,
      activeBossBattle.hp, healthFromPercent(bossEnemyHpRef.current, activeBossBattle.hp));
    const settleBossHit = (rawDamage: number, source: "attack" | "burn", volleyKey?:number) => {
      if (bossRoundEndedRef.current) return settleBossDamageEvent(bossDamageLedger, 0);
      const sequence = ++actionSequence;
      const cutover = settleCutoverAction(cutoverRoute, {
        battleId: cutoverRoute.battleId,
        sequence,
        rework: {
          ledger: skillDamageLedger,
          segments: [{ key: `boss-${source}-${sequence}`, source: source === "burn" ? "dot" : "original",
            hit: rawDamage > 0, damage: rawDamage }],
        },
      });
      if (cutover.mode !== "rework") throw new Error("Boss battle left the reworked damage route");
      skillDamageLedger = cutover.ledger;
      const settled = settleBossDamageEvent(bossDamageLedger, cutover.damage);
      bossDamageLedger = settled.ledger;
      bossEnemyHpRef.current = settled.remainingPercent;
      if (settled.newVictory) {
        const skyKey = skyRainKeyRef.current;
        const astralKey = astralKeyRef.current;
        if (astralKey !== null && ultimateAnimationLockRef.current === astralKey)
          pendingAstralVictoryRef.current.set(astralKey, () => resolveBossVictory(source));
        else if (skyKey !== null && ultimateAnimationLockRef.current === skyKey)
          pendingSkyVictoryRef.current.set(skyKey, () => resolveBossVictory(source));
        else pendingEnemyDefeatRef.current={token:activeBossBattle,queuedAt:performance.now(),volleyKey,finish:()=>resolveBossVictory(source)};
      }
      setBossEnemyHp(settled.remainingPercent);
      return settled;
    };
    const timer = setInterval(
      () => {
        if (ultimateAnimationLockRef.current !== null) return;
        if (bossCinematicLockRef.current || bossRoundEndedRef.current || bossEnemyHpRef.current<=0) return;
        const dotTicks = liveCombatRef.current ? advanceLiveCombatEvents(liveCombatRef.current, Date.now()) : [];
        const liveTickDamage = dotTicks.reduce((sum, event) => sum + event.damage, 0);
        if (liveTickDamage > 0) {
          const settled = settleBossHit(liveTickDamage, "burn");
          showDotDamage(dotTicks, settled.actualDamage);
          if (activeBossBattle.mode === "world" && settled.actualDamage > 0) {
            setWorldDamage((value) => value + settled.actualDamage);
            setWorldRoundDamage((value) => value + settled.actualDamage);
          }
          setLastBossDamage(settled.actualDamage);
          if (settled.defeated) return;
        }
        cadence.player += tickMs;
        const enemyControl = liveEnemyControl(liveCombatRef.current, Date.now());
        cadence.enemy = enemyControl.frozen ? 0 : cadence.enemy + tickMs * enemyControl.speedMultiplier;
        const activeWorldBurn = worldBossBurnRef.current;
        if (
          activeBossBattle.mode === "world" &&
          activeWorldBurn.until > Date.now() &&
          Date.now() >= activeWorldBurn.nextAt
        ) {
          activeWorldBurn.nextAt = Date.now() + 1_000;
          const rawBurnDamage = Math.max(1, activeWorldBurn.damagePerSecond);
          const burnSettlement = settleBossHit(rawBurnDamage, "burn");
          if (burnSettlement.actualDamage > 0) {
            setWorldDamage((value) => value + burnSettlement.actualDamage);
            setWorldRoundDamage((value) => value + burnSettlement.actualDamage);
            setLastBossDamage(burnSettlement.actualDamage);
            const burnKey = Date.now();
            setBattleHitGroups((current) => [...current, {
              key: burnKey,
              hits: [{ damage: burnSettlement.actualDamage, critical: false }],
            }]);
            window.setTimeout(() => {
              setBattleHitGroups((current) => current.filter((group) => group.key !== burnKey));
            }, 1_200);
          }
          if (burnSettlement.defeated) return;
        }
        const playerInterval = 100000 / Math.max(1, combatAttackSpeed);
        const bossInterval = 100000 / bossAttackSpeed;
        const playerActs = cadence.player >= playerInterval;
        let bossActs = !enemyControl.frozen && cadence.enemy >= bossInterval;
        if (!playerActs && !bossActs) return;
        if (playerActs) cadence.player %= playerInterval;
        if (bossActs) cadence.enemy %= bossInterval;
        const next = Date.now();
        setBattlePulse((value) => value + 1);
        setEnemyHitFeedback(null);
        setPlayerHitFeedback(null);
        const liveCombat = liveCombatRef.current;
        const liveAction = playerActs && liveCombat ? resolveLiveCombatAttack(liveCombat, {
          now: next, healthPercent: bossPlayerHpRef.current, attack: characterStats.attack,
          hitChance: hitChanceFromRatings(characterStats.hit,
            20 + activeBossBattle.level * balanceConfig.combat.evasionModel.bossEvasionPerLevel),
          criticalChance: characterStats.crit,
          criticalDamage: characterStats.critDamage, equippedItems: equippedGearRef.current,
        }) : null;
        if (liveEnemyControl(liveCombat, Date.now()).frozen) { bossActs = false; cadence.enemy = 0; }
        if (liveAction?.name && SKILL_REWORK_CATALOG[playerClass].some((skill) =>
          skill.category === "ultimate" && skill.name === liveAction.name)) {
          beginUltimateAnimation(next);
          // If the boss was due on this same tick, hold its attack until the
          // ultimate's animation reports completion.
          if (bossActs) {
            bossActs = false;
            cadence.enemy += bossInterval;
          }
        }
        if (liveAction && liveCombat) {
          updateLiveBloodRoar(liveCombat, liveAction, next);
          updateBloodBrandVisual(liveAction, next);
          updateBerserkerStanceVisual(liveCombat, liveAction, next);
          updateArmorSmashVisual(liveCombat, liveAction, next);
          updateTitanVisuals(liveCombat, liveAction, next);
          updateGroundSplitVisuals(liveAction, next);
          updatePiercingVisual(liveAction, next);
            updateStarbreakVisual(liveCombat, liveAction, next);
            updateElementSigil(liveCombat, liveAction);
          updateFrostfireVisual(liveCombat, liveAction, next);
          updateMeteorVisual(liveAction, next);
          updateOverload(liveCombat);
          updateVolleyVisual(liveAction, next);
            updateAstralVisual(liveCombat, liveAction, next);
            updateSkyRainVisual(liveCombat, liveAction, next);
            updateWindDomainVisual(liveCombat, liveAction, next);
          updateTailwindVisual(liveAction, next);
            updatePhantomStepVisual(liveCombat, next);
            updateHunterVisual(liveCombat, liveAction, next);
        }
        const actionDotDamage = liveAction?.ticks.reduce((sum, event) => sum + event.damage, 0) ?? 0;
        let bossSkillMultiplier = liveAction?.damagePercent ? liveAction.damagePercent / 100 : 1;
        if (liveAction?.name === "泰坦斷界斬" && hasPerk("skill-warrior-executioner")
            && bossEnemyHpRef.current < 25) bossSkillMultiplier *= 2;
        let bossSkill: Skill | null = liveAction?.name
          ? { name: liveAction.name, desc: "", level: skillReworkBuild.ranks[liveAction.name] ?? 1, max: 5, cost: 0 } : null;
        let bossDefenseIgnore = (hasPerk("special-blackfang") ? 8 : 0) + (liveAction?.defenseIgnore ?? 0);
        if (liveAction?.name) queueSkillVisual({ name: liveAction.name, key: next });
        let bossGuaranteedCritical = false;
        const bossCritDamageBonus = 0;
        let bossExecutionDamageMultiplier = 1;
        let bossExecutionTriggered = false;
        let bossGroundSplitTriggered = false;
        let bossMarkMultiplier = 1;
        let bossMarkExplosionWasActive = false;
        let frostfireDetonationDamage = 0;
        let setResonanceTriggered = false;
        if (playerActs) {
          bossPlayerAttackCount += 1;
          setResonanceTriggered =
            activeSetCount >= SET_RESONANCE_ATTACKS &&
            bossPlayerAttackCount % SET_RESONANCE_ATTACKS === 0;
          if (playerClass === "戰士") warriorBossAttackCount += 1;
          const bossMarkLevel = skills.find((skill) => skill.name === "致命標記")?.level ?? 0;
          if (bossMarkedRemainingRef.current > 0) {
            bossMarkMultiplier = 1 + (deadlyMarkBonusPct(bossMarkLevel) * (6 - bossMarkedRemainingRef.current)) / 100;
            bossMarkedRemainingRef.current -= 1;
          } else if (bossMarkExplosionPendingRef.current) {
            bossMarkMultiplier = deadlyMarkExplosionMultiplier(bossMarkLevel) * (hasPerk("skill-ranger-queen-contract") ? 1.5 : 1);
            bossMarkExplosionPendingRef.current = false;
            bossMarkExplosionWasActive = true;
          }
          if (bossSkillCooldown > 0) bossSkillCooldown -= 1;
          const learned = skills.filter((skill) => skill.level > 0);
          const hasSkill = (name: string) => liveCombat ? undefined : learned.find((skill) => skill.name === name);
          const executionThreshold = hasPerk("skill-warrior-executioner") ? 8 : 10;
          const executionSkill = playerClass === "戰士" && warriorBossAttackCount % executionThreshold === 0
            ? hasSkill("處決")
            : undefined;
          const executionReady = Boolean(executionSkill);
          if (!liveCombat && (bossSkillCooldown <= 0 || executionReady)) {
            const candidates = playerClass === "戰士"
              ? [
                  ...(executionSkill ? [{ skill: executionSkill, chance: 1 }] : []),
                  ...(hasSkill("裂地斬") ? [{ skill: hasSkill("裂地斬")!, chance: skillChance(hasSkill("裂地斬")) }] : []),
                ]
              : playerClass === "遊俠"
                ? [
                    ...(hasSkill("穿雲箭") ? [{ skill: hasSkill("穿雲箭")!, chance: skillChance(hasSkill("穿雲箭")) }] : []),
                    ...(hasSkill("疾風連射") ? [{ skill: hasSkill("疾風連射")!, chance: skillChance(hasSkill("疾風連射")) }] : []),
                    ...(hasSkill("致命標記") && bossMarkedRemainingRef.current <= 0 && !bossMarkExplosionPendingRef.current ? [{ skill: hasSkill("致命標記")!, chance: skillChance(hasSkill("致命標記")) }] : []),
                  ]
                : [
                    ...(hasSkill("霜火新星") ? [{ skill: hasSkill("霜火新星")!, chance: skillChance(hasSkill("霜火新星")) }] : []),
                    ...(hasSkill("奧術回響") ? [{ skill: hasSkill("奧術回響")!, chance: skillChance(hasSkill("奧術回響")) }] : []),
                    ...(hasSkill("隕星術") ? [{ skill: hasSkill("隕星術")!, chance: skillChance(hasSkill("隕星術")) }] : []),
                  ];
            let procRoll = Math.random();
            for (const candidate of candidates) {
              if (procRoll < candidate.chance) {
                bossSkill = candidate.skill;
                bossSkillMultiplier = skillMultiplier(candidate.skill.name, candidate.skill.level);
                bossExecutionTriggered = candidate.skill.name === "處決";
                bossGroundSplitTriggered = candidate.skill.name === "裂地斬";
                if (candidate.skill.name === "裂地斬") {
                  bossDefenseIgnore = hasPerk("skill-warrior-titan-axe") ? 35 : 20 + candidate.skill.level * 5;
                }
                if (candidate.skill.name === "穿雲箭") {
                  bossDefenseIgnore = hasPerk("skill-ranger-sky-piercer") ? 60 : 20 + candidate.skill.level * 5;
                }
                if (
                  candidate.skill.name === "處決" &&
                  hasPerk("skill-warrior-executioner") &&
                  bossEnemyHpRef.current <= 25
                ) {
                  bossExecutionDamageMultiplier = 2;
                }
                if (candidate.skill.name === "疾風連射") {
                  const shotCount = hasPerk("skill-ranger-thousand-feathers") ? 7 : 5;
                  bossSkillMultiplier = shotCount * windVolleyDamageMultiplier(candidate.skill.level) *
                    (hasPerk("skill-ranger-thousand-feathers") ? 1.2 : 1);
                }
                if (candidate.skill.name === "霜火新星" && hasPerk("skill-mage-polar-staff")) {
                  bossSkillMultiplier *= 1.5;
                }
                if (candidate.skill.name === "霜火新星" && activeBossBattle.mode === "world") {
                  const burnMagicDamage = Math.max(
                    1,
                    Math.round(
                      characterStats.attack *
                        (0.35 + candidate.skill.level * 0.1) *
                        additiveDamageMultiplier({ skillDamage: characterStats.skillDamage,
                          bossDamage: characterStats.bossDamage, skillTriggered: true, bossTarget: true }),
                    ),
                  );
                  const currentBurn = worldBossBurnRef.current;
                  if (hasPerk("skill-mage-polar-staff") && currentBurn.until > next) {
                    const remainingSeconds = Math.max(1, Math.ceil((currentBurn.until - next) / 1_000));
                    frostfireDetonationDamage = Math.round(
                      remainingSeconds * currentBurn.damagePerSecond * 1.5,
                    );
                    worldBossBurnRef.current = { until: 0, nextAt: 0, damagePerSecond: 0 };
                  } else {
                    worldBossBurnRef.current = {
                      until: next + 5_000,
                      nextAt: next + 1_000,
                      damagePerSecond: burnMagicDamage,
                    };
                  }
                }
                if (candidate.skill.name === "隕星術" && hasPerk("skill-mage-cataclysm-crown") && Math.random() < 0.35) {
                  bossSkillMultiplier += skillMultiplier(candidate.skill.name, candidate.skill.level) * 0.7;
                  bossGuaranteedCritical = true;
                }
                if (candidate.skill.name === "奧義回響" && hasPerk("skill-mage-akasha-pages")) {
                  bossSkillMultiplier *= 1.6;
                }
                if (candidate.skill.name === "致命標記") {
                  bossMarkedRemainingRef.current = 5;
                  bossMarkExplosionPendingRef.current = true;
                  setDeadlyMarkEffect({ key: next, detonationKey: null });
                  window.setTimeout(triggerRangerImpact, 270);
                }
                queueSkillVisual({ name: candidate.skill.name, key: next });
                if (candidate.skill.name === "穿雲箭") {
                  setRangerPiercingEffect({ key: next, hit: true });
                }
                if (candidate.skill.name === "疾風連射")
                  setRangerWindVolleyEffect((current) => [...current, { key: next, shotCount: 5 }]);
                if (candidate.skill.name === "處決") {
                  setExecutionEffect({ key: next });
                  window.setTimeout(() => {
                    setExecutionImpactPulse(true);
                    window.setTimeout(() => setExecutionImpactPulse(false), 360);
                  }, 750);
                }
                if (candidate.skill.name === "裂地斬") setGroundSplitEffect({ key: next, hit: true });
                if (["裂地斬", "致命標記", "霜火新星"].includes(candidate.skill.name)) {
                  showCombatStatus({
                    name: candidate.skill.name === "裂地斬" ? `破防 ${20 + candidate.skill.level * 5}%` : candidate.skill.name === "致命標記" ? `致命標記 +${deadlyMarkBonusPct(candidate.skill.level)}%／爆炸 ${Math.round(deadlyMarkExplosionMultiplier(candidate.skill.level) * 100)}%` : activeBossBattle.mode === "world" ? "灼燒・魔法傷害" : `灼燒 ${1.5 + candidate.skill.level * 0.5}%`,
                    target: "enemy",
                    remaining: candidate.skill.name === "霜火新星" ? 5 : candidate.skill.name === "裂地斬" ? 3 + Math.ceil(candidate.skill.level / 2) : 6,
                    unit: candidate.skill.name === "霜火新星" ? "秒" : "攻擊",
                    tone: candidate.skill.name === "致命標記" ? "gold" : "red",
                  });
                }
                break;
              }
              procRoll -= candidate.chance;
            }
            const cooldownRange = playerClass === "戰士" ? 3 : playerClass === "遊俠" ? 6 : 4;
            if (bossSkillMultiplier > 1) bossSkillCooldown = cooldownRange + Math.floor(Math.random() * 3);
          }
        }
        const bossBaseline = towerCombatValues({
          calibrateMonsterStats: false,
          firstChapterTuning: false,
          secondChapterTuning: false,
          combatPower: activeBossBattle.recommendedPower,
          recommendedPower: activeBossBattle.recommendedPower,
          mapId: activeBossBattle.mapId,
          localFloor: activeBossBattle.baseFloor,
          tier: activeBossBattle.baseTier,
          attacks: 1,
          skillTriggered: false,
          setTier: 0,
          monsterName: bossMonsterName,
          playerDefense: 0,
        });
        const bossValues = personalBossCombatValues({
          mapId: activeBossBattle.mapId,
          localFloor: activeBossBattle.baseFloor,
          attack: characterStats.attack,
          speed: characterStats.speed,
          crit: characterStats.crit,
          critDamage: characterStats.critDamage,
          hit: characterStats.hit,
          bossDamage: characterStats.bossDamage,
          defense: characterStats.defense,
          damageReduction: characterStats.damageReduction,
          dodge: characterStats.dodge,
          comboChance: characterStats.comboChance,
          bossReduction: characterStats.bossReduction,
          lowHealthDamage: characterStats.lowHealthDamage,
          lowHealthReduction: characterStats.lowHealthReduction,
          lowHealth: bossPlayerHpRef.current <= 35,
          playerLevel: level,
          bossLevel: activeBossBattle.level,
          monsterName: bossMonsterName,
          roll: liveAction ? 1 : Math.random(),
          attackRoll: liveAction ? 0 : Math.random(),
          counterRoll: Math.random(),
          playerDamageMultiplier:
            bossSkillMultiplier *
            bossMarkMultiplier *
            bossExecutionDamageMultiplier *
            (hasPerk("special-warhelm") && bossPlayerHpRef.current > 80 ? 1.1 : 1) *
            (bossPlayerAttackCount === 1 && hasEquippedEpithet(equippedGearRef.current, "chase") ? 1.1 : 1),
          skillTriggered: Boolean(bossSkill),
          defenseIgnore: bossDefenseIgnore,
          guaranteedCritical: bossGuaranteedCritical,
          critDamageBonus: bossCritDamageBonus +
            (bossPlayerAttackCount <= 3 && hasEquippedEpithet(equippedGearRef.current, "charge") ? 8 : 0),
          skillDamage:
            characterStats.skillDamage +
            (activeSetCount >= 8 ? SET_SKILL_DAMAGE_PCT : 0) +
            (!liveAction && bossSkill && hasPerk("skill-mage-eternal-core") ? 25 : 0),
          monsterAttack: bossBaseline.monsterDamage,
          monsterDefense: bossBaseline.monsterDefense,
          monsterMultiplier: activeBossBattle.multiplier,
        });
        if (liveAction?.damagePercent === 0) bossValues.playerDamage = 0;
        const bossElementalDamage = playerActs && activeSetCount >= 6
          ? bossValues.playerDamage * SET_ELEMENTAL_DAMAGE_PCT / 100 : 0;
        const bossResonanceDamage = playerActs && setResonanceTriggered
          ? bossValues.playerDamage * SET_RESONANCE_DAMAGE_PCT / 100 : 0;
        const calculatedPlayerDamage = playerActs
          ? bossValues.playerDamage + bossElementalDamage + bossResonanceDamage + frostfireDetonationDamage + actionDotDamage : 0;
        const bossHealthSettlement = playerActs
          ? settleBossHit(calculatedPlayerDamage, "attack",liveAction?.name==="疾風連射"?next:undefined)
          : settleCombatHealth(bossEnemyHpRef.current, activeBossBattle.hp, 0);
        const playerDamage = playerActs ? bossHealthSettlement.actualDamage : 0;
        const settledBossMain = Math.min(playerDamage, bossValues.playerDamage + frostfireDetonationDamage);
        const mythicDisplay = splitMythicDamage(liveAction, settledBossMain);
        const shownBossMain = mythicDisplay.remaining;
        const shownBossElemental = Math.min(playerDamage - settledBossMain, bossElementalDamage);
        const shownBossResonance = Math.min(playerDamage - settledBossMain - shownBossElemental, bossResonanceDamage);
        const shownBossDot = Math.min(playerDamage - settledBossMain - shownBossElemental - shownBossResonance, actionDotDamage);
        if (activeBossBattle.mode === "world" && playerActs) {
          setWorldDamage((value) => value + playerDamage);
          setWorldRoundDamage((value) => value + playerDamage);
        }
        const calculatedBossDamage = bossActs
          ? activeBossBattle.mode === "world"
            ? balanceConfig.combat.worldBoss.damagePerHit
            : Math.round(bossValues.counterDamage)
          : 0;
        let bossDamage = Math.min(
          healthFromPercent(bossPlayerHpRef.current, characterStats.hp),
          calculatedBossDamage,
        );
        let unyieldingBlocked = false;
        if (bossActs && liveCombatRef.current && !bossHealthSettlement.defeated) {
          const defense = resolveLiveEnemyAttack(liveCombatRef.current, {
            healthPercent: bossPlayerHpRef.current, maxHealth: characterStats.hp, damage: bossDamage,
             defense: characterStats.defense, equippedItems: equippedGearRef.current,
          });
          updateManaShield(liveCombatRef.current, defense.manaShield);
          updatePhantomStepVisual(liveCombatRef.current, next, defense.phantomStep);
          if (defense.unyielding) {
            updateUnyieldingVisual(defense.unyielding, next);
            setUnyieldingCounterFeedback(defense.unyielding.countered ? next : null);
          }
          unyieldingBlocked = Boolean(defense.unyielding?.blocked);
          bossDamage = defense.damage;
          if (defense.counterDamagePercent > 0 || (defense.equipmentDamage ?? 0) > 0) {
            const counter = Math.round(characterStats.attack * defense.counterDamagePercent / 100 + (defense.equipmentDamage ?? 0));
            const counterSettlement = settleBossHit(counter, "attack");
            showCounterDamage(counterSettlement.actualDamage, defense.equipmentDamage ? "過載爆炸" : "反擊");
            if (activeBossBattle.mode === "world" && counterSettlement.actualDamage > 0) {
              setWorldDamage((value) => value + counterSettlement.actualDamage);
              setWorldRoundDamage((value) => value + counterSettlement.actualDamage);
            }
          }
        }
        if (playerActs && bossMarkExplosionWasActive) {
          queueSkillVisual({ name: "致命標記・爆炸", key: next });
          setDeadlyMarkEffect((current) => current ? { ...current, detonationKey: next } : current);
          window.setTimeout(triggerRangerImpact, 240);
        }
        if (playerActs && setResonanceTriggered) {
          queueSkillVisual({ name: "套裝共鳴", key: next + 1 });
        }
        if (playerActs) {
          setEnemyHitFeedback({ damage: playerDamage, dodged: playerDamage <= 0, key: next });
          setMissFeedback(liveAction?.name!=="蒼穹箭雨" && liveAction?.name!=="星界寂滅" && liveAction?.name!=="霜火新星" && liveAction?.name!=="閃電鏈" && liveAction?.name!=="隕星術" && liveAction?.name!=="虛空崩解" && playerDamage <= 0 ? next : null);
        }
        if (bossActs)
          setPlayerHitFeedback({ damage: bossDamage, dodged: bossDamage <= 0 && !unyieldingBlocked,
            blocked: unyieldingBlocked, label: unyieldingBlocked ? "格擋成功！" : undefined, key: next });
        if (playerActs) {
          const groundShockDisplayed = liveAction && liveAction.damagePercent > 0
            ? Math.min(shownBossMain, Math.round(shownBossMain * liveAction.groundShockDamagePercent / liveAction.damagePercent)) : 0;
          queueGroundShockNumber(next, groundShockDisplayed);
          const tailwindEchoDisplayed = liveAction && liveAction.damagePercent > 0
            ? Math.min(shownBossMain - groundShockDisplayed,
              Math.round(shownBossMain * (liveAction.tailwindEcho?.damagePercent ?? 0) / liveAction.damagePercent)) : 0;
          queueTailwindEchoNumber(next, tailwindEchoDisplayed, liveAction?.tailwindEcho?.critical ?? false);
          const hunterBurstDisplayed = liveAction && liveAction.damagePercent > 0
            ? Math.min(shownBossMain - groundShockDisplayed - tailwindEchoDisplayed,
              Math.round(shownBossMain * (liveAction.hunterExplosion?.damagePercent ?? 0) / liveAction.damagePercent)) : 0;
          queueHunterBurstNumber(next, hunterBurstDisplayed, liveAction?.hunterExplosion?.critical ?? false);
          const frostfireAfterburstDisplayed = liveAction && liveAction.damagePercent > 0
            ? Math.min(shownBossMain - groundShockDisplayed - tailwindEchoDisplayed - hunterBurstDisplayed,
              Math.round(shownBossMain * (liveAction.frostfireAfterburst?.damagePercent ?? 0) / liveAction.damagePercent)) : 0;
          queueFrostfireAfterburstNumber(next, frostfireAfterburstDisplayed, liveAction?.frostfireAfterburst ?? null);
          const publishBossDamage = () => {
            showMythicDamage(mythicDisplay.hits);
              if (liveAction?.name === "霜火新星" && liveAction.hits.every(part => !part.hit))
                publishFrostfireNumber(next, 0, false, undefined, true);
            triggerHunterBurst(next);
            if (shownBossDot > 0) showDotDamage(liveAction?.ticks ?? [], shownBossDot);
            setLastBossDamage(playerDamage);
            const groupKey = Date.now();
            const titan = liveAction?.name === "泰坦斷界斬";
            const ultimate = Boolean(liveAction?.name && SKILL_REWORK_CATALOG[playerClass].some((skill) =>
              skill.category === "ultimate" && skill.name === liveAction.name));
            if (liveAction?.name !== "疾風連射" && liveAction?.name !== "星界寂滅" && liveAction?.name !== "蒼穹箭雨" && liveAction?.name !== "閃電鏈" && liveAction?.name !== "隕星術" && liveAction?.name !== "虛空崩解" && shownBossMain - groundShockDisplayed - tailwindEchoDisplayed - hunterBurstDisplayed - frostfireAfterburstDisplayed > 0) {
              setBattleHitGroups((current) => [...current, {
                key: groupKey,
                titan, ultimate, skillName: liveAction?.name ?? undefined,
                hits: [{ damage: shownBossMain - groundShockDisplayed - tailwindEchoDisplayed - hunterBurstDisplayed - frostfireAfterburstDisplayed, critical: liveAction?.critical ?? bossValues.critical,
                  label: liveAction?.name === "破星狙擊" ? (liveCombat?.ascended.has("破星狙擊") ? "星隕" : "破星") : undefined }],
              }]);
            }
            const elementalHits = [
              ...(shownBossElemental > 0 ? [{ damage: shownBossElemental, label: "元素" }] : []),
              ...(shownBossResonance > 0 ? [{ damage: shownBossResonance, label: "元素爆發" }] : []),
            ];
            if (elementalHits.length)
              setSetElementalHits((current) => [...current, { key: groupKey,
                hits: liveAction?.name==="疾風連射"?elementalHits.map((hit)=>({...hit,delayMs:0})):elementalHits,volley: false }]);
            const timer = window.setTimeout(() => {
              setBattleHitGroups((current) => current.filter((group) => group.key !== groupKey));
              setSetElementalHits((current) => current.filter((group) => group.key !== groupKey));
              titanDamageTimersRef.current.delete(groupKey);
            }, titan ? 1_500 : 1_200);
            if (titan) titanDamageTimersRef.current.set(groupKey, timer);
          };
          const bossDamageDisplayDelay = bossExecutionTriggered
            ? 750
            : bossGroundSplitTriggered
              ? 540
              : 0;
          if (liveAction?.name === "疾風連射") queueVolleyNumbers(next, liveAction,
            shownBossMain - groundShockDisplayed - tailwindEchoDisplayed - hunterBurstDisplayed, publishBossDamage);
          else if (liveAction?.name === "星界寂滅") queueAstralNumbers(next, liveAction, shownBossMain - groundShockDisplayed - tailwindEchoDisplayed - hunterBurstDisplayed - frostfireAfterburstDisplayed, publishBossDamage);
          else if (liveAction?.name === "蒼穹箭雨") queueSkyRainNumbers(next, liveAction,
            shownBossMain - groundShockDisplayed - tailwindEchoDisplayed - hunterBurstDisplayed, publishBossDamage, liveCombat?.ascended.has("蒼穹箭雨") ?? false);
          else if (liveAction?.name === "閃電鏈") queueLightningNumbers(next, liveAction, shownBossMain, publishBossDamage, liveCombat?.ascended.has("閃電鏈") ?? false);
          else if (liveAction?.name === "虛空崩解") queueVoidNumbers(next, liveAction, shownBossMain - groundShockDisplayed - tailwindEchoDisplayed - hunterBurstDisplayed - frostfireAfterburstDisplayed, publishBossDamage, liveCombat?.ascended.has("虛空崩解") ?? false);
          else if (liveAction?.name === "隕星術") queueMeteorNumbers(next, liveAction, shownBossMain, publishBossDamage);
          else if (liveAction?.name === "泰坦斷界斬") pendingTitanDamageRef.current.set(next, publishBossDamage);
          else if (liveAction?.name === "裂地斬") pendingGroundDamageRef.current.set(next, publishBossDamage);
          else if (liveAction?.name === "霜火新星") pendingFrostfireDamageRef.current.set(next, publishBossDamage);
          else if (liveAction?.name === "穿雲箭") pendingPiercingDamageRef.current.set(next, publishBossDamage);
          else if (liveAction?.name === "破星狙擊") pendingStarbreakDamageRef.current.set(next, publishBossDamage);
          else if (liveAction?.name === "追風箭") pendingTailwindDamageRef.current.set(next, publishBossDamage);
          else if (bossDamageDisplayDelay > 0) window.setTimeout(publishBossDamage, bossDamageDisplayDelay);
          else publishBossDamage();
        }
        if (playerActs && liveAction?.currentHealthCostPercent) setBossPlayerHp(health => {
          const nextHealth = Math.max(healthPercentFromDamage(1, characterStats.hp),
            health * (1 - liveAction.currentHealthCostPercent / 100));
          bossPlayerHpRef.current = nextHealth;
          return nextHealth;
        });
        if (playerActs && liveAction?.bloodRoarEmpowered) setBloodRoarSlashKey(next);
        if (playerActs && liveAction?.bloodRoarEmpowered && playerDamage > 0 && bossPlayerHpRef.current < 100 && characterStats.lifesteal + liveAction.lifestealPercent > 0) setBloodReturnKey(next);
        if (playerActs && playerDamage > 0 && characterStats.lifesteal + (liveAction?.lifestealPercent ?? 0) > 0)
          setBossPlayerHp((health) => {
            const nextHealth = Math.min(
              100,
              health + healthPercentFromDamage(
                (playerDamage * Math.min(100, characterStats.lifesteal + (liveAction?.lifestealPercent ?? 0))) / 100,
                characterStats.hp,
              ),
            );
            bossPlayerHpRef.current = nextHealth;
            return nextHealth;
          });
        if (bossActs)
          setLastBossCounterDamage(bossRoundEndedRef.current ? 0 : bossDamage);
        if (bossActs) setBossPlayerHp((hp) => {
          if (bossRoundEndedRef.current) return hp;
          const healthSettlement = settleCombatHealth(hp, characterStats.hp, bossDamage);
          if (healthSettlement.defeated) {
            if (bossRoundEndedRef.current) return hp;
            bossRoundEndedRef.current = true;
            worldBossDeadlineRef.current = null;
            setBossOutcome("loss");
            setBattleReport([
              `首領壓制了你的防禦。`,
              `生命歸零｜可立即再次挑戰。`,
              activeBossBattle.mode === "world"
                ? "本次傷害存入雲端後列入本期世界排行。"
                : "個人首領失敗不扣門票。",
            ]);
            pushLog("首領", `挑戰 ${activeBossBattle.name} 失敗`);
            bossPlayerHpRef.current = 0;
            return 0;
          }
          const nextHp = healthSettlement.remainingPercent;
          bossPlayerHpRef.current = nextHp;
          return nextHp;
        });
        setCausePrompt(
          playerActs && playerDamage > 0
            ? `玩家攻擊 → 對首領造成 ${playerDamage} 傷害${bossActs ? `・首領反擊 ${bossDamage} 傷害` : ""}`
            : playerActs
              ? `玩家攻擊落空${bossActs ? `・首領反擊 ${bossDamage} 傷害` : ""}`
              : `首領攻擊 → 造成 ${bossDamage} 傷害`,
        );
      },
      tickMs,
    );
    return () => clearInterval(timer);
  }, [
    activeBossBattle,
    characterStats.critDamage,
    beginUltimateAnimation,
    saveReady,
    sessionSuperseded,
    characterStats.hp,
    combatAttackSpeed,
    pushLog,
    updateManaShield,
    updateOverload,
    queueSkillVisual,
    triggerHunterBurst,
    updateHunterVisual,
    updateVolleyVisual,
    updateAstralVisual,
    queueAstralNumbers,
    updateSkyRainVisual,
    updateWindDomainVisual,
    updateStarbreakVisual,
    queueLightningNumbers,
    queueVoidNumbers,
    queueMeteorNumbers,
    updateMeteorVisual,
    updateElementSigil,
    updateFrostfireVisual,
    queueFrostfireAfterburstNumber,
    publishFrostfireNumber,
    showDotDamage,
    skills,
    bossOutcome,
    characterStats.attack,
    characterStats.speed,
    characterStats.crit,
    characterStats.hit,
    characterStats.defense,
    level,
    baseCharacterStats.speed,
    characterStats.bossDamage,
    characterStats.damageReduction,
    characterStats.dodge,
    characterStats.skillDamage,
    characterStats.comboChance,
    characterStats.bossReduction,
    characterStats.lowHealthDamage,
    characterStats.lowHealthReduction,
    characterStats.yuanbaoDrop,
    characterStats.lifesteal,
    equippedCatalogKey,
    activeSetCount,
    playerClass,
    skillReworkBuild,
    skillAscensions,
  ]);

  const leaveBossBattle = () => {
    resetCombatPerks();
    abyssBossSequenceRef.current += 1;
    bossCinematicLockRef.current = false;
    bossRoundEndedRef.current = true;
    worldBossDeadlineRef.current = null;
    setAbyssBossEffect(null);
    setAbyssImpactPulse(false);
    setBloodBrandVisual(null);
    setActiveBossBattle(null);
    setBossOutcome(null);
    setBattleOn(true);
    setTab("主控");
    setPlayerHp(100);
  };

  const hours = Math.floor(storedSeconds / 3600),
    mins = Math.floor((storedSeconds % 3600) / 60),
    secs = Math.floor(storedSeconds % 60);
  const stats = [
    { label: "綜合戰力", value: formatAssessedPower(assessedCombatPower) },
    { label: "攻擊", value: characterStats.attack.toLocaleString() },
    { label: "防禦", value: characterStats.defense.toLocaleString() },
    { label: "每秒攻擊", value: `${(characterStats.speed / 100).toFixed(2)} 次` },
  ];
  const setNumericBonuses: [string, string][] = [
    ...(equippedSetCountAtThreshold(equippedGear, 2) > 0
      ? [["套裝攻擊加成", `+${activeSetAttackBonusPct}%（${equippedSetCountAtThreshold(equippedGear, 2)} 套）`] as [string, string]]
      : []),
    ...(equippedSetCountAtThreshold(equippedGear, 4) > 0
      ? [["套裝離線收益", `+${Math.round((offlineSetMultiplier - 1) * 100)}%`] as [string, string]]
      : []),
    ...(activeSetCount >= 6
      ? [["套裝元素傷害", `+${SET_ELEMENTAL_DAMAGE_PCT}%`] as [string, string]]
      : []),
    ...(activeSetCount >= 8
      ? [["套裝技能傷害", `+${SET_SKILL_DAMAGE_PCT}%`] as [string, string]]
      : []),
    ...(activeSetCount >= 10
      ? [["套裝元素爆發", `每 ${SET_RESONANCE_ATTACKS} 次攻擊 +${SET_RESONANCE_DAMAGE_PCT}%`] as [string, string]]
      : []),
  ];

  return (
    <main className="game-shell">
      <Toaster theme="dark" position="top-center" richColors />
      {sessionSuperseded && (
        <div className="sync-lock-banner" role="alert">
          <strong>
            {sessionEndedReason === "maintenance"
              ? "伺服器已進入維護模式"
              : sessionEndedReason === "suspended"
              ? "帳號目前已停權"
              : sessionEndedReason === "expired"
                ? "登入狀態已失效"
                : sessionEndedReason === "conflict"
                  ? "雲端存檔版本衝突"
                  : "此視窗已由新的登入接管"}
          </strong>
          <span>
            {sessionEndedReason === "maintenance"
              ? "一般玩家的戰鬥與存檔已安全停止，請等待維護完成後重新登入。"
              : sessionEndedReason === "suspended"
              ? "此帳號已停止戰鬥與存檔，且無法登入；如有疑問請聯絡管理員。"
              : sessionEndedReason === "expired"
                ? "為避免覆蓋雲端進度，此視窗已停止戰鬥與存檔。請返回登入畫面後重新登入。"
                : sessionEndedReason === "conflict"
                  ? "偵測到雲端資料已更新，為避免回溯，此視窗已停止戰鬥與存檔。請返回登入畫面後重新載入最新資料。"
                  : "這是舊登入視窗，已停止戰鬥與存檔。請在最新登入的裝置繼續遊戲。"}
          </span>
          <button type="button" onClick={() => onExit()}>返回登入畫面</button>
        </div>
      )}
      {sessionSuperseded && <div className="sync-lock-overlay" aria-hidden="true" />}
      <Dialog open={rebirthOpen} onOpenChange={setRebirthOpen}>
        <DialogContent className="mail-dialog rebirth-dialog">
          <DialogHeader>
            <DialogTitle>開始第 {rebirthCount + 1} 次輪迴</DialogTitle>
            <DialogDescription>
              輪迴後會清空等級、地圖、技能、掛機進度、祝福、背包全部裝備與所有信件；金幣、元寶、強化石與洗鍊石會保留。
            </DialogDescription>
          </DialogHeader>
          <div className="rebirth-summary">
            <div>三圍屬性 +<strong>{REBIRTH_REWARD_PER_TURN.coreStats}%</strong>・經驗值 +<strong>{REBIRTH_REWARD_PER_TURN.experience}%</strong>・金幣 +<strong>{REBIRTH_REWARD_PER_TURN.gold}%</strong></div>
            <div>資源掉落率 +<strong>{REBIRTH_REWARD_PER_TURN.resourceDrop}%</strong>・裝備掉落率 +<strong>{REBIRTH_REWARD_PER_TURN.equipmentDrop}%</strong></div>
            <div>高品質掉落 +<strong>{REBIRTH_REWARD_PER_TURN.highQualityDrop}%</strong>・輪迴天賦 +<strong>{REBIRTH_REWARD_PER_TURN.talentPoints}</strong> 點</div>
          </div>
          <div className="rebirth-talent-actions">
            <span>可用天賦點：<strong>{rebirthPoints}</strong></span>
            <button className="text-btn" disabled={rebirthPoints === 0 && Object.values(rebirthTalents).every((points) => points === 0)} onClick={resetRebirthTalents}>
              重置配點
            </button>
          </div>
          <div className="rebirth-talent-grid">
            {rebirthTalentDefs.map((talent) => (
              <button
                key={talent.id}
                className="talent-card"
                disabled={rebirthPoints <= 0 || rebirthTalents[talent.id] >= talent.max}
                onClick={() => spendRebirthTalent(talent.id)}
              >
                <small>{talent.path}</small>
                <strong>{talent.label}</strong>
                <span>{talent.description}</span>
                <b>{rebirthTalents[talent.id]} / {talent.max}</b>
              </button>
            ))}
          </div>
          <div className="dialog-actions">
            <button className="btn" onClick={() => setRebirthOpen(false)}>稍後再說</button>
            <button className="btn btn-primary" onClick={() => { setRebirthOpen(false); rebirth(); }}>
              確認輪迴
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={mailOpen} onOpenChange={setMailOpen}>
        <DialogContent className="mail-dialog">
          <DialogHeader>
            <DialogTitle>系統郵件</DialogTitle>
            <DialogDescription>
              最多保存 {MAIL_CAPACITY} 件信件，獎勵郵件保留 7 天；裝備會依背包空間分批領取。
            </DialogDescription>
            <button className="btn btn-primary mail-claim-all" disabled={unclaimedMail === 0} onClick={claimAllMail}>
              一鍵領取全部
            </button>
          </DialogHeader>
          <div className="mail-list">
            <GmInboxMessages inbox={gmInbox} />
            {mails.filter(mail=>!mail.expiresAt||Date.parse(mail.expiresAt)>Date.now()).map((mail) => (
              <article key={mail.id} className={mail.claimed ? "claimed" : ""}>
                <div className="mail-mark">
                  <Mail />
                </div>
                <div>
                  <small>{mail.claimed ? "已領取" : "尚未領取"}</small>
                  <h3>{mail.title}</h3>
                  <p>{mail.body}</p>
                  <div className="mail-rewards">
                    {mail.rewards.gold > 0 && (
                      <span>
                        <CircleDollarSign />{" "}
                        {mail.rewards.gold.toLocaleString()}
                      </span>
                    )}
                    {mail.rewards.stones > 0 && (
                      <span>
                        <Zap /> {mail.rewards.stones} 強化石
                      </span>
                    )}
                    {(mail.rewards.yuanbao ?? 0) > 0 && (
                      <span>
                        <Gem /> {mail.rewards.yuanbao} 元寶
                      </span>
                    )}
                    {(mail.rewards.reforgeStones??0)>0&&<span><RefreshCw />{mail.rewards.reforgeStones} 洗鍊石</span>}
                    {mail.rewards.items.length > 0 && (
                      <span><PackageOpen /> {mail.rewards.items.length} 件裝備</span>
                    )}
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  disabled={mail.claimed}
                  onClick={() => claimMail(mail)}
                >
                  {mail.claimed ? "已領取" : "領取"}
                </button>
              </article>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={offlineReportOpen}
        onOpenChange={(open) => {
          if (offlineClaimPendingRef.current || equipmentBusyRef.current || equipmentPendingRef.current) return;
          setOfflineReportOpen(open);
          if (!open && !offlineClaimPending) setBattleOn(true);
        }}
      >
        <DialogContent className="mail-dialog offline-dialog">
          <DialogHeader>
            <DialogTitle>離線期間戰果已結算</DialogTitle>
            <DialogDescription>
              伺服器已整理這次離線期間的戰果，確認後即可領取。
            </DialogDescription>
          </DialogHeader>
          <div className="offline-hero">
            <span>
              <Skull />
            </span>
            <div>
              <small>
                {currentMap.name} · 離線 {hours} 小時 {mins} 分
              </small>
              <h3>
                擊敗{" "}
                {Math.max(1, Math.floor(storedSeconds / 12)).toLocaleString()}{" "}
                隻怪物
              </h3>
              <p>
                遭遇 {Math.floor(storedSeconds / 600)} 隻精英
                {storedSeconds > 3600 ? "，並發現隱藏首領「荒骨觀察者」" : ""}
              </p>
            </div>
          </div>
          <div className="offline-find">
            <p className="eyebrow">RANDOM DROP</p>
            <p>每次模擬擊殺皆有 15% 機率掉落裝備，領取時才進行隨機判定。</p>
          </div>
          <div className="offline-rewards">
            <span>
              <Sparkles /> 約{" "}
              {Math.round(
                Math.floor(storedSeconds / 12) *
                  ((currentMap.exp[0] + currentMap.exp[1]) / 2) *
                  EXPERIENCE_MULTIPLIER *
                  newcomerExperienceFactor(level) *
                  offlineSetMultiplier,
              ).toLocaleString()} 經驗
            </span>
            <span>
              <CircleDollarSign />{" "}
              {Math.floor((storedSeconds / 3600) * 920 * offlineSetMultiplier).toLocaleString()} 金幣
            </span>
            <span>
              <Zap /> {Math.floor((storedSeconds / 3600) * 6 * offlineSetMultiplier)} 強化石
            </span>
            <span>
              <PackageOpen /> 裝備隨機掉落（無保底）
            </span>
          </div>
          <button
            className="btn btn-primary"
            disabled={!canClaim || offlineClaimPending}
            onClick={claimOfflineReport}
          >
            {offlineClaimPending ? "領取中…" : canClaim ? "領取戰果並返回掛機" : "已領取"}
          </button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={blessingOpen}
        onOpenChange={(open) => {
          if (open) setBlessingOpen(true);
        }}
      >
        <DialogContent className="mail-dialog blessing-dialog">
          <DialogHeader>
            <DialogTitle>長夜祝福</DialogTitle>
            <DialogDescription>
              {blessingUnavailable
                ? `檢測出無祝福可用，視窗將於 ${blessingCountdown} 秒後自動關閉`
                : <>長夜祝福僅在九域遠征生效，不影響個人與世界首領。{" "}
              {blessingDrawing
                ? "命運正在洗牌…"
                : `選擇一項力量；${blessingCountdown} 秒後將自動抽取。`}</>}
            </DialogDescription>
          </DialogHeader>
          <div className={`blessing-grid ${blessingDrawing || blessingUnavailable ? "drawing" : ""}`}>
            {blessingDrawing
              ? Array.from({ length: 3 }, (_, index) => (
                  <div className="blessing-back" key={index}>
                    <Sparkles />
                    <b>?</b>
                  </div>
                ))
              : blessingUnavailable
                ? null
                : blessingChoices.map((blessing, index) => (
                  <button
                    className="blessing-reveal"
                    style={{ animationDelay: `${index * 120}ms` }}
                    key={blessing.id}
                    onClick={() => chooseBlessing(blessing)}
                  >
                    <em>0{index + 1}</em>
                    <span>{blessing.tag}</span>
                    <h3>{blessing.name}</h3>
                    <p>{blessing.description}</p>
                    <b>選擇此祝福</b>
                  </button>
                ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!lootInspect}
        onOpenChange={(open) => {
          if (!open) {
            setLootInspect(null);
            setBattleOn(true);
          }
        }}
      >
        <DialogContent className="mail-dialog loot-dialog">
          <DialogHeader>
            <DialogTitle>
              {lootInspect?.elite ? "精英戰利品" : "戰場掉落"}
            </DialogTitle>
            <DialogDescription>
              立即比較並決定去向，不必離開戰鬥畫面。
            </DialogDescription>
          </DialogHeader>
          {lootInspect && (
            <div className="loot-inspect">
              <div
                className={`loot-beam q${qualityOrder.indexOf(lootInspect.item.quality)}`}
                style={
                  {
                    "--loot": qualityColors[lootInspect.item.quality],
                  } as React.CSSProperties
                }
              >
                <EquipmentIcon item={lootInspect.item} className="loot-equipment-art" />
              </div>
              <GearTooltip
                item={lootInspect.item}
                powerDifference={powerDifferenceForItem(lootInspect.item)}
                equippedItem={items.find(
                  (item) =>
                    item.slot === lootInspect.item.slot &&
                    equipped.includes(item.id),
                )}
              />
              <div className="loot-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => resolveBattleDrop("equip")}
                >
                  立即穿上
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => resolveBattleDrop("keep")}
                >
                  收入背包
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => resolveBattleDrop("salvage")}
                >
                  分解回收
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={reforgeOpen}
        onOpenChange={(open) => {
          setReforgeOpen(open);
          if (!open) {
            setReforgeMode("idle");
            setTargetedAffix(null);
          }
        }}
      >
        <DialogContent className="mail-dialog reforge-dialog">
          <DialogHeader>
            <DialogTitle>裝備洗鍊</DialogTitle>
            <DialogDescription>
              一般洗鍊會重置全部詞綴；定向洗鍊只替換指定詞綴。兩種方式共用這件裝備的累計次數，每次洗鍊後費用增加 1.25 倍，金幣與洗鍊石數量皆向上取整。
            </DialogDescription>
          </DialogHeader>
          {currentItem && (
            <div className="reforge-body">
              <div className="reforge-item">
                <EquipmentIcon item={currentItem} className="reforge-equipment-art" />
                <span>
                  <small style={{ color: qualityColors[currentItem.quality] }}>
                    {currentItem.quality} · {currentItem.slot}
                  </small>
                   <b><EquipmentName item={currentItem} /></b>
                </span>
              </div>
              <div
                className={`affix-picker ${reforgeMode === "target" ? "enabled" : "locked"}`}
              >
                {currentItem.affixes.map((affix, index) => (
                  <button
                    disabled={reforgeMode !== "target"}
                    key={`${affix}-${index}`}
                    className={targetedAffix === index ? "active" : ""}
                    onClick={() => setTargetedAffix(index)}
                  >
                    <span>{displayAffix(affix)}</span>
                    <small>
                      {reforgeMode !== "target"
                        ? affixRangeLabel(currentItem, affix)
                        : targetedAffix === index
                          ? `定向目標・${affixRangeLabel(currentItem, affix)}`
                          : `點擊指定・${affixRangeLabel(currentItem, affix)}`}
                    </small>
                  </button>
                ))}
              </div>
              <div className="reforge-actions">
                <button
                  className="btn btn-ghost"
                  disabled={equipmentBusy}
                  onClick={() => reforge(false)}
                >
                  <RefreshCw />
                  一般洗鍊<small>{normalReforgeCost.gold.toLocaleString()} 金幣＋{normalReforgeCost.stones} 洗鍊石（第 {currentReforgeCount + 1} 次）</small>
                </button>
                {reforgeMode === "idle" ? (
                  <button
                    className="btn btn-primary"
                    onClick={() => setReforgeMode("target")}
                  >
                    <Sparkles />
                    進入定向洗鍊<small>再選擇一條詞綴</small>
                  </button>
                ) : (
                  <button
                    className="btn btn-primary"
                    disabled={equipmentBusy || targetedAffix === null}
                    onClick={() => reforge(true)}
                  >
                    <Sparkles />
                    確認定向洗鍊<small>{targetedReforgeCost.gold.toLocaleString()} 金幣＋{targetedReforgeCost.stones} 洗鍊石（第 {currentReforgeCount + 1} 次）</small>
                  </button>
                )}
              </div>
              <p>持有：{reforgeStones} 顆洗鍊石</p>
              <small className="reforge-note">
                資源掉落率會同時提高強化石與洗鍊石掉落機率；元寶掉率只會出現在項鍊與披風，範圍為 1%～3%。
              </small>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={gemWorkshopOpen} onOpenChange={setGemWorkshopOpen}>
        <DialogContent className="mail-dialog gem-workshop-dialog">
          <DialogHeader>
          <DialogTitle>裝備鑲嵌</DialogTitle>
            <DialogDescription>
              打孔與鑲嵌會立即寫入雲端存檔；已鑲嵌的寶石不可拆卸。
            </DialogDescription>
          </DialogHeader>
          <div className="gem-workshop-body">
            <section className="socket-workbench">
              <div className="gem-section-head">
                <div>
                  <b>裝備鑲嵌</b>
                  <small>打孔石 {drillingStones} 顆</small>
                </div>
                {currentItem && (
                  <button
                    className="btn btn-ghost"
                    disabled={equipmentBusy || normalizeEquipmentSockets(currentItem.sockets).socketCount >= 2 || drillingStones <= 0}
                    onClick={drillCurrentItem}
                  >
                    新增孔位
                  </button>
                )}
              </div>
              {currentItem ? (
                <>
                  <div className="gem-equipment-summary">
                    <EquipmentIcon item={currentItem} className="reforge-equipment-art" />
                    <span>
                      <small style={{ color: qualityColors[currentItem.quality] }}>{currentItem.quality} · {currentItem.slot}</small>
                       <b><EquipmentName item={currentItem} /></b>
                    </span>
                  </div>
                  <div className="socket-row">
                    {normalizeEquipmentSockets(currentItem.sockets).gems.map((gem, index) => {
                      const definition = gem ? getGemDefinition(gem.gemId, gem.tier) : null;
                      return (
                        <button
                          key={index}
                          className={definition ? "filled" : "empty"}
                          disabled={Boolean(definition)}
                          onClick={() => socketSelectedGem(index)}
                        >
                          {definition ? <NextImage unoptimized width={256} height={256} loading="eager" src={definition.icon} alt="" /> : <Gem />}
                          <span>{definition ? `${definition.tierLabel}${definition.name}` : selectedGem ? "鑲嵌所選寶石" : "空孔位"}</span>
                          <small>{definition ? gemEffectLabel(definition) : "先從下方選擇寶石"}</small>
                        </button>
                      );
                    })}
                    {normalizeEquipmentSockets(currentItem.sockets).socketCount === 0 && (
                      <p className="gem-empty-note">此裝備沒有孔位，可消耗 1 顆打孔石新增。</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="gem-empty-note">請先在背包選擇一件裝備。</p>
              )}
            </section>

            <section>
              <div className="gem-section-head">
                <div>
                  <b>選擇鑲嵌寶石</b>
                  <small>點選寶石後，再點上方空孔位完成鑲嵌。</small>
                </div>
                <button className="btn btn-ghost" onClick={() => { setGemWorkshopOpen(false); setTab("寶石"); }}>
                  前往寶石分頁
                </button>
              </div>
              <div className="gem-inventory-grid">
                {[...gemInventory]
                  .sort((a, b) => GEM_TIERS.indexOf(a.tier) - GEM_TIERS.indexOf(b.tier) || a.gemId.localeCompare(b.gemId))
                  .map((stack) => {
                    const definition = getGemDefinition(stack.gemId, stack.tier);
                    const key = gemStackKey(stack);
                    return (
                      <div key={key} className={`gem-stack-card socket-gem-card ${selectedGemKey === key ? "selected" : ""}`}>
                        <button className="gem-select" onClick={() => setSelectedGemKey(key)}>
                          <NextImage unoptimized width={256} height={256} loading="eager" src={definition.icon} alt="" />
                          <span><b>{definition.tierLabel}{definition.name}</b><small>{gemEffectLabel(definition)} · 持有 {stack.quantity}</small></span>
                        </button>
                      </div>
                    );
                  })}
                {!gemInventory.length && <p className="gem-empty-note">尚未獲得寶石。擊敗各地圖怪物有機率掉落。</p>}
              </div>
            </section>

          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={bulkSalvageOpen} onOpenChange={setBulkSalvageOpen}>
        <AlertDialogContent className="sale-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>一鍵分解裝備</AlertDialogTitle>
            <AlertDialogDescription>
              將分解 {bulkCandidates.length} 件未穿戴裝備，獲得{" "}
              {bulkReturn.gold.toLocaleString()} 金幣與 {bulkReturn.stones} 顆強化石。
              配裝一、配裝二使用中的裝備均已排除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="quality-filter-grid">
            {qualityOrder.map((quality) => (
              <button
                key={quality}
                className={bulkQualities.includes(quality) ? "active" : ""}
                style={{ "--q": qualityColors[quality] } as React.CSSProperties}
                onClick={() =>
                  setBulkQualities((old) =>
                    old.includes(quality)
                      ? old.filter((item) => item !== quality)
                      : [...old, quality],
                  )
                }
              >
                {quality}
              </button>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkCandidates.length === 0}
              onClick={salvageSelectedQualities}
            >
              確認分解
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <aside className="sidebar">
        <div className="brand">
          <span>
            <Skull />
          </span>
          <div>
            <strong>暗黑世界</strong>
            <small>DARK WORLD</small>
          </div>
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = navIcons[item];
            return (
              <button
                key={item}
                className={tab === item ? "active" : ""}
                onClick={() => setTab(item)}
              >
                <Icon size={18} />
                <span>{item}</span>
                {item === "背包" && unseenItemIds.length > 0 && (
                  <em>{unseenItemIds.length}</em>
                )}
                {item === "技能" && availableSkillPoints > 0 && (
                  <em>{availableSkillPoints}</em>
                )}
              </button>
            );
          })}
          {isGm && (
            <button
              className={adminOpen ? "active" : ""}
              onClick={() => setAdminOpen(true)}
              type="button"
              aria-label="GM 管理"
            >
              <Shield />
              <span>GM 管理</span>
            </button>
          )}
        </nav>
        {isGm && (
          <div className="gm-tools">
            <button className="side-exit" onClick={() => setAdminOpen(true)}>
              <Shield size={16} />
              GM 管理
            </button>
          </div>
        )}
      </aside>
      <div className="game-main">
        <header className="topbar">
          <div className="topbar-scroll">
            <div className="mobile-brand">
              <Skull size={18} />
              <strong>暗黑世界</strong>
            </div>
            <div className="player-block">
              <div className="avatar">
                {rebirthCount > 0 ? (
                  <NextImage unoptimized width={256} height={256} loading="eager" src={characterAvatarPath(playerClass, rebirthCount)} alt={`${playerClass}頭像`} />
                ) : (
                  <NextImage unoptimized width={256} height={256} loading="eager" src={`/characters/${characterSlug(playerClass)}-head.webp`} alt={`${playerClass}頭像`} />
                )}
              </div>
              <div>
                <strong>{playerName}</strong>
                <span>
                  Lv.{level} · {playerClass}
                </span>
              </div>
            </div>
            <div className="exp-block">
              <div>
                <span>經驗值</span>
                <b>
                  {level >= 100
                    ? "MAX"
                    : `${Math.floor(exp).toLocaleString()}／${requiredExperience.toLocaleString()}`}
                </b>
              </div>
              <Meter value={experienceProgress} />
            </div>
            <div className="currency">
              <span className="save-status">{saveStatus}</span>
              <span title="金幣">
                <CircleDollarSign /> {gold.toLocaleString()}
              </span>
              <span title="元寶">
                <Gem /> {yuanbao.toLocaleString()}
              </span>
              <span title="強化石">
                <Sparkles /> {enhanceStones.toLocaleString()}
              </span>
              <span title="洗鍊石">
                <WandSparkles /> {reforgeStones.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="topbar-actions">
            <button
              title="郵件"
              aria-label={`系統郵件，${unclaimedMail} 封未領取，${gmInbox.unread} 封 GM 未讀訊息`}
              onClick={() => setMailOpen(true)}
            >
              <Mail />
              {unclaimedMail + gmInbox.unread > 0 && <i>{unclaimedMail + gmInbox.unread}</i>}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button title="設定" aria-label="開啟設定選單">
                  <Settings />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="game-settings-menu">
                <DropdownMenuLabel>設定</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {isGm && (
                  <DropdownMenuItem onSelect={() => setAdminOpen(true)}>
                    <Shield />
                    GM 管理
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="game-settings-exit"
                  onSelect={() => onExit()}
                >
                  <LogOut />
                  離開角色
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <div className="content-wrap">
          {tab === "主控" && (
            <div className="dashboard-grid">
              <div className="stack">
                <Panel className="hero-panel">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">
                        {activeBossBattle
                          ? `${activeBossBattle.mode === "world" ? "WORLD" : "PERSONAL"} BOSS`
                          : `FLOOR ${String(wave).padStart(2, "0")} / 30 · ${currentMap.name}`}
                      </p>
                      <h2>
                        {activeBossBattle?.name ??
                          (currentWaveBoss || currentWaveGuardian || currentWaveElite
                            ? currentEnemyBaseName
                            : currentMap.name)}
                      </h2>
                      {!activeBossBattle && (currentWaveBoss || currentWaveGuardian || currentWaveElite) && (
                        <small className="suppression-badge elite">{towerTierLabel(currentCombatTier)}</small>
                      )}
                      {!activeBossBattle && currentSuppression.tier !== "none" && (
                        <small className="suppression-badge realm-suppression">{suppressionLabels[currentSuppression.tier]}</small>
                      )}
                    </div>
                    <span
                      className={`status ${battleOn || activeBossBattle ? "on" : ""}`}
                    >
                      {activeBossBattle
                        ? bossOutcome
                          ? bossOutcome === "win"
                            ? "討伐成功"
                            : bossOutcome === "timeout"
                              ? "挑戰結算"
                              : "挑戰失敗"
                          : "◆ 首領戰鬥中"
                        : runSummary
                          ? runSummary.outcome === "complete" ? "通關完成" : "你已死亡"
                        : battleOn
                          ? currentWaveBoss
                            ? "◆ 地圖首領戰鬥中"
                            : currentWaveGuardian
                            ? "◆ 守關戰鬥中"
                            : currentWaveElite
                              ? "◆ 精英戰鬥中"
                              : "● 自動戰鬥中"
                          : "已暫停"}
                    </span>
                  </div>
                  <div
                    className={`battle-stage ${astralVisual ? "astral-active" : ""} ${skyRainVisual ? "sky-queen-active" : ""} ${overloadVisual.enabled && (overloadVisual.phase !== "idle" || overloadVisual.charge > 0) ? "overload-active" : ""} ${activeBossBattle || currentWaveBoss || currentWaveElite || currentWaveGuardian ? "elite-stage" : ""} ${setTier > 0 ? "set-awakened" : ""} ${rangerImpactPulse ? "ranger-impact" : ""} ${executionImpactPulse ? "execution-impact" : ""} ${abyssImpactPulse ? "abyss-impact" : ""} ${voidVisuals.length ? "void-active" : ""} ${meteorVisuals.length ? "meteor-active" : ""} ${skillEffect && normalizeCombatEffectName(skillEffect.name) === "奧術回響" ? "arcane-echo-impact" : ""} ${skillEffect && !["星界寂滅", "虛空崩解", "奧術超載", "隕星術", "霜火新星", "元素蝕印", "裂地斬", "處決", "泰坦斷界斬", "穿雲箭", "追風箭", "獵殺標記", "疾風連射", "風行領域", "破星狙擊", "蒼穹箭雨"].includes(normalizeCombatEffectName(skillEffect.name)) ? `impact-${impactTier(skillEffect.name)}` : ""}`}
                    style={
                      { "--map-tone": currentMap.tone } as React.CSSProperties
                    }
                  >
                    {activeBossBattle?.mode === "world" && activeBossBattle.name === "深淵王" && (
                      <div className={`world-boss-countdown ${worldBossSecondsLeft <= 5 && !bossOutcome ? "danger" : ""}`}>
                        <Clock3 />
                        <span>本回合</span>
                        <strong>{String(Math.floor(worldBossSecondsLeft / 60)).padStart(2, "0")}:{String(worldBossSecondsLeft % 60).padStart(2, "0")}</strong>
                        <small>{presentedWorldRoundDamage.toLocaleString()} 傷害</small>
                      </div>
                    )}
                    <div
                      className={`fighter player ${battlePulse % 2 ? "strike" : ""} ${comboCount > 1 ? "rapid" : ""} ${bloodRoarVisualActive ? "blood-roar-active" : ""} ${skillEffect ? `skill-active-${skillVisualByName[skillEffect.name] ?? ""}` : ""} appearance-${selectedAppearance}`}
                    >
                      <CharacterAppearanceVfx
                        id={selectedAppearance}
                        className="combat-frame-wings"
                      />
                      <div className={`fighter-frame player-frame ${battleOn && battlePulse > 0 ? `attack-pulse-${battlePulse % 2}` : ""} ${playerHitFeedback && !playerHitFeedback.dodged ? `player-hit-impact-${playerHitFeedback.key % 2}` : ""}`}>
                        <BloodRoarBuffVfx active={bloodRoarVisualActive} />
                        <NextImage unoptimized width={1024} height={1536} loading="eager" className="battle-character-backdrop" src={characterFullbodyPath(playerClass, rebirthCount, Boolean(skillEffect))} alt="" aria-hidden="true" />
                        <NextImage unoptimized width={1024} height={1536} loading="eager" className="battle-character" src={characterFullbodyPath(playerClass, rebirthCount, Boolean(skillEffect))} alt={playerClass} />
                        {selectedTitle !== "none" && (
                          <span
                            className="equipped-title"
                            style={{ color: TITLE_OPTIONS[selectedTitle].color }}
                          >
                            {TITLE_OPTIONS[selectedTitle].name}
                          </span>
                        )}
                      </div>
                      <div className="fighter-meta">
                        <b>{playerName}</b>
                        {liveCombatRef.current?.characterClass === "法師" && (() => {
                          const shield = (liveCombatRef.current.combat as MageCombat).shield.value;
                          return shield > 0 ? (
                            <Meter
                              value={shield / characterStats.hp * 100}
                              color="#ffffff"
                              className="shield-meter"
                              ariaLabel={`護盾 ${Math.ceil(shield).toLocaleString()}`}
                            />
                          ) : null;
                        })()}
                        <Meter value={activeBossBattle ? bossPlayerHp : playerHp} color="#58ad71" />
                        {liveCombatRef.current?.combat.session.charge.ultimate && (
                          <>
                            <Meter
                              value={liveCombatRef.current.combat.session.charge.ultimateEnergy}
                              color={playerClass === "戰士" ? "#f1aa42" : playerClass === "遊俠" ? "#65d88d" : "#a78bfa"}
                              className={`ultimate-energy-meter${liveCombatRef.current.combat.session.charge.ultimateEnergy >= 100 ? " ready" : ""}`}
                              ariaLabel={`奧義蓄能 ${liveCombatRef.current.combat.session.charge.ultimateEnergy}／100`}
                            />
                            <small className="ultimate-energy-label">
                              奧義蓄能 {liveCombatRef.current.combat.session.charge.ultimateEnergy}／100
                            </small>
                          </>
                        )}
                        <small className="player-health-label">
                          {healthFromPercent(
                            activeBossBattle ? bossPlayerHp : playerHp,
                            characterStats.hp,
                          ).toLocaleString()}／{characterStats.hp.toLocaleString()} HP
                        </small>
                        <div className="combat-statuses" aria-label="玩家戰鬥狀態">
                          {combatStatuses.filter((status) => status.target === "player").map((status) => (
                            <span key={`${status.name}-${status.target}`} className={`combat-status ${status.tone}`}>
                              {combatStatusLabel(status.name)} · {status.remaining}{status.unit}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="versus">
                      <Swords />
                      <small>
                        {activeBossBattle
                          ? "首領戰"
                          : `第 ${wave} 層`}
                      </small>
                      {comboCount > 1 && !activeBossBattle && (
                        <strong>{comboCount} 連擊</strong>
                      )}
                    </div>
                    <div
                      className={`fighter enemy ${battlePulse % 2 ? "hit" : ""} ${comboCount > 1 ? "rapid-hit" : ""} ${enemyDefeated ? "defeated" : ""} ${skillEffect ? `skill-target-${skillVisualByName[skillEffect.name] ?? ""}` : ""}`}
                    >
                      <div className={`fighter-frame enemy-frame ${enemyHitFeedback && !enemyHitFeedback.dodged ? `attack-pulse-${battlePulse % 2}` : ""}`}>
                        {(() => {
                          const currentMonsterName = activeBossBattle?.name ?? currentEnemyBaseName;
                          const monsterImage = monsterImages[currentMonsterName]
                            ?? monsterImages[baseMonsterName(currentMonsterName)];
                          return monsterImage ? (
                            <NextImage unoptimized width={1024} height={1536} loading="eager" className="battle-monster" src={monsterImage} alt={currentMonsterName} />
                          ) : (
                            <span className="monster-placeholder">
                              {activeBossBattle || currentWaveBoss || currentWaveElite || currentWaveGuardian ? <Crown /> : <Skull />}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="fighter-meta">
                        <b>{activeBossBattle?.name ?? currentEnemyBaseName}</b>
                        <Meter className="enemy-synced-health" value={presentedEnemyPercent} color={activeBossBattle || currentWaveBoss || currentWaveElite || currentWaveGuardian ? "#dc8d32" : "#b9474b"} />
                        <small className="enemy-health-label">{activeBossBattle ? `${healthFromPercent(presentedEnemyPercent, activeBossBattle.hp).toLocaleString()}／${activeBossBattle.hp.toLocaleString()} HP` : `${healthFromPercent(presentedEnemyPercent,currentEnemyMaximumHealth).toLocaleString()}／${currentEnemyMaximumHealth.toLocaleString()} HP`}</small>
                        <div className="combat-statuses" aria-label="敵方戰鬥狀態">
                          {combatStatuses.filter((status) => status.target === "enemy").map((status) => (
                            <span key={`${status.name}-${status.target}`} className={`combat-status ${status.tone}`}>
                              {combatStatusLabel(status.name)} · {status.remaining}{status.unit}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {skillBannerEffect && !skillBannerEffect.name.endsWith("・共鳴斬") && (
                      <div
                        key={skillBannerEffect.key}
                        className={`skill-burst ${playerClass}`}
                      >
                        <WandSparkles />
                        <b>{skillBannerEffect.name}</b>
                        <span>技能發動</span>
                      </div>
                    )}
                    {!sessionSuperseded && (hunterBursts.length > 0 || hunterMarkVisual && (activeBossBattle ? !bossOutcome : battleOn && !runSummary)) && (
                      <RangerHunterMarkVfx mark={(activeBossBattle ? bossOutcome : runSummary) ? null : hunterMarkVisual} bursts={hunterBursts}
                        onImpact={publishHunterImpact} onComplete={finishHunterBurst} onExpire={expireHunterMark} />
                    )}
                    {windDomainVisual && !sessionSuperseded && (activeBossBattle ? !bossOutcome : battleOn && !runSummary) && (
                      <RangerWindDomainVfx visual={windDomainVisual} onComplete={finishWindDomain} />
                    )}
                    {phantomStepVisual && !sessionSuperseded && (activeBossBattle ? !bossOutcome : battleOn && !runSummary) && (
                      <RangerPhantomStepVfx visual={phantomStepVisual}
                        portraitSrc={characterFullbodyPath(playerClass, rebirthCount, Boolean(skillEffect))}
                        onComplete={finishPhantomStepBurst} />
                    )}
                    {!sessionSuperseded && (activeBossBattle ? !bossOutcome : battleOn && !runSummary) && (
                      <MageFrostfireNovaVfx effects={frostfireVisuals} statuses={frostfireStatuses}
                        onImpact={publishFrostfireImpact} onComplete={finishFrostfireVisual} />
                    )}
                    {!sessionSuperseded && (activeBossBattle ? !bossOutcome : battleOn && !runSummary) && (
                      <>
                        {playerClass === "法師" && <>
                          <MageArcaneOverloadVfx visual={overloadVisual} />
                          <MageManaShieldVfx visual={manaShieldVisual} />
                          <MageElementSigilVfx visual={elementSigilVisual} />
                          {astralVisual && <MageAstralAnnihilationVfx key={`astral-${astralVisual.key}`} effectKey={astralVisual.key}
                            ascended={astralVisual.ascended} segments={astralVisual.segments}
                            onImpact={publishAstralImpact} onComplete={finishAstralVisual} />}
                          <MageVoidCollapseVfx effects={voidVisuals} onImpact={publishVoidImpact} onComplete={finishVoidVisual} />
                          <MageMeteorStrikeVfx effects={meteorVisuals} onImpact={publishMeteorImpact} onComplete={finishMeteorVisual} />
                        </>}
                      <MageLightningChainVfx effects={lightningVisuals} paralysisExpiresAt={lightningParalysis}
                        onImpact={publishLightningImpact} onComplete={finishLightningVisual} />
                      </>
                    )}
                    {rangerPiercingEffect && (
                      <RangerPiercingArrowVfx key={`piercing-arrow-${rangerPiercingEffect.key}`}
                        ascended={skillAscensions.choices.includes("穿雲箭")}
                        effectKey={rangerPiercingEffect.key} hit={rangerPiercingEffect.hit}
                        onImpact={publishPiercingImpactDamage} onComplete={finishPiercingVisual} />
                    )}
                    {starbreakVisuals.map((effect) => (
                      <RangerStarbreakSnipeVfx key={`starbreak-${effect.key}`} effectKey={effect.key}
                        hit={effect.hit} ascended={effect.ascended} chargeRecovered={effect.chargeRecovered} onImpact={publishStarbreakImpact} onComplete={finishStarbreakVisual} />
                    ))}
                    {tailwindVisuals.map((effect) => (
                      <RangerTailwindArrowVfx key={`tailwind-main-${effect.key}`} kind="main"
                        effectKey={effect.key} hit={effect.hit}
                        onImpact={(eventKey) => publishTailwindImpactDamage(eventKey, effect.echo, effect.chargeRecovered)}
                        onComplete={finishTailwindVisual} />
                    ))}
                    {tailwindEchoVisuals.map((effect) => (
                      <RangerTailwindArrowVfx key={`tailwind-echo-${effect.key}`} kind="echo"
                        effectKey={effect.key} hit={effect.hit} onImpact={publishTailwindEchoDamage}
                        onComplete={finishTailwindEchoVisual} />
                    ))}
                    {tailwindChargeVisuals.map((effect) => (
                      <RangerTailwindArrowVfx key={`tailwind-charge-${effect.key}`} kind="charge"
                        effectKey={effect.key} hit onImpact={() => {}} onComplete={finishTailwindChargeVisual} />
                    ))}
                    {skyRainVisual && !sessionSuperseded && (
                      <RangerSkyQueenRainVfx key={`sky-queen-${skyRainVisual.key}`}
                        effectKey={skyRainVisual.key} ascended={skyRainVisual.ascended} arrows={skyRainVisual.arrows}
                        onImpact={publishSkyRainImpact} onComplete={finishSkyRainVisual} />
                    )}
                    {rangerWindVolleyEffect.map((effect) => (
                      <RangerWindVolleyVfx
                        key={`wind-volley-vfx-${effect.key}`}
                        effectKey={effect.key}
                        shotCount={effect.shotCount} arrows={effect.arrows}
                        onImpact={publishVolleyImpact} onComplete={finishVolleyVisual}
                      />
                    ))}
                    {deadlyMarkEffect && (
                      <RangerDeadlyMarkVfx
                        effectKey={deadlyMarkEffect.key}
                        detonationKey={deadlyMarkEffect.detonationKey}
                      />
                    )}
                    {abyssBossEffect && activeBossBattle?.name === "深淵王" && (
                      <DeepAbyssBossVfx effectKey={abyssBossEffect.key} />
                    )}
                    {unyieldingVisual.eventKey > 0 && (
                      <WebGLUnyieldingWillVfx
                        key="warrior-unyielding-will"
                        eventKey={unyieldingVisual.eventKey}
                        active={unyieldingVisual.active}
                        activated={unyieldingVisual.activated}
                        blocked={unyieldingVisual.blocked}
                        countered={unyieldingVisual.countered}
                        ascendedCounterStacks={unyieldingVisual.ascendedCounterStacks}
                        onFadeComplete={() => finishUnyieldingVisual(unyieldingVisual.eventKey)}
                      />
                    )}
                    {bloodBrandVisual && (
                      <WebGLBloodBrandVfx
                        key="warrior-blood-brand"
                        {...bloodBrandVisual}
                        onExpired={finishBloodBrandVisual}
                      />
                    )}
                    {armorSmashVisual && (
                      <WebGLArmorSmashVfx
                        key={`armor-smash-${armorSmashVisual.key}`}
                        effectKey={armorSmashVisual.key}
                        hit={armorSmashVisual.hit}
                        enhanced={armorSmashVisual.enhanced}
                        ascended={armorSmashVisual.ascended}
                        onComplete={finishArmorSmashVisual}
                      />
                    )}
                    {titanUltimateVisual && (
                      <WebGLTitanRiftVfx
                        key={`titan-rift-${titanUltimateVisual.key}`}
                        kind="ultimate"
                        effectKey={titanUltimateVisual.key}
                        hit={titanUltimateVisual.hit}
                        ascended={titanUltimateVisual.ascended}
                        onImpact={publishTitanImpactDamage}
                        onComplete={finishTitanUltimateVisual}
                      />
                    )}
                    {titanEchoVisuals.map((effect) => (
                      <WebGLTitanEchoVfx
                        key={`titan-echo-${effect.key}`}
                        kind="echo"
                        effectKey={effect.key}
                        slashIndex={effect.slashIndex}
                        onComplete={finishTitanEchoVisual}
                      />
                    ))}
                    {!titanUltimateVisual && <WebGLBerserkerStanceVfx {...berserkerStanceVisual} targetKey={activeBossBattle?.name ?? `${runStartedAt}:${mapId}:${wave}`} active={berserkerStanceVisual.active && Boolean(battleOn || activeBossBattle)} />}
                    {skillVisualEffects.map((effect) => (
                      effect.name === "鮮血怒吼"
                        ? <WebGLBloodRoarVfx key={`blood-roar-${effect.key}`} ascended={skillAscensions.choices.includes("鮮血怒吼")} />
                        : effect.name === "血刃斬"
                        ? <WebGLBloodBladeVfx key={`${effect.name}-${effect.key}`} effectKey={effect.key} />
                        : <SkillEffectCanvas
                            key={`${effect.name}-${effect.key}`}
                            name={effect.name}
                            effectKey={effect.key}
                            onComplete={SKILL_REWORK_CATALOG[playerClass].some((skill) =>
                              skill.category === "ultimate" && skill.name === effect.name.split("・")[0])
                              ? finishUltimateAnimation
                              : undefined}
                          />
                    ))}
                    {groundSplitEffect && (
                      <WebGLGroundSplitVfx key={`ground-split-${groundSplitEffect.key}`} kind="main"
                        effectKey={groundSplitEffect.key} hit={groundSplitEffect.hit}
                        onImpact={publishGroundImpactDamage} onComplete={finishGroundSplitVisual} />
                    )}
                    {groundShockEffects.map((effect) => (
                      <WebGLGroundSplitVfx key={`ground-shock-${effect.key}`} kind="shock"
                        effectKey={effect.key} hit onImpact={publishGroundShockDamage} onComplete={finishGroundShockVisual} />
                    ))}
                    {executionEffect && (
                      <SkillEffectCanvas
                        name="處決"
                        effectKey={executionEffect.key}
                        targetKey={`${activeBossBattle ? "boss" : mapId}:${wave}`}
                      />
                    )}
                    {bloodRoarSlashKey > 0 && (
                      <WebGLBloodRoarHitVfx key={`blood-slash-${bloodRoarSlashKey}`} kind="slash" />
                    )}
                    {bloodReturnKey > 0 && <WebGLBloodRoarHitVfx key={`blood-return-${bloodReturnKey}`} kind="return" />}
                    {mythicVfxEffects.map((effect) => (
                      <MythicSkillVfx
                        key={`${effect.skill}-${effect.key}`}
                        skill={effect.skill}
                        effectKey={effect.key}
                        phase={effect.phase}
                        variant={effect.variant}
                      />
                    ))}
                    <CombatDamageLayer
                      resetToken={enemyPresentationToken}
                      onDamageShown={onEnemyDamageShown}
                      enabled={!sessionSuperseded}
                      inputs={{ groups: battleHitGroups, elementals: setElementalHits, dots: dotDamageGroups,
                        player: playerHitFeedback, enemy: enemyHitFeedback, miss: missFeedback,
                        counter: unyieldingCounterFeedback, boss: Boolean(activeBossBattle) }}
                    />
                    {resourceDrop && !activeBossBattle && (
                      <div key={resourceDrop.key} className="resource-float">
                        <CircleDollarSign /> +{resourceDrop.gold}
                        {resourceDrop.enhance > 0 && (
                          <span>強化石 +{resourceDrop.enhance}</span>
                        )}
                        {resourceDrop.reforge > 0 && (
                          <span>洗鍊石 +{resourceDrop.reforge}</span>
                        )}
                        {resourceDrop.yuanbao > 0 && (
                          <span>元寶 +{resourceDrop.yuanbao}</span>
                        )}
                      </div>
                    )}
                    {setTier > 0 && (
                      <div className="set-aura">
                        <Sparkles />
                        {activeSet?.name}共鳴
                      </div>
                    )}
                    {!activeBossBattle && (
                      <div className="battle-drops">
                        {battleDrops.map((drop) => (
                          <button
                            key={drop.id}
                            className={`battle-drop q${qualityOrder.indexOf(drop.item.quality)}`}
                            style={
                              {
                                "--loot": qualityColors[drop.item.quality],
                              } as React.CSSProperties
                            }
                            onClick={() => {
                              setLootInspect(drop);
                              setBattleOn(false);
                            }}
                          >
                            <i />
                            <EquipmentIcon item={drop.item} className="battle-equipment-art" />
                            <span>{drop.item.quality}</span>
                             <b><EquipmentName item={drop.item} /></b>
                          </button>
                        ))}
                      </div>
                    )}
                    {runSummary && !activeBossBattle && (
                      <div className={`battle-run-overlay ${runSummary.outcome}`} role="status" aria-live="polite">
                        <div className="battle-run-message">
                          {runSummary.outcome === "complete" ? <Crown aria-hidden="true" /> : <Skull aria-hidden="true" />}
                          <h3>{runSummary.outcome === "complete" ? "通關完成" : "你已死亡"}</h3>
                          <p>第 {runSummary.highestFloor} 層 · 擊敗 {runSummary.kills} 隻怪物</p>
                          <strong>{restartCountdown}</strong>
                          <span>倒數完後從第 1 層重新開始</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="battle-actions">
                    <div>
                      <b>
                        {activeBossBattle
                          ? "首領戰已暫停原爬塔"
                          : "下一個里程碑"}
                      </b>
                      <span>
                        {activeBossBattle
                          ? bossOutcome
                            ? "查看戰況後返回爬塔"
                            : "勝利固定掉落 1–2 件裝備"
                          : currentWaveBoss
                            ? "擊敗後結算本輪並永久解鎖下一張地圖"
                            : currentWaveGuardian
                            ? "守關者必定掉落裝備"
                            : `第 ${Math.min(30, Math.ceil(wave / 10) * 10)} 層里程碑`}{" "}
                      </span>
                    </div>
                    {activeBossBattle && (
                      <div className="battle-buttons">
                          {bossOutcome && (
                            <button
                              className="btn btn-primary"
                              onClick={() => {
                                const canRetry = bossOutcome !== "win" && (
                                  activeBossBattle.mode === "personal" || worldAttempts > 0
                                );
                                if (!canRetry) {
                                  leaveBossBattle();
                                  return;
                                }
                                if (activeBossBattle.mode === "world") {
                                  const worldBoss = worldBosses.find((boss) => boss.name === activeBossBattle.name) ?? worldBosses[0];
                                  fightBoss(worldBoss);
                                } else {
                                  resetCombatPerks();
                                  setActiveBossBattle({...activeBossBattle});
                                  setBossEnemyHp(100);
                                  setPresentedEnemyHealth((current)=>({...current,percent:100}));
                                  setBossPlayerHp(100);
                                  setLastBossDamage(0);
                                  setLastBossCounterDamage(0);
                                  bossRoundEndedRef.current = false;
                                  setBossOutcome(null);
                                  setBattleReport([]);
                                }
                              }}
                            >
                              {bossOutcome !== "win" && (activeBossBattle.mode === "personal" || worldAttempts > 0)
                                ? "再次挑戰"
                                : "返回爬塔"}
                            </button>
                          )}
                          {bossOutcome &&
                            activeBossBattle.mode === "world" &&
                            bossOutcome !== "win" &&
                            worldAttempts > 0 && (
                              <button
                                className="btn btn-ghost"
                                onClick={leaveBossBattle}
                              >
                                退出世界首領
                              </button>
                            )}
                          {!bossOutcome && (
                            <button
                              className="btn btn-ghost"
                              onClick={leaveBossBattle}
                            >
                              撤離
                            </button>
                          )}
                      </div>
                    )}
                  </div>
                  <div className="combat-meta">
                    <div>
                      <small>套裝規則</small>
                      <b>
                        {activeSet
                          ? `${activeSet.name} ${activeSet.count} 件`
                          : `追獵 ${currentMap.set}`}
                      </b>
                      {equippedSetGroups.length ? equippedSetGroups.map((group) => (
                        <span className={group.count >= 2 ? "set-meta-active" : ""} key={group.name}>
                          {group.name} {group.count} 件：{setEffectDescription(group.count)}
                        </span>
                      )) : <span>{setEffectDescription(0)}</span>}
                    </div>
                    <div>
                      {activeBossBattle ? (
                        <>
                          <small>首領戰規則</small>
                          <div className="blessing-chips disabled-blessings">
                            <span>遠征祝福不會在首領戰生效</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <small>本次祝福 {blessings.length}</small>
                          <div className="blessing-chips">
                            {blessings.length ? (
                              blessings.map((blessing) => (
                                <span key={blessing.id}>
                                  {blessing.name}
                                  {blessing.upgraded ? "・昇華" : ""}
                                </span>
                              ))
                            ) : (
                              <span>第 10 層守關後可取得第一項祝福</span>
                            )}
                          </div>
                          {hasBlessing("blood") && (
                            <span className={`shield-state ${bloodShieldReady ? "ready" : "spent"}`}>
                              血誓護盾：{bloodShieldReady ? "準備" : "已消耗"}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="auto-salvage-panel">
                    <div>
                      <span>
                        <RefreshCw className={`auto-salvage-icon ${autoSalvage ? "active" : ""}`} /> 自動分解過濾
                      </span>
                      <small>
                        {autoSalvage
                          ? `${autoSalvageQuality === "全分解" || autoSalvageQuality === "傳奇以下" ? autoSalvageQuality : `${autoSalvageQuality}以下`}自動分解`
                          : "目前關閉，所有掉落將保留"}
                      </small>
                    </div>
                    <button
                      className={`toggle-chip ${autoSalvage ? "active" : ""}`}
                      onClick={() => setAutoSalvage((value) => !value)}
                    >
                      {autoSalvage ? "已開啟" : "開啟"}
                    </button>
                    <select
                      aria-label="自動分解品質上限"
                      value={autoSalvageQuality}
                      disabled={!autoSalvage}
                      onChange={(event) => setAutoSalvageQuality(event.target.value)}
                    >
                      {["普通", "良好", "優秀", "史詩", "傳奇以下", "全分解"].map((quality) => (
                        <option key={quality} value={quality}>
                          {quality}
                        </option>
                      ))}
                    </select>
                    <button
                      className={`protect-chip ${protectSetGear ? "active" : ""}`}
                      disabled={!autoSalvage}
                      onClick={() => setProtectSetGear((value) => !value)}
                    >
                      保留套裝
                    </button>
                    <button
                      className={`protect-chip ${protectPowerUpgrade ? "active" : ""}`}
                      disabled={!autoSalvage}
                      onClick={() => setProtectPowerUpgrade((value) => !value)}
                    >
                      保留戰力提升
                    </button>
                  </div>
                </Panel>
                <Panel>
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">IDLE STORAGE</p>
                      <h3>離線掛機收益</h3>
                    </div>
                    <span>
                      <Clock3 size={16} /> 上限 12 小時
                    </span>
                  </div>
                  <div className="run-loot-summary">
                    <b>本次遠征戰利品</b>
                    <span>金幣 {runGold.toLocaleString()}</span>
                    <span>強化石 {runEnhance}</span>
                    <span>洗鍊石 {runReforge}</span>
                    <span>裝備 {runGear} 件</span>
                  </div>
                  <div className="idle-row">
                    <div className="idle-time">
                      <strong>
                        {String(hours).padStart(2, "0")}:
                        {String(mins).padStart(2, "0")}:
                        {String(secs).padStart(2, "0")}
                      </strong>
                      <span>累積進度 {Math.round(storedSeconds / 432)}%</span>
                    </div>
                    <div className="loot-preview">
                      <span>
                        <CircleDollarSign />{" "}
                        {Math.floor(
                          (storedSeconds / 3600) * 920,
                        ).toLocaleString()}
                      </span>
                      <span>
                        <Zap /> {Math.floor((storedSeconds / 3600) * 6)} 強化石
                      </span>
                      <span>
                        <PackageOpen /> 離線預估約{" "}
                        {Math.floor((storedSeconds / 3600) * 4)} 件
                      </span>
                    </div>
                    <button
                      className="btn btn-primary"
                      disabled={!canClaim}
                      onClick={claim}
                    >
                      {canClaim ? "領取收益" : "累積中"}
                    </button>
                  </div>
                  <Meter value={storedSeconds / 432} />
                </Panel>
              </div>
              <div className="stack side-stack">
                <Panel>
                  <div className="section-head">
                    <h3>角色戰況</h3>
                    <span className="power">
                      綜合戰力 {formatAssessedPower(assessedCombatPower)}
                    </span>
                  </div>
                  <div className="stat-grid">
                    {stats.map((s) => (
                      <div key={s.label}>
                        <small>{s.label}</small>
                        <strong>{s.value}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="rebirth">
                    <span>
                      <Flame />
                      輪迴之力
                    </span>
                    <b>{rebirthCount} 轉</b>
                    <small>
                      {rebirthCount >= MAX_REBIRTHS
                        ? "已達輪迴上限"
                        : canRebirth
                          ? "已達成輪迴條件"
                          : "Lv.100・曾通關時墟深淵第 30 層可輪迴"}
                    </small>
                    <button
                      className="btn btn-primary"
                      disabled={!canRebirth}
                      onClick={() => setRebirthOpen(true)}
                    >
                      {rebirthCount >= MAX_REBIRTHS ? "輪迴已滿" : "開始輪迴"}
                    </button>
                    <button className="text-btn" onClick={() => setRebirthOpen(true)}>
                      天賦 {rebirthPoints} 點
                    </button>
                  </div>
                </Panel>
                <Panel>
                  <div className="section-head">
                    <h3>近期戰報</h3>
                    <button className="text-btn" onClick={() => setTab("日誌")}>
                      全部
                    </button>
                  </div>
                  <div className="mini-log">
                    {logs.slice(0, 4).map((log) => (
                      <div key={log.id}>
                        <i className={`dot ${log.type}`} />
                        <span>{log.text}</span>
                        <small>{log.time}</small>
                      </div>
                    ))}
                  </div>
                </Panel>
                <Panel className="daily-card">
                  <div>
                    <p className="eyebrow">DAILY TARGET</p>
                    <h3>今日獵殺</h3>
                    <span>擊敗怪物 {Math.min(balanceConfig.economy.dailyHuntReward.kills, dailyKills)} / {balanceConfig.economy.dailyHuntReward.kills}</span>
                    <small className="daily-reward-copy">
                      獎勵：金幣 {balanceConfig.economy.dailyHuntReward.gold.toLocaleString()}・強化石 {balanceConfig.economy.dailyHuntReward.enhanceStones}・洗鍊石 {balanceConfig.economy.dailyHuntReward.reforgeStones}・元寶 {balanceConfig.economy.dailyHuntReward.yuanbao}
                    </small>
                    <button
                      className="btn btn-primary daily-claim"
                      disabled={dailyKills < balanceConfig.economy.dailyHuntReward.kills || dailyRewardClaimed || dailyClaimBusy}
                      onClick={claimDailyHuntReward}
                    >
                      {dailyRewardClaimed
                        ? "今日已領取"
                        : dailyClaimBusy
                          ? "領取中…"
                        : dailyKills >= balanceConfig.economy.dailyHuntReward.kills
                          ? "領取獎勵"
                          : "尚未完成"}
                    </button>
                  </div>
                  <div className="daily-ring">
                    {Math.min(100, Math.floor((dailyKills / 500) * 100))}%
                  </div>
                </Panel>
              </div>
            </div>
          )}

          {tab === "地圖" && (
            <div className="page-section">
              <PageTitle
                title="九域長夜遠征"
                sub="每張地圖皆有 30 層；10、20 層取得祝福，擊敗 30 層首領後永久解鎖下一區域。"
              >
                <span className="bag-capacity">
                  {currentMap.name} {wave} / 30 · 已解鎖 {unlockedMapId} / 9 ·
                  完成 {completedRuns} 輪
                </span>
              </PageTitle>
              <div className="map-grid">
                {maps.map((map) => {
                  const locked = map.id > unlockedMapId;
                  const localProgress = Math.min(
                    MAP_FLOORS,
                    mapBestFloors[map.id] ?? (map.id === 1 ? 1 : 0),
                  );
                  const reachedFloors = mapId === map.id
                    ? Math.max(localProgress, Math.min(wave, MAP_FLOORS))
                    : localProgress;
                  const recommendedPower = map.recommendedAssessedPower;
                  const powerState = locked
                    ? { label: "尚未解鎖", tone: "locked" }
                    : assessedCombatPower < recommendedPower[0]
                      ? { label: "極度危險", tone: "danger" }
                      : assessedCombatPower <= recommendedPower[1]
                        ? { label: "適合挑戰", tone: "suitable" }
                        : { label: "可輕鬆通關", tone: "easy" };
                  return (
                    <button
                      key={map.id}
                      disabled={locked}
                      className={`map-card ${mapId === map.id ? "current" : ""}`}
                      style={{ "--tone": map.tone } as React.CSSProperties}
                      onClick={() => {
                        if (mapId === map.id) {
                          setTab("主控");
                          toast.info(`${map.name}：目前第 ${wave} 層`);
                          return;
                        }
                        enterMap(map.id);
                      }}
                    >
                      <div className="map-art">
                        <NextImage unoptimized width={640} height={360} src={map.sceneImage} alt="" loading="lazy" />
                        <span className="map-art-status">
                          {locked ? <><LockKeyhole /> 尚未解鎖</> : mapId === map.id ? "正在遠征" : reachedFloors >= MAP_FLOORS ? "區域已征服" : "可前往"}
                        </span>
                        <em>0{map.id}</em>
                      </div>
                      <div className="map-card-content">
                        <div className="map-card-heading">
                          <div>
                            <small className="map-region-label">REGION 0{map.id} · 建議等級 Lv.{map.level}</small>
                            <h3>{map.name}</h3>
                          </div>
                          <b className={`power-state ${powerState.tone}`}>
                            {powerState.label}
                          </b>
                        </div>
                        <p className="map-monster-line">遭遇：{map.monsters.slice(0, 3).join("・")}</p>
                        <div className="map-power-row">
                          <span>
                            建議戰力 {formatAssessedPower(recommendedPower[0])}～
                            {formatAssessedPower(recommendedPower[1])}
                          </span>
                        </div>
                        <div className="map-route-head">
                          <span>{mapId === map.id ? "遠征進度" : "最佳進度"}</span>
                          <b>{reachedFloors}<small> / {MAP_FLOORS}</small></b>
                        </div>
                        <div className="map-floor-track" role="img" aria-label={`${map.name}進度 ${reachedFloors}／${MAP_FLOORS} 層；精英在 5、15、25 層，守關者在 10、20 層，首領在 30 層`}>
                          {Array.from({ length: MAP_FLOORS }, (_, index) => {
                            const floor = index + 1;
                            const kind = floor === 30 ? "boss" : [10, 20].includes(floor) ? "guardian" : [5, 15, 25].includes(floor) ? "elite" : "";
                            const name = kind === "boss" ? "首領" : kind === "guardian" ? "守關者" : kind === "elite" ? "精英" : "普通層";
                            return <i key={`${map.id}-${floor}`} className={`${floor <= reachedFloors ? "cleared" : ""} ${kind}`} title={`第 ${floor} 層・${name}`} />;
                          })}
                        </div>
                        <div className="map-milestone-legend">
                          <span><i className="elite" />精英 5・15・25</span>
                          <span><i className="guardian" />守關 10・20</span>
                          <span><i className="boss" />首領 30</span>
                        </div>
                        <span className="sr-only">5/15/25F 精英 · 10/20F 守關 · 30F 首領</span>
                        <div className="map-card-rewards">
                          <span>EXP {map.exp[0]}～{map.exp[1]}</span>
                          <span>套裝・{map.set}</span>
                          <span>場景普通裝備 · 品質上限：傳奇</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "背包" && (
            <div className="page-section">
              <PageTitle
                title="背包與裝備"
                sub="穿戴中的裝備不佔背包格數；可穿戴、強化、洗鍊與鑲嵌，滿格獎勵會寄往郵件保存 7 天。"
              >
                <span className="bag-capacity">
                  綜合戰力 {formatAssessedPower(assessedCombatPower)} · 強化石 {enhanceStones} ·
                  洗鍊石 {reforgeStones} · 打孔石 {drillingStones} · {bagItems.length} / 60 格
                </span>
              </PageTitle>
              <div className="inventory-layout">
                <Panel className="equipment-panel">
                  <div className="loadout-tabs">
                    <button
                      className={activeLoadout === 1 ? "active" : ""}
                      onClick={() => setActiveLoadout(1)}
                    >
                      配裝一
                    </button>
                    <button
                      className={activeLoadout === 2 ? "active" : ""}
                      onClick={() => setActiveLoadout(2)}
                    >
                      配裝二
                    </button>
                    <span>兩套可共用裝備</span>
                  </div>
                  <div className="paperdoll">
                    {equipFeedback && <span key={equipFeedback.id} className="paperdoll-equip-feedback" aria-hidden="true" />}
                    <div className="character-display">
                      <CharacterAppearanceVfx id={selectedAppearance} />
                      <NextImage unoptimized width={1024} height={1536} loading="eager"
                        className="inventory-character"
                        src={characterFullbodyPath(playerClass, rebirthCount)}
                        alt={`${playerClass}角色立繪`}
                      />
                    </div>
                    {[
                      "武器",
                      "頭盔",
                      "胸甲",
                      "手套",
                      "鞋子",
                      "項鍊",
                      "戒指",
                      "腰帶",
                      "護腕",
                      "披風",
                    ].map((slot, i) => {
                      const it = items.find(
                        (x) => x.slot === slot && equipped.includes(x.id),
                      );
                      return (
                        <Popover key={slot}>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={`gear-slot s${i + 1} ${it?.set ? "set-item" : ""} ${it && items.indexOf(it) === selectedItem ? "selected" : ""}`}
                              style={{ "--set-color": it ? itemSetAccent(it) : "transparent" } as React.CSSProperties}
                              disabled={!it}
                              onClick={() => {
                                if (it) setSelectedItem(items.indexOf(it));
                                if (it) setMobileItemDetailOpen(true);
                              }}
                              aria-label={it ? `${slot}：${it.name}` : slot}
                            >
                              <small className="slot-name">{slot}</small>
                              {it && <><EquipmentIcon item={it} className="paperdoll-art" /><i className="set-badge">✦</i></>}
                              {it && equipFeedback?.slot === slot && (
                                <span key={equipFeedback.id} className="equip-slot-flash" aria-hidden="true" />
                              )}
                              <span
                                className="gear-enhance"
                                style={{
                                  color: it
                                    ? qualityColors[it.quality]
                                    : "#59605d",
                                }}
                              >
                                {it
                                  ? it.enhance
                                    ? `+${it.enhance}`
                                    : "◆"
                                  : "—"}
                              </span>
                            </button>
                          </PopoverTrigger>
                          {it && (
                            <PopoverContent
                              side="right"
                              sideOffset={8}
                              className="gear-tooltip-shell inventory-gear-popover"
                            >
                              <GearTooltip item={it} />
                            </PopoverContent>
                          )}
                        </Popover>
                      );
                    })}
                  </div>
                  <div className="set-bonus">
                    {equippedSetGroups.length ? (
                      equippedSetGroups.map((group) => (
                        <div key={group.name} className={`set-bonus-row ${group.count >= 2 ? "active" : ""}`}>
                          <b>{group.name} · {group.count} / 10</b>
                          <span className={group.count >= 2 ? "active" : ""}>2 件：攻擊 +{Math.round((SET_ATTACK_BONUS - 1) * 100)}%</span>
                          <span className={group.count >= 4 ? "active" : ""}>4 件：離線收益 +10%</span>
                          <span className={group.count >= 6 ? "active" : ""}>6 件：每次攻擊追加 {SET_ELEMENTAL_DAMAGE_PCT}% 元素傷害</span>
                          <span className={group.count >= 8 ? "active" : ""}>8 件：技能傷害 +{SET_SKILL_DAMAGE_PCT}%</span>
                          <span className={group.count >= 10 ? "active" : ""}>10 件：每 {SET_RESONANCE_ATTACKS} 次攻擊觸發元素爆發（{SET_RESONANCE_DAMAGE_PCT}%）</span>
                        </div>
                      ))
                    ) : (
                      <div className="set-bonus-row empty">
                        <b>尚未啟用套裝</b>
                        <span>穿戴同系列 2 件後啟用第一階段效果</span>
                      </div>
                    )}
                  </div>
                </Panel>
                <Panel className="bag-panel">
                  <div className="filter-row">
                    <b>{bagCategory}裝備</b>
                    <span>共 {visibleBagItems.length} 件</span>
                    <button
                      className="btn btn-ghost bulk-salvage-btn"
                      onClick={() => setBulkSalvageOpen(true)}
                    >
                      <Trash2 /> 一鍵分解
                    </button>
                  </div>
                  <div className="bag-tool-row">
                    <div className="bag-category-tabs" role="tablist" aria-label="背包分類">
                      {(["全部", "武器", "防具", "飾品", "套裝", "未查看"] as const).map((category) => (
                        <button key={category} className={bagCategory === category ? "active" : ""} onClick={() => setBagCategory(category)}>{category}</button>
                      ))}
                    </div>
                    <label className="bag-sort-control">排序
                      <select value={bagSort} onChange={(event) => setBagSort(event.target.value as typeof bagSort)}>
                        <option value="戰力">戰力</option><option value="品質">品質</option><option value="強化">強化</option><option value="最新">最新</option>
                      </select>
                    </label>
                  </div>
                  <div className="item-grid" key={bagRenderKey}>
                      {visibleBagItems.map((it, order) => {
                        const i = items.indexOf(it);
                        const worn = items.find(
                          (item) =>
                            item.slot === it.slot && equipped.includes(item.id),
                        );
                        const unseen = unseenItemIds.includes(it.id);
                        return (
                          <Popover key={`${it.id}-${i}`}>
                            <PopoverTrigger asChild>
                              <button
                                className={`${selectedItem === i ? "selected" : ""} ${unseen ? "unseen" : ""} ${it.set ? "set-item" : ""}`}
                                onClick={() => {
                                  setSelectedItem(i);
                                  setMobileItemDetailOpen(true);
                                  setUnseenItemIds((old) =>
                                    old.filter((id) => id !== it.id),
                                  );
                                }}
                                style={
                                  {
                                    "--q": qualityColors[it.quality],
                                    "--set-color": itemSetAccent(it),
                                    "--item-delay": `${140 + Math.min(order, 8) * 35}ms`,
                                  } as React.CSSProperties
                                }
                                aria-label={`${it.name}，裝備評級 ${equipmentDisplayRating(it)}`}
                              >
                                <EquipmentIcon item={it} className="bag-equipment-art" />
                                {it.set && <i className="set-badge">✦</i>}
                                <small>+{it.enhance}</small>
                                {it.locked && <span className="lock-mark">鎖</span>}
                                {unseen && <i>NEW</i>}
                                <span className={`bag-power-delta ${powerDifferenceForItem(it) >= 0 ? "gain" : "loss"}`}>
                                  {powerDifferenceForItem(it) >= 0 ? "▲" : "▼"}
                                </span>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              side="right"
                              sideOffset={8}
                              className="gear-tooltip-shell inventory-gear-popover"
                            >
                              <GearTooltip
                                item={it}
                                equippedItem={worn}
                                powerDifference={powerDifferenceForItem(it)}
                              />
                            </PopoverContent>
                          </Popover>
                        );
                      })}
                    </div>
                  {bagItems.length === 0 && (
                    <div className="empty-bag">
                      <PackageOpen />
                      <p>背包目前沒有裝備</p>
                    </div>
                  )}
                </Panel>
                {mobileItemDetailOpen && <button className="mobile-detail-backdrop" aria-label="關閉裝備詳情" onClick={() => setMobileItemDetailOpen(false)} />}
                <Panel className={`item-detail ${mobileItemDetailOpen ? "mobile-open" : ""}`}>
                  {currentItem ? (
                    <div className="item-detail-reveal" key={currentItem.id}>
                      <button className="mobile-detail-close" aria-label="關閉裝備詳情" onClick={() => setMobileItemDetailOpen(false)}>×</button>
                      <div
                        className={`item-icon ${currentItem.set ? "set-item" : ""}`}
                        style={{ color: qualityColors[currentItem.quality], "--set-color": itemSetAccent(currentItem) } as React.CSSProperties}
                      >
                        <EquipmentIcon item={currentItem} className="detail-equipment-art" />
                      </div>
                      <small
                        style={{ color: qualityColors[currentItem.quality] }}
                      >
                        {currentItem.quality} · {currentItem.slot}
                      </small>
                      <span className="equipment-type-label">
                        {currentItem.equipmentType ?? "場景普通裝備"}
                      </span>
                      <h3>
                         {currentItem.set && <span className="set-name-prefix">【{currentItem.set}】</span>} <EquipmentName item={currentItem} /> <em>+{currentItem.enhance}</em>
                      </h3>
                      <b>
                        裝備評級 {equipmentDisplayRating(currentItem).toLocaleString()}
                      </b>
                      <p
                        className={`power-impact ${powerDifferenceForItem(currentItem) >= 0 ? "gain" : "loss"}`}
                      >
                        {equipped.includes(currentItem.id) ? "卸下後" : "穿上後"}
                        實際戰力 {powerDifferenceForItem(currentItem) >= 0 ? "+" : ""}
                        {formatAssessedPower(powerDifferenceForItem(currentItem))}
                      </p>
                      {currentItem.set && (
                        <p className="set-label">{currentItem.set} 套裝</p>
                      )}
                      <div className="detail-base-stats">
                        <strong>基礎屬性</strong>
                        {equipmentBaseStats(currentItem).map((stat) => (
                          <span key={stat.name}>
                            <b>{stat.name} {stat.value.toLocaleString()}</b>
                            <small>
                              原始 {stat.original.toLocaleString()}
                              {currentItem.enhance > 0 &&
                                `・強化 +${(stat.value - stat.original).toLocaleString()}（${enhancementBonusPercent(currentItem.enhance)}%）`}
                            </small>
                          </span>
                        ))}
                        <EquipmentEpithetDetails item={currentItem} />
                      </div>
                      <div className="affix-divider"><span>詞綴加成</span></div>
                      <ul className="detail-affixes">
                        {currentItem.affixes.map((a, index) => (
                          <li key={`${a}-${index}`}>
                             <span>{amplifiedAffix(currentItem, a, index)}</span>
                             <small>{amplifiedAffix(currentItem, a, index) !== a ? `前後綴放大・原 ${a}` : affixRangeLabel(currentItem, a)}</small>
                          </li>
                        ))}
                      </ul>
                      <div className="detail-sockets">
                        <strong>寶石孔位 {normalizeEquipmentSockets(currentItem.sockets).socketCount} / 2</strong>
                        <div>
                          {normalizeEquipmentSockets(currentItem.sockets).gems.map((gem, index) => {
                            const definition = gem ? getGemDefinition(gem.gemId, gem.tier) : null;
                            return definition ? (
                              <span key={index}>
                                <NextImage unoptimized width={256} height={256} loading="eager" src={definition.icon} alt="" />
                                <small>{definition.tierLabel}{definition.name}<br />{gemEffectLabel(definition)}</small>
                              </span>
                            ) : <span key={index} className="empty"><Gem /><small>空孔位</small></span>;
                          })}
                          {normalizeEquipmentSockets(currentItem.sockets).socketCount === 0 && <small>尚未打孔</small>}
                        </div>
                      </div>
                      <div className="detail-actions">
                        <button
                          className="btn btn-primary"
                          onClick={toggleEquip}
                        >
                          {equipped.includes(currentItem.id) ? "卸下" : "穿上"}
                        </button>
                        <button
                          className="btn btn-ghost enhance-button"
                          disabled={currentItem.enhance >= balanceConfig.progression.maxEnhancement}
                          onClick={enhance}
                        >
                          {currentItem.enhance >= balanceConfig.progression.maxEnhancement
                            ? "已達 +15 上限"
                            : <>
                                <span>強化至 +{currentItem.enhance + 1}</span>
                                <small>（{goldCost.toLocaleString()}金幣＋{stoneCost}石）</small>
                              </>}
                        </button>
                        <button
                          className="btn btn-ghost"
                          onClick={() => {
                            setMobileItemDetailOpen(false);
                            setTargetedAffix(null);
                            setReforgeMode("idle");
                            setReforgeOpen(true);
                          }}
                        >
                          <RefreshCw />
                          洗鍊
                        </button>
                        <button
                          className="btn btn-ghost"
                          onClick={() => {
                            setMobileItemDetailOpen(false);
                            setSelectedGemKey(null);
                            setGemWorkshopOpen(true);
                          }}
                        >
                            <Gem /> 鑲嵌
                        </button>
                        <button
                          className="btn btn-danger"
                          onClick={() => {
                            if (!currentItem.locked) sellCurrentItem();
                          }}
                        >
                          <Trash2 />
                          {Object.values(loadouts).some((ids) =>
                            ids.includes(currentItem.id),
                          )
                            ? "穿戴中・不可出售"
                            : currentItem.locked
                              ? "已鎖定・不可出售"
                              : `出售（${currentSaleReturn.gold.toLocaleString()} 金幣）`}
                        </button>
                        <button
                          className={`btn btn-ghost lock-button ${currentItem.locked ? "active" : ""}`}
                          onClick={() => setItems((old) => old.map((item) => item.id === currentItem.id ? { ...item, locked: !item.locked } : item))}
                        >
                          <LockKeyhole /> {currentItem.locked ? "解除鎖定" : "鎖定"}
                        </button>
                      </div>
                      <p className="safe-note">
                        <Shield size={14} />{" "}
                        穿脫、技能、強化與洗鍊會立即更新角色戰力。
                      </p>
                    </div>
                  ) : (
                    <div className="empty-bag">
                      <PackageOpen />
                      <p>選擇一件裝備查看詳情</p>
                    </div>
                  )}
                </Panel>
                <Panel className="character-values-panel">
                  <div className="character-values">
                    <div className="section-head">
                      <h3>角色數值</h3>
                      <span>裝備與技能即時計算</span>
                    </div>
                    <div className="character-stat-grid">
                      {[
                        { label: "生命", value: characterStats.hp.toLocaleString(), icon: Heart },
                        { label: "攻擊", value: characterStats.attack.toLocaleString(), icon: Swords },
                        { label: "防禦", value: characterStats.defense.toLocaleString(), icon: Shield },
                        { label: "每秒攻擊", value: `${(characterStats.speed / 100).toFixed(2)} 次`, icon: Gauge },
                        { label: "命中值", value: characterStats.hit, icon: Target, hint: `目前地圖估算命中率 ${effectiveHit.toFixed(1)}%（已計入當前樓層壓制）` },
                        { label: "閃避值", value: characterStats.dodge, icon: Activity, hint: `目前地圖估算閃避率 ${effectiveDodge.toFixed(1)}%；地圖怪物命中評等 ${monsterAccuracyRating}，你的閃避評等 ${playerEvasionRating}` },
                        { label: "暴擊", value: `${Math.min(100, characterStats.crit)}%`, icon: Zap },
                        { label: "暴擊傷害", value: `+${characterStats.critDamage}%`, icon: Sparkles },
                        { label: "吸血", value: `${Math.min(100, characterStats.lifesteal)}%`, icon: Droplets },
                        { label: "傷害減免", value: `${Math.min(balanceConfig.progression.damageReductionCap, characterStats.damageReduction)}%`, icon: ShieldCheck },
                      ].map(({ label, value, icon: Icon, hint }) => (
                        <span className="character-stat" key={label} title={hint || `${label} ${value}`} aria-label={`${label} ${value}${hint ? `，${hint}` : ""}`}>
                          <Icon aria-hidden="true" />
                          <small>{label}</small>
                          <b>{value}</b>
                        </span>
                      ))}
                    </div>
                    <details className="character-stat-details">
                      <summary>更多數值與掉落加成</summary>
                      <div className="character-stat-extra">
                        {[
                          ["首領傷害", `+${characterStats.bossDamage}%`],
                          ["經驗加成", `+${characterStats.expBonus}%`],
                          ["金幣加成", `+${characterStats.goldBonus}%`],
                          ["裝備掉落率", `+${characterStats.equipmentDrop}%`],
                          ["資源掉落率", `+${characterStats.resourceDrop}%`],
                          ["強化石掉落率", `+${characterStats.enhanceDrop}%`],
                          ["洗鍊石掉落率", `+${characterStats.reforgeDrop}%`],
                          ["高品質掉落率", `+${characterStats.highQualityDrop}%`],
                          ...setNumericBonuses,
                        ].map(([label, value]) => (
                          <span key={label}><small>{label}</small><b>{value}</b></span>
                        ))}
                        <p className="character-stat-context">目前地圖估算：命中 {effectiveHit.toFixed(1)}%（已計入當前樓層壓制） · 閃避 {effectiveDodge.toFixed(1)}%<br />地圖怪物命中評等 {monsterAccuracyRating} · 角色閃避評等 {playerEvasionRating}</p>
                      </div>
                    </details>
                  </div>
                </Panel>
              </div>
            </div>
          )}

          {tab === "寶石" && (
            <div className="page-section gem-page">
              <PageTitle
                title="寶石系統"
                sub="整理寶石、升階合成，或為裝備打孔與鑲嵌。"
              >
                <span className="gem-page-summary">
                  <Gem /> 寶石 {gemInventory.reduce((sum, stack) => sum + stack.quantity, 0)} · 打孔石 {drillingStones}
                </span>
              </PageTitle>
              <div className="gem-mode-tabs" role="tablist" aria-label="寶石功能">
                {(["寶石庫", "寶石合成", "裝備鑲嵌"] as const).map((mode) => (
                  <button key={mode} className={gemPageMode === mode ? "active" : ""} onClick={() => setGemPageMode(mode)}>{mode}</button>
                ))}
              </div>
              {gemPageMode === "裝備鑲嵌" ? (
                <Panel className="gem-socket-entry">
                  <Gem />
                  <div><h3>裝備鑲嵌</h3><p>選擇裝備後可打孔、查看孔位並鑲入寶石；已鑲嵌寶石不可拆卸。</p></div>
                  <button className="btn btn-primary" onClick={() => { setGemWorkshopOpen(true); setGemPageMode("裝備鑲嵌"); }}>選擇裝備與寶石</button>
                </Panel>
              ) : <div className={`gem-page-layout ${gemPageMode === "寶石庫" ? "vault-only" : ""}`}>
                {gemPageMode === "寶石合成" && (
                <Panel className="gem-circle-panel">
                  <div className="section-head">
                    <h3>三芒升階法陣</h3>
                    <span>{gemFusionMaterials.length} / 3</span>
                  </div>
                  <div className="gem-auto-actions">
                    <button className="btn btn-ghost" onClick={() => autoFillGemCircle("same")}>自動放入同名 ×3</button>
                    <button className="btn btn-ghost" onClick={() => autoFillGemCircle("mixed")}>自動混合 ×3</button>
                  </div>
                  <div className={`gem-magic-circle ${gemFusionMaterials.length === 3 ? "ready" : ""}`}>
                    <div className="gem-circle-backdrop" aria-hidden="true"><div className="magic-ring" /></div>
                    {gemFusionSlots.map((gem, index) => {
                      const definition = gem ? getGemDefinition(gem.gemId, gem.tier) : null;
                      return (
                        <button
                          key={index}
                          className={`magic-slot slot-${index + 1} ${gem ? "filled" : ""}`}
                          onClick={() => { setGemFusionResult(null); setGemFusionSlots((slots) => slots.map((value, slotIndex) => slotIndex === index ? null : value)); }}
                          aria-label={definition ? `移除${definition.tierLabel}${definition.name}` : `空的寶石槽位 ${index + 1}`}
                        >
                          {definition ? (
                            <>
                              <NextImage unoptimized width={256} height={256} loading="eager" src={definition.icon} alt="" />
                              <small>{definition.tierLabel}</small>
                              <b>{definition.name}</b>
                            </>
                          ) : (
                            <><Gem /><small>點選寶石放入</small></>
                          )}
                        </button>
                      );
                    })}
                    <div className="magic-core">
                      {gemFusionResult ? <NextImage unoptimized width={256} height={256} loading="eager" src={getGemDefinition(gemFusionResult.gem.gemId, gemFusionResult.gem.tier).icon} alt="合成結果" /> : fusionPreviewGem ? <NextImage unoptimized width={256} height={256} loading="eager" src={fusionPreviewGem.icon} alt="預計產物" /> : <Sparkles />}
                      <b>{gemFusionResult ? (gemFusionResult.success ? "成功" : "失敗") : gemFusionMaterials.length === 3 ? `${Math.round(gemFusionSuccessRate * 100)}%` : "待機"}</b>
                      <small>{gemFusionResult ? getGemDefinition(gemFusionResult.gem.gemId, gemFusionResult.gem.tier).name : gemFusionMaterials.length === 3 ? "成功率" : "升階法陣"}</small>
                    </div>
                  </div>
                  <div className="fusion-preview">
                    <b>
                      {gemFusionResult
                        ? `${gemFusionResult.success ? "獲得" : "保留"}${getGemDefinition(gemFusionResult.gem.gemId, gemFusionResult.gem.tier).tierLabel}${getGemDefinition(gemFusionResult.gem.gemId, gemFusionResult.gem.tier).name}`
                        : gemFusionMaterials.length < 3
                        ? "放入 3 顆同階寶石"
                        : gemFusionKeepsType
                          ? `固定升級為${getGemDefinition(gemFusionMaterials[0].gemId, gemFusionTier === "beginner" ? "intermediate" : "advanced").name}`
                          : "隨機選擇一種材料寶石升階"}
                    </b>
                    <small>失敗會消耗 2 顆，隨機保留 1 顆原階材料。</small>
                  </div>
                  <div className="gem-circle-actions gem-sticky-actions">
                    <button className="btn btn-primary" disabled={gemFusionMaterials.length !== 3} onClick={fuseMagicCircle}>
                      <Sparkles /> 啟動魔法陣 {gemFusionMaterials.length === 3 ? `· ${Math.round(gemFusionSuccessRate * 100)}%` : ""}
                    </button>
                    <button className="btn btn-ghost" disabled={!gemFusionMaterials.length} onClick={() => { setGemFusionResult(null); setGemFusionSlots([null, null, null]); }}>
                      清空槽位
                    </button>
                  </div>
                </Panel>
                )}
                <Panel className="gem-vault-panel">
                  <div className="section-head">
                    <h3>寶石庫</h3>
                    <span>{gemPageMode === "寶石合成" ? "點擊即可放入" : `共 ${gemInventory.reduce((sum, stack) => sum + stack.quantity, 0)} 顆`}</span>
                  </div>
                  <div className="gem-filter-row">
                    <select value={gemTierFilter} onChange={(event) => setGemTierFilter(event.target.value as typeof gemTierFilter)} aria-label="寶石階級">
                      <option value="全部">全部階級</option><option value="beginner">初階</option><option value="intermediate">中階</option><option value="advanced">高階</option>
                    </select>
                    <select value={gemStatFilter} onChange={(event) => setGemStatFilter(event.target.value as typeof gemStatFilter)} aria-label="寶石屬性">
                      <option value="全部">全部屬性</option><option value="戰鬥">戰鬥</option><option value="生存">生存</option><option value="收益">收益</option>
                    </select>
                  </div>
                  {filteredGemInventory.length ? (
                    <div className="gem-vault-grid">
                      {filteredGemInventory.map((stack) => {
                          const definition = getGemDefinition(stack.gemId, stack.tier);
                          const selectedCount = gemFusionMaterials.filter((gem) => gemStackKey(gem) === gemStackKey(stack)).length;
                          const disabled = gemPageMode !== "寶石合成" || stack.tier === "advanced" || Boolean(gemFusionTier && gemFusionTier !== stack.tier) || selectedCount >= stack.quantity || gemFusionMaterials.length >= 3;
                          return (
                            <button key={gemStackKey(stack)} className={`${stack.tier === "advanced" ? "max-tier" : ""} ${gemPageMode === "寶石庫" ? "vault-readonly" : ""}`} disabled={disabled} onClick={() => addGemToFusionCircle(stack)}>
                              <NextImage unoptimized width={256} height={256} loading="eager" src={definition.icon} alt="" />
                              <span><b>{definition.tierLabel} · {definition.name}</b><small>{gemEffectLabel(definition)} · 持有 {stack.quantity}</small></span>
                              <em>{stack.tier === "advanced" ? "已達最高階" : gemPageMode === "寶石庫" ? "可鑲嵌" : selectedCount ? `已放 ${selectedCount}` : "放入"}</em>
                            </button>
                          );
                        })}
                    </div>
                  ) : (
                    <div className="empty-bag"><Gem /><p>{gemInventory.length ? "沒有符合篩選的寶石" : "尚未獲得寶石"}</p></div>
                  )}
                  {gemPageMode === "寶石合成" && <details className="gem-rules-details"><summary>合成規則</summary><p>三顆同階寶石可升階。同名固定升級原寶石，混合則隨機選擇其中一種；失敗消耗兩顆並保留一顆。</p></details>}
                </Panel>
              </div>}
            </div>
          )}

          {tab === "技能" && (
            <div className="page-section">
              <PageTitle
                title={`${playerClass}技能`}
                sub="專精配置"
              />
              <SkillReworkPanel
                characterClass={playerClass}
                characterLevel={level}
                build={skillReworkBuild}
                onUpgrade={(name) => { void runSkillAction({ kind: "upgrade", name }); }}
                onEquip={(slot, name) => { void runSkillAction({ kind: "equip", slot, name }); }}
                ascensions={skillAscensions}
                onSelectAscension={(tier, name) => { void runSkillAction({ kind: "select_ascension", tier, name }); }}
                onConfirmAscensions={() => { void runSkillAction({ kind: "confirm_ascensions" }); }}
                busy={skillActionBusy}
              />
            </div>
          )}

          {tab === "首領" && (
            <div className="page-section">
              <PageTitle
                title="首領戰"
                sub={bossMode === "personal" ? "挑選首領，挑戰成功後領取獎勵。" : "60 秒挑戰 · 每日 00:00 重置次數 · 12:00 結算排行"}
              />
              <div className="mode-tabs">
                <button
                  className={bossMode === "personal" ? "active" : ""}
                  onClick={() => setBossMode("personal")}
                >
                  個人首領 <span>{bossTickets} / 10</span>
                </button>
                <button
                  className={bossMode === "world" ? "active" : ""}
                  onClick={() => setBossMode("world")}
                >
                  世界首領 <span>{worldAttempts} / 3</span>
                </button>
              </div>
              {bossMode === "personal" ? (
                <div className="boss-layout">
                  <div className="boss-list">
                    {Array.from(new Set(personalBosses.map((boss) => boss.mapId))).map((mapId) => {
                      const group = personalBosses.filter((boss) => boss.mapId === mapId);
                      return (
                        <section className="boss-list-group" key={mapId} aria-label={group[0].map}>
                          <div className="boss-list-region"><span>{group[0].map}</span><small>通過 {group[0].baseFloor} 層解鎖</small></div>
                          {group.map((b) => {
                            const locked = (mapBestFloors[b.mapId] ?? 0) < b.baseFloor;
                            return (
                              <button key={b.id} disabled={locked}
                                className={`${selectedBoss.id === b.id ? "active" : ""} ${b.name.includes("真身") ? "boss-form-true" : ""}`}
                                onClick={() => { setSelectedBoss(b); setBattleReport([]); }}>
                                {locked ? <LockKeyhole /> : <Skull />}
                                <span><b>{b.name}</b><small>{locked ? "尚未解鎖" : "可挑戰"}</small></span>
                                <ChevronRight />
                              </button>
                            );
                          })}
                        </section>
                      );
                    })}
                  </div>
                  <BossDetail
                    name={selectedBoss.name}
                    level={selectedBoss.level}
                    hp={selectedBoss.hp}
                    reward={selectedBoss.reward}
                    image={monsterImages[selectedBoss.name]}
                    attempts={`${bossTickets} / 10`}
                    report={battleReport}
                    disabled={(mapBestFloors[selectedBoss.mapId] ?? 0) < selectedBoss.baseFloor || bossTickets <= 0}
                    disabledReason={bossTickets <= 0 ? "今日挑戰次數已用完" : "尚未解鎖"}
                    onFight={() => fightBoss()}
                  />
                </div>
              ) : (
                <div className="world-boss-grid">
                  {worldBosses.map((b) => {
                    const locked = level < b.level;
                    const active = worldBossOpen && b.active && !locked;
                    return (
                      <Panel key={b.id} className={`world-card ${b.active ? "world-card-active" : "world-card-preview"}`}>
                        <div
                          className="world-art"
                          style={{ "--boss": b.accent } as React.CSSProperties}
                        >
                          {b.image ? (
                            <NextImage unoptimized width={1024} height={1536} loading="eager" src={b.image} alt={`${b.name}世界首領`} />
                          ) : (
                            <Crown />
                          )}
                          <span>
                            {active
                              ? "全球開放中"
                              : locked
                                ? `Lv.${b.level} 解鎖`
                                : "尚未開放"}
                          </span>
                        </div>
                        <small>{b.active ? "每日 3 次・每回合 60 秒" : "後續世界災厄"}</small>
                        <h3>{b.name}</h3>
                        <p>
                          Lv.{b.level} · 生命 {b.hp.toLocaleString()}
                        </p>
                        <p className="world-skill">界滅技能・{b.skill}</p>
                        <Meter value={b.active ? ((3 - worldAttempts) / 3) * 100 : 0} color={b.accent} />
                        {b.active ? (
                          <>
                            <div className="world-stats">
                              <span>
                                本期排名 <b>{worldRank ? `#${worldRank}` : worldPeriodDamage > 0 ? "更新中" : "—"}</b>
                              </span>
                              <span>
                                本期傷害 <b>{worldPeriodDamage.toLocaleString()}</b>
                              </span>
                              <span>
                                本期最高 <b>{worldLeaderDamage.toLocaleString()}</b>
                              </span>
                            </div>
                            <div className="world-top-rank" aria-label="世界首領前五名傷害排行">
                              <div className="world-top-rank-title"><Trophy /> 前五傷害</div>
                              {worldTopRanks.length ? worldTopRanks.map((rank, index) => {
                                const place = index + 1;
                                const reward = place === 1
                                  ? <><Crown />職業神話・5詞綴 <Gem />500 <RefreshCw />200</>
                                  : place === 2
                                    ? <><Trophy />特殊傳奇／神話 <Gem />300 <RefreshCw />150</>
                                    : place === 3
                                      ? <><Trophy />特殊傳奇 <Gem />200 <RefreshCw />100</>
                                      : null;
                                return (
                                  <div className={`world-top-rank-row place-${place}`} key={`${rank.name}-${place}`}>
                                    <b className="world-top-place">{place}</b>
                                    <span className="world-top-name">{rank.name ?? "未知冒險者"}</span>
                                    <small>{rank.cls ?? "—"}</small>
                                    <strong>{Math.max(0, Number(rank.damage ?? 0)).toLocaleString()}</strong>
                                    {reward && <span className="world-top-reward">{reward}</span>}
                                  </div>
                                );
                              }) : <p className="world-top-empty">暫無傷害紀錄</p>}
                            </div>
                          </>
                        ) : (
                          <div className="world-stats world-stats-preview">
                            <span>目前無法挑戰</span>
                          </div>
                        )}
                        <button
                          className="btn btn-primary"
                          disabled={!active || worldAttempts <= 0}
                          onClick={() => fightBoss(b)}
                        >
                          {!b.active || !worldBossOpen
                            ? "尚未降臨"
                            : locked
                              ? `Lv.${b.level} 才可挑戰`
                              : worldAttempts <= 0
                                ? "今日挑戰已用完"
                                : `單挑深淵王（${worldAttempts}/3）`}
                        </button>
                      </Panel>
                    );
                  })}
                </div>
              )}
              {battleReport.length > 0 && bossMode === "world" && (
                <BattleReport lines={battleReport} />
              )}
            </div>
          )}

          {tab === "排行" && (
            <Ranking
              playerName={playerName}
              playerClass={playerClass}
              combatPower={assessedCombatPower}
              level={level}
              rebirthCount={rebirthCount}
              selectedAppearance={selectedAppearance}
              refreshIn={refreshIn}
            />
          )}
          {tab === "商城" && (
            <Shop
              yuanbao={yuanbao}
              gold={gold}
              idleSeconds={idleSeconds}
              selectedTitle={selectedTitle}
              selectedTitleBonus={selectedTitleBonus}
              selectedAppearance={selectedAppearance}
              ashCleared={(mapBestFloors[1] ?? 0) >= MAP_FLOORS}
              abyssCleared={(mapBestFloors[9] ?? 0) >= MAP_FLOORS || finalBossDefeated}
              ownedTitles={ownedTitles}
              ownedAppearances={ownedAppearances}
              onSelectTitle={setSelectedTitle}
              onSelectAppearance={setSelectedAppearance}
              onBuy={buyShopItem}
              shopPurchaseBusy={shopPurchaseBusy || !saveReady || sessionSuperseded}
              onPaidSkillReset={async () => {
                if (await runSkillAction({ kind: "paid_reset" })) {
                  pushLog("收益", "商城技能重置，消耗 300 元寶");
                  toast.success("新版技能點已重置", { description: "消耗 300 元寶；昇華選擇保留" });
                }
              }}
              skillResetBusy={skillActionBusy || !saveReady || sessionSuperseded}
              skillResetAvailable={Object.values(skillReworkBuild.ranks).some((rank) => rank > 0)}
            />
          )}
          {tab === "日誌" && <Logs logs={logs} />}
        </div>
        <nav className="mobile-nav">
          {navItems.map((item) => {
            const Icon = navIcons[item];
            return (
              <button
                key={item}
                className={tab === item ? "active" : ""}
                onClick={() => setTab(item)}
              >
                <Icon />
                <span>{item}</span>
                {item === "背包" && unseenItemIds.length > 0 && (
                  <em>{unseenItemIds.length}</em>
                )}
                {item === "技能" && availableSkillPoints > 0 && (
                  <em>{availableSkillPoints}</em>
                )}
              </button>
            );
          })}
        </nav>
      </div>
      {isGm && <AdminMonitor open={adminOpen} onOpenChange={setAdminOpen} />}
    </main>
  );
}

function PageTitle({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <p className="eyebrow">DARK WORLD</p>
        <h1>{title}</h1>
        <span>{sub}</span>
      </div>
      {children}
    </div>
  );
}

function BossDetail({
  name,
  level,
  hp,
  image,
  reward,
  attempts,
  report,
  disabled,
  disabledReason,
  onFight,
}: {
  name: string;
  level: number;
  hp: number;
  image?: string;
  reward: string;
  attempts: string;
  report: string[];
  disabled: boolean;
  disabledReason: string;
  onFight: () => void;
}) {
  return (
    <Panel className={`boss-detail ${name.includes("真身") ? "boss-detail-true" : ""}`}>
      <div className="boss-visual" style={image ? { "--boss-image": `url("${image}")` } as React.CSSProperties : undefined}>
        {image ? (
          <NextImage unoptimized width={1024} height={1536} loading="eager" className="boss-image" src={image} alt={name} />
        ) : (
          <div className="boss-sigil">
            <Skull />
          </div>
        )}
        <span>個人首領</span>
        <h2>{name}</h2>
        <p>
          Lv.{level} · {hp.toLocaleString()} 生命
        </p>
      </div>
      <div className="boss-info">
        <div>
          <small>可能掉落</small>
          <b>{reward}</b>
        </div>
        <div>
          <small>今日剩餘</small>
          <b>{attempts}</b>
        </div>
        <div>
          <small>規則</small>
          <b>失敗不扣票 · 無冷卻</b>
        </div>
      </div>
      <button
        className="btn btn-primary boss-fight"
        disabled={disabled}
        onClick={onFight}
      >
        <Swords />
        {disabled ? disabledReason : "開始挑戰"}
      </button>
      {report.length > 0 && <BattleReport lines={report} />}
    </Panel>
  );
}

function BattleReport({ lines }: { lines: string[] }) {
  return (
    <div className="report">
      <div>
        <History />
        <b>對戰戰況</b>
      </div>
      {lines.map((l, i) => (
        <p key={i} className={i === lines.length - 1 ? "result" : ""}>
          {l}
        </p>
      ))}
    </div>
  );
}

function Ranking({
  playerName,
  playerClass,
  combatPower,
  level,
  rebirthCount,
  selectedAppearance,
  refreshIn,
}: {
  playerName: string;
  playerClass: GameClass;
  combatPower: number;
  level: number;
  rebirthCount: number;
  selectedAppearance: AppearanceId;
  refreshIn: string;
}) {
  type PublicRank = {
    name: string;
    cls: GameClass;
    level: number;
    power: number;
    rebirth: number;
    portrait?: string;
    currentMapId?: number;
    currentFloor?: number;
    highestFloor?: number;
    unlockedMapId?: number;
    mapBestFloors?: Record<string, number>;
    equippedItems?: { id: number; name: string; slot: string; quality: string; enhance: number; set: string; power: number; mapId: number; affixes: string[]; prefixId?: string; suffixId?: string; mythicId?: string; legendaryId?: string; artKey?: string }[];
    appearance?: AppearanceId;
  };
  const [ranks, setRanks] = useState<PublicRank[]>([]);
  const [selectedRank, setSelectedRank] = useState<PublicRank | null>(null);
  const [rankPage, setRankPage] = useState(0);
  useEffect(() => {
    fetch("/api/ranking", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setRanks(Array.isArray(data.ranks) ? data.ranks : []))
      .catch(() => setRanks([]));
  }, []);
  const displayRanks = (ranks.length ? ranks : [{ name: playerName, cls: playerClass, level, power: combatPower, rebirth: rebirthCount, portrait: characterAvatarPath(playerClass, rebirthCount) }]).map((rank) => ({
    ...rank,
    portrait: characterAvatarPath(rank.cls, rank.rebirth),
    ...(rank.name === playerName ? { appearance: selectedAppearance } : {}),
  }));
  const mapNames = ["灰燼墓園", "骸骨荒原", "黑鐵礦坑", "毒霧沼澤", "永夜密林", "惡魔城塞", "星界廢墟", "霜火王座", "時墟深淵"];
  const rankPageCount = Math.max(1, Math.ceil(displayRanks.length / 10));
  const visibleRanks = displayRanks.slice(rankPage * 10, rankPage * 10 + 10);
  const rankItemToItem = (item: NonNullable<PublicRank["equippedItems"]>[number]) => ({
    ...item,
    mapId: item.mapId || 1,
    equipmentType: (item.mythicId ? "神話裝備" : item.legendaryId ? "特殊傳奇" : "場景普通裝備") as Item["equipmentType"],
  }) as Item;
  const rankNameClass = (name: string, podium = false) => {
    const prefix = podium ? "place-name" : "rank-name";
    if (name.length >= 16) return `${prefix} ${prefix}-very-long`;
    if (name.length >= 10) return `${prefix} ${prefix}-long`;
    return prefix;
  };
  return (
    <div className="page-section">
      <PageTitle title="英雄排行" sub="每小時更新一次；目前不設賽季。">
        <span className="refresh-time">
          <Clock3 />
          距更新 {refreshIn}
        </span>
      </PageTitle>
      <Panel className="ranking">
        <div className="podium">
          {displayRanks.slice(0, 3).map((r, i) => (
            <button key={`${r.name}-${i}`} className={`place p${i + 1}`} onClick={() => setSelectedRank(r)} type="button">
              <Crown />
              <div className="rank-avatar">
                <CharacterAppearanceVfx id={r.appearance ?? "none"} className="rank-appearance-vfx" />
                <NextImage unoptimized width={256} height={256} loading="eager" src={r.portrait ?? `/characters/${r.cls === "戰士" ? "warrior" : r.cls === "遊俠" ? "ranger" : "mage"}-head.webp`} alt={`${r.cls}角色`} />
              </div>
              <b className={rankNameClass(r.name, true)}>{r.name}</b>
              <span className={r.rebirth > 0 ? "rank-level rebirth-level" : "rank-level"}>
                {r.rebirth > 0 && <b>{r.rebirth}轉</b>} {r.level}等
              </span>
              <span>{formatAssessedPower(r.power)} 綜合戰力</span>
              <em>#{i + 1}</em>
            </button>
          ))}
        </div>
        <div className="rank-table">
          <div className="rank-head">
            <span>名次</span>
            <span>冒險者</span>
            <span>等級</span>
            <span>綜合戰力</span>
            <span>資料</span>
          </div>
          {visibleRanks.map((r, i) => {
            const rankIndex = rankPage * 10 + i;
            return <button key={`${r.name}-row`} className="rank-row-button" onClick={() => setSelectedRank(r)} type="button">
              <b className="rank-cell-rank">#{rankIndex + 1}</b>
              <span className="rank-cell-player">
                <span className={rankNameClass(r.name)}>{r.name}</span>
                <small>{r.cls}</small>
              </span>
              <span className={`rank-cell-level ${r.rebirth > 0 ? "rank-level rebirth-level" : "rank-level"}`}>
                {r.rebirth > 0 && <b>{r.rebirth}轉</b>} {r.level}等
              </span>
              <strong className="rank-cell-power">{formatAssessedPower(r.power)}</strong>
              <span className="rank-view-action">查看</span>
            </button>;
          })}
          {!displayRanks.some((r) => r.name === playerName) && <div className="my-rank"><b className="rank-cell-rank">—</b><span className="rank-cell-player"><span>{playerName}（你）</span><small>{playerClass}</small></span><span className="rank-cell-level rank-level">{level}等</span><strong className="rank-cell-power">{formatAssessedPower(combatPower)}</strong><span /></div>}
          {rankPageCount > 1 && <div className="rank-pagination">
            <button type="button" onClick={() => setRankPage((page) => Math.max(0, page - 1))} disabled={rankPage === 0}>上一頁</button>
            <span>第 {rankPage + 1} / {rankPageCount} 頁</span>
            <button type="button" onClick={() => setRankPage((page) => Math.min(rankPageCount - 1, page + 1))} disabled={rankPage >= rankPageCount - 1}>下一頁</button>
          </div>}
        </div>
      </Panel>
      <Dialog open={Boolean(selectedRank)} onOpenChange={(open) => !open && setSelectedRank(null)}>
        <DialogContent className="rank-detail-dialog">
          {selectedRank && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedRank.name} 的冒險資料</DialogTitle>
                <DialogDescription>
                  {selectedRank.cls} · {selectedRank.rebirth > 0 ? `${selectedRank.rebirth}轉 ` : ""}{selectedRank.level}等 · 綜合戰力 {formatAssessedPower(selectedRank.power)}
                </DialogDescription>
              </DialogHeader>
              <div className="rank-detail-progress">
                <div className="rank-detail-current">
                  目前進度：{mapNames[(selectedRank.currentMapId ?? 1) - 1] ?? "未知地圖"} 第 {selectedRank.currentFloor ?? 1} 層
                </div>
                <div className="rank-map-progress-grid">
                  {mapNames.map((name, index) => (
                    <div key={name} className="rank-map-progress">
                      <span>{index + 1}. {name}</span>
                      <b>{selectedRank.mapBestFloors?.[String(index + 1)] ?? 0}/30</b>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rank-worn-gear">
                <h4>目前穿著 <span>{selectedRank.equippedItems?.length ?? 0}/10 件 · 點擊裝備查看屬性</span></h4>
                <div className="rank-paperdoll paperdoll">
                  <div className="character-display">
                    <CharacterAppearanceVfx id={selectedRank.appearance ?? (selectedRank.name === playerName ? selectedAppearance : "none")} />
                    <NextImage unoptimized width={1024} height={1536} loading="eager" className="inventory-character" src={characterFullbodyPath(selectedRank.cls, selectedRank.rebirth)} alt={`${selectedRank.cls}角色立繪`} />
                  </div>
                  {["武器", "頭盔", "胸甲", "手套", "鞋子", "項鍊", "戒指", "腰帶", "護腕", "披風"].map((slot, index) => {
                    const item = selectedRank.equippedItems?.find((entry) => entry.slot === slot);
                    return <Popover key={slot}>
                      <PopoverTrigger asChild>
                        <button type="button" className={`gear-slot s${index + 1} rank-gear-slot`} disabled={!item} aria-label={item ? `${slot}：${item.name}` : slot}>
                          <small className="slot-name">{slot}</small>
                          {item && <EquipmentIcon item={rankItemToItem(item)} className="paperdoll-art" />}
                          <span className="gear-enhance" style={{ color: item ? qualityColors[item.quality] : "#59605d" }}>{item ? item.enhance ? `+${item.enhance}` : "◆" : "—"}</span>
                        </button>
                      </PopoverTrigger>
                      {item && <PopoverContent side="right" sideOffset={8} className="gear-tooltip-shell rank-gear-popover"><GearTooltip item={rankItemToItem(item)} /></PopoverContent>}
                    </Popover>;
                  })}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Shop({
  yuanbao,
  gold,
  idleSeconds,
  selectedTitle,
  selectedTitleBonus,
  selectedAppearance,
  ashCleared,
  abyssCleared,
  ownedTitles,
  ownedAppearances,
  onSelectTitle,
  onSelectAppearance,
  onBuy,
  onPaidSkillReset,
  skillResetBusy,
  skillResetAvailable,
  shopPurchaseBusy,
}: {
  yuanbao: number;
  gold: number;
  idleSeconds: number;
  selectedTitle: TitleId;
  selectedTitleBonus: string;
  selectedAppearance: AppearanceId;
  ashCleared: boolean;
  abyssCleared: boolean;
  ownedTitles: TitleId[];
  ownedAppearances: AppearanceId[];
  onSelectTitle: (id: TitleId) => void;
  onSelectAppearance: (id: AppearanceId) => void;
  onBuy: (item: "reforge" | "gamble" | "title-ash" | "title-abyss" | "appearance-ember" | "appearance-arcane" | "appearance-abyss" | "gold-reforge" | "gold-enhance") => void;
  onPaidSkillReset: () => Promise<void>;
  skillResetBusy: boolean;
  skillResetAvailable: boolean;
  shopPurchaseBusy: boolean;
}) {
  const [currency, setCurrency] = useState<"yuanbao" | "gold">("yuanbao");
  const [yuanbaoPage, setYuanbaoPage] = useState<1 | 2>(1);
  const [confirmSkillReset, setConfirmSkillReset] = useState(false);
  const resetPrice = balanceConfig.economy.costs.skillReworkResetYuanbao;
  return (
    <div className="page-section">
      <PageTitle title="暗黑商城" sub="使用金幣或元寶兌換冒險資源。" />
      <div className="mode-tabs">
        <button className={currency === "yuanbao" ? "active" : ""} onClick={() => setCurrency("yuanbao")}>
          元寶商城 <span>{yuanbao}</span>
        </button>
        <button className={currency === "gold" ? "active" : ""} onClick={() => setCurrency("gold")}>
          金幣商城 <span>{gold.toLocaleString()}</span>
        </button>
      </div>
      {currency === "yuanbao" && <div className="mode-tabs shop-page-tabs"><button className={yuanbaoPage === 1 ? "active" : ""} onClick={() => setYuanbaoPage(1)}>第一頁：資源</button><button className={yuanbaoPage === 2 ? "active" : ""} onClick={() => setYuanbaoPage(2)}>第二頁：外型</button></div>}
      {currency === "gold" ? (
        <div className="shop-grid">
          <Panel className="shop-card"><h3>強化石 ×50</h3><p>資源補給｜強化裝備使用。</p><button className="btn btn-primary" onClick={() => onBuy("gold-enhance")}>100,000 金幣購買</button></Panel>
          <Panel className="shop-card"><h3>洗鍊石 ×10</h3><p>資源補給｜洗鍊裝備使用。</p><button className="btn btn-primary" onClick={() => onBuy("gold-reforge")}>200,000 金幣購買</button></Panel>
        </div>
      ) : yuanbaoPage === 2 ? (
        <div className="shop-grid">
          <Panel className="shop-card"><h3>灰燼征服者</h3><p>稱號｜通關灰燼墓園後解鎖。裝備時：經驗 +5%。</p><button className="btn btn-primary" disabled={shopPurchaseBusy || ownedTitles.includes("ash-conqueror") || !ashCleared} onClick={() => onBuy("title-ash")}>{ownedTitles.includes("ash-conqueror") ? "已解鎖" : !ashCleared ? "通關灰燼墓園後解鎖" : "200 元寶解鎖"}</button></Panel>
          <Panel className="shop-card"><h3>深淵倖存者</h3><p>稱號｜通關時墟深淵後解鎖。裝備時：經驗／攻擊／防禦 +10%。</p><button className="btn btn-primary" disabled={shopPurchaseBusy || ownedTitles.includes("abyss-survivor") || !abyssCleared} onClick={() => onBuy("title-abyss")}>{ownedTitles.includes("abyss-survivor") ? "已解鎖" : !abyssCleared ? "通關時墟深淵後解鎖" : "2,000 元寶解鎖"}</button></Panel>
          <Panel className="shop-card"><h3>灰燼熔翼</h3><p>外觀｜熔岩骨翼與火星彈射。裝備時：攻擊 +5%。</p><button className="btn btn-primary" disabled={shopPurchaseBusy || ownedAppearances.includes("ember-aura")} onClick={() => onBuy("appearance-ember")}>{ownedAppearances.includes("ember-aura") ? "已解鎖" : "500 元寶解鎖"}</button></Panel>
          <Panel className="shop-card"><h3>奧術星翼</h3><p>外觀｜紫色符文能量羽翼。裝備時：攻擊／防禦 +10%。</p><button className="btn btn-primary" disabled={shopPurchaseBusy || ownedAppearances.includes("arcane-aura")} onClick={() => onBuy("appearance-arcane")}>{ownedAppearances.includes("arcane-aura") ? "已解鎖" : "1,500 元寶解鎖"}</button></Panel>
          <Panel className="shop-card"><h3>深淵黑翼</h3><p>外觀｜黑紅破碎深淵蝠翼。裝備時：攻擊 +15%、防禦／命中／迴避 +10%。</p><button className="btn btn-primary" disabled={shopPurchaseBusy || ownedAppearances.includes("abyss-aura")} onClick={() => onBuy("appearance-abyss")}>{ownedAppearances.includes("abyss-aura") ? "已解鎖" : "4,500 元寶解鎖"}</button></Panel>
        </div>
      ) : (
        <div className="shop-grid">
          <Panel className="shop-card"><h3>洗鍊石 ×12</h3><p>資源補給｜補充裝備洗鍊所需的稀有資源。</p><button className="btn btn-primary" disabled={shopPurchaseBusy} onClick={() => onBuy("reforge")}>10 元寶購買</button></Panel>
          <Panel className="shop-card"><h3>賭狗禮包</h3><p>資源補給｜已攻略最高地圖的隨機部位裝備。</p><small>史詩 40%・洗鍊石 ×10 30%・傳奇 20%・神話 10%</small><button className="btn btn-primary" onClick={() => onBuy("gamble")}>10 元寶開啟</button></Panel>
          <Panel className="shop-card">
            <h3>新版技能重置</h3><p>重置已分配的新版技能點與出戰槽；昇華選擇保留。</p>
            {confirmSkillReset ? <div className="cosmetic-actions">
              <button className="btn btn-primary" disabled={skillResetBusy || yuanbao < resetPrice || !skillResetAvailable}
                onClick={async () => { setConfirmSkillReset(false); await onPaidSkillReset(); }}>確認消耗 {resetPrice} 元寶</button>
              <button className="btn btn-ghost" disabled={skillResetBusy} onClick={() => setConfirmSkillReset(false)}>取消</button>
            </div> : <button className="btn btn-primary" disabled={skillResetBusy || yuanbao < resetPrice || !skillResetAvailable}
              onClick={() => setConfirmSkillReset(true)}>{resetPrice} 元寶重置</button>}
            {yuanbao < resetPrice && <small>元寶不足</small>}
            {!skillResetAvailable && <small>尚未分配新版技能點</small>}
          </Panel>
        </div>
      )}
      <Panel className="shop-card cosmetic-loadout"><h3>目前裝備</h3><p>稱號：{TITLE_OPTIONS[selectedTitle].name}　外觀：{APPEARANCE_OPTIONS[selectedAppearance].name}</p><small className="title-extra-bonus">額外加成：{selectedTitleBonus}</small><div className="cosmetic-actions"><select value={selectedTitle} onChange={(event) => onSelectTitle(event.target.value as TitleId)}>{ownedTitles.map((id) => <option key={id} value={id}>{TITLE_OPTIONS[id].name}</option>)}</select><select value={selectedAppearance} onChange={(event) => onSelectAppearance(event.target.value as AppearanceId)}>{ownedAppearances.map((id) => <option key={id} value={id}>{APPEARANCE_OPTIONS[id].name}</option>)}</select></div><small>金幣 {gold.toLocaleString()} · 元寶 {yuanbao.toLocaleString()}</small></Panel>
      <Panel>
        <h3>泡點模式</h3>
        <p>頁面開啟期間每 10 分鐘自動獲得 10 元寶。</p>
        <p>目前累積：{Math.floor(idleSeconds / 60)} 分鐘</p>
      </Panel>
    </div>
  );
}

function Logs({ logs }: { logs: LogEntry[] }) {
  const [filter, setFilter] = useState("全部");
  const shown =
    filter === "全部" ? logs : logs.filter((l) => l.type === filter);
  return (
    <div className="page-section">
      <PageTitle title="冒險日誌" sub="最多保留最近 30 筆紀錄。" />
      <div className="log-filters">
        {[
          "全部",
          "戰鬥",
          "掉落",
          "收益",
          "裝備",
          "強化",
          "首領",
          "技能",
          "系統",
        ].map((f) => (
          <button
            key={f}
            className={filter === f ? "active" : ""}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <Panel className="full-log">
        {shown.length ? (
          shown.map((log) => (
            <div key={log.id}>
              <span className={`log-icon ${log.type}`}>
                <ScrollText />
              </span>
              <div>
                <small>{log.type}</small>
                <p>{log.text}</p>
              </div>
              <time>{log.time}</time>
            </div>
          ))
        ) : (
          <div className="empty-log">
            <ScrollText />
            <p>目前沒有這類紀錄</p>
          </div>
        )}
      </Panel>
    </div>
  );
}

function AnnouncementModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="announcement-dialog">
        <DialogHeader>
          <span className="announcement-kicker">系統公告</span>
          <DialogTitle>暗黑世界維護中</DialogTitle>
          <DialogDescription>
            伺服器目前已進入維護模式。
          </DialogDescription>
        </DialogHeader>
        <div className="announcement-body">
          <div className="announcement-time">
            <span>目前狀態</span>
            <strong>維護進行中</strong>
          </div>
          <p>一般玩家已暫停登入，遊戲與雲端存檔操作亦已停止。</p>
          <p>
            感謝您對《暗黑世界》的支持。<br />
            我們正在整理封測資料，重新開放時間將另行公告。
          </p>
        </div>
        <button className="btn btn-primary announcement-action" type="button" onClick={() => onOpenChange(false)}>
          關閉公告
        </button>
      </DialogContent>
    </Dialog>
  );
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("welcome");
  const [announcementOpen, setAnnouncementOpen] = useState(MAINTENANCE_MODE);
  const [logoutReason, setLogoutReason] = useState<string | null>(null);
  const [accountName, setAccountName] = useState("");
  const [isGm, setIsGm] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [playerClass, setPlayerClass] = useState<GameClass>("戰士");
  const [characterId, setCharacterId] = useState("");
  const [loginId, setLoginId] = useState("");
  const [gameLoading, setGameLoading] = useState(false);
  const [gameLoadingProgress, setGameLoadingProgress] = useState({ loaded: 0, total: 0 });
  const enterGame = async (cls: GameClass) => {
    setGameLoading(true);
    setGameLoadingProgress({ loaded: 0, total: 0 });
    const startedAt = Date.now();
    await preloadGameEntryImages(gameEntryImagePaths(cls), (loaded, total) => {
      setGameLoadingProgress({ loaded, total });
    });
    const remainingTransition = Math.max(0, 750 - (Date.now() - startedAt));
    if (remainingTransition > 0)
      await new Promise((resolve) => window.setTimeout(resolve, remainingTransition));
    setStage("game");
    setGameLoading(false);
  };
  useEffect(() => {
    if (!localStorage.getItem(LEGACY_DATA_RESET_KEY)) {
      [
        CHARACTER_SLOTS_KEY,
        "dark-world-guest-account-v1",
        "dark-world-character",
        "dark-world-player-id",
      ].forEach((key) => localStorage.removeItem(key));
      localStorage.setItem(LEGACY_DATA_RESET_KEY, "1");
    }
    const restoredLoginId = sessionStorage.getItem(LOGIN_INSTANCE_STORAGE_KEY) ?? "";
    if (!restoredLoginId) return;
    void fetch("/api/auth", { headers: loginHeaders(restoredLoginId), cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then(async (result) => {
        if (!result?.account) return;
        setLoginId(restoredLoginId);
        setAccountName(result.account.username);
        setIsGm(Boolean(result.account.isGm));
        const characterResponse = await fetch("/api/character", {
          headers: loginHeaders(restoredLoginId),
          cache: "no-store",
        });
        const characterResult = characterResponse.ok
          ? await characterResponse.json()
          : null;
        if (characterResult?.character) {
          setPlayerName(characterResult.character.name);
          setPlayerClass(characterResult.character.cls);
          setCharacterId(characterResult.character.id);
          await enterGame(characterResult.character.cls);
        } else {
          setStage("create");
        }
      })
      .catch(() => undefined);
  }, []);
  const create = async (name: string, cls: GameClass, existing?: CharacterSlot) => {
    const id = existing?.id ?? createCharacterId();
    if (!existing) {
      try {
        const response = await fetch("/api/character", {
          method: "POST",
          headers: loginHeaders(loginId, true),
          body: JSON.stringify({
            playerId: id,
            accountName,
            playerName: name,
            playerClass: cls,
          }),
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          if (result.error === "account_already_has_character")
            toast.error("這個帳號已經有角色", { description: "每個帳號只能建立一名角色與一個職業。" });
          else if (result.error === "nickname_already_taken")
            toast.error("遊戲暱稱已被使用", { description: "請改用其他不重複的暱稱。" });
          else toast.error("角色建立失敗", { description: "請稍後再試。" });
          return;
        }
      } catch {
        toast.error("目前無法確認角色資料", { description: "請確認網路連線後再試。" });
        return;
      }
    }
    const slots = readCharacterSlots();
    slots[accountCharacterKey(accountName)] = {
      id,
      name,
      cls,
      account: accountName,
    };
    localStorage.setItem(CHARACTER_SLOTS_KEY, JSON.stringify(slots));
    setPlayerName(name);
    setPlayerClass(cls);
    setCharacterId(id);
    localStorage.setItem(
      "dark-world-character",
      JSON.stringify({ id, name, cls, account: accountName }),
    );
    await enterGame(cls);
  };
  const exit = useCallback(() => {
    void fetch("/api/auth", {
      method: "POST",
      headers: loginHeaders(loginId, true),
      body: JSON.stringify({ action: "logout" }),
    }).catch(() => undefined);
    sessionStorage.removeItem(LOGIN_INSTANCE_STORAGE_KEY);
    setLoginId("");
    localStorage.removeItem("dark-world-character");
    setCharacterId("");
    setStage("welcome");
    setLogoutReason(null);
  }, [loginId]);
  const endReplacedSession = useCallback((reason: "replaced" | "suspended" | "expired" | "maintenance") => {
    // Never call the logout endpoint from an obsolete tab. Tabs share the
    // cookie jar, so clearing it here would also sign out the newest login.
    sessionStorage.removeItem(LOGIN_INSTANCE_STORAGE_KEY);
    setLoginId("");
    localStorage.removeItem("dark-world-character");
    setCharacterId("");
    setStage("welcome");
    setLogoutReason(
      reason === "maintenance"
        ? "伺服器已進入維護模式，一般玩家的戰鬥與存檔已安全停止。"
        : reason === "suspended"
        ? "此帳號目前已停權，遊戲與存檔已停止。"
        : reason === "expired"
          ? "登入狀態已到期，請重新登入後載入伺服器存檔。"
          : "偵測到較新的登入；這個舊視窗已停止遊戲與存檔，最新登入不受影響。",
    );
  }, []);
  if (gameLoading)
    return <GameEntryLoading loaded={gameLoadingProgress.loaded} total={gameLoadingProgress.total} />;
  if (stage === "welcome")
    return (
      <>
        <AnnouncementModal open={announcementOpen} onOpenChange={setAnnouncementOpen} />
        <Welcome
          onAccount={async (name, password, mode) => {
          try {
            const nextLoginId = crypto.randomUUID();
            const response = await fetch("/api/auth", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ action: mode, username: name, password, loginId: nextLoginId }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
              const message =
                result.error === "rate_limited"
                  ? `嘗試次數過多，請等待 ${Math.max(1, Math.ceil(Number(result.retryAfter ?? 60) / 60))} 分鐘後再試`
                  : result.error === "auth_temporarily_unavailable"
                    ? "登入服務暫時無法使用，請稍後再試"
                    : result.error === "account_already_exists"
                  ? "這個帳號已存在，請直接登入。"
                  : result.error === "maintenance"
                    ? result.message ?? MAINTENANCE_MESSAGE
                  : result.error === "account_suspended"
                    ? `此帳號目前已停權：${result.reason ?? "請聯絡管理員"}`
                  : result.error === "invalid_credentials"
                    ? "帳號或密碼錯誤。"
                    : "帳號建立或登入失敗，請稍後再試。";
              toast.error(message);
              return;
            }
            sessionStorage.setItem(LOGIN_INSTANCE_STORAGE_KEY, nextLoginId);
            setLoginId(nextLoginId);
            setLogoutReason(null);
            setAccountName(result.account.username);
            setIsGm(Boolean(result.account.isGm));
            const characterResponse = await fetch("/api/character", {
              headers: loginHeaders(nextLoginId),
              cache: "no-store",
            });
            const characterResult = characterResponse.ok
              ? await characterResponse.json()
              : null;
            if (characterResult?.character) {
              setPlayerName(characterResult.character.name);
              setPlayerClass(characterResult.character.cls);
              setCharacterId(characterResult.character.id);
              await enterGame(characterResult.character.cls);
            } else {
              setStage("create");
            }
          } catch {
            toast.error("目前無法連線到帳號服務，請稍後再試。");
          }
          }}
        />
        <Dialog
          open={Boolean(logoutReason)}
          onOpenChange={(open) => {
            if (!open) setLogoutReason(null);
          }}
        >
          <DialogContent className="mail-dialog session-replaced-dialog">
            <DialogHeader>
              <DialogTitle>此視窗已自動登出</DialogTitle>
              <DialogDescription>{logoutReason}</DialogDescription>
            </DialogHeader>
            <div className="session-replaced-note">
              關閉這個提示後，請使用目前最新的視窗重新登入即可繼續遊戲。
            </div>
            <button
              className="btn btn-primary session-replaced-action"
              type="button"
              onClick={() => setLogoutReason(null)}
            >
              我知道了
            </button>
          </DialogContent>
        </Dialog>
      </>
    );
  if (stage === "create")
    return (
      <>
        <AnnouncementModal open={announcementOpen} onOpenChange={setAnnouncementOpen} />
        <CharacterCreate accountName={accountName} onCreate={create} />
      </>
    );
  return (
    <>
      <AnnouncementModal open={announcementOpen} onOpenChange={setAnnouncementOpen} />
      <Game
        key={characterId}
        characterId={characterId}
        playerName={playerName}
        playerClass={playerClass}
        isGm={isGm}
        loginId={loginId}
        onExit={exit}
        onSessionEnded={endReplacedSession}
      />
    </>
  );
}
