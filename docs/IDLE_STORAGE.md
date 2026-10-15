# 掛機儲存時間

2026-10-03：修正主控掛機條漏秒。`app/idle-storage-clock.ts` 是瀏覽器顯示時鐘，`app/idle-claim.ts` 與 `app/save-integrity.ts` 是可領取時間的伺服器權威。

- 有效角色存檔載入後，獨立時鐘以 `performance.now()` 的實際差值累積。奧義、死亡倒數、換怪、首領、技能／背包頁、收益確認視窗不暫停計時；effect 不依賴戰鬥狀態。
- 背景節流或忙碌使 interval 延遲時，下一次回呼補上整段時間；不以回呼次數作為秒數。換怪不丟棄小數秒。介面仍只顯示完整秒，總上限 43,200 秒。
- 登入失效／被取代、維護及讀檔未就緒時停止本機計時；重新載入／恢復的可領取時間由伺服器結算。
- 同步回應與本機計時涵蓋同一段時間，取較大的顯示值，不能相加。舊版本回應忽略；領取、輪迴、重讀存檔增加 epoch，讓先前請求不能復活已消耗時間。
- 雲端普通存檔、恢復與領取都以伺服器 `lastSeenAt` 和伺服器現在時間計算；不採用客戶端提交的累積秒數／時間戳。延遲的普通存檔不再把可儲存時間截成 90 秒，戰鬥資源額度原有 90 秒限制保留。
- 領取先結算尚未存檔的實際時間，再於既有有效 session／CAS 寫入中清零。相同 claimId 重送僅回覆原收據，不重複結算／消耗。伺服器與本機保留小數秒；頻繁恢復不再向下取整漏秒。
- 沿用既有存檔欄位、收益公式與領取流程；不改每日重置、收益倍率或新增資源。不對玩家歷史時間做推估補發。

測試：`tests/idle-storage-clock.test.mjs` 執行頁面實際獨立計時 effect，涵蓋 60 秒、戰鬥暫停／換怪／首領、節流、切頁、上限、舊回應、claim／輪迴重置與小數秒；既有 claim、防重送、存檔安全與輪迴測試保留。

## 提交後回應遺失與並行重送驗證（2026-10-11）

`tests/idle-claim-fault.test.mjs` 直接取出實際 API 的 `claim_idle` 分支與頁面的 `claimOfflineReport` 函式執行，資料庫使用隔離 SQLite 與非同步 adapter。涵蓋提交後丟棄回應＋32 次同 ID 並行重送、32 個舊版本讀取的 CAS 競態、不同 ID 的競爭、讀取後登入被替換、普通存檔收益額度不因收據重送再增加，以及 32 次同時點擊下前端自動重試且只發放一次本機收益。

執行：`node --test tests/idle-claim-fault.test.mjs tests/idle-claim.test.mjs tests/save-integrity.test.mjs`，34 項通過。收益額度在後續存檔可能依既有上限縮減；測試驗證不增加，不假設完全不變。

限制：非正式站 HTTP／D1 實測；未驗證真實網路、驗證 cookie／session 的 HTTP 入口、完整普通存檔 API 或瀏覽器重載後的結算恢復。結算仍是伺服器消耗秒數、客戶端計算收益、普通存檔驗證額度的既有分段流程；不能宣稱全部獎勵已在單一服務端交易中提交。本次只加入測試與紀錄，未更動正式遊戲邏輯。

## 同步積壓與恢復驗證（2026-10-11）

`tests/save-sync-backlog.test.mjs` 執行頁面实际普通存檔 effect，以可控時間與 fetch 注入測試：

- 已重現缺口：普通存檔 fetch 沒有应用層期限；請求兩分鐘不完成时，`saveInFlightRef` 仍為 true，最新待送進度無法提交，狀態停在「儲存中」。此測試記錄缺口，不代表逾時恢復已修好。
- 原請求恢復成功後，100 次狀態變更只再送出一份最新快照，成功後不持續重試。
- 網路 reject 會解除在途鎖，存在待送狀態時可重試成功。
- 普通等待／成功／網路 reject 路徑未觸發戰鬥停止或雲端重載；既有戰鬥恢復與獨立時間測試通過。沒有證明正式站 1HP／不刷怪由同步請求卡住造成。
- 同一寫入者較舊 sequence 被識別為 already applied；本次沒有完整 HTTP／D1 或普通寫入交易實測。

六個相關測試檔共 50 項通過（backlog、combat-sync-stall、idle-storage-clock、idle-claim-fault、idle-claim、save-integrity）。額外 combat-playback-guard 測試因缺少 typescript 依賴未能載入，未算入通過數。本次僅驗證與紀錄，未修正同步邏輯或部署。後續應加入涵蓋 fetch 和讀取 response body 的截止時間，並確保終止前已提交的請求仍可安全重送。

## 普通存檔期限與安全重送修正（2026-10-11）

前述沒有逾時的缺口已修正：`app/save-request.ts` 的 `saveJsonWithTimeout` 以 15 秒總期限涵蓋 fetch 與 JSON body 讀取，期限到時 abort 並拒絕 Promise。即使底層不遵守 abort 或回應遲到，Promise race 也不再把其結果交給頁面成功處理器。finally 清除 timer；頁面既有 finally 釋放 `saveInFlightRef`。

