# 暗黑世界 RPG — Codex 工作入口

## 讀取順序

1. 先讀 `docs/PROJECT_MAP.md`。
2. 依任務只讀對應規格與實際程式檔。
3. 除非定位失敗，不得掃描整個 repository。

| 任務 | 規格 |
|---|---|
| 戰鬥、傷害、攻速、死亡 | `docs/COMBAT.md` |
| 三職技能 | `docs/SKILLS.md` |
| 裝備、詞綴、強化、洗鍊 | `docs/EQUIPMENT.md` |
| 地圖、怪物、首領 | `docs/MONSTERS.md` |
| Sprite Sheet、Canvas、CSS 特效 | `docs/VFX.md` |
| 輪迴與排行 | `docs/REINCARNATION.md` |
| 帳號、存檔、GM | `docs/GM.md` |
| 部署 | `docs/DEPLOY.md` |

## 強制工作規則

- 只修改任務涉及的模組；禁止順手重構。
- 優先以 `rg` 搜尋 symbol、技能 ID、資料鍵，再讀附近程式。
- 數值以 `app/balance-config.ts` 為程式來源；公式先查 `app/balance.ts`，規格衝突先查 `docs/DECISIONS.md`。
- 不臆測檔案路徑、API、資料表或部署狀態。
- 不破壞現有玩家存檔；資料結構變更必須附 migration 或相容讀取。
- 線上遊戲相關修改需檢查：舊存檔、重複登入、每日重置、伺服器權威、防重複領取。
- VFX 不得阻塞戰鬥計時器；錨點必須基於角色／敵人框的即時尺寸。
- 修改後執行最小相關測試；未測項目要明講。
- 未被明確要求時，不部署正式站。

## 精簡回報格式

完成後只回報：

1. 修改檔案
2. 修改內容
3. 測試結果
4. 是否部署

除非被要求，不貼完整程式碼、不重述需求、不輸出長篇分析。
