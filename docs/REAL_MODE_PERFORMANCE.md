# 真實模式效能檢查・第一批

日期：2026-10-26。基準為正式第500版，提交 `cf9bb12a6b8e9d814f7040c81a73c32adb22b581`。本批先修復、測試並保存修復分支，不部署正式站。

## 使用的 GameDev Skills

已讀取 `AGENTS.md`、`docs/PROJECT_MAP.md`，以及 GitHub `codex/game-dev-skills-20261026` 分支的 [GAMEDEV_SKILLS.md](https://github.com/darkrpgidle/dark-world-rpg/blob/codex/game-dev-skills-20261026/docs/GAMEDEV_SKILLS.md)。該技能分支未合入正式第500版；本批以第500版程式為基準，沒有用較舊技能分支覆蓋遊戲。

- [performance-optimization](https://github.com/darkrpgidle/dark-world-rpg/blob/codex/game-dev-skills-20261026/.agents/skills/performance-optimization/SKILL.md) 與 profiling-and-budgets：先量測，再降低重複工作與排程成本。
- [game-feel](https://github.com/darkrpgidle/dark-world-rpg/blob/codex/game-dev-skills-20261026/.agents/skills/game-feel/SKILL.md) 與 feedback-recipes：回饋只讀已結算命中，不阻塞模擬，換怪與背景清理。
- [save-systems](https://github.com/darkrpgidle/dark-world-rpg/blob/codex/game-dev-skills-20261026/.agents/skills/save-systems/SKILL.md) 與 versioning-and-migration：資料與顯示分離，保留舊存檔及現有CAS／登入／領獎驗證。

## 已確認的瓶頸與修正

1. 像素預備原本每32列固定建立一個0ms timer。小片工作也支付巢狀timer等待成本，第四章共2,020次。新增 `asset-work-budget.ts`，在既有列／影格邊界檢查4ms工作預算；時間到才讓出主執行緒。支援原生scheduler及timer備援，每次檢查／讓出後均驗證取消。像素公式、校準、影格留白及素材檔案不變。
2. 雙蟒施放與纏身同時顯示時，每層各讀一次相同戰鬥框與肖像，共6次DOM矩形讀取，並與Canvas／樣式寫入交錯。現在先讀本影格全部錨點，同場景各層共用一次（3次矩形讀取）；下一影格重新讀取，resize／位移不使用跨影格舊快取。

戰鬥仍為既有50ms時鐘；普通攻擊、怪物技能及玩家奧義並行，首領兩招交替；各段倍率、命中／閃避、DOT與回血時序不變。預備工作只發生在讀取門檻；未完成全部怪物／職業素材前不開打，失敗、重試、取消及舊回呼防護維持。

## 同環境量測

在 managed preview 的隔離頁直接呼叫實際素材預備及戰鬥／渲染模組，以小型計數器記錄排程及座標讀取；素材全部來自既有WebP，未使用正式帳號或存檔API。

| 項目 | 第500版 | 修正版 |
|---|---:|---:|
| 第四章104張怪物素材預備，暖快取 | 8,659ms | 2,769／2,890ms |
| 第四章實際讓出任務次數 | 2,020 | 321／317 |
| 第三章18張怪物素材預備，參考樣本 | 5,578ms | 3,200ms |
| 雙蟒施放＋纏身，每影格矩形讀取 | 6 | 3 |

第四章修正版兩次平均2,829.5ms，較暖快取基準縮短約67%。基準第一次含冷讀取為8,832ms，不拿它計算暖快取改善。

此為開發預覽的隔離量測，並非正式建置的裝置FPS測試。雲端瀏覽器RAF多次受限接近每秒1次，因此不以其影格率推論手機／電腦遊玩FPS；單次長工作仍被觀察到（第四章修正版52～58ms，第三章樣本93ms；第一章重試樣本9次、最長89ms）。本批未改素材解析度或GPU讀回策略，不能宣稱所有卡頓已消失。

## 回歸與界線

- `asset-work-budget.test.mjs`：100ms小片工作約24～25次讓出；超時工作、瀏覽器延遲、取消、原生scheduler與timer備援。
- `real-monster-renderer-runtime.test.mjs`：實際渲染器的多層錨點讀取順序／resize、未命中／零傷／舊目標不震動；沒有RAF時亡靈衝鋒仍在1750／2000／2200／2450／2700ms各結算一次100%，僅排一個RAF；背景與卸載清理。
- 既有真實模式測試仍覆蓋24招、冰凍、首領交替、死亡中止、逐段HP呈現、預載重試／取消／快取及React StrictMode。完整套件另覆蓋舊檔、session取代、每日重置與獎勵防重複。
- 瀏覽器確認修正版四章素材均可完成預備，第一章取消後可重新讀取。20秒黑鐵首領對照前後均為5次施放、18次唯一命中（含DOT）；修正版巨鱷20秒為4次施放、10次唯一命中。收尾後Canvas均為0。
- 本批不修改 `balance-config.ts`、戰鬥規則、存檔schema7、D1結構或存檔API。隔離播放的命中採固定測試傷害，驗證排程與去重，不作平衡評估。正式帳號雲端端到端、手機實機與GPU效能尚未驗證。
- 臨時量測頁不納入提交或正式建置。

本批檢查結果：`npm test`（含正式建置）1,042項全部通過；`npx tsc --noEmit`與`git diff --check`通過。修改範圍為三個程式模組、兩個測試檔，以及本紀錄／`REAL_MODE.md`／`PROJECT_MAP.md`，共八檔。
