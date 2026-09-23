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

## 模組索引

| 模組 | 規格 | 實際程式與主要 symbol |
|---|---|---|
| Balance | `COMBAT.md`, `EQUIPMENT.md`, `MONSTERS.md` | `app/balance-config.ts`; `app/balance.ts` → `towerCombatValues`, `hitChanceFromRatings`, `dropPowerRange` |
| Combat | `COMBAT.md` | `app/page.tsx` → `Game`, `calculateCharacterStats`, `calculateCombatPower`; `app/balance.ts` → `towerCombatValues` |
| Skills | `SKILLS.md` | `app/game-data.ts` → `skillsByClass`; `app/page.tsx` → `skillValue`, `skillProcChance`, `skillMultiplier`, `calculateSkillEffects` |
| VFX | `VFX.md` | `app/skill-effect-canvas.tsx`; `app/mythic-skill-vfx.tsx`; `app/*-vfx.tsx`; `app/globals.css`; `public/vfx/` |
| Equipment | `EQUIPMENT.md` | `app/page.tsx` → `createCatalogItem`, `equipmentBaseStats`, `equipmentCombatRating`, `rollAffixes`; `app/gem-system.ts`; `app/mythic-data.ts`; `public/equipment/`, `public/gems/` |
| Maps／Monsters | `MONSTERS.md` | `app/game-data.ts` → `maps`, `monsterImages`; `app/page.tsx` → `monsterMaximumHealth`, `effectiveMonsterMaximumHealth`, `createDrop` |
| Boss | `MONSTERS.md` | `app/game-data.ts` → `personalBosses`, `worldBosses`; `app/page.tsx` → `personalBossCombatValues`, `fightBoss`; `app/deep-abyss-boss-vfx.tsx` |
| Reincarnation | `REINCARNATION.md` | `app/page.tsx` → `rebirthTalentDefs`, `rebirth`, `MAX_REBIRTHS` |
| Ranking | `REINCARNATION.md` | `app/page.tsx` → `Ranking`; `app/api/ranking/route.ts` |
| Save／Auth | `GM.md` | `app/api/auth-utils.ts`; `app/api/auth/route.ts`; `app/api/save/route.ts`; `app/api/character/route.ts`; `db/schema.ts` |
| GM | `GM.md` | `app/admin-panels.tsx` → `AdminMonitor`, `AdminSaveEditor`, `AdminPlayerManagement`, `AdminSaveRestore`; `app/api/admin/` |
| Deploy | `DEPLOY.md` | `.openai/hosting.json`; `package.json`; `scripts/build-verified.sh`; `scripts/install-ci.sh`; `scripts/sites-env.sh` |

## 精準讀取規則

1. 先從上表定位檔案與 symbol。
2. 使用 `rg -n "symbol" path`，只讀命中附近區段。
3. 修改數值時優先檢查 `app/balance-config.ts`，避免在 UI 重複寫死。
4. 不讀 `build/`、依賴、lockfile 或圖片內容，除非任務直接涉及它們。
5. `app/page.tsx` 很大，不得整份載入；只讀目標 symbol 與呼叫端。