普通存檔失敗主動排程重送，不再依賴其他狀態變更喚醒。連續失敗從 1 秒起指數退避，基準最高 30 秒，加入 ±20% 隨機延遲；實際排程也遵守原有存檔防抖。成功後清除退避。待送狀態仍合併為最新完整快照；重送時沿用目前 request ID，但遞增同一客戶端 sequence。服務端以 session、sequence 與版本 CAS 判定：若舊请求在 abort 後仍提交，後送新 sequence 可以保存最新完整状态；若新 sequence 先提交，舊 sequence 不得覆寫。此為普通快照重送，不會再次呼叫離線領取或生成獎勵，仍受既有收益額度驗證。

backlog 測試已改為驗證修正行為，增加回應 body 卡住、逾時後遲到回應與多次失敗退避；六個相關檔案共 52 項通過。未執行完整建置／浏览器或正式 D1 網路實測；本修正尚未部署。這次僅涵蓋普通自動存檔，不改技能、裝備、領獎等專用操作 API。

## 正式站 D1 網路驗證（2026-10-11，正式版本 488）

以正式 `https://darkrpgidle.fun` API 和獨立測試角色驗證，未部署新逾時修正，未修改既有玩家。第一輪在首次 claim 回傳 accepted:false 時停止，第二輪改以實際讀回資料判定提交，完成核心驗證。

- 普通存檔首次回應 accepted:false，但 GET 讀回 sequence=1 且 request ID 相符，證實寫入成功；同快照四次並行重送均 HTTP 200／accepted:false。
- 離線 claim 首次回應 accepted:false，但讀回 claim ID 相符、storedSeconds=0，證實時間已消耗。四次並行重送都回傳相同的 32.759 秒收據，沒有再次接受；重送前後 updatedAt 與金幣、元寶、強化石、storedSeconds 不變。
- 新登入後，舊 session 重送 claim 得到 HTTP 401／session_replaced。
- 客戶端端到端並行重送耗時約 6.2～7.3 秒，包含執行環境代理／網路成本，不能當作 D1 查詢耗時。
- 最新 session 的 logout 呼叫回傳 HTTP 409；未進一步讀回驗證是否已刪除 session。

新發現：真實提交成功卻回報 accepted:false。`getDb` 使用 drizzle-orm/d1，而普通存檔與 claim 分支只用 result.rowsAffected 判断成功。以 meta.changes-only 的 SQLite adapter 回傳，能重現首個 claim 提交成功後被當成重送回覆 accepted:false（新增 fault characterization 測試）。這支持 D1 寫入結果格式不相容的診斷，尚未直接取得線上原始 D1 result。deleteSession 同樣只讀 rowsAffected，可能解釋 logout 409。普通存檔 accepted:false 若帶有 save，前端会暂停战斗并重载；是可造成不必要同步重載的具體路徑，尚非正式站 1HP／不刷怪根因證明。

未進行正式站負載壓測、伺服器故障注入或實際切斷 TCP 回應；「丟回應」是 API 提交後由測試呼叫端忽略成功回應，再走真實網路重送。15 秒逾時版本仍僅在源碼，正式站本次不能驗證該修正。

測試帳號保留：synctest_166cc5f0（player 46407f94-ed11-4fc2-920d-cce0d7538c11）、synctest_cd2962c3（player 02c42b24-baa2-41a3-943c-c927851f46f4）。未刪除帳號；密碼與 session 憑證未寫入檔案。後續可由 GM 刪除這兩個測試角色。

## D1 寫入回條修正（2026-10-11）

`app/d1-write-result.ts` 共用 `affectedRows` 優先讀原生 `meta.changes`，相容其他 adapter 的 `rowsAffected`；meta.changes=0 不得被其他欄位的非零值覆蓋。普通存檔、離線結算／領取、每日獎勵、線上收益、技能／装备操作，以及存檔恢復的成功分支改用此判定；logout 刪除 session 也改用共用判定。不更改資料表、收益公式或 session／版本 CAS 條件。

D1 格式的首次 claim 測試改為要求 accepted:true，零變更仍走原有拒絕／重試流程；增加實際 deleteSession 函式的 D1 metadata 測試。與 15 秒普通存檔逾時修正一同準備部署。

部署前驗證：`npm test`（含正式 vinext build）955 項通過；`tsc --noEmit` 通過。正式 API 驗收項目為首個快照 accepted:true、首個 claim accepted:true、同操作並行重送不改版本／資源、取代登入拒絕舊 session，以及 logout HTTP 200 後舊 cookie 不再登入。資料庫結構不變。

### 第 489 版部署後正式驗收

部署成功，執行碼提交 `ccfd0c64d7aaf51656f4d4b445663fe590d99aa4`。正式網域實測：首次普通存檔 accepted:true、讀回 sequence=1 且 request ID 相符；四次同快照並行重送 accepted:false。首次離線 claim accepted:true，讀回 claim ID 相符且 storedSeconds=0；四次並行重送返回相同 33.035 秒收據，updatedAt、gold、yuanbao、enhanceStones、storedSeconds 不變。新登入取代舊登入後，舊 session claim HTTP 401／session_replaced。最新 session logout HTTP 200，隨後相同 cookie 查詢 auth HTTP 401，證實登出完成。

本輪測試帳號 synctest_98d7a6f2（player 3fc9b661-5c75-43c5-bd82-35d4ffe740c3）已登出，帳號與角色仍保留供 GM 清理；未修改正常玩家資料。15 秒逾時／遲到 body／退避仍以隔離故障注入驗證，沒有在正式站故意中斷服務或做負載壓測。
