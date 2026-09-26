import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test, { after } from "node:test";
import { createServer } from "vite";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const data = await readFile(new URL("../app/game-data.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const balanceSource = await readFile(new URL("../app/balance.ts", import.meta.url), "utf8");
const balanceConfigSource = await readFile(new URL("../app/balance-config.ts", import.meta.url), "utf8");
const skillCanvasSource = await readFile(new URL("../app/skill-effect-canvas.tsx", import.meta.url), "utf8");
const adminPanelsSource = await readFile(new URL("../app/admin-panels.tsx", import.meta.url), "utf8");
const authSource = await readFile(new URL("../app/api/auth/route.ts", import.meta.url), "utf8");
const authUtilsSource = await readFile(new URL("../app/api/auth-utils.ts", import.meta.url), "utf8");
const maintenanceSource = await readFile(new URL("../app/maintenance.ts", import.meta.url), "utf8");
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root: new URL("..", import.meta.url).pathname,
  server: { middlewareMode: true },
});
const { dropPowerRange, enhancementBonusPercent, enhancementFailureLevel, enhancementGoldCost, enhancementStoneCost, enhancementStoneDismantleYield, enhancementStoneDropChance, equipmentReforgeCost, evadeChanceFromRatings, gamblePackageReward, healthFromPercent, healthPercentFromDamage, hitChanceFromRatings, realmSuppression, towerCombatValues } = await vite.ssrLoadModule(
  "/app/balance.ts",
);
const { balanceConfig } = await vite.ssrLoadModule("/app/balance-config.ts");
const {
  createEquipmentSockets,
  drillSocket,
  fuseGem,
  fuseGemSelection,
  getSocketStatBonus,
  normalizeEquipmentSockets,
  rollGemDrop,
  socketGem,
} = await vite.ssrLoadModule("/app/gem-system.ts");
after(async () => vite.close());

test("persists gems and safely upgrades legacy equipment to the socket schema", () => {
  assert.match(page, /saveSchemaVersion: 7/);
  assert.match(page, /drillingStones,/);
  assert.match(page, /gemInventory,/);
  assert.deepEqual(normalizeEquipmentSockets(undefined), { socketCount: 0, gems: [] });
  assert.deepEqual(createEquipmentSockets(() => 0), { socketCount: 2, gems: [null, null] });
  const oneSocket = drillSocket({ socketCount: 0, gems: [] });
  assert.deepEqual(oneSocket, { socketCount: 1, gems: [null] });
  const socketed = socketGem(oneSocket, 0, { gemId: "redIron", tier: "beginner" });
  assert.equal(getSocketStatBonus(socketed)["攻擊%"], 3);
  assert.equal(socketGem({ socketCount: 2, gems: [{ gemId: "redIron", tier: "beginner" }, null] }, 1, { gemId: "redIron", tier: "advanced" }), null);
  assert.equal(drillSocket({ socketCount: 2, gems: [null, null] }), null);
});

test("drops map-gated gems and applies the documented fusion outcomes", () => {
  assert.deepEqual(rollGemDrop(1, (() => { const rolls = [0, 0]; return () => rolls.shift() ?? 0; })()), {
    gemId: "redIron",
    tier: "beginner",
  });
  const inventory = [{ gemId: "redIron", tier: "beginner", quantity: 3 }];
  const success = fuseGem(inventory, "redIron", "beginner", () => 0);
  assert.equal(success.success, true);
  assert.deepEqual(success.inventory, [{ gemId: "redIron", tier: "intermediate", quantity: 1 }]);
  const failure = fuseGem(inventory, "redIron", "beginner", () => 0.99);
  assert.equal(failure.success, false);
  assert.deepEqual(failure.inventory, [{ gemId: "redIron", tier: "beginner", quantity: 1 }]);
  const mixedInventory = [
    { gemId: "redIron", tier: "beginner", quantity: 1 },
    { gemId: "azureGuard", tier: "beginner", quantity: 1 },
    { gemId: "phantom", tier: "beginner", quantity: 1 },
  ];
  const mixedSuccess = fuseGemSelection(mixedInventory, mixedInventory, (() => { const rolls = [0, 0.6]; return () => rolls.shift() ?? 0; })());
  assert.equal(mixedSuccess.success, true);
  assert.deepEqual(mixedSuccess.inventory, [{ gemId: "azureGuard", tier: "intermediate", quantity: 1 }]);
  const mixedFailure = fuseGemSelection(mixedInventory, mixedInventory, (() => { const rolls = [0.99, 0.9]; return () => rolls.shift() ?? 0; })());
  assert.equal(mixedFailure.success, false);
  assert.deepEqual(mixedFailure.inventory, [{ gemId: "phantom", tier: "beginner", quantity: 1 }]);
  assert.doesNotMatch(page, /裝備合成/);
  assert.doesNotMatch(page, /equipmentFusionGroups/);
  assert.doesNotMatch(page, /equipmentFusionSelection/);
  assert.doesNotMatch(page, /equipment-fusion-bag/);
  assert.doesNotMatch(page, /寶石工坊/);
  assert.match(page, /tab === "寶石"/);
  assert.match(page, /寶石系統/);
  assert.match(css, /\.gem-magic-circle/);
  assert.match(page, /自動放入同名 ×3/);
  assert.match(page, /裝備鑲嵌/);
});

