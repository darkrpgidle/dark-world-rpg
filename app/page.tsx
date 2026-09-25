"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Backpack,
  BookOpen,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Crown,
  Flame,
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
  Skull,
  Sparkles,
  Swords,
  Trophy,
  WandSparkles,
  Zap,
  Trash2,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { BloodRoarBuffVfx } from "./blood-roar-buff-vfx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  skillsByClass,
  worldBosses,
  type GameClass,
} from "./game-data";
import {
  dropPowerRange,
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
  monsterProfile,
  realmSuppression,
  towerCombatValues,
} from "./balance";
import { balanceConfig } from "./balance-config";
import {
  addGemStack,
  createEquipmentSockets,
  drillSocket,
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
import { WebGLSkillEffectCanvas as SkillEffectCanvas } from "./webgl-skill-effect-canvas";
import { RangerPiercingArrowVfx } from "./ranger-piercing-arrow-vfx";
import { RangerWindVolleyVfx } from "./ranger-wind-volley-vfx";
import { RangerDeadlyMarkVfx } from "./ranger-deadly-mark-vfx";
import { WebGLMythicSkillVfx as MythicSkillVfx } from "./webgl-mythic-skill-vfx";
import type { MythicVfxPhase } from "./mythic-skill-vfx";
import { WebGLDeepAbyssBossVfx as DeepAbyssBossVfx } from "./webgl-deep-abyss-boss-vfx";
import { WebGLSpriteLayer } from "./webgl-sprite-layer";
import { AdminMonitor } from "./admin-panels";
import { MAINTENANCE_MESSAGE, MAINTENANCE_MODE } from "./maintenance";
import {
  ALL_CATALOG_EQUIPMENT,
  GENERAL_MYTHICS,
  SKILL_MYTHICS,
  SPECIAL_LEGENDARIES,
  catalogBonus,
  catalogStory,
  equippedSkillMythic,
  findEquipmentDefinition,
  hasCatalogItem,
  type EquipmentCatalogDefinition,
} from "./mythic-data";

type Stage = "welcome" | "create" | "game";
const MAIL_CAPACITY = 50;
const PERSONAL_BOSS_RESET_VERSION = "2026-09-05";
const SAVE_DEBOUNCE_MS = 1_400;
const SAVE_MAX_INTERVAL_MS = 20_000;
const LOGIN_INSTANCE_STORAGE_KEY = "dark-world-login-instance-v1";
const LOGIN_ID_HEADER = "x-dark-world-login-id";
const SET_ELEMENTAL_DAMAGE_PCT = 15;
const WORLD_BOSS_ROUND_MS = 60_000;
const WORLD_BOSS_RESET_VERSION = "2026-09-14-60s";
const SET_RESONANCE_ATTACKS = 10;
const SET_RESONANCE_DAMAGE_PCT = 100;
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
type CombatStatus = {
  name: string;
  target: "player" | "enemy";
  remaining: number;
  unit: "攻擊" | "秒" | "次";
  tone: "red" | "blue" | "gold" | "green";
};
type MailMessage = {
  id: number;
  title: string;
  body: string;
  claimed: boolean;
  rewards: { gold: number; stones: number; yuanbao?: number; items: Item[]; resourcesClaimed?: boolean };
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
    return `/characters/ranger-rebirth10-${skillActive ? "open" : "closed"}.png`;
  }
  return `/characters/${characterSlug(cls)}${rebirthCount > 0 ? "-rebirth" : ""}.png`;
}

function characterAvatarPath(cls: GameClass, rebirthCount: number) {
  if (cls === "遊俠" && rebirthCount >= 10) {
    return "/characters/ranger-rebirth10-avatar.png";
  }
  return `/characters/${characterSlug(cls)}${rebirthCount > 0 ? "-rebirth-avatar" : ""}.png`;
}

