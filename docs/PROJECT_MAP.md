# 專案地圖

> 狀態：已接入正式 Sites repository。基準為正式站第 271 版，提交 `fe022b1e61c900bf0dfd494a52fc7e66e6ba2099`。

## 權威來源

| 來源 | 用途 |
|---|---|
| `app/balance-config.ts` | 成長、地圖、怪物、戰鬥、裝備的可調數值 |
| `app/balance.ts` | 命中／閃避、傷害、防禦、掉落評級、強化成本公式 |
| `app/game-data.ts` | 職業、地圖、怪物圖、個人／世界首領、技能清單 |
| `app/page.tsx` | 遊戲主流程、戰鬥排程、技能結算、裝備、輪迴與主要 UI |
| `app/mythic-data.ts` | 神話與特殊傳奇裝備資料、技能聯動效果 |
| `db/schema.ts` | 帳號、session、存檔、快照、死亡事件與 GM 紀錄資料表 |
| `docs/*.md` | 產品規格、跨模組限制與已知設計衝突 |

## 型別檢查

2026-09-28 修正新角色升級的失效呼叫、舊版未使用的掉落函式與技能存檔欄位型別後，`npx tsc --noEmit` 已全數通過。

## 模組索引

| 模組 | 規格 | 實際程式與主要 symbol |
|---|---|---|
| Balance | `COMBAT.md`, `EQUIPMENT.md`, `MONSTERS.md` | `app/balance-config.ts`; `app/combat-math.ts`（双方護甲曲線與一般增傷）；`app/balance.ts` → `towerCombatValues`, `hitChanceFromRatings`, `dropPowerRange` |
| Power Assessment | `COMBAT.md` | `app/power-display.ts`（共用顯示尺度）；`app/combat-power-assessment.ts`、`app/equipment-power-estimate.ts`（職業神話成對抽樣）；`app/character-power.ts` → `calculateAssessedCombatPower`，面板／換裝／排行共用；`app/ranking-power.ts` → 存檔重新評估；原遠征／存檔評分保留 |
| Combat | `COMBAT.md` | `app/page.tsx` → `Game`, `calculateCharacterStats`, `calculateCombatPower`; `app/balance.ts` → `towerCombatValues` |
| Skills | `SKILLS.md` | `app/game-data.ts` → `skillsByClass`; `app/page.tsx` → `skillValue`, `skillProcChance`, `skillMultiplier`, `calculateSkillEffects` |
| VFX | `VFX.md` | `app/skill-effect-canvas.tsx`; `app/mythic-skill-vfx.tsx`; `app/*-vfx.tsx`; `app/globals.css`; `public/vfx/` |
| Damage Floats | `DAMAGE_FLOATS.md` | `app/combat-damage-layer.tsx`; `app/combat-float-events.ts`; `app/combat-float-layout.ts`，全遊戲傷害與受傷跳字唯一顯示入口 |
| Playback Guard | `COMBAT.md` | `app/combat-playback-guard.ts`; `app/page.tsx` → `beginUltimateAnimation`, `recoverInterruptedUltimate`，主流程奧義暫停與防停滯收尾 |
| HP Presentation | `DAMAGE_FLOATS.md`, `COMBAT.md` | `app/combat-health-presentation.ts`; `app/page.tsx` → `onEnemyDamageShown`, `presentedEnemyPercent`，血條／HP 文字與逐段跳字同步 |
| Equipment | `EQUIPMENT.md` | `app/page.tsx` → `createCatalogItem`, `equipmentBaseStats`, `equipmentCombatRating`, `rollAffixes`; `app/equipment-affixes.ts` → 共用詞綴池與抽取; `app/equipment-save-policy.ts` → 伺服器洗鍊／打孔、槽位與重送驗證; `app/gem-system.ts`; `app/mythic-data.ts`; `public/equipment/`, `public/gems/` |
| Maps／Monsters | `MONSTERS.md` | `app/game-data.ts` → `maps`, `monsterImages`; `app/page.tsx` → `monsterMaximumHealth`, `effectiveMonsterMaximumHealth`, `createDrop`；`app/balance-config.ts` → `maps[].recommendedAssessedPower`（固定綜合戰力建議）；`scripts/map-power-calibration.mjs`（三職關卡校準）；`scripts/monster-strength-calibration.mjs`（同配裝新舊攻防壓力對比，資料在 `tests/fixtures/monster-strength-calibration.json`）；回放資料在 `tests/fixtures/map-power-calibration.json` |
| Boss | `MONSTERS.md` | `app/game-data.ts` → `personalBosses`, `worldBosses`; `app/page.tsx` → `personalBossCombatValues`, `fightBoss`; `app/deep-abyss-boss-vfx.tsx`; `app/world-boss-rewards.ts`（12:00週期帳本、結算／投遞／領取回條）；`app/api/world-boss/status/route.ts` |
| Reincarnation | `REINCARNATION.md` | `app/rebirth-save.ts` → `finalizePendingRebirth`；`app/skill-save-policy.ts` → 原子輪迴；`app/page.tsx` → `rebirthTalentDefs`, `rebirth`, `MAX_REBIRTHS` |
| Ranking | `REINCARNATION.md` | `app/page.tsx` → `Ranking`; `app/api/ranking/route.ts` |
| Save／Auth | `GM.md` | `app/api/auth-utils.ts`; `app/api/auth/route.ts`; `app/api/save/route.ts`; `app/api/character/route.ts`; `db/schema.ts` |
| Save Integrity | `SAVE_INTEGRITY.md` | `app/save-integrity.ts`; `app/api/save/route.ts`，存檔變動驗證、收益額度與拒絕紀錄；尚非完整權威戰鬥 |
| Idle Storage | `IDLE_STORAGE.md` | `app/idle-storage-clock.ts` → 獨立實際時間顯示；`app/idle-claim.ts` → 伺服器時間結算與領取；`app/save-integrity.ts` → 普通存檔時間權威 |
| GM | `GM.md`, `GM_REVIEW.md` | `app/admin-panels.tsx` → `AdminMonitor`, `AdminSaveEditor`, `AdminPlayerManagement`, `AdminSaveRestore`; `app/api/admin/` |
| Deploy | `DEPLOY.md` | `.openai/hosting.json`; `package.json`; `scripts/build-verified.sh`; `scripts/install-ci.sh`; `scripts/sites-env.sh` |

## 精準讀取規則

1. 先從上表定位檔案與 symbol。
2. 使用 `rg -n "symbol" path`，只讀命中附近區段。
3. 修改數值時優先檢查 `app/balance-config.ts`，避免在 UI 重複寫死。
4. 不讀 `build/`、依賴、lockfile 或圖片內容，除非任務直接涉及它們。
5. `app/page.tsx` 很大，不得整份載入；只讀目標 symbol 與呼叫端。

共用異常與本次法師定案規則：見 [STATUS_EFFECTS.md](STATUS_EFFECTS.md)。

GM 工作台補充模組：`app/gm-security-panel.tsx`、`app/gm-workbench.css`（管理 UI）；`app/save-integrity-audit.ts` 與 `app/api/admin/security-logs/route.ts`（異常紀錄）；`app/admin-save-mutation.ts`（原子版本寫入）；`app/admin-equipment.ts`（穿著與目錄正規化）；`app/admin-state.ts`（還原完整性狀態）；`app/admin-response.ts`（不快取回應）。

登入安全：`app/auth-session-plan.ts`（原子登入替換），`app/auth-rate-limit.ts` 與 `auth_rate_limits`（持久限流）。存檔欄位型別：`app/save-field-schema.ts`（寫入檢查與只讀安全投影）。