test("renders inventory filters and mobile equipment detail", () => {
  assert.match(page, /背包分類/);
  assert.match(page, /option value="戰力"/);
  assert.doesNotMatch(page, /bag-socket-count/);
  assert.match(page, /mobile-detail-backdrop/);
  assert.match(css, /\.item-detail\.mobile-open/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.inventory-gear-popover \{\s*display: none !important;/);
  assert.match(page, /setMobileItemDetailOpen\(false\);\s*setSelectedGemKey\(null\);\s*setGemWorkshopOpen\(true\);/);
});

test("keeps reforge open for repeated rolls", () => {
  const reforgeBody = page.slice(
    page.indexOf("const reforge ="),
    page.indexOf("const sellCurrentItem ="),
  );
  assert.doesNotMatch(reforgeBody, /setReforgeOpen\(false\)/);
  assert.match(reforgeBody, /可繼續洗鍊/);
});

test("increases general and targeted reforge costs by 1.25 per attempt", () => {
  assert.deepEqual(equipmentReforgeCost(0, false), { gold: 600, stones: 1 });
  assert.deepEqual(equipmentReforgeCost(1, false), { gold: 750, stones: 2 });
  assert.deepEqual(equipmentReforgeCost(2, false), { gold: 938, stones: 2 });
  assert.deepEqual(equipmentReforgeCost(0, true), { gold: 1800, stones: 3 });
  assert.deepEqual(equipmentReforgeCost(1, true), { gold: 2250, stones: 4 });
  assert.deepEqual(equipmentReforgeCost(2, true), { gold: 2813, stones: 5 });
  assert.deepEqual(equipmentReforgeCost(-1), { gold: 600, stones: 1 });
});
test("blocks players during maintenance while preserving GM access", () => {
  assert.match(maintenanceSource, /MAINTENANCE_MODE = true/);
  assert.match(authSource, /MAINTENANCE_MODE && !existing\.isGm/);
  assert.match(authSource, /body\.action === "register"[\s\S]*MAINTENANCE_MODE/);
  assert.match(authUtilsSource, /MAINTENANCE_MODE && !context\.account\.isGm/);
  assert.match(page, /伺服器維護中/);
  assert.match(page, /管理員登入/);
});

test("uses integer monster experience with a tapered newcomer bonus", () => {
  assert.equal(balanceConfig.progression.experienceMultiplier, 3);
  assert.match(page, /function newcomerExperienceFactor/);
  assert.equal(balanceConfig.progression.newcomerExperience.multiplier, 2);
  assert.equal(balanceConfig.progression.newcomerExperience.endsAtLevel, 30);
  assert.match(page, /map\.exp\[0\]/);
  assert.doesNotMatch(page, /1 \+ level \* 0\.12/);
  assert.match(page, /xpSchemaVersion: 2/);
});

test("clears staged loot after elite battles and marks worn gear", () => {
  assert.match(page, /if \(tier === "elite"\) setBattleDrops\(\[\]\)/);
  assert.match(page, /equippedAcrossLoadouts/);
  assert.match(page, /已裝備的物品不能出售/);
  assert.match(page, /old\.filter\(\(id\) => id !== currentItem\.id\)/);
  assert.match(css, /\.item-grid button\.equipped-item/);
});

test("blood oath consumes one 80 percent shield per battle", () => {
  assert.match(page, /blessingUpgraded\("blood"\) \? 0\.9 : 0\.8/);
  assert.match(page, /setBloodShieldReady\(false\)/);
  assert.match(page, /setBloodShieldReady\(true\)/);
  assert.doesNotMatch(page, /if \(!blessings\.some\([^\n]+blood/);
});

test("blood roar is a once-per-battle low-health five-attack lifesteal buff", () => {
  assert.match(page, /const bonuses = \[20, 26, 32, 38, 44, 50, 55, 60\]/);
  assert.match(page, /Math\.ceil\(8 \* 1\.2 \*\* \(boundedLevel - 1\)\)/);
  assert.match(page, /const bloodRoarStateRef = useRef\(\{ battleKey: "", remaining: 0, used: false \}\)/);
  assert.match(page, /if \(!battleOn \|\| playerClass !== "戰士" \|\| playerHp >= 40\) return/);
  assert.match(page, /queueSkillVisual\(\{ name: "鮮血怒吼", key: Date\.now\(\) \}\)/);
  assert.match(page, /生命低於 40% → 鮮血怒吼立刻發動/);
  assert.match(page, /bloodRoarStateRef\.current\.used = true;/);
  assert.match(page, /bloodRoarStateRef\.current\.remaining = bloodRoarCount;/);
  assert.match(page, /dynamicLifesteal \+ temporaryLifesteal/);
  assert.doesNotMatch(page, /if \(skill\.name === "鮮血怒吼"\) result\.attackPct/);
});

test("offers upgrades only after collecting all base blessings", () => {
  assert.match(page, /if \(available\.length > 0\)/);
  assert.match(page, /kind: "upgrade"/);
  assert.match(page, /advancedCombatBlessings/);
  assert.match(page, /advancedSupportBlessings/);
});

test("publishes the nine-region power guidance", () => {
  assert.match(page, /九域長夜遠征/);
  assert.match(page, /極度危險/);
  assert.match(page, /適合挑戰/);
  assert.match(page, /可輕鬆通關/);
  assert.deepEqual(balanceConfig.maps[0].power, [1000, 5500]);
  assert.equal(balanceConfig.maps[0].bossPower, 5800);
  assert.deepEqual(balanceConfig.maps[8].power, [70000, 120000]);
  assert.equal(balanceConfig.maps[8].bossPower, 140000);
});

test("each unlocked map runs its own thirty-floor loop", () => {
  assert.equal(balanceConfig.progression.mapFloors, 30);
  assert.match(page, /const \[unlockedMapId, setUnlockedMapId\]/);
  assert.match(page, /setUnlockedMapId\(\(value\) =>/);
  assert.match(page, /enterMap\(map\.id\)/);
  assert.match(page, /10\/20F 守關 · 30F 首領/);
  assert.doesNotMatch(page, /setMapId\(Math\.ceil\(nextWave \/ 10\)\)/);
});

test("names only actual set drops after their set and lists every worn set", () => {
  assert.match(page, /name: `\$\{isSetItem \? map\.set : map\.gearPrefix\}\$\{slot\}`/);
  assert.match(page, /set: isSetItem \? map\.set : ""/);
  assert.match(page, /equippedSetGroups\.map/);
  assert.doesNotMatch(page, /守夜旅者 · \{equippedSetCount\}/);
});

test("stacks the two-piece attack bonus once for each equipped set", () => {
  assert.match(page, /function equippedSetAttackMultiplier\\(gear: Item\\[\\]\\)[\\s\\S]*?maps\\.filter\\([\\s\\S]*?length >= 2[\\s\\S]*?1 \\+ twoPieceSetCount \\* \\(SET_ATTACK_BONUS - 1\\)/);
  assert.match(page, /const setAttackMultiplier = equippedSetAttackMultiplier\\(gear\\)/);
  assert.match(page, /const activeSetAttackMultiplier = equippedSetAttackMultiplier\\(equippedGear\\)/);
  assert.match(page, /activeSetAttackBonusPct = Math\\.round\\(\\(activeSetAttackMultiplier - 1\\) \\* 100\\)/);
});

test("uses non-overlapping equipment rails", () => {
  assert.match(css, /\.paperdoll\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.s1, \.s2, \.s3, \.s4, \.s5 \{ grid-column: 1; \}/);
  assert.match(css, /\.s6, \.s7, \.s8, \.s9, \.s10 \{ grid-column: 3; \}/);
});

test("protects equipped gear from direct and bulk salvage", () => {
  assert.match(page, /已裝備的物品不能出售/);
  assert.match(page, /!equippedAcrossLoadouts\.has\(item\.id\)/);
  assert.match(page, /配裝一、配裝二使用中的裝備均已排除/);
  assert.match(page, /const bagRenderKey = visibleBagItems\.length/);
  assert.match(page, /<div className="item-grid" key=\{bagRenderKey\}>/);
  assert.match(page, /<Popover key=\{`\$\{it\.id\}-\$\{i\}`\}>/);
  assert.match(page, /className="gear-tooltip-shell inventory-gear-popover"/);
});

test("starts new characters without equipment or demo battle history", () => {
  assert.match(page, /useState<Item\[]>\(\[\]\)/);
  assert.match(page, /1: \[\],\s*2: \[\]/s);
  assert.doesNotMatch(page, /items: \[createDrop\(2, "首領", 99\)\]/);
  assert.match(page, /角色以無裝備狀態進入灰燼墓園/);
});

test("renders detailed canvas skill effects without moving card portraits", () => {
  assert.match(page, /skillVisualEffects\.map/);
  assert.match(page, /<SkillEffectCanvas key=\{`\$\{effect\.name\}-\$\{effect\.key\}`\} name=\{effect\.name\} effectKey=\{effect\.key\}/);
  assert.match(skillCanvasSource, /requestAnimationFrame/);
  assert.match(skillCanvasSource, /裂地斬/);
  assert.match(skillCanvasSource, /疾風連射/);
  assert.match(skillCanvasSource, /隕星術/);
  assert.doesNotMatch(skillCanvasSource, /battle-character/);
  assert.match(css, /\.skill-effect-canvas\s*\{[\s\S]*pointer-events:\s*none/);
});

test("clears all mail when rebirthing to prevent carrying over late-map rewards", () => {
  const rebirthBody = page.slice(page.indexOf("const rebirth ="), page.indexOf("const spendRebirthTalent ="));
  assert.match(rebirthBody, /setItems\(\[\]\);\s*\/\/ 輪迴會清除本輪所有信件[\s\S]*setMails\(\[\]\);/);
  assert.match(rebirthBody, /全部裝備與信件已重置/);
  assert.match(page, /背包全部裝備與所有信件/);
});

test("limits each account to one class and reserves unique nicknames", async () => {
  assert.match(page, /const CHARACTER_SLOTS_KEY = "dark-world-character-slots-v2"/);
  assert.match(page, /function accountCharacterKey\(account: string\)/);
  assert.match(page, /findAccountCharacter\(slots, accountName\)/);
  assert.doesNotMatch(page, /characterSlotKey\(/);
  assert.match(page, /existing\?\.id \?\? createCharacterId\(\)/);
  assert.match(page, /fetch\("\/api\/character"/);
  assert.match(page, /accountName,/);
  assert.match(page, /暱稱全站唯一/);
  assert.match(page, /key=\{characterId\}/);
  assert.match(page, /characterId=\{characterId\}/);
  assert.match(page, /playerClass,/);
  assert.match(page, /playerName,/);
  assert.match(await readFile(new URL("../app/api/character/route.ts", import.meta.url), "utf8"), /nickname_already_taken/);
  assert.match(await readFile(new URL("../app/api/character/route.ts", import.meta.url), "utf8"), /account_already_has_character/);
});

test("rejects a cloud save belonging to another class", () => {
  assert.match(page, /const savedClass = save\.playerClass \?\? inferredClass/);
  assert.match(page, /savedClass && savedClass !== playerClass/);
  assert.match(page, /已阻止錯誤職業存檔/);
  assert.match(page, /setBattleOn\(false\)/);
  assert.match(page, /saveSchemaVersion: 7/);
});

test("starts authenticated players without importing legacy guest saves", async () => {
  assert.match(page, /const LEGACY_DATA_RESET_KEY = "dark-world-auth-reset-v1"/);
  assert.match(page, /dark-world-guest-account-v1/);
  assert.match(page, /dark-world-player-id/);
  assert.doesNotMatch(page, /legacySave\?\.skills/);
  assert.doesNotMatch(page, /const legacyId/);
  assert.match(await readFile(new URL("../app/api/auth/route.ts", import.meta.url), "utf8"), /action === "register"/);
  assert.match(await readFile(new URL("../app/api/auth-utils.ts", import.meta.url), "utf8"), /dark_world_session/);
});

test("reports current online viewers instead of cumulative login sessions", async () => {
  const overview = await readFile(new URL("../app/api/admin/overview/route.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  assert.match(schema, /lastSeenAt: text\("last_seen_at"\)/);
  assert.match(overview, /gt\(sessions\.lastSeenAt, activeSince\)/);
  assert.match(overview, /onlineViewers: sessionCount\?\.value/);
  assert.match(adminPanelsSource, /目前瀏覽人數/);
  assert.match(page, /const timer = window\.setInterval\(checkSession, 5_000\)/);
});

test("newest login keeps save authority while old windows pause", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const saveRoute = await readFile(new URL("../app/api/save/route.ts", import.meta.url), "utf8");
  const authUtils = await readFile(new URL("../app/api/auth-utils.ts", import.meta.url), "utf8");
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  assert.match(page, /setSessionSuperseded\(true\)/);
  assert.match(page, /已停止戰鬥與存檔/);
  assert.match(page, /LOGIN_INSTANCE_STORAGE_KEY/);
  assert.match(page, /x-dark-world-login-id/);
  assert.doesNotMatch(page, /window\.location\.reload\(\)/);
  assert.doesNotMatch(page, /onReloadSave/);
  assert.doesNotMatch(page, /gameRevision/);
  assert.match(page, /if \(result\?\.accepted === false\) \{[\s\S]*?setSaveStatus\("雲端已同步"\)/);
  assert.match(schema, /loginId: text\("login_id"\)/);
  assert.match(authUtils, /context\.session\.loginId !== requestedLoginId/);
  assert.match(authUtils, /eq\(sessions\.loginId, loginId\)/);
  assert.match(saveRoute, /authenticatedLogin\(request\)/);
  assert.match(saveRoute, /const sessionId = auth\.login\.sessionId/);
  assert.doesNotMatch(saveRoute, /writerIsRecent/);
});

test("server checkpoints use canonical saves and the GM view refreshes automatically", async () => {
  const saveRoute = await readFile(new URL("../app/api/save/route.ts", import.meta.url), "utf8");
  const snapshotsRoute = await readFile(new URL("../app/api/admin/save-snapshots/route.ts", import.meta.url), "utf8");
  assert.match(saveRoute, /SERVER_CHECKPOINT_INTERVAL_MS = 5 \* 60 \* 1_000/);
  assert.match(saveRoute, /createServerCheckpointIfDue\(db, \{/);
  assert.match(saveRoute, /\.offset\(24\)/);
  assert.match(snapshotsRoute, /\.offset\(24\)/);
  assert.match(adminPanelsSource, /此頁每 30 秒自動更新/);
});

test("cloud saves cannot be starved by continuous combat and keep bubble progress", () => {
  assert.match(page, /const SAVE_DEBOUNCE_MS = 1_400/);
  assert.match(page, /const SAVE_MAX_INTERVAL_MS = 20_000/);
  assert.match(page, /const lastSaveStartedAtRef = useRef\(0\)/);
  assert.match(page, /const saveCadenceStartedAtRef = useRef\(0\)/);
  assert.match(page, /Math\.min\(SAVE_DEBOUNCE_MS, maxWait\)/);
  assert.match(page, /Date\.now\(\) - baseline >= SAVE_MAX_INTERVAL_MS/);
  assert.match(page, /idleSeconds,/);
  assert.match(page, /setIdleSeconds\(Math\.max\(0, Math\.min\(599, save\.idleSeconds \?\? 0\)\)\)/);
  assert.match(page, /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/);
  assert.match(page, /window\.addEventListener\("pagehide", queueBackup\)/);
  assert.match(page, /requestPrioritySave\(\);/);
});

test("derives combat power from actual stats and enhancement", () => {
  assert.match(page, /Map as MapIcon/);
  assert.doesNotMatch(page, /import[\s\S]*\bMap,\n/);
  assert.match(page, /function calculateCombatPower\(/);
  assert.match(page, /current\.attack - naked\.attack/);
  assert.deepEqual(
    Array.from({ length: 16 }, (_, level) => enhancementBonusPercent(level)),
    [0, 3, 6, 9, 12, 17, 22, 27, 32, 37, 47, 57, 67, 77, 87, 97],
  );
  assert.match(page, /for \(const stat of equipmentBaseStats\(item\)\)/);
  assert.doesNotMatch(page, /power: it\.power \+ 24/);
  assert.match(page, /實際戰力/);
  assert.match(page, /裝備評級/);
  assert.doesNotMatch(page, /current\.resourceDrop \* 4/);
  assert.doesNotMatch(page, /current\.yuanbaoDrop \* 12/);
  assert.equal(balanceConfig.combat.tierDefense.boss, 1.62);
  assert.equal(balanceConfig.combat.tierAttack.boss, 1.72);
  assert.equal(balanceConfig.combat.monsterStats.playerAttackScale, 1);
});

test("raises real tower monster health without changing player damage formulas", () => {
  assert.deepEqual(balanceConfig.mapFloors.monsterHealth.combatMultiplier, { normal: 0.78, elite: 1.05, guardian: 1.45, boss: 0.48 });
  assert.deepEqual(balanceConfig.combat.monsterDamageReductionByMap, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(balanceConfig.combat.evasionModel.monsterEvasionBonusByMap, [0, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(balanceConfig.combat.evasionModel.monsterEvasionPerMap, 22);
  assert.match(page, /function monsterCombatHealthMultiplier/);
});

test("makes monster attacks threatening before the player builds defense", () => {
  assert.equal(balanceConfig.combat.monsterStats.recommendedPowerAttackScale, 0.045);

  const lowDefense = towerCombatValues({
    combatPower: 1667,
    recommendedPower: 1667,
    mapId: 1,
    localFloor: 3,
    tier: "normal",
    attacks: 1,
    skillTriggered: false,
    setTier: 0,
    playerDefense: 20,
    monsterName: "星塵獸",
  });
  const armored = towerCombatValues({
    combatPower: 1667,
    recommendedPower: 1667,
    mapId: 1,
    localFloor: 3,
    tier: "normal",
    attacks: 1,
    skillTriggered: false,
    setTier: 0,
    playerDefense: 300,
    monsterName: "星塵獸",
  });

  assert.ok(lowDefense.monsterDamage >= 45);
  assert.ok(armored.monsterDamage < lowDefense.monsterDamage);
  assert.ok(armored.monsterDamage <= lowDefense.monsterDamage * 0.7);

  const lateMap = towerCombatValues({
    combatPower: 70000,
    recommendedPower: 70000,
    mapId: 9,
    localFloor: 1,
    tier: "normal",
    attacks: 1,
    skillTriggered: false,
    setTier: 0,
    playerDefense: 0,
    monsterName: "深淵王",
  });
  assert.ok(lateMap.monsterDamage >= 2900);
  assert.ok(lateMap.progressionDamageFloor > lowDefense.progressionDamageFloor);
});

test("softens the tenth-floor attack checkpoints on every map", () => {
  assert.equal(balanceConfig.combat.monsterDamage.milestoneAttackReduction, 0.15);
  const at = (localFloor, tier) => towerCombatValues({
    combatPower: 10000,
    recommendedPower: 10000,
    mapId: 4,
    localFloor,
    tier,
    attacks: 1,
    skillTriggered: false,
    setTier: 0,
    playerDefense: 0,
    monsterName: "星塵獸",
  });
  const normal10 = at(10, "normal");
  const normal11 = at(11, "normal");
  const guardian20 = at(20, "guardian");
  const boss30 = at(30, "boss");
  assert.ok(normal10.progressionDamageFloor < normal11.progressionDamageFloor);
  assert.ok(guardian20.progressionDamageFloor > 0);
  assert.ok(boss30.progressionDamageFloor > normal10.progressionDamageFloor);
});

test("keeps equipment attack from being multiplied a second time", () => {
  const towerCall = page.slice(
    page.indexOf("const combatValues = towerCombatValues({"),
    page.indexOf("const bossDamageMultiplier =", page.indexOf("const combatValues = towerCombatValues({")),
  );
  assert.doesNotMatch(towerCall, /characterStats\.attack\s*\/\s*baseCharacterStats\.attack/);
  assert.match(towerCall, /playerAttack:\s*offensiveAttack/);
  assert.match(towerCall, /skillMultiplier:\s*\n\s*triggeredMultiplier/);
  assert.match(towerCall, /playerDamageMultiplier:/);
});

test("scales enhancement costs and downgrades risky failures", () => {
  assert.deepEqual(
    Array.from({ length: 15 }, (_, index) => enhancementGoldCost(index + 1)),
    [704, 704, 739, 774, 810, 859, 915, 986, 1070, 1162, 1267, 1394, 1535, 1690, 1866],
  );
  assert.equal(enhancementGoldCost(1, { mapId: 9, quality: "神話", slot: "胸甲" }), 7820);
  assert.equal(enhancementGoldCost(15, { mapId: 9, quality: "神話", slot: "胸甲" }), 20723);
  assert.deepEqual(
    Array.from({ length: 15 }, (_, index) => enhancementStoneCost(index + 1)),
    [1, 2, 3, 4, 5, 7, 9, 11, 13, 15, 18, 22, 26, 32, 38],
  );
  assert.equal(enhancementFailureLevel(10), 10);
  assert.equal(enhancementFailureLevel(11), 10);
  assert.equal(enhancementFailureLevel(14), 13);
  assert.deepEqual(gamblePackageReward(0), { type: "equipment", qualityIndex: 3 });
  assert.deepEqual(gamblePackageReward(0.399999), { type: "equipment", qualityIndex: 3 });
  assert.deepEqual(gamblePackageReward(0.4), { type: "reforge", amount: 10 });
  assert.deepEqual(gamblePackageReward(0.699999), { type: "reforge", amount: 10 });
  assert.deepEqual(gamblePackageReward(0.7), { type: "equipment", qualityIndex: 4 });
  assert.deepEqual(gamblePackageReward(0.899999), { type: "equipment", qualityIndex: 4 });
  assert.deepEqual(gamblePackageReward(0.9), { type: "equipment", qualityIndex: 5 });
  assert.deepEqual(gamblePackageReward(1), { type: "equipment", qualityIndex: 5 });
  assert.match(page, /const reward = createGambleReward\(targetMap, Math\.random\(\), Date\.now\(\)\)/);
  assert.match(page, /reward\.type === "reforge"/);
  assert.match(page, /setReforgeStones\(\(value\) => value \+ reward\.amount\)/);
  assert.match(page, /equipmentType: qualityIndex === 5 \? "神話裝備"/);
  assert.match(page, /quality: qualityOrder\[qualityIndex\]/);
  assert.match(page, /<span>強化至 \+\{currentItem\.enhance \+ 1\}<\/span>/);
  assert.match(page, /<small>（\{goldCost\.toLocaleString\(\)}金幣＋\{stoneCost\}石）<\/small>/);
  assert.doesNotMatch(page, /強化至 \+\$\{currentItem\.enhance \+ 1\}（基礎/);
  assert.doesNotMatch(page, /!activeBossBattle && <small>\{towerTierLabel\(currentCombatTier\)\}<\/small>/);
  assert.match(page, /className="inventory-character"/);
  assert.match(css, /\.inventory-character\s*\{[^}]*width:\s*min\(145%,\s*270px\)/s);
});

test("reduces combat and dismantling enhancement stone rewards by half", () => {
  assert.equal(balanceConfig.economy.enhancementStones.combatDropChanceMultiplier, 0.5);
  assert.equal(balanceConfig.economy.enhancementStones.dismantleYieldMultiplier, 0.5);
  assert.equal(enhancementStoneDropChance(0.06), 0.03);
  assert.equal(enhancementStoneDropChance(0.3), 0.15);
  assert.equal(enhancementStoneDropChance(1), 0.5);
  assert.equal(enhancementStoneDropChance(0.06, 20, 0.1), 0.18);
  assert.equal(enhancementStoneDismantleYield(0, 0), 1);
  assert.equal(enhancementStoneDismantleYield(5, 9), 4);
  assert.equal(enhancementStoneDismantleYield(5, 15), 5);
  assert.match(page, /enhancementStoneDismantleYield\(rank, item\.enhance\)/);
  assert.match(page, /enhancementStoneDropChance\(/);
});

test("uses the confirmed monster drop quality distribution", () => {
  const battleDropBody = page.slice(
    page.indexOf('source === "戰鬥"'),
    page.indexOf("const slot = dropSlots"),
  );
  assert.match(battleDropBody, /roll > 0\.96/);
  assert.match(battleDropBody, /roll > 0\.81/);
  assert.match(battleDropBody, /roll > 0\.58/);
  assert.match(battleDropBody, /roll > 0\.3/);
  assert.doesNotMatch(battleDropBody, /roll > 0\.94/);
  assert.doesNotMatch(battleDropBody, /roll > 0\.78/);
  assert.doesNotMatch(battleDropBody, /roll > 0\.46/);
  assert.doesNotMatch(battleDropBody, /roll > 0\.18/);
});

test("displays player and monster damage as matching raw numbers", () => {
  assert.match(page, /bossDamageGroups\.map/);
  assert.match(page, /<b>首領 -\{group\.damage\}<\/b>/);
  assert.match(page, /`-\$\{enemyHitFeedback\.damage\}`/);
  assert.match(page, /對首領造成 \$\{playerDamage\} 傷害/);
  assert.doesNotMatch(page, /首領 -\{lastBossDamage\}%/);
  assert.doesNotMatch(page, /enemyHitFeedback\.damage\}%/);
});

test("keeps skill cards and battle information unambiguous", () => {
  assert.match(page, /skillValue\(skill\.name, skill\.level\)\.current/);
  assert.match(page, /遠征祝福不會在首領戰生效/);
  assert.match(page, /首領 -\{group\.damage\}/);
  assert.match(page, /enemyHitFeedback\.damage/);
  assert.match(page, /離線掛機收益/);
  assert.match(page, /本次遠征戰利品/);
});

test("locks ultimates until level ten and counts only direct stat skills in power", () => {
  assert.match(page, /const isUltimateLocked = isUltimate && level < 10/);
  assert.match(page, /角色達到 Lv\.10 後解鎖/);
  assert.match(page, /isUltimateLocked/);
  assert.doesNotMatch(page, /技能戰力/);
  assert.doesNotMatch(page, /戰力貢獻/);
  assert.doesNotMatch(page, /skillPowerContribution/);
  assert.match(page, /const statSkills = skills\.filter/);
  assert.match(page, /\["鋼鐵壁壘", "獵手本能", "魔力護盾"\]/);
  assert.doesNotMatch(page, /calculateSkillEffects\(skills\)\.power/);
});

test("shows rapid multi-hit and critical combat feedback", () => {
  assert.match(page, /const \[battleHits, setBattleHits\]/);
  assert.match(page, /setBattleHitGroups\(\(current\) =>/);
  assert.match(page, /className=\{`combo-hit/);
  assert.match(page, /className=\{`fighter player .*rapid/);
  assert.match(css, /@keyframes rapid-strike/);
  assert.match(css, /@keyframes combo-damage/);
  assert.match(css, /\.combo-hit\.critical-hit/);
  assert.match(css, /\.combo-hit\.critical-hit b/);
  assert.match(css, /@keyframes critical-flare/);
  assert.match(css, /@keyframes critical-punch/);
  assert.match(page, /const \[enemyHitFeedback, setEnemyHitFeedback\]/);
  assert.match(page, /className=\{`enemy-damage-float/);
  assert.match(css, /@keyframes enemy-damage/);
  assert.match(css, /@keyframes attack-impact-a/);
  assert.match(css, /@keyframes attack-impact-b/);
});

test("疾風連射 keeps one total attack while presenting five timed arrows", () => {
  assert.match(page, /case "疾風連射": return 1;/);
  assert.match(page, /const windVolleyTriggered = triggered\?\.name === "疾風連射";/);
  assert.match(page, /if \(windVolleyTriggered\) \{[\s\S]*?attacks = windVolleyCriticals\.length;/);
  assert.match(page, /const skillDamageTriggered = Boolean\(triggered\);/);
  assert.match(page, /skillTriggered: skillDamageTriggered/);
  assert.match(page, /windVolleyCriticals\.length/);
  assert.match(page, /RangerWindVolleyVfx/);
  assert.match(css, /\.combo-hit\.volley-hit \{\s*animation-delay: calc\(495ms \+ \(var\(--hit-index\) \* 250ms\)\);\s*\}/s);
  assert.match(css, /\.ranger-wind-volley-arrow/);
  assert.match(page, /RangerWindVolleyVfx/);
});

test("recommended map power separates danger from viable clears", () => {
  const powers = [1000, 3000, 6000, 10000, 16000, 24000, 35000, 50000, 70000];
  powers.forEach((recommended, index) => {
    const mapId = index + 1;
    const valuesAt = (power) => towerCombatValues({
      combatPower: power,
      recommendedPower: recommended,
      mapId,
      localFloor: 10,
      tier: "guardian",
      attacks: 1,
      skillTriggered: false,
      setTier: 0,
      playerAttack: 54 * (power / recommended),
      playerDefense: 0,
    });
    const danger = valuesAt(recommended * 0.75);
    const viable = valuesAt(recommended);
    const strong = valuesAt(recommended * 1.2);
    assert.ok(danger.monsterDamage > viable.monsterDamage);
    assert.ok(viable.monsterDamage >= strong.monsterDamage);
    assert.ok(danger.playerDamage < viable.playerDamage);
    assert.ok(viable.playerDamage < strong.playerDamage);
  });
});

test("class balance gives warrior durability and mage single-target burst", () => {
  assert.equal(balanceConfig.character.baseStats.戰士.hp, 620);
  assert.equal(balanceConfig.character.baseStats.戰士.defense, 36);
  assert.equal(balanceConfig.character.baseStats.法師.hp, 390);
  assert.match(balanceSource, /playerDefense/);
  assert.match(balanceConfigSource, /monsterProfiles/);
  assert.match(page, /const playerHpLossFromDamage/);
  assert.match(page, /playerDamageMultiplier/);
  assert.match(data, /單體・術式爆發/);
  assert.doesNotMatch(data, /群攻・成長核心/);
});

test("equipment power rises consistently across all nine maps", () => {
  for (let mapId = 1; mapId < 9; mapId++) {
    for (let quality = 0; quality < 6; quality++) {
      const current = dropPowerRange(mapId, quality);
      const next = dropPowerRange(mapId + 1, quality);
      assert.ok(next.minimum > current.minimum);
      assert.ok(current.maximum > current.minimum);
    }
  }
});

test("ships all ninety map equipment icons and maps drops to them", async () => {
  const expected = [
    "belt.png",
    "boots.png",
    "bracer.png",
    "chest.png",
    "cloak.png",
    "gloves.png",
    "helmet.png",
    "necklace.png",
    "ring.png",
    "weapon.png",
  ];
  for (let mapId = 1; mapId <= 9; mapId++) {
    const files = await readdir(
      new URL(`../public/equipment/map-${mapId}/`, import.meta.url),
    );
    assert.deepEqual(files.sort(), expected);
  }
  assert.match(page, /const equipmentSlotSlugs/);
  assert.match(page, /return `\/equipment\/map-\$\{mapId\}\/\$\{slot\}\.png`/);
  assert.match(page, /<EquipmentIcon item=\{it\} className="bag-equipment-art"/);
  assert.match(page, /<EquipmentIcon item=\{currentItem\} className="detail-equipment-art"/);
  assert.match(css, /\.item-grid \.bag-equipment-art \{[^}]*left:\s*50%;[^}]*top:\s*50%;[^}]*transform:\s*translate\(-50%, -50%\)/s);
  assert.match(css, /\.item-grid button > i:not\(\.set-badge\)/);
});

test("caps all scene equipment at legendary and reserves mythic gear", () => {
  assert.equal(balanceConfig.equipment.sceneMaxQualityIndex, 4);
  assert.match(page, /equipmentType: "場景普通裝備"/);
  assert.match(page, /Math\.min\(\s*SCENE_MAX_QUALITY_INDEX,\s*qualityOrder\.indexOf\(item\.quality\) \+ 1/s);
  assert.match(page, /場景普通裝備 · 品質上限：傳奇/);
  assert.doesNotMatch(data, /quality: "神話"/);
});

test("allows mythic equipment to roll five affixes", () => {
  assert.match(page, /const MAX_AFFIXES_BY_QUALITY = \[0, 1, 2, 3, 4, 5\]/);
  assert.match(page, /const affixCount = MAX_AFFIXES_BY_QUALITY/);
  assert.match(page, /const affixes = rollAffixes\(upgraded\)/);
  assert.match(page, /\.\.\.upgraded,\s*affixes,/);
});

test("implements the confirmed rebirth reset and permanent growth rules", () => {
  assert.match(page, /const MAX_REBIRTHS = 20/);
  assert.match(page, /const canRebirth = level >= 100 && \(mapBestFloors\[9\] \?\? 0\) >= MAP_FLOORS/);
  assert.match(page, /setRebirthPoints\(\(value\) => value \+ 2\)/);
  assert.match(page, /setItems\(\[\]\)/);
  assert.match(page, /setLoadouts\(\{ 1: \[\], 2: \[\] \}\)/);
  assert.match(page, /setGold\(save\.gold/);
  assert.match(page, /setYuanbao\(save\.yuanbao/);
  assert.match(page, /equipmentDrop: baseCharacterStats\.equipmentDrop \+ rebirthTier \* 5/);
  assert.match(page, /expBonus: baseCharacterStats\.expBonus \+ rebirthTier \* 20/);
  assert.match(page, /goldBonus: baseCharacterStats\.goldBonus \+ rebirthTier \* 20/);
  assert.match(page, /highQualityDrop: rebirthTier \* 3/);
  assert.match(page, /rebirthTalentDefs/);
});

test("gives every equipment slot a distinct core affix profile", () => {
  assert.match(page, /武器: \[flat\("攻擊"\)/);
  assert.match(page, /胸甲: \[flat\("防禦"\)/);
  assert.match(page, /鞋子: \[percentage\("閃避", 0\.45\)/);
  assert.match(page, /項鍊: \[percentage\("經驗", 0\.6\)/);
  assert.match(page, /戒指: \[percentage\("暴擊", 0\.55\)/);
  assert.match(page, /腰帶: \[flat\("生命"\)/);
  assert.match(page, /披風: \[percentage\("傷害減免", 0\.45\)/);
  assert.match(page, /const affixCount = MAX_AFFIXES_BY_QUALITY/);
});

test("applies specialized utility affixes to actual rewards and combat", () => {
  assert.match(page, /result\.expBonus \+= value/);
  assert.match(page, /result\.goldBonus \+= value/);
  assert.match(page, /result\.bossDamage \+= value/);
  assert.match(page, /result\.damageReduction \+= value/);
  assert.match(page, /1 \+ characterStats\.expBonus \/ 100/);
  assert.match(page, /1 \+ characterStats\.goldBonus \/ 100/);
  assert.match(page, /1 \+ characterStats\.bossDamage \/ 100/);
  assert.match(page, /balanceConfig\.progression\.damageReductionCap/);
  for (const stat of ["技能傷害", "首領減傷", "資源掉落率", "元寶掉率"]) {
    assert.match(page, new RegExp(`result\\.${stat === "元寶掉率" ? "yuanbaoDrop" : stat === "資源掉落率" ? "resourceDrop" : stat === "技能傷害" ? "skillDamage" : "bossReduction"} \\+= value`));
  }
  assert.match(page, /percentageFixed\("元寶掉率"\)/);
  assert.equal((page.match(/percentageFixed\("元寶掉率"\)/g) ?? []).length, 2);
  assert.match(page, /資源掉落率會同時提高強化石與洗鍊石掉落機率/);
  assert.match(page, /resourceDrop\.yuanbao/);
  assert.deepEqual(balanceConfig.equipment.affixes.percentQualityBands.元寶掉率, [[1, 3], [1, 3], [1, 3], [1, 3], [1, 3], [1, 3]]);
});

test("separates inherent equipment stats from random affixes", () => {
  assert.match(page, /function equipmentBaseStats\(/);
  assert.match(page, /基礎屬性/);
  assert.match(page, /className="affix-divider"><span>詞綴加成<\/span>/);
  assert.match(page, /原始 \{stat\.original\.toLocaleString\(\)\}・強化 \+/);
  assert.match(page, /affixRangeLabel\(item, affix\)/);
});

test("uses disjoint quality bands for flat and percentage affixes", () => {
  assert.match(page, /const flatQualityBands = balanceConfig/);
  assert.deepEqual(balanceConfig.equipment.affixes.flatQualityMultipliers[0], [0.08, 0.12]);
  assert.deepEqual(balanceConfig.equipment.affixes.flatQualityMultipliers[4], [0.3, 0.4]);
  assert.deepEqual(balanceConfig.equipment.affixes.percentQualityBands.暴擊[4], [4, 8]);
  assert.match(page, /affixSchemaVersion: 7/);
  assert.match(page, /normalizeSceneItem/);
  assert.match(page, /只會產生\$\{currentItem\.quality\}數值區間/);
});

test("preserves duplicate affixes through save normalization", () => {
  assert.match(page, /洗鍊允許同一種詞綴重複出現/);
  assert.match(page, /affixes: cleanAffixes\.slice\(0, maxAffixes\)/);
  assert.doesNotMatch(page, /const uniqueAffixes = cleanAffixes\.filter/);
});

test("shows the same damage that is removed from the monster's real hp", () => {
  assert.match(page, /function monsterMaximumHealth/);
  assert.match(page, /function effectiveMonsterMaximumHealth/);
  assert.equal(healthFromPercent(40, 17050), 6820);
  assert.equal(healthPercentFromDamage(1023, 17050), 6);
  assert.equal(healthFromPercent(94, 17050), 16027);
  assert.equal(healthFromPercent(0, 17050), 0);
  assert.equal(healthFromPercent(0.00001, 1394), 1);
  assert.match(page, /monsterProfile\(currentEnemyBaseName\)/);
  assert.match(page, /monsterName: currentEnemyBaseName/);
  assert.match(page, /monsterProfile\(bossMonsterName\)/);
  assert.match(page, /actualPercentDamage = Math\.min\(\s*h,\s*healthPercentFromDamage\(finalHpDamage, enemyMaximumHealth\),\s*\)/);
  assert.match(page, /if \(h - actualPercentDamage <= 0\.000001\)/);
  assert.match(page, /Math\.min\(Math\.round\(currentEffectiveEnemyHealth\), finalHpDamage\)/);
  assert.match(page, /currentEnemyHealth\.toLocaleString\(\).*currentEnemyMaximumHealth\.toLocaleString\(\).*HP/s);
  assert.match(page, /共 \$\{totalDisplayedDamage\.toLocaleString\(\)\} 傷害/);
  assert.match(page, /const bossHpLoss =/);
  assert.match(page, /bossHpLoss/);
  assert.match(page, /return Math\.max\(0, h - actualPercentDamage\)/);
  assert.match(page, /className="player-health-label"/);
  assert.match(page, /width: `\$\{Math\.max\(0, Math\.min\(100, value\)\)\}%`/);
  assert.doesNotMatch(page, /3 \/ monsterCombatHealthMultiplier/);
  assert.doesNotMatch(page, /characterStats\.attack \* 4\.2 \+ 620/);
});

test("stops tower combat on the lethal frame", () => {
  assert.match(page, /const towerDeathPendingRef = useRef\(false\)/);
  assert.match(page, /if \(towerDeathPendingRef\.current\) return/);
  assert.ok((page.match(/towerDeathPendingRef\.current = true/g) ?? []).length >= 2);
  assert.equal((page.match(/setBattleOn\(false\);\s*setCausePrompt\("生命歸零 → 戰鬥已停止"\)/g) ?? []).length, 2);
  assert.equal((page.match(/finishRun\("death", wave\), 0/g) ?? []).length, 2);
  assert.doesNotMatch(page, /finishRun\("death", wave\), 120/);
  assert.match(page, /if \(savedPlayerHp <= 0\)/);
  assert.equal((page.match(/actualDamage >= healthFromPercent\(playerHealth, characterStats\.hp\)/g) ?? []).length, 2);
  assert.equal((page.match(/playerHealth - hpLoss <= 0\.000001/g) ?? []).length, 2);
  assert.match(page, /if \(hp - hpLoss <= 0\.000001\)/);
});

test("does not expose a direct equipment quality-upgrade button", () => {
  assert.doesNotMatch(page, /升品按鈕|升品材料|執行升品|升品成功/);
  assert.match(page, /高品質掉落修正提高至 60%/);
});

test("keeps formal experience and removes game speed controls", () => {
  assert.equal(balanceConfig.progression.experienceMultiplier, 3);
  assert.doesNotMatch(page, /dark-world-speed|setTimeScale|速度 ×|戰鬥速度/);
  assert.doesNotMatch(page, /BALANCE_TEST_MODE|經驗 ×100/);
});

test("raises inherent gear power through map five and preserves a mythic gap later", () => {
  assert.deepEqual(balanceConfig.equipment.baseScaleByMap, [0, 2, 2.9, 6.15, 8.7, 12.15, 13.4, 17, 23, 32]);
  assert.deepEqual(balanceConfig.equipment.baseQualityMultipliers, [1, 1.06, 1.12, 1.18, 1.24, 1.3]);
  assert.match(balanceConfigSource, /普通到神話的基礎能力總差距為 30%/);
  assert.match(page, /qualityMultiplier/);
  assert.match(page, /scale \* qualityMultiplier/);
  assert.match(page, /canonicalBase\(name\) \* multiplier \* qualityMinimum/);
  assert.deepEqual(balanceConfig.equipment.affixes.flatQualityMultipliers[4], [0.3, 0.4]);
  assert.deepEqual(balanceConfig.equipment.affixes.flatQualityMultipliers[5], [0.45, 0.6]);
});

test("uses three distinct ten-floor power bands without cluttering map cards", () => {
  assert.match(page, /boundedFloor <= 10/);
  assert.match(page, /boundedFloor <= 20/);
  assert.match(page, /map\.phasePower\[0\]/);
  assert.match(page, /map\.phasePower\[1\]/);
  assert.match(page, /map\.phasePower\[0\] \* balanceConfig/);
  assert.match(page, /map\.phasePower\[1\] \* balanceConfig/);
  assert.equal(balanceConfig.combat.guardianCheckpoints.floor10.defense, 1.15);
  assert.equal(balanceConfig.combat.guardianCheckpoints.floor20.attack, 1.4);
  assert.match(page, /建議戰力 \{map\.power\[0\]/);
  assert.doesNotMatch(page, /前十層戰力|中十層戰力|後十層戰力/);
});

test("caps dodge at forty percent and applies map accuracy", () => {
  assert.equal(balanceConfig.progression.dodgeCap, 40);
  assert.equal(balanceConfig.combat.evasionModel.accuracyMultiplier, 1.25);
  assert.equal(balanceConfig.combat.evasionModel.evasionMultiplier, 0.3);
  assert.equal(hitChanceFromRatings(100, 1000), 31.25);
  assert.equal(evadeChanceFromRatings(100, 1000), 68.75);
  assert.match(page, /hitChanceFromRatings\(characterStats\.hit, monsterEvasionRating\)/);
  assert.match(page, /evadeChanceFromRatings\(monsterAccuracyRating, playerEvasionRating\)/);
  assert.match(page, /Math\.min\(DODGE_CAP, Math\.max\(0, characterStats\.dodge\)\)/);
  assert.match(page, /\[0, 0, 3, 6, 9, 12, 16, 20, 24, 28\]/);
});

test("centralizes adjustable game balance in one configuration file", () => {
  assert.match(balanceConfigSource, /唯一的遊戲平衡設定檔/);
  assert.match(balanceConfigSource, /experienceMultiplier: 3/);
  assert.match(balanceConfigSource, /dodgeCap: 40/);
  assert.match(balanceConfigSource, /flatQualityMultipliers/);
  assert.match(balanceConfigSource, /realmSuppression/);
  assert.match(data, /balanceConfig\.maps\[index\]/);
  assert.match(balanceSource, /balanceConfig\.combat/);
});

test("awards online yuanbao every ten minutes", () => {
  const idleRewardBody = page.slice(
    page.indexOf("const next = idleSeconds + 60"),
    page.indexOf("const buyShopItem"),
  );
  assert.match(idleRewardBody, /next >= 600/);
  assert.match(idleRewardBody, /Math\.floor\(next \/ 600\) \* 10/);
  assert.match(page, /每 10 分鐘自動獲得 10 元寶/);
});

test("awards the 500-kill daily target exactly once per Taipei day", () => {
  assert.match(page, /const \[dailyRewardClaimed, setDailyRewardClaimed\] = useState\(false\)/);
  assert.match(page, /if \(dailyKills < 500\)/);
  assert.match(page, /if \(dailyRewardClaimed\) return toast\.info\("今日獎勵已領取"\)/);
  assert.match(page, /setGold\(\(value\) => value \+ 5000\)/);
  assert.match(page, /setEnhanceStones\(\(value\) => value \+ 10\)/);
  assert.match(page, /setReforgeStones\(\(value\) => value \+ 10\)/);
  assert.match(page, /setYuanbao\(\(value\) => value \+ 20\)/);
  assert.match(page, /setDailyRewardClaimed\(true\)/);
  assert.match(page, /timeZone: "Asia\/Taipei"/);
  assert.match(page, /const savedForToday = save\.dailyDate === today/);
  assert.match(page, /disabled=\{dailyKills < 500 \|\| dailyRewardClaimed\}/);
  assert.match(page, /dailyRewardClaimed,/);
});

test("starts new accounts with zero yuanbao", () => {
  assert.match(page, /const \[yuanbao, setYuanbao\] = useState\(0\)/);
  assert.match(page, /setYuanbao\(save\.yuanbao \?\? 0\)/);
});

test("uses live combat stats for personal boss battles", () => {
  const bossBody = page.slice(
    page.indexOf("const fightBoss ="),
    page.indexOf("const leaveBossBattle ="),
  );
  assert.match(page, /function personalBossCombatValues\(/);
  assert.match(bossBody, /attack: characterStats\.attack/);
  assert.match(bossBody, /speed: characterStats\.speed/);
  assert.match(bossBody, /defense: characterStats\.defense/);
  assert.match(bossBody, /bossDamage: characterStats\.bossDamage/);
  assert.doesNotMatch(bossBody, /combatPower \/ Math\.max\(800, activeBossBattle\.level \* 360\)/);
});

test("defines distinct monster combat profiles", () => {
  const profileBlock = page.slice(
    page.indexOf("const currentEnemyBaseName ="),
    page.indexOf("const currentRecommendedPower ="),
  );
  assert.match(balanceConfigSource, /monsterProfiles: \{/);
  assert.match(balanceConfigSource, /腐骨鼠: \{ health: 0\.72, attack: 0\.68, defense: 0\.62, speed: 1\.28 \}/);
  assert.match(balanceSource, /monsterAttackSpeed: profile\.speed \* 100/);
  assert.match(profileBlock, /const currentEnemyBaseName = baseMonsterName\(enemyName\)/);
});

test("keeps every page reachable from a horizontally draggable mobile navigation", () => {
  const mobileNavBody = page.slice(
    page.indexOf('<nav className="mobile-nav">'),
    page.indexOf("</nav>", page.indexOf('<nav className="mobile-nav">')),
  );
  assert.match(mobileNavBody, /navItems\.map/);
  assert.doesNotMatch(mobileNavBody, /mobileMoreOpen|mobile-more-menu|更多/);
  assert.match(css, /\.mobile-nav \{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.mobile-nav button \{[^}]*flex:\s*0 0 72px/s);
});

test("keeps settings accessible and scrolls all mobile topbar resources", () => {
  const topbarBody = page.slice(
    page.indexOf('<header className="topbar">'),
    page.indexOf("</header>", page.indexOf('<header className="topbar">')),
  );
  assert.match(topbarBody, /title="強化石"[\s\S]*enhanceStones\.toLocaleString\(\)/);
  assert.match(topbarBody, /title="洗鍊石"[\s\S]*reforgeStones\.toLocaleString\(\)/);
  assert.match(topbarBody, /aria-label="開啟設定選單"/);
  assert.match(topbarBody, /onSelect=\{\(\) => onExit\(\)\}/);
  assert.doesNotMatch(page, /onClick=\{onExit\}/);
  assert.match(css, /\.topbar-scroll \{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.topbar-actions \{[^}]*flex:\s*0 0 auto/s);
});

test("places character values after all equipment on mobile", () => {
  const inventoryBody = page.slice(
    page.indexOf('<div className="inventory-layout">'),
    page.indexOf("</div>\n            </div>", page.indexOf('<div className="inventory-layout">')),
  );
  assert.ok(inventoryBody.indexOf('className="bag-panel"') < inventoryBody.indexOf('className="character-values-panel"'));
  assert.match(css, /\.character-values-panel\s*\{\s*grid-column:\s*1;/);
});

test("applies staged realm suppression below current floor power", () => {
  assert.equal(realmSuppression(1000, 1000).tier, "none");
  assert.equal(realmSuppression(900, 1000).tier, "light");
  assert.equal(realmSuppression(750, 1000).tier, "medium");
  assert.equal(realmSuppression(600, 1000).tier, "heavy");
  assert.equal(realmSuppression(400, 1000).tier, "abyss");
  assert.match(page, /suppressionLabels/);
  assert.doesNotMatch(page, /怪物傷害\+25%|怪物減傷\+12%|怪物命中\+10%/);
});