type TitleId = "none" | "night-watcher" | "ash-conqueror" | "abyss-survivor";
type AppearanceId = "none" | "ember-aura" | "arcane-aura" | "abyss-aura";
const TITLE_OPTIONS: Record<TitleId, { name: string; color: string; description: string }> = {
  none: { name: "無稱號", color: "#9aa39d", description: "不顯示稱號" },
  "night-watcher": { name: "灰燼守夜人", color: "#d6b36a", description: "灰燼墓園的守望者" },
  "ash-conqueror": { name: "灰燼征服者", color: "#f08a52", description: "征服灰燼墓園" },
  "abyss-survivor": { name: "深淵倖存者", color: "#bd83ff", description: "從時墟深淵生還" },
};
const APPEARANCE_OPTIONS: Record<AppearanceId, { name: string; description: string; color: string }> = {
  none: { name: "無特效", description: "不顯示外觀特效", color: "#9aa39d" },
  "ember-aura": { name: "灰燼熔翼", description: "暗紅熔岩骨翼與火星彈射", color: "#e35d3f" },
  "arcane-aura": { name: "奧術星翼", description: "紫色符文能量羽翼", color: "#a875ff" },
  "abyss-aura": { name: "深淵黑翼", description: "黑紅破碎深淵蝠翼", color: "#6d4cff" },
};
function appearanceVfxPath(id: AppearanceId) {
  return id === "ember-aura" ? "ember" : id === "arcane-aura" ? "arcane" : id === "abyss-aura" ? "abyss" : null;
}
function CharacterAppearanceVfx({ id, className = "" }: { id: AppearanceId; className?: string }) {
  const wingSet = appearanceVfxPath(id);
  const [frame, setFrame] = useState(0);
  const rootRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ width: 178, height: 270 });
  useEffect(() => {
    if (!wingSet) return;
    setFrame(0);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setFrame((current) => (current + 1) % 6), 180);
    return () => window.clearInterval(timer);
  }, [wingSet]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(() => {
      const rect = root.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [wingSet]);
  if (!wingSet) return null;
  const src = `/vfx/appearance-wings/${wingSet}/frame-${String(frame).padStart(2, "0")}.png`;
  const combat = className.includes("combat-frame-wings");
  return <span ref={rootRef} className={`character-appearance-vfx ${className}`} aria-hidden="true">
    <WebGLSpriteLayer
      sprites={[{ source: src, x: size.width / 2, y: size.height / 2,
        width: size.width * (combat ? 1.82 : 1), height: size.height * (combat ? 1.03 : 1) }]}
      fallback={<img className="character-appearance-frame" src={src} alt="" />}
    />
  </span>;
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

function inferClassFromSkills(savedSkills: unknown): GameClass | undefined {
  if (!Array.isArray(savedSkills)) return undefined;
  const savedSkillNames = new Set<string>(
    savedSkills
      .map((skill) =>
        typeof skill === "object" && skill && "name" in skill
          ? String(skill.name)
          : "",
      )
      .filter(Boolean),
  );
  return (Object.entries(skillsByClass) as [GameClass, Skill[]][]).find(
    ([, classSkills]) =>
      classSkills.some((skill) => savedSkillNames.has(skill.name)),
  )?.[0];
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
const MAX_AFFIXES_BY_QUALITY = [0, 1, 2, 3, 4, 5] as const;
const ALLOWED_AFFIX_NAMES = new Set<EquipmentStatName>([
  "生命", "生命%", "攻擊", "攻擊%", "防禦", "防禦%", "攻速",
  "命中", "閃避", "暴擊", "暴擊傷害", "吸血", "傷害減免", "技能傷害",
  "首領傷害", "首領減傷", "經驗", "金幣", "資源掉落率", "元寶掉率",
]);
const MAX_REBIRTHS = 20;
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
const DODGE_CAP = balanceConfig.progression.dodgeCap;

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
    id: Date.now() + sequence + Math.floor(Math.random() * 1000),
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
  return { ...item, affixes: rollAffixes(item) };
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
  { id: "stat-hit", name: "洞察之眼", tag: "進階・命中", description: "本輪命中 +10%。", kind: "combat" },
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
    id: Date.now() + sequence + Math.floor(Math.random() * 1000),
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
  return { ...item, affixes: rollAffixes(item) };
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
  return { type: "equipment" as const, item: {
    ...upgraded,
    affixes: rollAffixes(upgraded),
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
    return `/equipment/${folder}/${definition.artKey}.png`;
  }
  const mapId = equipmentMapId(item);
  const slot = equipmentSlotSlugs[item.slot] ?? "weapon";
  return `/equipment/map-${mapId}/${slot}.png`;
}

function enhancementBonusPercent(level: number) {
  const safeLevel = Math.max(0, Math.min(balanceConfig.progression.maxEnhancement, level));
  const rules = balanceConfig.equipment.enhancement;
  return (
    Math.min(5, safeLevel) * rules.firstFivePerLevel +
    Math.max(0, Math.min(10, safeLevel) - 5) * rules.nextFivePerLevel +
    Math.max(0, safeLevel - 10) * rules.finalFivePerLevel
  );
}

function equipmentBaseStats(item: Item, enhanceLevel = item.enhance): EquipmentStat[] {
  const mapId = equipmentMapId(item);
  const scale = balanceConfig.equipment.baseScaleByMap[mapId] ?? 1;
  const baseBySlot = balanceConfig.equipment.baseStats as Record<string, readonly (readonly [EquipmentStatName, number, number])[]>;
  const bonus = enhancementBonusPercent(enhanceLevel);
  const qualityRank = Math.max(0, Math.min(qualityOrder.length - 1, qualityOrder.indexOf(item.quality)));
  const qualityMultiplier = balanceConfig.equipment.baseQualityMultipliers[qualityRank] ?? 1;
  return (baseBySlot[item.slot] ?? baseBySlot.武器).map(([name, base, growth]) => {
    const setMultiplier = item.set ? 1.15 : 1;
    const original = Math.round((base + mapId * growth) * scale * qualityMultiplier * setMultiplier);
    return {
    name,
    original,
    value: Math.round(original * (1 + bonus / 100)),
  }; });
}

const equipmentStatWeights = balanceConfig.equipment.statWeights as Record<EquipmentStatName, number>;

function baseStatPower(stats: EquipmentStat[]) {
  return Math.round(
    stats.reduce(
      (total, stat) => total + stat.value * equipmentStatWeights[stat.name],
      0,
    ),
  );
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
    if (name === "生命") isPercent ? (combat.hpPct += value) : (combat.hp += value);
    if (name === "生命%") combat.hpPct += value;
    if (name === "攻擊") isPercent ? (combat.attackPct += value) : (combat.attack += value);
    if (name === "攻擊%") combat.attackPct += value;
    if (name === "防禦") isPercent ? (combat.defensePct += value) : (combat.defense += value);
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
  for (const affix of item.affixes) {
    addStat(affixName(affix), Number(affix.match(/\d+(?:\.\d+)?/)?.[0] ?? 0), affix.includes("%"));
  }
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
    <img
      className={`equipment-art ${className}`}
      src={equipmentIconPath(item)}
      alt=""
      draggable={false}
    />
  );
}

function skillValue(name: string, level: number) {
  const lv = Math.max(1, level);
  const values: Record<
    string,
    { metric: string; value: (n: number) => string }
  > = {
    裂地斬: { metric: "傷害／破防", value: (n) => `${120 + n * 20}%／${20 + n * 5}%` },
    鮮血怒吼: {
      metric: "傷害加成／吸血（5 次）",
      value: (n) => `+${bloodRoarDamageBonus(n)}%／${bloodRoarLifesteal(n)}%`,
    },
    鋼鐵壁壘: {
      metric: "防禦／生命",
      value: (n) => `${3 + n * 2.5}%／+${30 + n * 25}`,
    },
    處決: { metric: "每 10 次攻擊總倍率", value: (n) => `${[160, 180, 200, 220, 250][Math.min(5, Math.max(1, n)) - 1]}%` },
    穿雲箭: { metric: "傷害／忽略防禦", value: (n) => `${120 + n * 20}%／${20 + n * 5}%` },
    疾風連射: {
      metric: "連射段數／總傷害",
      value: (n) => `5 段／${Math.round(500 * windVolleyDamageMultiplier(n))}%基礎`,
    },
    獵手本能: {
      metric: "暴擊率／閃避率／暴擊追加",
      value: (n) => `${2 + n}%／${2 + n}%／${Math.min(30, 6 + n)}%（追加 1 次攻擊）`,
    },
    致命標記: { metric: "前 5 下逐次追加／第 6 下爆炸", value: (n) => `每下追加 +${deadlyMarkBonusPct(n)}%／${Math.round(deadlyMarkExplosionMultiplier(n) * 100)}%` },
    霜火新星: { metric: "傷害／灼燒", value: (n) => `${140 + n * 20}%／${1.5 + n * 0.5}%最大生命` },
    奧術回響: { metric: "追加傷害", value: (n) => `${110 + n * 20}%` },
    魔力護盾: { metric: "傷害減免", value: (n) => `${45 + n * 3.75}%` },
    隕星術: { metric: "傷害／首領加成", value: (n) => `${300 + n * 50}%／${15 + n * 2}%` },
  };
  const rule = values[name] ?? {
    metric: "效果加成",
    value: (n: number) => `+${n * 5}%`,
  };
  return {
    metric: rule.metric,
    current: level === 0 ? "未解鎖" : rule.value(lv),
    next: rule.value(Math.min(10, lv + 1)),
    value: rule.value,
  };
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

function calculateSkillEffects(skills: Skill[]) {
  const result = {
    hpFlat: 0,
    attackPct: 0,
    defensePct: 0,
    speed: 0,
    hit: 0,
    dodge: 0,
    crit: 0,
    lifesteal: 0,
  };
  for (const skill of skills) {
    if (skill.level <= 0) continue;
    if (skill.name === "鋼鐵壁壘") {
      result.defensePct += 3 + skill.level * 2.5;
      result.hpFlat += 30 + skill.level * 25;
    }
    if (skill.name === "獵手本能") {
      result.crit += 2 + skill.level;
      result.dodge += 2 + skill.level;
    }
    if (skill.name === "魔力護盾") result.defensePct += 10 + skill.level * 3;
    if (skill.name === "穿雲箭") result.hit += skill.level * 2;
    if (skill.name === "疾風連射") result.speed += skill.level * 3;
  }
  return result;
}

function calculateCharacterStats(
  playerClass: GameClass,
  level: number,
  gear: Item[],
  skills: Skill[],
) {
  const base = balanceConfig.character.baseStats[playerClass];
  const levelGrowth = balanceConfig.character.levelGrowth;
  const result = {
    ...base,
    speed: Number(base.speed),
    hp: base.hp + (level - 1) * levelGrowth.hp,
    attack: base.attack + (level - 1) * levelGrowth.attack,
    defense: base.defense + (level - 1) * levelGrowth.defense,
    expBonus: 0,
    goldBonus: 0,
    bossDamage: 0,
    damageReduction: 0,
    skillDamage: 0,
    comboChance: 0,
    bossReduction: 0,
    eliteDamage: 0,
    lowHealthDamage: 0,
    lowHealthReduction: 0,
    resourceDrop: 0,
    equipmentDrop: 0,
    enhanceDrop: 0,
    reforgeDrop: 0,
    highQualityDrop: 0,
    yuanbaoDrop: 0,
    // 暴擊傷害是暴擊時的總加成；基礎 +50% 代表暴擊倍率 ×1.5。
    critDamage: 50,
    hpPct: 0,
    attackPct: 0,
    defensePct: 0,
  };
  for (const item of gear) {
    for (const stat of equipmentBaseStats(item)) {
      if (stat.name === "生命") result.hp += stat.value;
      if (stat.name === "生命%") result.hpPct += stat.value;
      if (stat.name === "攻擊") result.attack += stat.value;
      if (stat.name === "攻擊%") result.attackPct += stat.value;
      if (stat.name === "防禦") result.defense += stat.value;
      if (stat.name === "防禦%") result.defensePct += stat.value;
      if (stat.name === "攻速") result.speed += stat.value;
      if (stat.name === "命中") result.hit += stat.value;
      if (stat.name === "閃避") result.dodge += stat.value;
      if (stat.name === "暴擊") result.crit += stat.value;
      if (stat.name === "暴擊傷害") result.critDamage += stat.value;
      if (stat.name === "吸血") result.lifesteal += stat.value;
      if (stat.name === "經驗") result.expBonus += stat.value;
      if (stat.name === "金幣") result.goldBonus += stat.value;
      if (stat.name === "首領傷害") result.bossDamage += stat.value;
      if (stat.name === "傷害減免") result.damageReduction += stat.value;
      if (stat.name === "技能傷害") result.skillDamage += stat.value;
      if (stat.name === "首領減傷") result.bossReduction += stat.value;
      if (stat.name === "資源掉落率") result.resourceDrop += stat.value;
      if (stat.name === "元寶掉率") result.yuanbaoDrop += stat.value;
    }
    for (const affix of item.affixes) {
      const value = Number(affix.match(/\d+/)?.[0] ?? 0);
      const name = affixName(affix);
      if (name === "生命") result.hp += value;
      if (name === "生命%") result.hpPct += value;
      if (name === "攻擊") result.attack += value;
      if (name === "攻擊%") result.attackPct += value;
      if (name === "防禦") result.defense += value;
      if (name === "防禦%") result.defensePct += value;
      if (name === "攻速") result.speed += value;
      if (affix.startsWith("命中")) result.hit += value;
      if (affix.startsWith("閃避")) result.dodge += value;
      if (name === "暴擊傷害") result.critDamage += value;
      else if (name === "暴擊") result.crit += value;
      if (affix.startsWith("吸血")) result.lifesteal += value;
      if (affix.startsWith("經驗")) result.expBonus += value;
      if (affix.startsWith("金幣")) result.goldBonus += value;
      if (affix.startsWith("首領傷害")) result.bossDamage += value;
      if (affix.startsWith("傷害減免")) result.damageReduction += value;
      if (affix.startsWith("技能傷害")) result.skillDamage += value;
      if (affix.startsWith("首領減傷")) result.bossReduction += value;
      if (affix.startsWith("資源掉落率")) result.resourceDrop += value;
      if (affix.startsWith("元寶掉率")) result.yuanbaoDrop += value;
    }
    for (const [name, value] of Object.entries(getSocketStatBonus(item.sockets ?? { socketCount: 0, gems: [] }))) {
      if (name === "生命") result.hp += value;
      if (name === "生命%") result.hpPct += value;
      if (name === "攻擊") result.attack += value;
      if (name === "攻擊%") result.attackPct += value;
      if (name === "防禦") result.defense += value;
      if (name === "防禦%") result.defensePct += value;
      if (name === "攻速") result.speed += value;
      if (name === "命中") result.hit += value;
      if (name === "閃避") result.dodge += value;
      if (name === "暴擊") result.crit += value;
      if (name === "吸血") result.lifesteal += value;
      if (name === "經驗") result.expBonus += value;
      if (name === "金幣") result.goldBonus += value;
    }
  }
  const skill = calculateSkillEffects(skills);
  result.hp += skill.hpFlat;
  result.attack = Math.round(result.attack * (1 + skill.attackPct / 100));
  result.defense = Math.round(result.defense * (1 + skill.defensePct / 100));
  result.speed += skill.speed;
  result.hit += skill.hit;
  result.dodge += skill.dodge;
  result.crit += skill.crit;
  result.lifesteal += skill.lifesteal;
  const catalog = catalogBonus(gear);
  result.hpPct += catalog.hpPct ?? 0;
  result.attackPct += catalog.attackPct ?? 0;
  result.defensePct += catalog.defensePct ?? 0;
  result.speed += catalog.speed ?? 0;
  result.speed = Math.round(result.speed * (1 + (catalog.speedPct ?? 0) / 100)) as typeof result.speed;
  result.hit += catalog.hit ?? 0;
  result.dodge += catalog.dodge ?? 0;
  result.crit += catalog.crit ?? 0;
  result.lifesteal += catalog.lifesteal ?? 0;
  result.expBonus += catalog.expBonus ?? 0;
  result.goldBonus += catalog.goldBonus ?? 0;
  result.bossDamage += catalog.bossDamage ?? 0;
  result.damageReduction += catalog.damageReduction ?? 0;
  result.skillDamage += catalog.skillDamage ?? 0;
  result.resourceDrop += catalog.resourceDrop ?? 0;
  result.equipmentDrop += catalog.equipmentDrop ?? 0;
  result.hp = Math.round(result.hp * (1 + result.hpPct / 100));
  result.attack = Math.round(result.attack * (1 + result.attackPct / 100));
  result.defense = Math.round(result.defense * (1 + result.defensePct / 100));
  return result;
}

function calculateCombatPower(
  playerClass: GameClass,
  level: number,
  gear: Item[],
  skills: Skill[],
  permanentBonuses: { hp: number; attack: number; defense: number } = { hp: 0, attack: 0, defense: 0 },
) {
  const naked = calculateCharacterStats(playerClass, level, [], []);
  const statSkills = skills.filter((skill) =>
    ["鋼鐵壁壘", "獵手本能", "魔力護盾"].includes(skill.name),
  );
  const current = calculateCharacterStats(playerClass, level, gear, statSkills);
  const statPower =
    (current.hp - naked.hp) * 0.25 +
    (current.attack - naked.attack) * 4 +
    (current.defense - naked.defense) * 3 +
    (current.speed - naked.speed) * 4 +
    (current.hit - naked.hit) * 5 +
    (Math.min(DODGE_CAP, current.dodge) - Math.min(DODGE_CAP, naked.dodge)) * 8 +
    (current.crit - naked.crit) * 8 +
    (current.critDamage - naked.critDamage) * 5 +
    (current.lifesteal - naked.lifesteal) * 10 +
    (current.bossDamage - naked.bossDamage) * 7 +
    (current.damageReduction - naked.damageReduction) * 10 +
    current.skillDamage * 7 +
    current.bossReduction * 9;
  const permanentPower =
    naked.hp * (permanentBonuses.hp / 100) * 0.25 +
    naked.attack * (permanentBonuses.attack / 100) * 4 +
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
  attack,
  speed,
  crit,
  critDamage,
  hit,
  bossDamage,
  defense,
  damageReduction,
  dodge,
  skillDamage,
  comboChance,
  bossReduction,
  lowHealthDamage,
  lowHealthReduction,
  lowHealth,
  playerLevel,
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
  const bossEvasionRating = 20 + bossLevel * evasionRules.bossEvasionPerLevel;
  const bossAccuracyRating =
    evasionRules.monsterAccuracyBase + bossLevel * evasionRules.bossAccuracyPerLevel;
  const playerHitChance = hitChanceFromRatings(hit, bossEvasionRating);
  const playerEvasionRating =
    Math.min(DODGE_CAP, Math.max(0, dodge)) * evasionRules.statToRating;
  const bossHitChance = hitChanceFromRatings(bossAccuracyRating, playerEvasionRating);
  const bossDefense =
    (monsterDefense ?? (18 + bossLevel * 2.5) * profile.defense) *
    monsterMultiplier *
    (1 - Math.min(0.8, Math.max(0, defenseIgnore) / 100));
  const bossDamageReduction = Math.min(0.65, bossDefense / (bossDefense + 100));
  const isCritical = guaranteedCritical || roll < Math.min(1, crit / 100);
  const criticalMultiplier = isCritical ? 1 + (critDamage + critDamageBonus) / 100 : 1;
  const playerDamage = attackRoll * 100 > playerHitChance
    ? 0
    : Math.max(
        3,
        Math.round(
          attack *
            (1 - bossDamageReduction) *
            (1 + bossDamage / 100) *
            (skillTriggered ? 1 + skillDamage / 100 : 1) *
            Math.max(0, playerDamageMultiplier ?? 1) *
            criticalMultiplier *
            (lowHealth ? 1 + lowHealthDamage / 100 : 1),
        ),
      );
  const defenseMitigation = Math.min(
    0.65,
    (defense / Math.max(1, defense + bossLevel * 8)) * 0.65,
  );
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

const flatQualityBands = balanceConfig.equipment.affixes.flatQualityMultipliers;
const percentQualityBands = balanceConfig.equipment.affixes.percentQualityBands as Record<
  Exclude<EquipmentStatName, "生命" | "攻擊" | "防禦" | "攻速">,
  readonly (readonly [number, number])[]
>;

function affixOptions(item: Item): AffixRoll[] {
  const rank = Math.max(0, Math.min(5, qualityOrder.indexOf(item.quality)));
  const mapId = equipmentMapId(item);
  const [qualityMinimum, qualityMaximum] = flatQualityBands[rank];
  const canonicalBase = (name: "生命" | "攻擊" | "防禦") => {
    const slot = name === "攻擊" ? "武器" : name === "防禦" ? "胸甲" : "腰帶";
    return (
      equipmentBaseStats({ ...item, slot } as Item, 0).find(
        (stat) => stat.name === name,
      )?.original ?? 1
    );
  };
  const flat = (
    name: "生命" | "攻擊" | "防禦",
    multiplier = 1,
  ): AffixRoll => ({
    name,
    minimum: Math.max(
      1,
      Math.round(canonicalBase(name) * multiplier * qualityMinimum),
    ),
    maximum: Math.max(
      1,
      Math.round(canonicalBase(name) * multiplier * qualityMaximum),
    ),
  });
  const percentage = (
    name: Exclude<EquipmentStatName, "生命" | "攻擊" | "防禦" | "攻速">,
    growth: number,
  ): AffixRoll => {
    const [minimum, maximum] = percentQualityBands[name][rank];
    const mapBonus = Math.min(2, Math.floor((mapId - 1) * growth));
    return { name, minimum: minimum + mapBonus, maximum: maximum + mapBonus, percent: true };
  };
  const percentageFixed = (
    name: Exclude<EquipmentStatName, "生命" | "攻擊" | "防禦" | "攻速">,
  ): AffixRoll => {
    const [minimum, maximum] = percentQualityBands[name][rank];
    return { name, minimum, maximum, percent: true };
  };
  const speed = (): AffixRoll => {
    const speedBands = balanceConfig.equipment.affixes.speedQualityBands;
    const [minimum, maximum] = speedBands[rank];
    const mapBonus = Math.floor((mapId - 1) * balanceConfig.equipment.affixes.speedMapGrowth);
    return { name: "攻速", minimum: minimum + mapBonus, maximum: maximum + mapBonus, percent: true };
  };
  const percentFlat = (name: "生命%" | "攻擊%" | "防禦%", growth = 0.45): AffixRoll =>
    percentage(name, growth);
  const pools: Record<string, AffixRoll[]> = {
    武器: [flat("攻擊"), percentFlat("攻擊%"), percentage("暴擊", 0.45), percentage("暴擊傷害", 0.45), speed(), percentage("首領傷害", 0.6), percentage("技能傷害", 0.5), percentage("吸血", 0.35), percentage("命中", 0.5)],
    頭盔: [percentage("命中", 0.5), flat("防禦", 0.65), percentFlat("防禦%", 0.45), flat("生命", 0.35), percentFlat("生命%", 0.45), percentage("經驗", 0.55), percentage("傷害減免", 0.35), percentage("閃避", 0.35)],
    胸甲: [flat("防禦"), percentFlat("防禦%"), flat("生命", 0.65), percentFlat("生命%"), percentage("傷害減免", 0.5), percentage("首領減傷", 0.45), percentage("閃避", 0.3), flat("攻擊", 0.12), percentFlat("攻擊%", 0.3), percentage("命中", 0.3)],
    手套: [speed(), flat("攻擊", 0.55), percentFlat("攻擊%"), percentage("暴擊", 0.5), percentage("暴擊傷害", 0.5), percentage("技能傷害", 0.5), percentage("命中", 0.5), percentage("吸血", 0.25)],
    鞋子: [percentage("閃避", 0.45), speed(), percentage("資源掉落率", 0.45), flat("防禦", 0.45), percentFlat("防禦%", 0.45), percentage("金幣", 0.6), flat("生命", 0.25), percentFlat("生命%", 0.45), percentage("傷害減免", 0.25)],
    項鍊: [percentage("經驗", 0.6), percentageFixed("元寶掉率"), percentage("技能傷害", 0.5), flat("攻擊", 0.45), percentFlat("攻擊%"), flat("生命", 0.35), percentFlat("生命%"), percentage("命中", 0.5), percentage("暴擊", 0.45), percentage("暴擊傷害", 0.45), percentage("資源掉落率", 0.4), percentage("吸血", 0.3)],
    戒指: [percentage("暴擊", 0.55), percentage("暴擊傷害", 0.55), flat("攻擊", 0.55), percentFlat("攻擊%"), percentage("吸血", 0.4), percentage("首領傷害", 0.6), speed(), percentage("命中", 0.4)],
    腰帶: [flat("生命"), percentFlat("生命%"), flat("防禦", 0.5), percentFlat("防禦%"), percentage("資源掉落率", 0.45), percentage("傷害減免", 0.4), percentage("金幣", 0.6), percentage("閃避", 0.3), flat("攻擊", 0.1), percentFlat("攻擊%", 0.1)],
    護腕: [percentage("命中", 0.55), flat("攻擊", 0.45), percentFlat("攻擊%"), flat("防禦", 0.5), percentFlat("防禦%"), percentage("首領傷害", 0.5), percentage("暴擊", 0.4), percentage("暴擊傷害", 0.4), speed()],
    披風: [percentage("傷害減免", 0.45), percentageFixed("元寶掉率"), percentage("首領減傷", 0.45), flat("生命", 0.6), percentFlat("生命%"), percentage("資源掉落率", 0.45), percentage("閃避", 0.5), percentage("經驗", 0.5), flat("防禦", 0.35), percentFlat("防禦%"), percentage("金幣", 0.5)],
  };
  const slotPool = pools[item.slot] ?? pools.武器;
  const universalPool = Array.from(
    new Map(Object.values(pools).flat().map((option) => [option.name, option])).values(),
  ).filter((option) => option.name !== "元寶掉率" || item.slot === "項鍊" || item.slot === "披風");
  // 部位核心詞綴仍優先；其餘詞綴從完整允許池隨機抽取，且允許同件重複。
  const core = slotPool[0];
  return core ? [core, ...universalPool.filter((option) => option.name !== core.name)] : universalPool;
}

function rollAffix(roll: AffixRoll) {
  const value =
    roll.minimum + Math.floor(Math.random() * (roll.maximum - roll.minimum + 1));
  const labels: Partial<Record<EquipmentStatName, string>> = {
    生命: "生命力",
    "生命%": "生命力",
    攻擊: "攻擊力",
    "攻擊%": "攻擊力",
    防禦: "防禦力",
    "防禦%": "防禦力",
    攻速: "攻擊速度",
  };
  return `${labels[roll.name] ?? roll.name} +${value}${roll.percent ? "%" : ""}`;
}

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
  return `${labels[name] ?? name} +${value}${affix.includes("%") || name === "攻速" || name.endsWith("%") ? "%" : ""}`;
}

function affixRange(item: Item, affix: string) {
  return affixOptions(item).find((roll) => roll.name === affixName(affix));
}

function affixRangeLabel(item: Item, affix: string) {
  const range = affixRange(item, affix);
  if (!range) return "專屬詞綴";
  const suffix = range.percent ? "%" : "";
  return `${item.quality}範圍 ${range.minimum}～${range.maximum}${suffix}`;
}

function normalizeSceneItem(item: Item): Item {
  const definition = findEquipmentDefinition(item);
  const catalogFields = definition
    ? {
        name: definition.name,
        slot: definition.slot,
        quality: definition.kind === "special-legendary" ? "傳奇" : "神話",
        equipmentType:
          definition.kind === "special-legendary"
            ? "特殊傳奇" as const
            : "神話裝備" as const,
        ...(definition.kind === "special-legendary"
          ? { legendaryId: definition.id }
          : { mythicId: definition.id }),
        artKey: definition.artKey,
        set: "",
      }
    : {};
  const normalized = {
    ...item,
    ...catalogFields,
    equipmentType: definition
      ? definition.kind === "special-legendary"
        ? "特殊傳奇" as const
        : "神話裝備" as const
      : item.quality === "神話" || item.equipmentType === "神話裝備"
        ? "神話裝備" as const
        : item.equipmentType === "特殊傳奇"
          ? "特殊傳奇" as const
          : "場景普通裝備" as const,
    affixSchemaVersion: 7,
    reforgeCount: Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(Number(item.reforgeCount ?? 0) || 0))),
  };
  const maxAffixes = MAX_AFFIXES_BY_QUALITY[Math.max(0, qualityOrder.indexOf(normalized.quality))] ?? 0;
  const cleanAffixes = (item.affixes ?? [])
    .map((affix) => affix.replace(/^(?:菁英傷害|精英傷害)(?= )/, "首領傷害"))
    .filter((affix) => ALLOWED_AFFIX_NAMES.has(affixName(affix)))
    .map((affix) => {
      const range = affixRange(normalized, affix);
      if (!range) return affix;
      const oldValue = Number(affix.match(/\d+(?:\.\d+)?/)?.[0] ?? range.minimum);
      const value = Math.max(range.minimum, Math.min(range.maximum, oldValue));
      return `${range.name} +${value}${range.percent ? "%" : ""}`;
    });
  // 洗鍊允許同一種詞綴重複出現；正規化只能清理非法／超出區間的數值，
  // 不可依詞綴名稱去重，否則重新登入或下一次存檔會吃掉合法的重複詞綴。
  return {
    ...normalized,
    affixes: cleanAffixes.slice(0, maxAffixes),
    sockets: normalizeEquipmentSockets(item.sockets),
  };
}

function rollAffixes(item: Item) {
  const rank = Math.max(0, qualityOrder.indexOf(item.quality));
  const affixCount = MAX_AFFIXES_BY_QUALITY[Math.min(rank, MAX_AFFIXES_BY_QUALITY.length - 1)] ?? 0;
  if (affixCount <= 0) return [];
  const options = affixOptions(item);
  const [core] = options;
  // 洗鍊詞綴允許重複；保留第一條部位核心詞綴，其餘詞綴從完整池中獨立抽取。
  return [core, ...Array.from({ length: Math.max(0, affixCount - 1) }, () =>
    options[Math.floor(Math.random() * options.length)],
  )].map(rollAffix);
}

