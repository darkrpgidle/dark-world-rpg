# 部署規格

## 正式環境

- Sites 專案：`dark-world-rpg`
- 專案 ID：`appgprj_6a90facf59b08191a3f2ca1ed79e96f2`
- 正式網域：`https://darkrpgidle.fun/`
- `.openai/hosting.json`：D1 binding 為 `DB`，R2 未啟用。
- 不建立新站；沿用既有 repository、專案與玩家資料。

## 標準流程

1. 確認工作樹只含本次任務修改。
2. 執行最小相關檢查；程式異動至少執行 `npm test`。
3. 文件異動需檢查 Markdown 路徑與 `PROJECT_MAP.md` 導航。
4. 提交後推送 `main`，提交 SHA 必須與本機 `HEAD` 完全一致。
5. 由該提交建立 Sites 版本並部署到既有專案。
6. 檢查部署狀態；只有平台成功且正式網址可用，才回報已公開部署。

## 資料安全

- 不變更 `project_id`、D1 binding 或存檔 schema，除非任務明確要求。
- 資料結構變更必須提供相容讀取或 migration。
- 部署失敗時保留目前正式版本，不以建立新站規避。