function rerollSingleAffix(item: Item, affix: string, index: number) {
  const options = affixOptions(item);
  const [core] = options;
  if (index === 0) return rollAffix(core);
  // 定向洗鍊同樣允許洗出目前已存在的詞綴，符合重複詞綴玩法。
  const pool = options;
  return rollAffix(pool[Math.floor(Math.random() * pool.length)]);
}

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
}: {
  value: number;
  color?: string;
}) {
  return (
    <div className="meter">
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
        {item.set && <span className="set-name-prefix">【{item.set}】</span>} {item.name} {item.enhance > 0 && `+${item.enhance}`}
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
      </div>
      <div className="affix-divider"><span>詞綴加成</span></div>
      <ul className="gear-affixes">
        {item.affixes.map((affix, index) => (
          <li key={`${affix}-${index}`}>
            <span>{displayAffix(affix)}</span>
            <small>{affixRangeLabel(item, affix)}</small>
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
            {Math.abs(powerDifference ?? 0).toLocaleString()}
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
              <img className="class-portrait" src={`/characters/${cls.name === "戰士" ? "warrior" : cls.name === "遊俠" ? "ranger" : "mage"}.png`} alt={`${cls.name}角色`} />
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
  const [playerHp, setPlayerHp] = useState(100);
  const [battlePulse, setBattlePulse] = useState(0);
  const [enemyDefeated, setEnemyDefeated] = useState(false);
  const [round, setRound] = useState(1);
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
  const [rangerPiercingEffect, setRangerPiercingEffect] = useState<{ key: number } | null>(null);
  const [rangerWindVolleyEffect, setRangerWindVolleyEffect] = useState<{
    key: number;
    shotCount: number;
  }[]>([]);
  const [rangerWindVolleyDamage, setRangerWindVolleyDamage] = useState<{
    key: number;
    hits: { damage: number; critical: boolean }[];
    visible: number;
  }[]>([]);
  const [deadlyMarkEffect, setDeadlyMarkEffect] = useState<{
    key: number;
    detonationKey: number | null;
  } | null>(null);
  const [rangerImpactPulse, setRangerImpactPulse] = useState(false);
  const rangerImpactPulseTimerRef = useRef<number | null>(null);
  const [frostfireImpactPulse, setFrostfireImpactPulse] = useState<"normal" | "detonation" | null>(null);
  const frostfireImpactPulseTimerRef = useRef<number | null>(null);
  const frostfireImpactDelayTimerRef = useRef<number | null>(null);
  const [meteorImpactPulse, setMeteorImpactPulse] = useState(false);
  const meteorImpactPulseTimerRef = useRef<number | null>(null);

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

  const triggerFrostfireImpact = (detonation = false) => {
    setFrostfireImpactPulse(null);
    if (frostfireImpactDelayTimerRef.current !== null) {
      window.clearTimeout(frostfireImpactDelayTimerRef.current);
      frostfireImpactDelayTimerRef.current = null;
    }
    if (frostfireImpactPulseTimerRef.current !== null) {
      window.clearTimeout(frostfireImpactPulseTimerRef.current);
    }
    const startPulse = () => {
      window.requestAnimationFrame(() => setFrostfireImpactPulse(detonation ? "detonation" : "normal"));
      frostfireImpactPulseTimerRef.current = window.setTimeout(() => {
        setFrostfireImpactPulse(null);
        frostfireImpactPulseTimerRef.current = null;
      }, detonation ? 720 : 430);
    };
    if (detonation) startPulse();
    else frostfireImpactDelayTimerRef.current = window.setTimeout(() => {
      frostfireImpactDelayTimerRef.current = null;
      startPulse();
    }, 1320);
  };

  const queueMythicVfx = (effect: { name: string; key: number }) => {
    const skill = effect.name.startsWith("致命標記")
      ? "致命標記"
      : effect.name.replace(/・(?:回響|爆炸|強化斬擊|血爆|裂痕引爆|灼燒引爆)$/, "");
    // Frostfire Nova's six-frame VFX belongs to the skill itself. The
    // Polar Staff only changes the follow-up into the four-frame detonation.
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
  };

  const queueSkillVisual = (effect: { name: string; key: number }) => {
    queueMythicVfx(effect);
    const baseName = effect.name.replace(/・(?:回響|爆炸|強化斬擊|血爆|裂痕引爆|灼燒引爆)$/, "");
    if (baseName === "霜火新星") triggerFrostfireImpact(effect.name.includes("灼燒引爆"));
    if (baseName === "隕星術") {
      if (meteorImpactPulseTimerRef.current !== null) window.clearTimeout(meteorImpactPulseTimerRef.current);
      meteorImpactPulseTimerRef.current = window.setTimeout(() => {
        window.requestAnimationFrame(() => setMeteorImpactPulse(true));
        meteorImpactPulseTimerRef.current = window.setTimeout(() => {
          setMeteorImpactPulse(false);
          meteorImpactPulseTimerRef.current = null;
        }, 520);
      }, 650);
    }
    setSkillEffect(effect);
    setSkillBannerEffect(effect);
    window.setTimeout(() => {
      setSkillBannerEffect((current) => (current?.key === effect.key ? null : current));
    }, skillBannerDuration());
    if (["裂地斬", "處決", "穿雲箭", "疾風連射", "致命標記", "致命標記・爆炸", "霜火新星", "隕星術"].includes(baseName) || baseName.endsWith("・共鳴斬")) return;
    setSkillVisualEffects((current) => [...current, effect]);
    window.setTimeout(() => {
      setSkillVisualEffects((current) => current.filter((item) => item.key !== effect.key));
    }, 2_200);
  };
  // Ground-split owns its own lifetime so a dying/changing enemy or a normal
  // attack cannot unmount the fissure before its visual timeout.
  const [groundSplitEffect, setGroundSplitEffect] = useState<{ key: number } | null>(null);
  const [executionEffect, setExecutionEffect] = useState<{
    key: number;
  } | null>(null);
  const [executionImpactPulse, setExecutionImpactPulse] = useState(false);
  const [bloodRoarVisualActive, setBloodRoarVisualActive] = useState(false);
  const [bloodRoarSlashKey, setBloodRoarSlashKey] = useState(0);
  const [comboCount, setComboCount] = useState(1);
  const [lastDamage, setLastDamage] = useState(0);
  const [battleHits, setBattleHits] = useState<
    { damage: number; critical: boolean; volley?: boolean }[]
  >([]);
  const [battleHitGroups, setBattleHitGroups] = useState<{
    key: number;
    hits: { damage: number; critical: boolean }[];
  }[]>([]);
  const [enemyHitFeedback, setEnemyHitFeedback] = useState<{
    damage: number;
    dodged: boolean;
    key: number;
  } | null>(null);
  const [playerHitFeedback, setPlayerHitFeedback] = useState<{
    damage: number;
    dodged: boolean;
    key: number;
  } | null>(null);
  const [combatStatuses, setCombatStatuses] = useState<CombatStatus[]>([]);
  const showCombatStatus = (status: CombatStatus) => {
    setCombatStatuses((current) => [
      ...current.filter((item) => !(item.name === status.name && item.target === status.target)),
      status,
    ]);
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
  const [causePrompt, setCausePrompt] = useState("");
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
  const [selectedTitle, setSelectedTitle] = useState<TitleId>("none");
  const [selectedAppearance, setSelectedAppearance] = useState<AppearanceId>("none");
  const [ownedTitles, setOwnedTitles] = useState<TitleId[]>(["none"]);
  const [ownedAppearances, setOwnedAppearances] = useState<AppearanceId[]>(["none"]);
  const [rebirthPoints, setRebirthPoints] = useState(0);
  const [rebirthTalents, setRebirthTalents] = useState<RebirthTalents>(emptyRebirthTalents);
  const [finalBossDefeated, setFinalBossDefeated] = useState(false);
  const [runSummary, setRunSummary] = useState<RunSummary | null>(null);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [rebirthOpen, setRebirthOpen] = useState(false);
  const [restartCountdown, setRestartCountdown] = useState(10);
  const [storedSeconds, setStoredSeconds] = useState(0);
  const [offlineClaimPending, setOfflineClaimPending] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [bagCategory, setBagCategory] = useState<"全部" | "武器" | "防具" | "飾品" | "套裝" | "未查看">("全部");
  const [bagSort, setBagSort] = useState<"戰力" | "品質" | "強化" | "最新">("戰力");
  const [mobileItemDetailOpen, setMobileItemDetailOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(0);
  const [activeLoadout, setActiveLoadout] = useState<1 | 2>(1);
  const [loadouts, setLoadouts] = useState<Record<1 | 2, number[]>>({
    1: [],
    2: [],
  });
  const [skillPoints, setSkillPoints] = useState(1);
  const [skills, setSkills] = useState(() =>
    skillsByClass[playerClass].map((skill, index) => ({
      ...skill,
      level: index === 0 ? 1 : 0,
    })),
  );
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
  const [lastBossDamage, setLastBossDamage] = useState(0);
  const [lastBossCounterDamage, setLastBossCounterDamage] = useState(0);
  const [bossDamageGroups, setBossDamageGroups] = useState<{ key: number; damage: number }[]>([]);
  const [bossOutcome, setBossOutcome] = useState<"win" | "loss" | "timeout" | null>(null);
  const [abyssBossEffect, setAbyssBossEffect] = useState<{ key: number } | null>(null);
  const [abyssImpactPulse, setAbyssImpactPulse] = useState(false);
  const playerId = characterId;
  const [saveReady, setSaveReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState("載入存檔");
  const [saveUpdatedAt, setSaveUpdatedAt] = useState<string | null>(null);
  const [sessionSuperseded, setSessionSuperseded] = useState(false);
  const [sessionEndedReason, setSessionEndedReason] = useState<"replaced" | "suspended" | "expired" | "conflict" | "maintenance">("replaced");
  const [saveRetryTick, setSaveRetryTick] = useState(0);
  const saveInFlightRef = useRef(false);
  const saveRequestIdRef = useRef<string | null>(null);
  const saveClientIdRef = useRef("");
  const saveSequenceRef = useRef(0);
  const saveQueuedRef = useRef(false);
  const lastSaveStartedAtRef = useRef(0);
  const saveCadenceStartedAtRef = useRef(0);
  const prioritySaveRef = useRef(false);
  const [adminRevision, setAdminRevision] = useState(0);
  const [dailyKills, setDailyKills] = useState(0);
  const [dailyDate, setDailyDate] = useState("");
  const [dailyRewardClaimed, setDailyRewardClaimed] = useState(false);
  const [worldDamage, setWorldDamage] = useState(0);
  const [worldRoundDamage, setWorldRoundDamage] = useState(0);
  const [worldBossSecondsLeft, setWorldBossSecondsLeft] = useState(WORLD_BOSS_ROUND_MS / 1_000);
  const [worldRank, setWorldRank] = useState<number | null>(null);
  const [worldLeaderDamage, setWorldLeaderDamage] = useState(0);
  const [worldTopRanks, setWorldTopRanks] = useState<Array<{
    name?: string; cls?: string; damage?: number;
  }>>([]);
  const logIdRef = useRef(10_000);
  const lootIdRef = useRef(20_000);
  const towerDeathPendingRef = useRef(false);
  const bloodRoarStateRef = useRef({ battleKey: "", remaining: 0, used: false });
  const bloodRoarHideTimerRef = useRef<number | null>(null);
  const bloodRoarVisualTokenRef = useRef(0);
  const bossMarkedRemainingRef = useRef(0);
  const bossMarkExplosionPendingRef = useRef(false);
  const worldBossBurnRef = useRef({ until: 0, nextAt: 0, damagePerSecond: 0 });
  const abyssBossAttackCountRef = useRef(0);
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
    return () => {
      if (bloodRoarHideTimerRef.current !== null) {
        window.clearTimeout(bloodRoarHideTimerRef.current);
      }
      if (frostfireImpactDelayTimerRef.current !== null) {
        window.clearTimeout(frostfireImpactDelayTimerRef.current);
      }
      if (frostfireImpactPulseTimerRef.current !== null) {
        window.clearTimeout(frostfireImpactPulseTimerRef.current);
      }
      if (meteorImpactPulseTimerRef.current !== null) {
        window.clearTimeout(meteorImpactPulseTimerRef.current);
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
    setBloodRoarVisualActive(false);
  }, [battleOn]);

  useEffect(() => {
    if (!battleOn || playerClass !== "戰士" || playerHp >= 40) return;
    const bloodRoar = skills.find((skill) => skill.name === "鮮血怒吼" && skill.level > 0);
    if (!bloodRoar) return;
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
      name: `鮮血怒吼：${bloodRoarCount} 次／傷害 +${bloodRoarDamageBonus(bloodRoar.level)}%／吸血 ${bloodRoarLifesteal(bloodRoar.level)}%`,
      target: "player",
      remaining: bloodRoarStateRef.current.remaining,
      unit: "攻擊",
      tone: "red",
    });
    setCausePrompt("生命低於 40% → 鮮血怒吼立刻發動");
  }, [battleOn, mapId, playerClass, playerHp, skills, wave]);

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
      if (bagSort === "強化") return b.enhance - a.enhance || equipmentDisplayRating(b) - equipmentDisplayRating(a);
      if (bagSort === "最新") return items.indexOf(b) - items.indexOf(a);
      return equipmentDisplayRating(b) - equipmentDisplayRating(a);
    });
  // 批次分解後強制以實際背包內容重建列表，避免手機瀏覽器保留舊的卡片節點。
  const bagRenderKey = visibleBagItems.length
    ? visibleBagItems.map((item, index) => `${item.id}:${index}`).join("|")
    : "empty";
  useEffect(() => {
    setSelectedItem((index) =>
      items.length ? Math.max(0, Math.min(index, items.length - 1)) : 0,
    );
    setUnseenItemIds((old) => old.filter((id) => items.some((item) => item.id === id)));
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
  const rebirthCombatBonus = rebirthTier * 3;
  const rebirthBonuses = {
    hp: rebirthCombatBonus + rebirthTalents.survivalHp * 10,
    attack: rebirthCombatBonus,
    defense: rebirthCombatBonus + rebirthTalents.survivalDefense * 10,
  };
  const combatPower = calculateCombatPower(
    playerClass,
    level,
    equippedGear,
    skills,
    rebirthBonuses,
  );
  const powerDifferenceForItem = (item: Item) => {
    const isEquipped = equipped.includes(item.id);
    const projectedGear = isEquipped
      ? equippedGear.filter((gear) => gear.id !== item.id)
      : [
          ...equippedGear.filter((gear) => gear.slot !== item.slot),
          item,
        ];
    return (
      calculateCombatPower(playerClass, level, projectedGear, skills, rebirthBonuses) -
      combatPower
    );
  };
  const hasBlessing = (id: string) =>
    blessings.some((blessing) => blessing.id === id);
  const blessingUpgraded = (id: string) =>
    blessings.some((blessing) => blessing.id === id && blessing.upgraded);
  const baseCharacterStats = calculateCharacterStats(
    playerClass,
    level,
    equippedGear,
    skills,
  );
  const characterStats = {
    ...baseCharacterStats,
    hp: Math.round(baseCharacterStats.hp * (1 + rebirthBonuses.hp / 100) * (hasBlessing("stat-hp") ? (blessingUpgraded("stat-hp") ? 1.3 : 1.15) : 1)),
    attack: Math.round(
      baseCharacterStats.attack * (1 + rebirthBonuses.attack / 100) * (hasBlessing("stat-attack") ? 1.15 : 1),
    ),
    defense: Math.round(
      baseCharacterStats.defense *
        (1 + rebirthBonuses.defense / 100) *
        (hasBlessing("stat-defense") ? 1.15 : 1),
    ),
    speed: baseCharacterStats.speed + rebirthTalents.combatAttackSpeed * 5 + (hasBlessing("stat-speed") ? 15 : 0),
    hit: baseCharacterStats.hit + (hasBlessing("stat-hit") ? 10 : 0),
    crit: baseCharacterStats.crit + rebirthTalents.combatCritRate * 4 + (hasBlessing("stat-crit") ? (blessingUpgraded("stat-crit") ? 18 : 12) : 0),
    critDamage: baseCharacterStats.critDamage + rebirthTalents.combatCritDamage * 10,
    lifesteal:
      baseCharacterStats.lifesteal +
      (hasBlessing("stat-lifesteal") ? 8 : 0),
    bossDamage: baseCharacterStats.bossDamage + rebirthTalents.combatBoss * 5,
    damageReduction: baseCharacterStats.damageReduction + rebirthTalents.combatDamageReduction * 3,
    equipmentDrop: rebirthTier * 5,
    expBonus: baseCharacterStats.expBonus + rebirthTier * 20,
    goldBonus: baseCharacterStats.goldBonus + rebirthTier * 20,
    enhanceDrop: rebirthTier * 20,
    reforgeDrop: rebirthTier * 10,
    highQualityDrop: rebirthTier * 3,
    skillDamage: baseCharacterStats.skillDamage + rebirthTalents.growthSkill * 5,
  };
  const combatAttackSpeed =
    characterStats.speed +
    (hasBlessing("rapid") ? (blessingUpgraded("rapid") ? 35 : 20) : 0);
  const playerHpLossFromDamage = (damage: number) =>
    healthPercentFromDamage(damage, characterStats.hp);
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
  const mapAccuracyBonus = [0, 0, 3, 6, 9, 12, 16, 20, 24, 28][mapId] ?? 0;
  const monsterAccuracyRating =
    evasionRules.monsterAccuracyBase +
    mapAccuracyBonus * evasionRules.monsterAccuracyPerMap;
  const playerEvasionRating =
    Math.min(DODGE_CAP, Math.max(0, characterStats.dodge)) * evasionRules.statToRating;
  const effectiveDodge = evadeChanceFromRatings(monsterAccuracyRating, playerEvasionRating);
  const currentEnemyMaximumHealth = effectiveMonsterMaximumHealth(
    mapId,
    currentRecommendedPower,
    currentCombatTier,
    currentEnemyBaseName,
  );
  const currentEnemyHealth = Math.max(
    0,
    healthFromPercent(enemyHp, currentEnemyMaximumHealth),
  );
  const equippedSetGroups = maps
    .map((map) => ({
      name: map.set,
      count: items.filter(
        (item) => item.set === map.set && equipped.includes(item.id),
      ).length,
    }))
    .filter((group) => group.count > 0)
    .sort((a, b) => b.count - a.count);
  const activeSet = equippedSetGroups[0];
  const activeSetCount = activeSet?.count ?? 0;
  const setTier = activeSet
    ? Math.min(
        3,
        Math.floor(activeSet.count / 2),
      )
    : 0;
  const setEffect =
    activeSetCount >= 10
      ? `每 ${SET_RESONANCE_ATTACKS} 次攻擊觸發元素爆發`
      : activeSetCount >= 8
        ? "技能傷害 +12%"
        : activeSetCount >= 6
          ? `每次攻擊追加 ${SET_ELEMENTAL_DAMAGE_PCT}% 元素傷害`
          : activeSetCount >= 4
            ? "離線收益 +10%"
            : activeSetCount >= 2
              ? "攻擊 +8%"
              : "尚未形成套裝共鳴";
  const monsterEvasionRating =
    evasionRules.monsterEvasionBase + mapId * evasionRules.monsterEvasionPerMap;
  const mapEvasionBonus = balanceConfig.combat.evasionModel.monsterEvasionBonusByMap[mapId] ?? 0;
  const effectiveHit = Math.max(
    evasionRules.minimumHitChance,
    hitChanceFromRatings(characterStats.hit, monsterEvasionRating) - mapEvasionBonus,
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
  const offlineSetMultiplier = activeSetCount >= 4 ? 1.1 : 1;
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
    queueMicrotask(() => {
      fetch(`/api/save?playerId=${encodeURIComponent(playerId)}`, {
        cache: "no-store",
        headers: loginHeaders(loginId),
      })
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then(({ save, updatedAt }) => {
          setSaveUpdatedAt(updatedAt ?? null);
          const today = new Date().toLocaleDateString("en-CA", {
            timeZone: "Asia/Taipei",
          });
          setDailyDate(today);
          if (save) {
            const inferredClass = inferClassFromSkills(save.skills);
            const savedClass = save.playerClass ?? inferredClass;
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
            setRebirthCount(Math.min(MAX_REBIRTHS, Number(save.rebirthCount ?? 0)));
            setSelectedTitle((save.selectedTitle ?? "none") as TitleId);
            setSelectedAppearance((save.selectedAppearance ?? "none") as AppearanceId);
            setOwnedTitles(Array.isArray(save.ownedTitles) ? save.ownedTitles : ["none"]);
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
              setPlayerHp(savedPlayerHp);
            }
            const normalizedSavedItems = Array.isArray(save.items)
              ? save.items.map((item: Item) => normalizeSceneItem(item))
              : [];
            if (Array.isArray(save.items)) setItems(normalizedSavedItems);
            if (save.loadouts) setLoadouts(save.loadouts);
            if (save.activeLoadout === 1 || save.activeLoadout === 2) {
              setActiveLoadout(save.activeLoadout);
            }
            if (Array.isArray(save.skills)) setSkills(save.skills);
            const needsBossTicketReset = save.bossTicketResetVersion !== PERSONAL_BOSS_RESET_VERSION;
            setBossTickets(needsBossTicketReset ? 10 : (save.bossTickets ?? 10));
            setHighestFloor(save.highestFloor ?? savedWave);
            setCompletedRuns(save.completedRuns ?? 0);
            // Idle time is settled by the server after this load. Keeping the
            // raw saved value here prevents a background tab and the server
            // from crediting the same seconds twice.
            setStoredSeconds(Math.min(43200, save.storedSeconds ?? 0));
            setIdleSeconds(Math.max(0, Math.min(599, save.idleSeconds ?? 0)));
            setBattleOn(save.battleOn !== false);
            setSkillPoints(save.skillPoints ?? 1);
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
          // Never mark a failed load as save-ready: the default in-memory
          // state could otherwise overwrite the player's cloud progress.
          setSaveStatus("讀檔失敗，已停止存檔");
          setSaveReady(false);
        });
    });
  }, [loginId, playerClass, playerId]);

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

  const settleBackgroundProgress = useCallback(() => {
    if (!saveReady || !playerId || sessionSuperseded) return;
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
        if (typeof result?.save?.storedSeconds === "number") {
          setStoredSeconds(Math.min(43200, Math.max(0, result.save.storedSeconds)));
        }
        setSaveUpdatedAt(result.updatedAt ?? null);
        setSaveStatus("雲端已同步");
      })
      .catch(() => undefined);
  }, [loginId, pauseSupersededSession, playerId, saveReady, sessionSuperseded]);

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
    if (!saveReady || !playerId || sessionSuperseded) return;
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
    const delay = prioritySaveRef.current
      ? 0
      : Math.min(SAVE_DEBOUNCE_MS, maxWait);
    const timer = setTimeout(() => {
      if (saveInFlightRef.current) {
        saveQueuedRef.current = true;
        return;
      }
      saveInFlightRef.current = true;
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
        loadouts,
        activeLoadout,
        skills,
        bossTickets,
        bossTicketResetVersion: PERSONAL_BOSS_RESET_VERSION,
        worldAttempts,
        worldBossResetVersion: WORLD_BOSS_RESET_VERSION,
        highestFloor,
        completedRuns,
        storedSeconds,
        battleOn,
        idleSeconds,
        skillPoints,
        mails,
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
      fetch("/api/save", {
        method: "POST",
        headers: loginHeaders(loginId, true),
        body: JSON.stringify({ playerId, save: payload }),
      })
        .then(async (response) => {
          const result = await response.json();
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
          if (response.status === 409 && result?.error === "save_conflict") {
            saveQueuedRef.current = false;
            saveRequestIdRef.current = null;
            setSaveStatus("雲端已同步");
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
          if (result?.accepted === false) {
            // Duplicate/idempotent writes mean the authoritative server save
            // already contains this operation. Confirm it silently instead of
            // remounting the whole game and resetting the visible battle UI.
            setSaveUpdatedAt(result.updatedAt ?? saveUpdatedAt);
            saveRequestIdRef.current = null;
            setSaveStatus("雲端已同步");
            sessionStorage.removeItem(`dark-world-save-conflict-recovery:${playerId}`);
            return;
          }
          setSaveUpdatedAt(result.updatedAt ?? saveUpdatedAt);
          setSaveStatus("雲端已同步");
          saveRequestIdRef.current = null;
          sessionStorage.removeItem(`dark-world-save-conflict-recovery:${playerId}`);
        })
        .catch(() => setSaveStatus("等待連線"))
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
    saveUpdatedAt,
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
    skills,
    bossTickets,
    worldAttempts,
    highestFloor,
    completedRuns,
    storedSeconds,
    battleOn,
    idleSeconds,
    skillPoints,
    mails,
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
          if (!save || revision <= adminRevision) return;
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
  }, [dailyDate, now]);

  const claimDailyHuntReward = () => {
    if (dailyKills < 500)
      return toast.info("今日獵殺尚未完成", {
        description: `還需擊敗 ${500 - dailyKills} 隻怪物`,
      });
    if (dailyRewardClaimed) return toast.info("今日獎勵已領取");
    setGold((value) => value + 5000);
    setEnhanceStones((value) => value + 10);
    setReforgeStones((value) => value + 10);
    setYuanbao((value) => value + 20);
    setDailyRewardClaimed(true);
    pushLog("收益", "完成今日獵殺 500 隻：金幣 +5,000・強化石 +10・洗鍊石 +10・元寶 +20");
    toast.success("今日獵殺獎勵已領取", {
      description: "金幣 +5,000・強化石 +10・洗鍊石 +10・元寶 +20",
    });
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = idleSeconds + 60;
      if (next >= 600) {
        const rewards = Math.floor(next / 600) * 10;
        setYuanbao((value) => value + rewards);
        pushLog("收益", `泡點模式達成，獲得元寶 +${rewards}`);
        toast.success("泡點收益已發放", { description: `元寶 +${rewards}` });
        requestPrioritySave();
      }
      setIdleSeconds(next % 600);
    }, 60_000);
    return () => window.clearTimeout(timer);
  }, [idleSeconds, pushLog, requestPrioritySave]);

  const buyShopItem = (item: "reforge" | "gamble" | "title-ash" | "title-abyss" | "appearance-ember" | "appearance-arcane" | "appearance-abyss" | "gold-reforge" | "gold-enhance") => {
    const yuanbaoPrices: Partial<Record<typeof item, number>> = {
      "title-ash": 80, "title-abyss": 180, "appearance-ember": 120,
      "appearance-arcane": 180, "appearance-abyss": 300, reforge: 10, gamble: 10,
    };
    const goldPrices: Partial<Record<typeof item, number>> = { "gold-reforge": 200000, "gold-enhance": 100000 };
    const yuanbaoPrice = yuanbaoPrices[item];
    const goldPrice = goldPrices[item];
    if (yuanbaoPrice) {
      if (yuanbao < yuanbaoPrice) return toast.error("元寶不足", { description: `需要 ${yuanbaoPrice} 元寶` });
      setYuanbao((value) => value - yuanbaoPrice);
      if (item.startsWith("title-")) {
        const title = item === "title-ash" ? "ash-conqueror" : "abyss-survivor";
        setOwnedTitles((current) => current.includes(title) ? current : [...current, title]);
        setSelectedTitle(title);
        toast.success("稱號已解鎖並裝備", { description: TITLE_OPTIONS[title].name });
        return;
      }
      if (item.startsWith("appearance-")) {
        const appearance = item.replace("appearance-", "") as "ember" | "arcane" | "abyss";
        const id = `${appearance}-aura` as AppearanceId;
        setOwnedAppearances((current) => current.includes(id) ? current : [...current, id]);
        setSelectedAppearance(id);
        toast.success("外觀特效已解鎖並裝備", { description: APPEARANCE_OPTIONS[id].name });
        return;
      }
    }
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
    if (item === "reforge") {
      setReforgeStones((value) => value + 12);
      pushLog("收益", "商城購買洗鍊石 ×12，消耗元寶 10");
      toast.success("購買成功", { description: "洗鍊石 +12" });
      return;
    }
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
          setSkillPoints((points) => points + levelUps);
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
            (!worn || equipmentDisplayRating(item) > equipmentDisplayRating(worn))
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
          id: Date.now() + index,
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
    const nextMails = mails.map((mail) => {
      if (mail.claimed) return mail;
      const itemsToClaim = mail.rewards.items.slice(0, freeSlots);
      freeSlots -= itemsToClaim.length;
      claimedItems.push(...itemsToClaim);
      const remainingItems = mail.rewards.items.slice(itemsToClaim.length);
      const claimResources = !mail.rewards.resourcesClaimed;
      if (claimResources) {
        goldGain += mail.rewards.gold;
        stonesGain += mail.rewards.stones;
        yuanbaoGain += mail.rewards.yuanbao ?? 0;
      }
      return {
        ...mail,
        claimed: remainingItems.length === 0,
        rewards: {
          ...mail.rewards,
          gold: claimResources ? 0 : mail.rewards.gold,
          stones: claimResources ? 0 : mail.rewards.stones,
          yuanbao: claimResources ? 0 : mail.rewards.yuanbao,
          items: remainingItems,
          resourcesClaimed: true,
        },
      };
    });
    if (goldGain) setGold((value) => value + goldGain);
    if (stonesGain) setEnhanceStones((value) => value + stonesGain);
    if (yuanbaoGain) setYuanbao((value) => value + yuanbaoGain);
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
    [addLoot, blessings, mapId, playerClass, pushLog],
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

  useEffect(() => {
    if (!blessingOpen || blessingDrawing || blessingChoices.length === 0)
      return;
    const timer = setTimeout(() => {
      if (blessingCountdown <= 1)
        chooseBlessing(
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
    setRunDialogOpen(false);
    setRestartCountdown(10);
    setBattleOn(true);
    setCausePrompt(
      completed ? `${currentMap.name}新一輪遠征開始，祝福已重置` : "戰敗後重新整備，祝福已清除",
    );
  };

  const finishRun = (outcome: "death" | "complete", floor: number) => {
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
    setRunDialogOpen(true);
    setRestartCountdown(10);
    pushLog(
      "戰鬥",
      outcome === "complete"
        ? `擊敗${currentMap.name}第 30 層首領，下一張地圖已解鎖；10 秒後在原地展開新一輪`
        : "角色戰敗，10 秒後從第 1 層重新挑戰",
    );
  };

  const canRebirth = level >= 100 && (mapBestFloors[9] ?? 0) >= MAP_FLOORS && rebirthCount < MAX_REBIRTHS;
  const rebirth = () => {
    if (!canRebirth) return;
    towerDeathPendingRef.current = false;
    resetCombatPerks();
    setRebirthCount((value) => Math.min(MAX_REBIRTHS, value + 1));
    setRebirthPoints((value) => value + 2);
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
    setSkills(skillsByClass[playerClass].map((skill, index) => ({ ...skill, level: index === 0 ? 1 : 0 })));
    setSkillPoints(1);
    setCompletedRuns(0);
    setStoredSeconds(0);
    setBlessings([]);
    setDailyKills(0);
    setDailyDate(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }));
    setDailyRewardClaimed(false);
    setFinalBossDefeated(false);
    setBattleDrops([]);
    setRunSummary(null);
    setRunDialogOpen(false);
    setBattleOn(true);
    setCausePrompt(`第 ${rebirthCount + 1} 轉開始，裝備、信件與地圖進度已重置`);
    pushLog("系統", `完成第 ${rebirthCount + 1} 次輪迴，獲得輪迴天賦點 +2`);
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
    setRunDialogOpen(false);
    setRestartCountdown(10);
    setBattleOn(true);
    setTab("主控");
    setCausePrompt(`已前往${target.name}，祝福重新累積`);
    pushLog("系統", `前往${target.name}，從第 1 層開始定點掛機`);
  };

  useEffect(() => {
    if (!runSummary) return;
    const timer = setTimeout(() => {
      if (restartCountdown <= 1) beginNewRun();
      else setRestartCountdown((value) => value - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [runSummary, restartCountdown]);

  useEffect(() => {
    if (!battleOn || activeBossBattle || runSummary) return;
    const tickMs = COMBAT_TICK_MS;
    const monsterAttackSpeed = monsterProfile(currentEnemyBaseName).speed * 100;
    let playerClock = 0;
    let monsterClock = 0;
    let realSecondClock = 0;
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
    let fissureRemaining = 0;
    let fissureDetonationPending = false;
    const hasPerk = (id: string) => hasCatalogItem(equippedGear, id);
    const hasSkillMythic = (skill: string) => Boolean(equippedSkillMythic(equippedGear, skill));
    if (markedRemaining > 0 && hasSkillMythic("致命標記")) {
      showCombatStatus({ name: "致命標記 ×2", target: "enemy", remaining: markedRemaining + 1, unit: "攻擊", tone: "gold" });
    }
    const timer = setInterval(
      () => {
        if (towerDeathPendingRef.current) return;
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
        realSecondClock += tickMs;
        if (realSecondClock >= 1000) {
          realSecondClock -= 1000;
          setStoredSeconds((s) => Math.min(43200, s + 1));
          setCombatStatuses((current) =>
            current
              .map((status) => status.unit === "秒" ? { ...status, remaining: status.remaining - 1 } : status)
              .filter((status) => status.remaining > 0),
          );
        }
        playerClock += tickMs;
        monsterClock += tickMs;
        const activeCombatAttackSpeed = combatAttackSpeed * (
          combatPerksRef.current.dodgeSpeedAttacks > 0 ? 1.12 : 1
        );
        const playerInterval = 100000 / Math.max(1, activeCombatAttackSpeed);
        const monsterInterval = 100000 / monsterAttackSpeed;
        const playerActs = playerClock >= playerInterval;
        const monsterActs = monsterClock >= monsterInterval;
        if (!playerActs && !monsterActs) return;
        if (playerActs) playerClock %= playerInterval;
        if (monsterActs) monsterClock %= monsterInterval;
        if (burningUntil > Date.now() && Date.now() >= nextBurnAt) {
          nextBurnAt = Date.now() + 1000;
          const burnLevel = skills.find((skill) => skill.name === "霜火新星")?.level ?? 1;
          setEnemyHp((health) => Math.max(0, health - (1.5 + burnLevel * 0.5)));
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
              if (Math.random() * 100 < effectiveDodge) {
                if (hasPerk("special-shadowwalker")) {
                  combatPerksRef.current.dodgeSpeedAttacks = 3;
                  showCombatStatus({ name: "疾影 +12%攻速", target: "player", remaining: 3, unit: "次", tone: "green" });
                }
                setPlayerHitFeedback({ damage: 0, dodged: true, key: next });
                setEnemyHitFeedback({ damage: 0, dodged: true, key: next });
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
                setPlayerHitFeedback({ damage: 0, dodged: true, key: next });
                setEnemyHitFeedback({ damage: 0, dodged: true, key: next });
                setCausePrompt("鋼鐵壁壘觸發 → 完全格擋");
                return playerHealth;
              }
              const magicShieldLevel = skills.find((skill) => skill.name === "魔力護盾")?.level ?? 0;
              if (playerClass === "法師" && !shieldExpired && magicShieldCooldown <= 0 && magicShieldLevel > 0 && Math.random() < skillProcChance("魔力護盾", magicShieldLevel)) {
                monsterDamage = Math.max(1, Math.round(monsterDamage * (1 - skillReduction("魔力護盾", magicShieldLevel))));
                magicShieldCooldown = 4 + Math.floor(Math.random() * 3);
                queueSkillVisual({ name: "魔力護盾", key: next });
                showCombatStatus({ name: `魔力護盾 -${Math.round(skillReduction("魔力護盾", magicShieldLevel) * 100)}%`, target: "player", remaining: 1, unit: "次", tone: "blue" });
                setCausePrompt(`魔力護盾觸發 → 下一次傷害降低 ${Math.round(skillReduction("魔力護盾", magicShieldLevel) * 100)}%`);
              }
              if (shieldExpired && hasPerk("skill-mage-eternal-core")) {
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
              const actualDamage = Math.min(
                healthFromPercent(playerHealth, characterStats.hp),
                monsterDamage,
              );
              const hpLoss = playerHpLossFromDamage(actualDamage);
              if (hasPerk("special-revenge-thorn")) {
                combatPerksRef.current.revengeStacks = Math.min(3, combatPerksRef.current.revengeStacks + 1);
              }
              setPlayerHitFeedback({ damage: actualDamage, dodged: false, key: next });
              setEnemyHitFeedback({ damage: actualDamage, dodged: false, key: next });
              if (
                actualDamage >= healthFromPercent(playerHealth, characterStats.hp) ||
                playerHealth - hpLoss <= 0.000001
              ) {
                if (!towerDeathPendingRef.current) {
                  towerDeathPendingRef.current = true;
                  setBattleOn(false);
                  setCausePrompt("生命歸零 → 戰鬥已停止");
                  window.setTimeout(() => finishRun("death", wave), 0);
                }
                return 0;
              }
              return playerHealth - hpLoss;
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
          if (playerActs) playerAttackCount += 1;
          const setTriggered =
            activeSetCount >= SET_RESONANCE_ATTACKS &&
            playerAttackCount % SET_RESONANCE_ATTACKS === 0;
          let triggered: Skill | null = null;
          let triggeredMultiplier = 1;
          let triggeredDefenseIgnore = defenseBreakRemaining > 0 ? 35 : 0;
          let frostfireDetonationDamage = 0;
          let meteorSecondTriggered = false;
          const bloodRoarWasActive = bloodRoarStateRef.current.remaining > 0;
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
              setBloodRoarSlashKey(next);
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
            const hasSkill = (name: string) => learned.find((skill) => skill.name === name);
            const executionThreshold = hasPerk("skill-warrior-executioner") ? 8 : 10;
            const executionSkill = playerClass === "戰士" && warriorAttackCount % executionThreshold === 0
              ? hasSkill("處決")
              : undefined;
            const executionReady = Boolean(executionSkill);
            if (skillCooldown <= 0 || executionReady) {
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
              fissureDetonationPending = false;
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
                fissureDetonationPending = true;
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
          const critical = Math.random() * 100 < Math.min(100, characterStats.crit);
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
          const windCriticalMultiplier = windVolleyTriggered
            ? windVolleyCriticals.reduce<number>(
                (total, isCritical) => total + (isCritical ? 1 + (characterStats.critDamage + (activeAttackPerks?.nextAttackCritDamage ?? 0)) / 100 : 1),
                0,
              ) / Math.max(1, windVolleyCriticals.length)
            : critical
              ? 1 + (characterStats.critDamage + (activeAttackPerks?.nextAttackCritDamage ?? 0)) / 100
              : 1;
          const skillDamageTriggered = Boolean(triggered);
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
          const combatValues = towerCombatValues({
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
              (bloodRoarWasActive ? 1 + bloodRoarDamageBonus(skills.find((skill) => skill.name === "鮮血怒吼")?.level ?? 0) / 100 : 1),
            skillDamage: characterStats.skillDamage +
              (activeSetCount >= 8 ? 12 : 0) +
              (skillDamageTriggered && magicShieldCooldown > 0 && hasPerk("skill-mage-eternal-core") ? 25 : 0),
            eliteDamage: 0,
            bossReduction: characterStats.bossReduction,
            lowHealthDamage: characterStats.lowHealthDamage,
            lowHealthReduction: characterStats.lowHealthReduction,
            lowHealth: playerHp <= 35,
            roll: Math.random(),
            monsterName: currentEnemyBaseName,
            playerDefense: characterStats.defense,
            playerAttack: offensiveAttack,
            defenseIgnore: triggeredDefenseIgnore,
            playerHit: characterStats.hit,
            monsterEvasionRating:
              balanceConfig.combat.evasionModel.monsterEvasionBase +
              mapId * balanceConfig.combat.evasionModel.monsterEvasionPerMap +
              (balanceConfig.combat.evasionModel.monsterEvasionBonusByMap[mapId] ?? 0),
            playerDamageMultiplier:
              attackPerkMultiplier *
              (activeSetCount >= 2 ? 1.08 : 1) *
              (fissureWasActive ? 1.3 : 1),
          });
          const bossDamageMultiplier =
            currentWaveBoss || currentWaveGuardian || currentWaveElite
              ? 1 + characterStats.bossDamage / 100
              : 1;
          const baseHpDamage = Math.round(
            combatValues.playerDamage *
              windCriticalMultiplier *
              bossDamageMultiplier,
          );
          let hpDamage = baseHpDamage;
          if (activeSetCount >= 6) {
            hpDamage += Math.round(combatValues.playerDamage * SET_ELEMENTAL_DAMAGE_PCT / 100);
          }
          if (setTriggered) {
            hpDamage += Math.round(combatValues.playerDamage * SET_RESONANCE_DAMAGE_PCT / 100);
          }
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
          const effectName = bloodRoarFinalAttack
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
              : null;
          setComboCount(attacks);
          if (effectName) queueSkillVisual({ name: effectName, key: next });
          else setSkillEffect(null);
          if (triggered?.name === "穿雲箭") {
            setRangerPiercingEffect({ key: next });
            window.setTimeout(triggerRangerImpact, 140);
          }
          if (triggered?.name === "疾風連射") {
            const shotCount = windVolleyCriticals.length;
            setRangerWindVolleyEffect((current) => [...current, { key: next, shotCount }]);
            window.setTimeout(() => {
              setRangerWindVolleyEffect((current) => current.filter((effect) => effect.key !== next));
            }, 250 + (shotCount - 1) * 250 + 1_700);
            Array.from({ length: shotCount }, (_, index) => 495 + index * 250).forEach((impactDelay) => {
              window.setTimeout(triggerRangerImpact, impactDelay);
            });
          }
          if (triggered?.name === "致命標記") {
            setDeadlyMarkEffect({ key: next, detonationKey: null });
            window.setTimeout(triggerRangerImpact, 270);
          }
          if (markExplosionWasActive) {
            setDeadlyMarkEffect((current) => current ? { ...current, detonationKey: next } : current);
            window.setTimeout(triggerRangerImpact, 240);
          }
          if (triggered?.name === "裂地斬") setGroundSplitEffect({ key: next });
          if (triggered?.name === "處決") {
            setExecutionEffect({ key: next });
            window.setTimeout(() => {
              setExecutionImpactPulse(true);
              window.setTimeout(() => setExecutionImpactPulse(false), 360);
            }, 750);
          }
          const hitRoll = Math.random() * 100;
          if (hitRoll > effectiveHit) {
            setLastDamage(0);
            setBattleHits([]);
            setCausePrompt(
              `命中 ${effectiveHit.toFixed(0)}% − 敵方閃避 ${(100 - effectiveHit).toFixed(0)}% → 攻擊落空`,
            );
            return next;
          }
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
          setEnemyHp((h) => {
            const execution =
              hasBlessing("execute") &&
              h <= (blessingUpgraded("execute") ? 35 : 30);
            const executionMythicBonus =
              triggered?.name === "處決" &&
              hasPerk("skill-warrior-executioner") &&
              h <= 25
                ? 2
                : 1;
            const finalHpDamage = Math.round(
              hpDamage *
                (execution ? (blessingUpgraded("execute") ? 1.6 : 1.45) : 1) *
                executionMythicBonus,
            );
            const enemyMaximumHealth = effectiveMonsterMaximumHealth(
              mapId,
              currentRecommendedPower,
              tier,
              currentEnemyBaseName,
            );
            const actualPercentDamage = Math.min(
              h,
              healthPercentFromDamage(finalHpDamage, enemyMaximumHealth),
            );
            const currentEffectiveEnemyHealth =
              healthFromPercent(h, enemyMaximumHealth);
            const totalDisplayedDamage = Math.max(
              1,
              Math.min(Math.round(currentEffectiveEnemyHealth), finalHpDamage),
            );
            const baseHitDamage = Math.max(1, Math.floor(totalDisplayedDamage / attacks));
            const remainder = Math.max(0, totalDisplayedDamage - baseHitDamage * attacks);
            const hitDamages = windVolleyTriggered
              ? Array.from({ length: attacks }, (_, index) =>
                  Math.max(
                    1,
                    Math.round(
                      (totalDisplayedDamage *
                        (windVolleyCriticals[index] ? 1 + (characterStats.critDamage + (activeAttackPerks?.nextAttackCritDamage ?? 0)) / 100 : 1)) /
                        windVolleyCriticals.reduce<number>(
                          (total, isCritical) => total + (isCritical ? 1 + (characterStats.critDamage + (activeAttackPerks?.nextAttackCritDamage ?? 0)) / 100 : 1),
                          0,
                        ),
                    ),
                  ),
                )
              : Array.from({ length: attacks }, (_, index) =>
                  baseHitDamage + (index < remainder ? 1 : 0),
                );
            const perHitDamage = hitDamages[0] ?? baseHitDamage;
            const publishDamageDisplay = () => {
              if (windVolleyTriggered) {
                setRangerWindVolleyDamage((current) => [
                  ...current.filter((volley) => volley.key !== next),
                  {
                    key: next,
                    hits: hitDamages.map((damage, index) => ({ damage, critical: windVolleyCriticals[index] ?? false })),
                    visible: 0,
                  },
                ]);
                windVolleyCriticals.forEach((_, index) => {
                  window.setTimeout(() => {
                    setRangerWindVolleyDamage((current) => current.map((volley) =>
                      volley.key === next ? { ...volley, visible: Math.max(volley.visible, index + 1) } : volley,
                    ));
                  }, 495 + index * 250);
                });
                window.setTimeout(() => {
                  setRangerWindVolleyDamage((current) => current.filter((volley) => volley.key !== next));
                }, 495 + (windVolleyCriticals.length - 1) * 250 + 1_200);
              } else {
                const groupKey = next;
                setBattleHitGroups((current) => [
                  ...current,
                  {
                    key: groupKey,
                    hits: hitDamages.map((damage) => ({
                      damage,
                      critical: critical || triggered?.name === "處決",
                    })),
                  },
                ]);
                window.setTimeout(() => {
                  setBattleHitGroups((current) => current.filter((group) => group.key !== groupKey));
                }, 1_200);
              }
              setLastDamage(perHitDamage);
            };
            // Delay the number until each dedicated VFX reaches its impact:
            // execution frame 6 at 750ms; ground-split frame 5 at 540ms.
            const damageDisplayDelay = triggered?.name === "處決"
              ? 750
              : triggered?.name === "裂地斬"
                ? 540
                : triggered?.name === "霜火新星"
                  ? (frostfireDetonationDamage > 0 ? 520 : 1320)
                : triggered?.name === "隕星術"
                  ? 650
                : markExplosionWasActive || magicShieldExplosionWasActive
                  ? 240
                : 0;
            if (damageDisplayDelay > 0) {
              window.setTimeout(publishDamageDisplay, damageDisplayDelay);
            } else {
              publishDamageDisplay();
            }
            setCausePrompt(
              `${windVolleyTriggered ? "疾風連射：" : ""}攻擊 ${characterStats.attack.toLocaleString()} × 技能 ${Math.round(triggeredMultiplier * 100)}%${skillDamageTriggered && characterStats.skillDamage > 0 ? ` × 技能傷害 +${characterStats.skillDamage}%` : ""}${critical ? ` × 暴擊 ${(1 + (characterStats.critDamage + (activeAttackPerks?.nextAttackCritDamage ?? 0)) / 100).toFixed(2)}` : ""} × 怪物減傷${activeAttackPerks?.ironWallBonus ? ` × 絕對防禦 +${activeAttackPerks.ironWallBonus}` : ""} → ${attacks} 段，共 ${totalDisplayedDamage.toLocaleString()} 傷害`,
            );
            const temporaryLifesteal = bloodRoarWasActive
              ? bloodRoarLifesteal(skills.find((skill) => skill.name === "鮮血怒吼")?.level ?? 0)
              : 0;
            const totalLifesteal = Math.min(100, dynamicLifesteal + temporaryLifesteal);
            if (bloodRoarFinalAttack) {
              setPlayerHp((health) => Math.max(1, health * 0.9));
            }
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
            if (h - actualPercentDamage <= 0.000001) {
              const executionFinisher = triggered?.name === "處決";
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
              setCombatStatuses([]);
              defenseBreakRemaining = 0;
              markedRemaining = 0;
              markExplosionPending = false;
              fissureRemaining = 0;
              fissureDetonationPending = false;
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
            }
            if (!monsterActs) return Math.max(0, h - actualPercentDamage);
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
              if (Math.random() * 100 < effectiveDodge) {
                if (hasPerk("special-shadowwalker")) {
                  combatPerksRef.current.dodgeSpeedAttacks = 3;
                  showCombatStatus({ name: "疾影 +12%攻速", target: "player", remaining: 3, unit: "次", tone: "green" });
                }
                setPlayerHitFeedback({ damage: 0, dodged: true, key: next });
                setEnemyHitFeedback({ damage: 0, dodged: true, key: next });
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
                setPlayerHitFeedback({ damage: 0, dodged: true, key: next });
                setEnemyHitFeedback({ damage: 0, dodged: true, key: next });
                setCausePrompt("鋼鐵壁壘觸發 → 完全格擋");
                return playerHealth;
              }
              const magicShieldLevel = skills.find((skill) => skill.name === "魔力護盾")?.level ?? 0;
              if (playerClass === "法師" && !shieldExpired && magicShieldCooldown <= 0 && magicShieldLevel > 0 && Math.random() < skillProcChance("魔力護盾", magicShieldLevel)) {
                monsterDamage = Math.max(1, Math.round(monsterDamage * (1 - skillReduction("魔力護盾", magicShieldLevel))));
                magicShieldCooldown = 4 + Math.floor(Math.random() * 3);
                queueSkillVisual({ name: "魔力護盾", key: next });
                showCombatStatus({ name: `魔力護盾 -${Math.round(skillReduction("魔力護盾", magicShieldLevel) * 100)}%`, target: "player", remaining: 1, unit: "次", tone: "blue" });
                setCausePrompt(`魔力護盾觸發 → 下一次傷害降低 ${Math.round(skillReduction("魔力護盾", magicShieldLevel) * 100)}%`);
              }
              if (shieldExpired && hasPerk("skill-mage-eternal-core")) {
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
              const actualDamage = Math.min(
                healthFromPercent(playerHealth, characterStats.hp),
                monsterDamage,
              );
              setEnemyHitFeedback({
                damage: actualDamage,
                dodged: false,
                key: next,
              });
              setPlayerHitFeedback({ damage: actualDamage, dodged: false, key: next });
              if (hasPerk("special-revenge-thorn")) {
                combatPerksRef.current.revengeStacks = Math.min(3, combatPerksRef.current.revengeStacks + 1);
              }
              const hpLoss = playerHpLossFromDamage(actualDamage);
              if (
                actualDamage >= healthFromPercent(playerHealth, characterStats.hp) ||
                playerHealth - hpLoss <= 0.000001
              ) {
                if (!towerDeathPendingRef.current) {
                  towerDeathPendingRef.current = true;
                  setBattleOn(false);
                  setCausePrompt("生命歸零 → 戰鬥已停止");
                  window.setTimeout(() => finishRun("death", wave), 0);
                }
                return 0;
              }
              return playerHealth - hpLoss;
            });
            return Math.max(0, h - actualPercentDamage);
          });
          return next;
        });
      },
      tickMs,
    );
    return () => clearInterval(timer);
  }, [
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
    skills,
    blessings,
    currentWaveElite,
    currentWaveGuardian,
    currentWaveBoss,
    wave,
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
    if (offlineClaimPending) return;
    setOfflineClaimPending(true);
    let claimSeconds = storedSeconds;
    try {
      const response = await fetch("/api/save", {
        method: "POST",
        headers: loginHeaders(loginId, true),
        body: JSON.stringify({ playerId, action: "claim_idle" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.ok !== true) throw new Error(result?.error ?? "claim_failed");
      claimSeconds = Math.max(0, Math.min(43200, Number(result.claimedSeconds ?? 0)));
      setStoredSeconds(0);
      setSaveUpdatedAt(result.updatedAt ?? saveUpdatedAt);
      setSaveStatus("雲端已同步");
    } catch {
      setOfflineClaimPending(false);
      toast.error("離線戰果領取失敗", { description: "請確認連線後再試一次，收益不會被扣除。" });
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
    const isEquipped = equipped.includes(currentItem.id);
    const actualDifference = powerDifferenceForItem(currentItem);
    if (isEquipped) {
      updateEquipped((old) => old.filter((id) => id !== currentItem.id));
      toast.info(`已卸下${currentItem.name}`, {
        description: `實際戰力 ${actualDifference >= 0 ? "+" : ""}${actualDifference.toLocaleString()}`,
      });
      pushLog(
        "裝備",
        `卸下${currentItem.name}，戰力更新為 ${(combatPower + actualDifference).toLocaleString()}`,
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
      description: `${replaced ? `替換${replaced.name}・` : ""}實際戰力 ${actualDifference >= 0 ? "+" : ""}${actualDifference.toLocaleString()}`,
    });
    pushLog(
      "裝備",
      `穿上${currentItem.name}，戰力更新為 ${(combatPower + actualDifference).toLocaleString()}`,
    );
  };

  const reforge = (targeted: boolean) => {
    if (!currentItem) return;
    if (targeted && targetedAffix === null)
      return toast.info("請先點選要定向替換的詞綴");
    const { stones: stoneNeed, gold: goldNeed } = equipmentReforgeCost(currentReforgeCount, targeted);
    if (reforgeStones < stoneNeed || gold < goldNeed)
      return toast.error("洗鍊資源不足", {
        description: `需要 ${goldNeed.toLocaleString()} 金幣與 ${stoneNeed} 顆洗鍊石`,
      });
    const nextAffixes = targeted
      ? currentItem.affixes.map((affix, index) =>
          index === targetedAffix
            ? rerollSingleAffix(currentItem, affix, index)
            : affix,
        )
      : rollAffixes(currentItem);
    setGold((value) => value - goldNeed);
    setReforgeStones((value) => value - stoneNeed);
    setItems((old) =>
      old.map((item) =>
        item.id === currentItem.id
          ? {
              ...item,
              affixes: nextAffixes,
              affixSchemaVersion: 7,
              reforgeCount: Math.min(Number.MAX_SAFE_INTEGER, currentReforgeCount + 1),
            }
          : item,
      ),
    );
    pushLog("裝備", `${currentItem.name}完成${targeted ? "定向" : "一般"}洗鍊`);
    toast.success("洗鍊完成", {
      description: `${currentItem.quality}裝備只會產生${currentItem.quality}數值區間・可繼續洗鍊`,
    });
  };

  const drillCurrentItem = () => {
    if (!currentItem) return;
    if (drillingStones <= 0) return toast.error("沒有打孔石");
    const nextSockets = drillSocket(normalizeEquipmentSockets(currentItem.sockets));
    if (!nextSockets) return toast.info("這件裝備已達 2 孔上限");
    setItems((old) => old.map((item) => item.id === currentItem.id ? { ...item, sockets: nextSockets } : item));
    setDrillingStones((value) => value - 1);
    pushLog("裝備", `${currentItem.name}新增 1 個寶石孔`);
    toast.success("打孔成功", { description: `${currentItem.name}目前有 ${nextSockets.socketCount} 個孔位` });
  };

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
        `戰場即時穿上${item.name}，實際戰力 ${actualDifference >= 0 ? "+" : ""}${actualDifference}`,
      );
      toast.success(`已穿上${item.name}`, {
        description: `實際戰力 ${actualDifference >= 0 ? "+" : ""}${actualDifference}，下一輪生效。`,
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
    setBossPlayerHp(100);
    setLastBossDamage(0);
    setLastBossCounterDamage(0);
    setBossDamageGroups([]);
    abyssBossAttackCountRef.current = 0;
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
      const remainingMs = Math.max(0, worldBossDeadlineRef.current! - Date.now());
      setWorldBossSecondsLeft(Math.ceil(remainingMs / 1_000));
      if (remainingMs > 0 || bossRoundEndedRef.current) return;

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
  }, [activeBossBattle, bossOutcome, requestPrioritySave, worldDamage, worldRoundDamage]);

  useEffect(() => {
    if (!activeBossBattle || bossOutcome) return;
    const tickMs = COMBAT_TICK_MS;
    const bossMonsterName = baseMonsterName(activeBossBattle.name);
    // 個人首領採固定節奏，避免沿用各怪物原始攻速而造成首領間的壓力落差。
    // 殘影：每秒 1 次；真身：每秒 1.25 次（每 0.8 秒一次）。
    const bossAttackSpeed = activeBossBattle.mode === "personal"
      ? (activeBossBattle.name.endsWith("・真身") ? 125 : 100)
      : monsterProfile(bossMonsterName).speed * 100;
    let playerClock = 0;
    let bossClock = 0;
    let bossSkillCooldown = 0;
    let warriorBossAttackCount = 0;
    let bossPlayerAttackCount = 0;
    const hasPerk = (id: string) => hasCatalogItem(equippedGearRef.current, id);
    const timer = setInterval(
      () => {
        if (bossCinematicLockRef.current) return;
        playerClock += tickMs;
        bossClock += tickMs;
        const activeWorldBurn = worldBossBurnRef.current;
        if (
          activeBossBattle.mode === "world" &&
          activeWorldBurn.until > Date.now() &&
          Date.now() >= activeWorldBurn.nextAt
        ) {
          activeWorldBurn.nextAt = Date.now() + 1_000;
          const burnDamage = Math.max(1, activeWorldBurn.damagePerSecond);
          const burnHpLoss = healthPercentFromDamage(burnDamage, activeBossBattle.hp);
          setBossEnemyHp((hp) => Math.max(0, hp - burnHpLoss));
          setWorldDamage((value) => value + burnDamage);
          setWorldRoundDamage((value) => value + burnDamage);
          setLastBossDamage(burnDamage);
          const burnKey = Date.now();
          setBossDamageGroups((current) => [...current, { key: burnKey, damage: burnDamage }]);
          window.setTimeout(() => {
            setBossDamageGroups((current) => current.filter((group) => group.key !== burnKey));
          }, 1_200);
        }
        const playerInterval = 100000 / Math.max(1, combatAttackSpeed);
        const bossInterval = 100000 / bossAttackSpeed;
        const playerActs = playerClock >= playerInterval;
        // 世界首領只保留倒數結束時的專屬必殺技，不進行普通攻擊或反擊。
        const bossActs = activeBossBattle.mode !== "world" && bossClock >= bossInterval;
        if (!playerActs && !bossActs) return;
        if (playerActs) playerClock %= playerInterval;
        if (bossActs) {
          bossClock %= bossInterval;
          abyssBossAttackCountRef.current += 1;
        }
        const next = Date.now();
        setBattlePulse((value) => value + 1);
        setEnemyHitFeedback(null);
        setPlayerHitFeedback(null);
        let bossSkillMultiplier = 1;
        let bossSkill: Skill | null = null;
        let bossDefenseIgnore = hasPerk("special-blackfang") ? 8 : 0;
        let bossGuaranteedCritical = false;
        let bossCritDamageBonus = 0;
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
          const hasSkill = (name: string) => learned.find((skill) => skill.name === name);
          const executionThreshold = hasPerk("skill-warrior-executioner") ? 8 : 10;
          const executionSkill = playerClass === "戰士" && warriorBossAttackCount % executionThreshold === 0
            ? hasSkill("處決")
            : undefined;
          const executionReady = Boolean(executionSkill);
          if (bossSkillCooldown <= 0 || executionReady) {
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
                        (1 + characterStats.skillDamage / 100) *
                        (1 + characterStats.bossDamage / 100),
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
                  setRangerPiercingEffect({ key: next });
                  window.setTimeout(triggerRangerImpact, 140);
                }
                if (candidate.skill.name === "疾風連射") {
                  const shotCount = hasPerk("skill-ranger-thousand-feathers") ? 7 : 5;
                  setRangerWindVolleyEffect((current) => [...current, { key: next, shotCount }]);
                  window.setTimeout(() => {
                    setRangerWindVolleyEffect((current) => current.filter((effect) => effect.key !== next));
                  }, 250 + (shotCount - 1) * 250 + 1_700);
                  Array.from({ length: shotCount }, (_, index) => 495 + index * 250).forEach((impactDelay) => {
                    window.setTimeout(triggerRangerImpact, impactDelay);
                  });
                }
                if (candidate.skill.name === "處決") {
                  setExecutionEffect({ key: next });
                  window.setTimeout(() => {
                    setExecutionImpactPulse(true);
                    window.setTimeout(() => setExecutionImpactPulse(false), 360);
                  }, 750);
                }
                if (candidate.skill.name === "裂地斬") setGroundSplitEffect({ key: next });
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
          roll: Math.random(),
          attackRoll: Math.random(),
          counterRoll: Math.random(),
          playerDamageMultiplier:
            bossSkillMultiplier *
            bossMarkMultiplier *
            bossExecutionDamageMultiplier *
            (activeSetCount >= 2 ? 1.08 : 1) *
            (hasPerk("special-warhelm") && bossPlayerHpRef.current > 80 ? 1.1 : 1),
          skillTriggered: Boolean(bossSkill),
          defenseIgnore: bossDefenseIgnore,
          guaranteedCritical: bossGuaranteedCritical,
          critDamageBonus: bossCritDamageBonus,
          skillDamage:
            characterStats.skillDamage +
            (activeSetCount >= 8 ? 12 : 0) +
            (bossSkill && hasPerk("skill-mage-eternal-core") ? 25 : 0),
          monsterAttack: bossBaseline.monsterDamage,
          monsterDefense: bossBaseline.monsterDefense,
          monsterMultiplier: activeBossBattle.multiplier,
        });
        const calculatedPlayerDamage = playerActs
          ? bossValues.playerDamage *
            (activeSetCount >= 6 ? 1 + SET_ELEMENTAL_DAMAGE_PCT / 100 : 1) +
            (setResonanceTriggered
              ? bossValues.playerDamage * SET_RESONANCE_DAMAGE_PCT / 100
              : 0) +
            frostfireDetonationDamage
          : 0;
        const remainingBossHealth = healthFromPercent(bossEnemyHpRef.current, activeBossBattle.hp);
        const playerDamage = Math.min(remainingBossHealth, calculatedPlayerDamage);
        if (activeBossBattle.mode === "world" && playerActs) {
          setWorldDamage((value) => value + playerDamage);
          setWorldRoundDamage((value) => value + playerDamage);
        }
        const abyssSpecialReady =
          bossActs &&
          activeBossBattle.mode === "world" &&
          activeBossBattle.name === "深淵王" &&
          abyssBossAttackCountRef.current % 6 === 0;
        const calculatedBossDamage = bossActs
          ? Math.round(bossValues.counterDamage * (abyssSpecialReady ? 1.6 : 1))
          : 0;
        const bossDamage = Math.min(
          healthFromPercent(bossPlayerHpRef.current, characterStats.hp),
          calculatedBossDamage,
        );
        if (playerActs && bossMarkExplosionWasActive) {
          queueSkillVisual({ name: "致命標記・爆炸", key: next });
          setDeadlyMarkEffect((current) => current ? { ...current, detonationKey: next } : current);
          window.setTimeout(triggerRangerImpact, 240);
        }
        if (playerActs && setResonanceTriggered) {
          queueSkillVisual({ name: "套裝共鳴", key: next + 1 });
        }
        if (playerActs)
          setEnemyHitFeedback({ damage: playerDamage, dodged: playerDamage <= 0, key: next });
        if (bossActs && !abyssSpecialReady)
          setPlayerHitFeedback({ damage: bossDamage, dodged: bossDamage <= 0, key: next });
        if (playerActs) {
          const publishBossDamage = () => {
            setLastBossDamage(playerDamage);
            const groupKey = Date.now();
            setBossDamageGroups((current) => [...current, { key: groupKey, damage: playerDamage }]);
            window.setTimeout(() => {
              setBossDamageGroups((current) => current.filter((group) => group.key !== groupKey));
            }, 1_200);
          };
          const bossDamageDisplayDelay = bossExecutionTriggered
            ? 750
            : bossGroundSplitTriggered
              ? 540
              : bossSkill?.name === "霜火新星"
                ? (frostfireDetonationDamage > 0 ? 520 : 680)
              : 0;
          if (bossDamageDisplayDelay > 0) window.setTimeout(publishBossDamage, bossDamageDisplayDelay);
          else publishBossDamage();
        }
        if (playerActs && playerDamage > 0 && characterStats.lifesteal > 0)
          setBossPlayerHp((health) => {
            const nextHealth = Math.min(
              100,
              health + healthPercentFromDamage(
                (playerDamage * Math.min(100, characterStats.lifesteal)) / 100,
                characterStats.hp,
              ),
            );
            bossPlayerHpRef.current = nextHealth;
            return nextHealth;
          });
        const bossHpLoss =
          playerDamage <= 0
            ? 0
            : healthPercentFromDamage(playerDamage, activeBossBattle.hp);
        const abyssSpecialTriggered = abyssSpecialReady && bossEnemyHpRef.current > bossHpLoss;
        if (bossActs && !abyssSpecialTriggered)
          setLastBossCounterDamage(bossEnemyHpRef.current <= bossHpLoss ? 0 : bossDamage);
        if (playerActs) setBossEnemyHp((hp) => {
          if (hp <= bossHpLoss) {
            if (bossRoundEndedRef.current) return hp;
            bossRoundEndedRef.current = true;
            worldBossDeadlineRef.current = null;
            abyssBossSequenceRef.current += 1;
            bossCinematicLockRef.current = false;
            setAbyssBossEffect(null);
            setAbyssImpactPulse(false);
            setDeadlyMarkEffect((current) => current?.detonationKey === null ? null : current);
            setBossOutcome("win");
            setBossPlayerHp(100);
            const report = [
              `每秒攻擊 ${(baseCharacterStats.speed / 100).toFixed(2)} 次，你取得先手（遠征祝福未生效）。`,
              `技能與裝備造成最後一擊。`,
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
              addLoot(
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
              addLoot(worldDrops, `擊敗${activeBossBattle.name}`);
              setBattleReport((lines) => [
                ...lines,
                `世界首領獎勵：${worldDrops.some((item) => findEquipmentDefinition(item)) ? "神話／特殊傳奇／高階" : "傳奇"}裝備 ${dropCount} 件`,
              ]);
            }
            pushLog("首領", `擊敗 ${activeBossBattle.name}`);
            bossEnemyHpRef.current = 0;
            return 0;
          }
          const nextHp = hp - bossHpLoss;
          bossEnemyHpRef.current = nextHp;
          return nextHp;
        });
        if (abyssSpecialTriggered) {
          const sequence = ++abyssBossSequenceRef.current;
          bossCinematicLockRef.current = true;
          setAbyssBossEffect({ key: next });
          setCausePrompt("深淵王撕開界縫——萬觸葬界正在收束");
          window.setTimeout(() => {
            if (abyssBossSequenceRef.current !== sequence) return;
            setAbyssImpactPulse(true);
            window.setTimeout(() => setAbyssImpactPulse(false), 520);
            setPlayerHitFeedback({ damage: bossDamage, dodged: bossDamage <= 0, key: next });
            setLastBossCounterDamage(bossDamage);
            setBossPlayerHp((hp) => {
              const hpLoss = playerHpLossFromDamage(bossDamage);
              if (hp - hpLoss <= 0.000001) {
                if (bossRoundEndedRef.current) return hp;
                bossRoundEndedRef.current = true;
                worldBossDeadlineRef.current = null;
                setBossOutcome("loss");
                setBattleReport([
                  "深淵裂縫從四方張開，萬觸同時收束。",
                  `萬觸葬界造成 ${bossDamage.toLocaleString()} 傷害。`,
                  "本次造成的累積傷害已列入今日世界排行。",
                ]);
                pushLog("首領", `挑戰 ${activeBossBattle.name} 失敗`);
                bossPlayerHpRef.current = 0;
                return 0;
              }
              const nextHp = hp - hpLoss;
              bossPlayerHpRef.current = nextHp;
              return nextHp;
            });
            setCausePrompt(`萬觸葬界命中 → 造成 ${bossDamage.toLocaleString()} 傷害`);
          }, 1_030);
          window.setTimeout(() => {
            if (abyssBossSequenceRef.current !== sequence) return;
            bossCinematicLockRef.current = false;
            setAbyssBossEffect(null);
          }, 2_200);
        }
        if (bossActs && !abyssSpecialTriggered) setBossPlayerHp((hp) => {
          if (bossEnemyHpRef.current <= bossHpLoss) return hp;
          const hpLoss = playerHpLossFromDamage(bossDamage);
          if (hp - hpLoss <= 0.000001) {
            if (bossRoundEndedRef.current) return hp;
            bossRoundEndedRef.current = true;
            worldBossDeadlineRef.current = null;
            setBossOutcome("loss");
            setBattleReport([
              `首領壓制了你的防禦。`,
              `生命歸零｜可立即再次挑戰。`,
              activeBossBattle.mode === "world"
                ? "本次累積傷害已列入今日世界排行。"
                : "個人首領失敗不扣門票。",
            ]);
            pushLog("首領", `挑戰 ${activeBossBattle.name} 失敗`);
            bossPlayerHpRef.current = 0;
            return 0;
          }
          const nextHp = hp - hpLoss;
          bossPlayerHpRef.current = nextHp;
          return nextHp;
        });
        setCausePrompt(
          abyssSpecialTriggered
            ? "深淵王撕開界縫——萬觸葬界正在收束"
            : playerActs && playerDamage > 0
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
    skills,
  ]);

  const leaveBossBattle = () => {
    resetCombatPerks();
    abyssBossSequenceRef.current += 1;
    abyssBossAttackCountRef.current = 0;
    bossCinematicLockRef.current = false;
    bossRoundEndedRef.current = true;
    worldBossDeadlineRef.current = null;
    setAbyssBossEffect(null);
    setAbyssImpactPulse(false);
    setActiveBossBattle(null);
    setBossOutcome(null);
    setBattleOn(true);
    setTab("主控");
    setPlayerHp(100);
  };

  const hours = Math.floor(storedSeconds / 3600),
    mins = Math.floor((storedSeconds % 3600) / 60),
    secs = storedSeconds % 60;
  const stats = [
    { label: "戰力", value: combatPower.toLocaleString() },
    { label: "攻擊", value: characterStats.attack.toLocaleString() },
    { label: "防禦", value: characterStats.defense.toLocaleString() },
    { label: "每秒攻擊", value: `${(characterStats.speed / 100).toFixed(2)} 次` },
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
            <div>升級三圍+<strong>3%</strong> EXP+<strong>20%</strong> GOLD+<strong>20%</strong></div>
            <div>強化石掉落+<strong>20%</strong> 洗鍊石掉落+<strong>10%</strong></div>
            <div>裝備掉落+<strong>5%</strong> 高品質掉落+<strong>3%</strong></div>
            <div>輪迴天賦+<strong>2</strong> 點</div>
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
            {mails.map((mail) => (
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
        open={!!runSummary && runDialogOpen}
        onOpenChange={setRunDialogOpen}
      >
        <DialogContent className="mail-dialog run-dialog">
          <DialogHeader>
            <DialogTitle>
              {runSummary?.outcome === "complete"
                ? "長夜輪迴完成"
                : "本次挑戰結束"}
            </DialogTitle>
            <DialogDescription>
              {restartCountdown} 秒後自動從第 1 層重新挑戰；所有祝福將重置。
            </DialogDescription>
          </DialogHeader>
          {runSummary && (
            <>
              <div className="run-result">
                <span>
                  {runSummary.outcome === "complete" ? <Crown /> : <Skull />}
                </span>
                <div>
                  <small>最高抵達</small>
                  <h3>第 {runSummary.highestFloor} 層</h3>
                  <p>
                    {Math.floor(runSummary.duration / 60)} 分{" "}
                    {runSummary.duration % 60} 秒 · 擊敗 {runSummary.kills}{" "}
                    隻怪物
                  </p>
                </div>
                <b>{restartCountdown}</b>
              </div>
              <div className="run-stats">
                <span>
                  精英 <b>{runSummary.elites}</b>
                </span>
                <span>
                  守關者 <b>{runSummary.guardians}</b>
                </span>
                <span>
                  金幣 <b>+{runSummary.gold}</b>
                </span>
                <span>
                  強化石 <b>+{runSummary.enhance}</b>
                </span>
                <span>
                  洗鍊石 <b>+{runSummary.reforge}</b>
                </span>
                <span>
                  裝備 <b>{runSummary.gear}</b>
                </span>
              </div>
              <button className="btn btn-primary" onClick={beginNewRun}>
                立即重新挑戰
              </button>
            </>
          )}
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
                  <b>{currentItem.name}</b>
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
                    <span>{affix}</span>
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
                    disabled={targetedAffix === null}
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
                    disabled={normalizeEquipmentSockets(currentItem.sockets).socketCount >= 2 || drillingStones <= 0}
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
                      <b>{currentItem.name}</b>
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
                          {definition ? <img src={definition.icon} alt="" /> : <Gem />}
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
                          <img src={definition.icon} alt="" />
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
                  <img src={characterAvatarPath(playerClass, rebirthCount)} alt={`${playerClass}頭像`} />
                ) : (
                  <img src={`/characters/${characterSlug(playerClass)}-head.png`} alt={`${playerClass}頭像`} />
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
              aria-label={`系統郵件，${unclaimedMail} 封未領取`}
              onClick={() => setMailOpen(true)}
            >
              <Mail />
              {unclaimedMail > 0 && <i>{unclaimedMail}</i>}
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
                    className={`battle-stage ${activeBossBattle || currentWaveBoss || currentWaveElite || currentWaveGuardian ? "elite-stage" : ""} ${setTier > 0 ? "set-awakened" : ""} ${rangerImpactPulse ? "ranger-impact" : ""} ${executionImpactPulse ? "execution-impact" : ""} ${abyssImpactPulse ? "abyss-impact" : ""} ${frostfireImpactPulse ? `frostfire-${frostfireImpactPulse}` : ""} ${meteorImpactPulse ? "meteor-impact" : ""} ${skillEffect && normalizeCombatEffectName(skillEffect.name) === "奧術回響" ? "arcane-echo-impact" : ""} ${skillEffect && !["裂地斬", "處決"].includes(normalizeCombatEffectName(skillEffect.name)) ? `impact-${impactTier(skillEffect.name)}` : ""}`}
                    style={
                      { "--map-tone": currentMap.tone } as React.CSSProperties
                    }
                  >
                    {activeBossBattle?.mode === "world" && activeBossBattle.name === "深淵王" && (
                      <div className={`world-boss-countdown ${worldBossSecondsLeft <= 5 && !bossOutcome ? "danger" : ""}`}>
                        <Clock3 />
                        <span>本回合</span>
                        <strong>{String(Math.floor(worldBossSecondsLeft / 60)).padStart(2, "0")}:{String(worldBossSecondsLeft % 60).padStart(2, "0")}</strong>
                        <small>{worldRoundDamage.toLocaleString()} 傷害</small>
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
                        <img className="battle-character-backdrop" src={characterFullbodyPath(playerClass, rebirthCount, Boolean(skillEffect))} alt="" aria-hidden="true" />
                        <img className="battle-character" src={characterFullbodyPath(playerClass, rebirthCount, Boolean(skillEffect))} alt={playerClass} />
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
                        <Meter value={activeBossBattle ? bossPlayerHp : playerHp} color="#58ad71" />
                        <small className="player-health-label">
                          {healthFromPercent(
                            activeBossBattle ? bossPlayerHp : playerHp,
                            characterStats.hp,
                          ).toLocaleString()}／{characterStats.hp.toLocaleString()} HP
                        </small>
                        <div className="combat-statuses" aria-label="玩家戰鬥狀態">
                          {combatStatuses.filter((status) => status.target === "player").map((status) => (
                            <span key={`${status.name}-${status.target}`} className={`combat-status ${status.tone}`}>
                              {status.name} · {status.remaining}{status.unit}
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
                            <img className="battle-monster" src={monsterImage} alt={currentMonsterName} />
                          ) : (
                            <span className="monster-placeholder">
                              {activeBossBattle || currentWaveBoss || currentWaveElite || currentWaveGuardian ? <Crown /> : <Skull />}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="fighter-meta">
                        <b>{activeBossBattle?.name ?? currentEnemyBaseName}</b>
                        <Meter value={activeBossBattle ? bossEnemyHp : enemyHp} color={activeBossBattle || currentWaveBoss || currentWaveElite || currentWaveGuardian ? "#dc8d32" : "#b9474b"} />
                        <small className="enemy-health-label">{activeBossBattle ? `${healthFromPercent(bossEnemyHp, activeBossBattle.hp).toLocaleString()}／${activeBossBattle.hp.toLocaleString()} HP` : `${currentEnemyHealth.toLocaleString()}／${currentEnemyMaximumHealth.toLocaleString()} HP`}</small>
                        <div className="combat-statuses" aria-label="敵方戰鬥狀態">
                          {combatStatuses.filter((status) => status.target === "enemy").map((status) => (
                            <span key={`${status.name}-${status.target}`} className={`combat-status ${status.tone}`}>
                              {status.name} · {status.remaining}{status.unit}
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
                    {rangerPiercingEffect && (
                      <RangerPiercingArrowVfx effectKey={rangerPiercingEffect.key} />
                    )}
                    {rangerWindVolleyEffect.map((effect) => (
                      <RangerWindVolleyVfx
                        key={`wind-volley-vfx-${effect.key}`}
                        effectKey={effect.key}
                        shotCount={effect.shotCount}
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
                    {skillVisualEffects.map((effect) => (
                      <SkillEffectCanvas key={`${effect.name}-${effect.key}`} name={effect.name} effectKey={effect.key} />
                    ))}
                    {groundSplitEffect && (
                      <SkillEffectCanvas name="裂地斬" effectKey={groundSplitEffect.key} />
                    )}
                    {executionEffect && (
                      <SkillEffectCanvas
                        name="處決"
                        effectKey={executionEffect.key}
                        targetKey={`${activeBossBattle ? "boss" : mapId}:${wave}`}
                      />
                    )}
                    {bloodRoarSlashKey > 0 && (
                      <SkillEffectCanvas name="鮮血怒吼・強化斬擊" effectKey={bloodRoarSlashKey} />
                    )}
                    {mythicVfxEffects.map((effect) => (
                      <MythicSkillVfx
                        key={`${effect.skill}-${effect.key}`}
                        skill={effect.skill}
                        effectKey={effect.key}
                        phase={effect.phase}
                        variant={effect.variant}
                      />
                    ))}
                    {(activeBossBattle
                      ? bossDamageGroups.length > 0
                      : battleHitGroups.length > 0 || rangerWindVolleyDamage.length > 0) && (
                      <div
                        className={`damage-float ${activeBossBattle ? "boss-damage-float" : "player-damage-float"} ${skillEffect?.name === "隕星術" ? "meteor-damage-float" : ""} ${skillEffect && normalizeCombatEffectName(skillEffect.name) === "奧術回響" ? "arcane-echo-damage-float" : ""}`}
                      >
                        {activeBossBattle ? (
                          bossDamageGroups.map((group) => (
                            <div key={`boss-damage-sequence-${group.key}`} className="damage-sequence">
                              <div className="combo-hit boss-combo-hit">
                                <b>首領 -{group.damage}</b>
                              </div>
                            </div>
                          ))
                        ) : battleHitGroups.length > 0 ? (
                          battleHitGroups.map((group) => (
                            <div key={`damage-sequence-${group.key}`} className="damage-sequence">
                              {group.hits.map((hit, index) => (
                                <div
                                  key={`${group.key}-${index}`}
                                  className={`combo-hit ${hit.critical ? "critical-hit" : ""}`}
                                  style={{
                                    "--hit-index": index,
                                    "--hit-count": group.hits.length,
                                  } as React.CSSProperties}
                                >
                                  {hit.critical && index === 0 && <small>暴擊!</small>}
                                  <b>-{hit.damage.toLocaleString()}</b>
                                </div>
                              ))}
                            </div>
                          ))
                        ) : null}
                      </div>
                    )}
                    {!activeBossBattle && rangerWindVolleyDamage.map((volley) => (
                      <div
                        key={`volley-damage-${volley.key}`}
                        className="damage-float player-damage-float volley-damage-float"
                      >
                        {volley.hits.slice(0, volley.visible).map((hit, index) => (
                          <div
                            key={`${volley.key}-${index}`}
                            className={`combo-hit volley-hit ${hit.critical ? "critical-hit" : ""}`}
                            style={{
                              "--hit-index": index,
                              "--hit-count": volley.hits.length,
                            } as React.CSSProperties}
                          >
                            {hit.critical && index === 0 && <small>暴擊!</small>}
                            <b>-{hit.damage.toLocaleString()}</b>
                          </div>
                        ))}
                      </div>
                    ))}
                    {activeBossBattle && playerHitFeedback && (
                      <div
                        key={`player-hit-${playerHitFeedback.key}`}
                        className={`player-hit-float ${playerHitFeedback.dodged ? "dodged" : ""}`}
                      >
                        {playerHitFeedback.dodged ? "閃避!" : `-${playerHitFeedback.damage}`}
                      </div>
                    )}
                    {!activeBossBattle && enemyHitFeedback && (
                      <div
                        key={`enemy-hit-${enemyHitFeedback.key}`}
                        className={`enemy-damage-float ${enemyHitFeedback.dodged ? "dodged" : ""}`}
                      >
                        {enemyHitFeedback.dodged
                          ? "閃避!"
                          : `-${enemyHitFeedback.damage}`}
                      </div>
                    )}
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
                            <b>{drop.item.name}</b>
                          </button>
                        ))}
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
                    <div className="battle-buttons">
                      {activeBossBattle ? (
                        <>
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
                                  setBossEnemyHp(100);
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
                          {!bossOutcome && (
                            <button
                              className="btn btn-ghost"
                              onClick={leaveBossBattle}
                            >
                              撤離
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          className="btn btn-ghost"
                          onClick={() => setBattleOn((v) => !v)}
                        >
                          {battleOn ? "停止" : "繼續"}掛機
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="combat-meta">
                    <div>
                      <small>套裝規則</small>
                      <b>
                        {activeSet
                          ? `${activeSet.name} ${activeSet.count} 件`
                          : `追獵 ${currentMap.set}`}
                      </b>
                      <span>{setEffect}</span>
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
                      戰力 {combatPower.toLocaleString()}
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
                      開始輪迴
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
                    <span>擊敗怪物 {Math.min(500, dailyKills)} / 500</span>
                    <small className="daily-reward-copy">
                      獎勵：金幣 5,000・強化石 10・洗鍊石 10・元寶 20
                    </small>
                    <button
                      className="btn btn-primary daily-claim"
                      disabled={dailyKills < 500 || dailyRewardClaimed}
                      onClick={claimDailyHuntReward}
                    >
                      {dailyRewardClaimed
                        ? "今日已領取"
                        : dailyKills >= 500
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
                  const powerState = locked
                    ? { label: "尚未解鎖", tone: "locked" }
                    : combatPower < map.power[0]
                      ? { label: "極度危險", tone: "danger" }
                      : combatPower <= map.power[1]
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
                        <span>{locked ? <LockKeyhole /> : <MapIcon />}</span>
                        <em>0{map.id}</em>
                      </div>
                      <div>
                        <small>
                          最佳進度 {localProgress}／30 · 5/15/25F 精英 ·
                          10/20F 守關 · 30F 首領
                        </small>
                        <h3>{map.name}</h3>
                        <p>{map.monsters.slice(0, 3).join("・")}</p>
                        <div className="map-power-row">
                          <span>
                            建議戰力 {map.power[0].toLocaleString()}～
                            {map.power[1].toLocaleString()}
                          </span>
                          <b className={`power-state ${powerState.tone}`}>
                            {powerState.label}
                          </b>
                        </div>
                        <span className="map-exp-label">
                          普通怪經驗 {map.exp[0]}～{map.exp[1]} · 首領 ×12
                        </span>
                        <span className="map-exp-label">
                          場景普通裝備 · 品質上限：傳奇
                        </span>
                        <span className="set-label">套裝系列：{map.set}</span>
                      </div>
                      {mapId === map.id && (
                        <b className="current-tag">掛機中 · 第 {wave} 層</b>
                      )}
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
                  戰力 {combatPower.toLocaleString()} · 強化石 {enhanceStones} ·
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
                    <div className="character-display">
                      <CharacterAppearanceVfx id={selectedAppearance} />
                      <img
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
                        <div key={group.name} className="set-bonus-row">
                          <b>{group.name} · {group.count} / 10</b>
                          <span>2 件：攻擊 +8%</span>
                          <span>4 件：離線收益 +10%</span>
                          <span>6 件：每次攻擊追加 {SET_ELEMENTAL_DAMAGE_PCT}% 元素傷害</span>
                          <span>8 件：技能傷害 +12%</span>
                          <span>10 件：每 {SET_RESONANCE_ATTACKS} 次攻擊觸發元素爆發（{SET_RESONANCE_DAMAGE_PCT}%）</span>
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
                      {visibleBagItems.map((it) => {
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
                    <>
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
                        {currentItem.set && <span className="set-name-prefix">【{currentItem.set}】</span>} {currentItem.name} <em>+{currentItem.enhance}</em>
                      </h3>
                      <b>
                        裝備評級 {equipmentDisplayRating(currentItem).toLocaleString()}
                      </b>
                      <p
                        className={`power-impact ${powerDifferenceForItem(currentItem) >= 0 ? "gain" : "loss"}`}
                      >
                        {equipped.includes(currentItem.id) ? "卸下後" : "穿上後"}
                        實際戰力 {powerDifferenceForItem(currentItem) >= 0 ? "+" : ""}
                        {powerDifferenceForItem(currentItem).toLocaleString()}
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
                      </div>
                      <div className="affix-divider"><span>詞綴加成</span></div>
                      <ul className="detail-affixes">
                        {currentItem.affixes.map((a, index) => (
                          <li key={`${a}-${index}`}>
                            <span>{a}</span>
                            <small>{affixRangeLabel(currentItem, a)}</small>
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
                                <img src={definition.icon} alt="" />
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
                    </>
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
                    <div>
                      {[
                        ["生命", characterStats.hp.toLocaleString()],
                        ["攻擊", characterStats.attack.toLocaleString()],
                        ["防禦", characterStats.defense.toLocaleString()],
                        ["每秒攻擊", `${(characterStats.speed / 100).toFixed(2)} 次`],
                        [
                          "閃避",
                          `${Math.min(DODGE_CAP, characterStats.dodge)}%${characterStats.dodge > DODGE_CAP ? "（上限）" : ""}`,
                        ],
                        ["暴擊", `${Math.min(100, characterStats.crit)}%`],
                        ["暴擊傷害", `+${characterStats.critDamage}%`],
                        ["吸血", `${Math.min(100, characterStats.lifesteal)}%`],
                        ["首領傷害", `+${characterStats.bossDamage}%`],
                        [
                          "傷害減免",
                          `${Math.min(balanceConfig.progression.damageReductionCap, characterStats.damageReduction)}%`,
                        ],
                        ["經驗加成", `+${characterStats.expBonus}%`],
                        ["金幣加成", `+${characterStats.goldBonus}%`],
                        ["裝備掉落率", `+${characterStats.equipmentDrop}%`],
                        ["資源掉落率", `+${characterStats.resourceDrop}%`],
                        ["強化石掉落率", `+${characterStats.enhanceDrop}%`],
                        ["洗鍊石掉落率", `+${characterStats.reforgeDrop}%`],
                        ["高品質掉落率", `+${characterStats.highQualityDrop}%`],
                      ].map(([label, value]) => (
                        <span key={label}>
                          <small>{label}</small>
                          <b>{value}</b>
                        </span>
                      ))}
                      <span className="hit-value">
                        <small>面板命中</small>
                        <b>{characterStats.hit}%</b>
                        <em>
                          怪物閃避評等 {monsterEvasionRating} → 實際命中 {effectiveHit}%
                        </em>
                      </span>
                    </div>
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
                    <div className="magic-ring" aria-hidden="true" />
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
                              <img src={definition.icon} alt="" />
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
                      {gemFusionResult ? <img src={getGemDefinition(gemFusionResult.gem.gemId, gemFusionResult.gem.tier).icon} alt="合成結果" /> : fusionPreviewGem ? <img src={fusionPreviewGem.icon} alt="預計產物" /> : <Sparkles />}
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
                              <img src={definition.icon} alt="" />
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
                sub="升級技能會提高技能效果；只有直接增加角色面板數值的技能會反映在戰力。"
              >
                <span className="skill-points">
                  <Sparkles /> {skillPoints} 技能點
                </span>
              </PageTitle>
              <SkillGrowthTable skills={skills} />
              <div className="skills-grid">
                {skills.map((skill, i) => (
                  (() => {
                    const isUltimate = i === 3;
                    const isUltimateLocked = isUltimate && level < 10;
                    return (
                  <Panel
                    key={skill.name}
                    className={`skill-card ${skill.level === 0 || isUltimateLocked ? "locked" : ""}`}
                  >
                    <div className="skill-icon">
                      {i === 3 ? <Crown /> : <WandSparkles />}
                    </div>
                    <div>
                      <small>
                        {isUltimate ? "奧義" : i === 2 ? "被動" : "主動技能"}
                      </small>
                      <h3>{skill.name}</h3>
                      <p>
                        {skillValue(skill.name, skill.level).metric}：
                        {skillValue(skill.name, skill.level).current}
                      </p>
                      {isUltimateLocked && <p>角色達到 Lv.10 後解鎖</p>}
                      <div className="skill-level">
                        <Meter value={(skill.level / skill.max) * 100} />
                        <span>
                          Lv.{skill.level} / {skill.max}
                        </span>
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost"
                      disabled={
                        skillPoints < skill.cost ||
                        skill.level >= skill.max ||
                        isUltimateLocked
                      }
                      onClick={() => {
                        setSkillPoints((v) => v - skill.cost);
                        setSkills((old) =>
                          old.map((s, idx) =>
                            idx === i ? { ...s, level: s.level + 1 } : s,
                          ),
                        );
                        pushLog(
                          "技能",
                          `${skill.name}提升至 Lv.${skill.level + 1}`,
                        );
                        toast.success(`${skill.name}升級`, {
                          description: "技能效果已提升",
                        });
                      }}
                    >
                      {isUltimateLocked
                        ? "Lv.10 解鎖"
                        : skill.level === 0
                          ? "解鎖"
                          : "升級"} · {skill.cost} 點
                    </button>
                  </Panel>
                    );
                  })()
                ))}
              </div>
              <Panel className="build-note">
                <div>
                  <BookOpen />
                  <span>
                    <b>
                      推薦流派：
                      {playerClass === "戰士"
                        ? "鮮血處決"
                        : playerClass === "遊俠"
                          ? "疾風暴擊"
                          : "霜火回響"}
                    </b>
                    <small>
                      只有直接增加生命、攻擊、防禦等面板數值的技能會反映在戰力；傷害與觸發型技能不計入戰力。
                    </small>
                  </span>
                </div>
                <button
                  className="btn btn-ghost"
                  onClick={() =>
                    toast.info("推薦配點", {
                      description:
                        "先提升主動與被動技能；角色達到 Lv.10 後再解鎖奧義。",
                    })
                  }
                >
                  查看配點
                </button>
              </Panel>
            </div>
          )}

          {tab === "首領" && (
            <div className="page-section">
              <PageTitle
                title="首領戰"
                sub="世界首領採 60 秒獨立單挑；每日 00:00（台灣時間）重置 3 次挑戰與今日傷害，依累積傷害排行。"
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
                    {personalBosses.map((b) => {
                      const locked = (mapBestFloors[b.mapId] ?? 0) < b.baseFloor;
                      return (
                        <button
                          key={b.id}
                          disabled={locked}
                          className={selectedBoss.id === b.id ? "active" : ""}
                          onClick={() => {
                            setSelectedBoss(b);
                            setBattleReport([]);
                          }}
                        >
                          {locked ? <LockKeyhole /> : <Skull />}
                          <span>
                            <b>{b.name}</b>
                            <small>
                              {b.map} · 通過 {b.baseFloor} 層
                              {locked ? " · 尚未解鎖" : ""}
                            </small>
                          </span>
                          <ChevronRight />
                        </button>
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
                            <img src={b.image} alt={`${b.name}世界首領`} />
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
                                今日排名 <b>{worldRank ? `#${worldRank}` : worldDamage > 0 ? "更新中" : "—"}</b>
                              </span>
                              <span>
                                累積傷害 <b>{worldDamage.toLocaleString()}</b>
                              </span>
                              <span>
                                今日最高 <b>{worldLeaderDamage.toLocaleString()}</b>
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
              combatPower={combatPower}
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
              selectedAppearance={selectedAppearance}
              ownedTitles={ownedTitles}
              ownedAppearances={ownedAppearances}
              onSelectTitle={setSelectedTitle}
              onSelectAppearance={setSelectedAppearance}
              onBuy={buyShopItem}
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

function SkillGrowthTable({
  skills,
}: {
  skills: { name: string; level: number; max: number }[];
}) {
  return (
    <Panel className="skill-growth">
      <div className="section-head">
        <div>
          <p className="eyebrow">LEVEL COMPARISON</p>
          <h3>技能升級數值表</h3>
        </div>
        <span>升級前可比較技能效果</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>技能</TableHead>
            <TableHead>主要效果</TableHead>
            <TableHead>目前等級</TableHead>
            <TableHead>下一級</TableHead>
            <TableHead>滿級</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {skills.map((skill) => {
            const info = skillValue(skill.name, skill.level);
            return (
              <TableRow key={skill.name}>
                <TableCell>
                  <b>{skill.name}</b>
                  <small>
                    Lv.{skill.level}/{skill.max}
                  </small>
                </TableCell>
                <TableCell>{info.metric}</TableCell>
                <TableCell>{info.current}</TableCell>
                <TableCell className="next-value">
                  {skill.level >= skill.max ? "已滿級" : info.next}
                </TableCell>
                <TableCell>{info.value(skill.max)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Panel>
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
  onFight: () => void;
}) {
  return (
    <Panel className="boss-detail">
      <div className="boss-visual">
        {image ? (
          <img className="boss-image" src={image} alt={name} />
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
        {disabled ? `Lv.${level} 解鎖` : "開始挑戰"}
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
    equippedItems?: { id: number; name: string; slot: string; quality: string; enhance: number; set: string; power: number; mapId: number; affixes: string[] }[];
    appearance?: AppearanceId;
  };
  const [ranks, setRanks] = useState<PublicRank[]>([]);
  const [selectedRank, setSelectedRank] = useState<PublicRank | null>(null);
  const [rankPage, setRankPage] = useState(0);
  useEffect(() => {
    fetch("/api/ranking")
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
    equipmentType: "場景普通裝備" as const,
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
                <img src={r.portrait ?? `/characters/${r.cls === "戰士" ? "warrior" : r.cls === "遊俠" ? "ranger" : "mage"}-head.png`} alt={`${r.cls}角色`} />
              </div>
              <b className={rankNameClass(r.name, true)}>{r.name}</b>
              <span className={r.rebirth > 0 ? "rank-level rebirth-level" : "rank-level"}>
                {r.rebirth > 0 && <b>{r.rebirth}轉</b>} {r.level}等
              </span>
              <span>{r.power.toLocaleString()} 戰力</span>
              <em>#{i + 1}</em>
            </button>
          ))}
        </div>
        <div className="rank-table">
          <div className="rank-head">
            <span>名次</span>
            <span>冒險者</span>
            <span>等級</span>
            <span>戰力</span>
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
              <strong className="rank-cell-power">{r.power.toLocaleString()}</strong>
              <span className="rank-view-action">查看</span>
            </button>;
          })}
          {!displayRanks.some((r) => r.name === playerName) && <div className="my-rank"><b className="rank-cell-rank">—</b><span className="rank-cell-player"><span>{playerName}（你）</span><small>{playerClass}</small></span><span className="rank-cell-level rank-level">{level}等</span><strong className="rank-cell-power">{combatPower.toLocaleString()}</strong><span /></div>}
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
                  {selectedRank.cls} · {selectedRank.rebirth > 0 ? `${selectedRank.rebirth}轉 ` : ""}{selectedRank.level}等 · 戰力 {selectedRank.power.toLocaleString()}
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
                    <img className="inventory-character" src={characterFullbodyPath(selectedRank.cls, selectedRank.rebirth)} alt={`${selectedRank.cls}角色立繪`} />
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
  selectedAppearance,
  ownedTitles,
  ownedAppearances,
  onSelectTitle,
  onSelectAppearance,
  onBuy,
}: {
  yuanbao: number;
  gold: number;
  idleSeconds: number;
  selectedTitle: TitleId;
  selectedAppearance: AppearanceId;
  ownedTitles: TitleId[];
  ownedAppearances: AppearanceId[];
  onSelectTitle: (id: TitleId) => void;
  onSelectAppearance: (id: AppearanceId) => void;
  onBuy: (item: "reforge" | "gamble" | "title-ash" | "title-abyss" | "appearance-ember" | "appearance-arcane" | "appearance-abyss" | "gold-reforge" | "gold-enhance") => void;
}) {
  const [currency, setCurrency] = useState<"yuanbao" | "gold">("yuanbao");
  const [yuanbaoPage, setYuanbaoPage] = useState<1 | 2>(1);
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
          <Panel className="shop-card"><h3>灰燼征服者</h3><p>外型｜稱號：征服灰燼墓園。</p><button className="btn btn-primary" disabled={ownedTitles.includes("ash-conqueror")} onClick={() => onBuy("title-ash")}>{ownedTitles.includes("ash-conqueror") ? "已解鎖" : "80 元寶解鎖"}</button></Panel>
          <Panel className="shop-card"><h3>深淵倖存者</h3><p>外型｜稱號：從時墟深淵生還。</p><button className="btn btn-primary" disabled={ownedTitles.includes("abyss-survivor")} onClick={() => onBuy("title-abyss")}>{ownedTitles.includes("abyss-survivor") ? "已解鎖" : "180 元寶解鎖"}</button></Panel>
          <Panel className="shop-card"><h3>灰燼熔翼</h3><p>外型｜六格去背熔岩骨翼，展翼時彈射火星。</p><button className="btn btn-primary" disabled={ownedAppearances.includes("ember-aura")} onClick={() => onBuy("appearance-ember")}>{ownedAppearances.includes("ember-aura") ? "已解鎖" : "120 元寶解鎖"}</button></Panel>
          <Panel className="shop-card"><h3>奧術星翼</h3><p>外型｜六格去背紫色符文能量羽翼。</p><button className="btn btn-primary" disabled={ownedAppearances.includes("arcane-aura")} onClick={() => onBuy("appearance-arcane")}>{ownedAppearances.includes("arcane-aura") ? "已解鎖" : "180 元寶解鎖"}</button></Panel>
          <Panel className="shop-card"><h3>深淵黑翼</h3><p>外型｜六格去背黑紅破碎深淵蝠翼。</p><button className="btn btn-primary" disabled={ownedAppearances.includes("abyss-aura")} onClick={() => onBuy("appearance-abyss")}>{ownedAppearances.includes("abyss-aura") ? "已解鎖" : "300 元寶解鎖"}</button></Panel>
        </div>
      ) : (
        <div className="shop-grid">
          <Panel className="shop-card"><h3>洗鍊石 ×12</h3><p>資源補給｜補充裝備洗鍊所需的稀有資源。</p><button className="btn btn-primary" onClick={() => onBuy("reforge")}>10 元寶購買</button></Panel>
          <Panel className="shop-card"><h3>賭狗禮包</h3><p>資源補給｜已攻略最高地圖的隨機部位裝備。</p><small>史詩 40%・洗鍊石 ×10 30%・傳奇 20%・神話 10%</small><button className="btn btn-primary" onClick={() => onBuy("gamble")}>10 元寶開啟</button></Panel>
        </div>
      )}
      <Panel className="shop-card cosmetic-loadout"><h3>目前裝備</h3><p>稱號：{TITLE_OPTIONS[selectedTitle].name}　外觀：{APPEARANCE_OPTIONS[selectedAppearance].name}</p><div className="cosmetic-actions"><select value={selectedTitle} onChange={(event) => onSelectTitle(event.target.value as TitleId)}>{ownedTitles.map((id) => <option key={id} value={id}>{TITLE_OPTIONS[id].name}</option>)}</select><select value={selectedAppearance} onChange={(event) => onSelectAppearance(event.target.value as AppearanceId)}>{ownedAppearances.map((id) => <option key={id} value={id}>{APPEARANCE_OPTIONS[id].name}</option>)}</select></div><small>金幣 {gold.toLocaleString()} · 元寶 {yuanbao.toLocaleString()}</small></Panel>
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
  const [announcementOpen, setAnnouncementOpen] = useState(true);
  const [logoutReason, setLogoutReason] = useState<string | null>(null);
  const [accountName, setAccountName] = useState("");
  const [isGm, setIsGm] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [playerClass, setPlayerClass] = useState<GameClass>("戰士");
  const [characterId, setCharacterId] = useState("");
  const [loginId, setLoginId] = useState("");
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
          setStage("game");
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
    setStage("game");
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
                result.error === "account_already_exists"
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
              setStage("game");
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
