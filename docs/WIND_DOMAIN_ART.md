# 風行領域：疾風羅盤

採用使用者確認的第二版外觀：低矮橢圓羅盤、银青箭羽符紋、向右水平風線；昇華加入淡金外環。沒有直立風柱或角色虛影，保持與幻影步不同的輪廓。

## 素材與播放

- 內建 imagegen 生成透明 1536×1024、4×3 圖集；原圖 `exec-a2562c7b-8129-4d75-b8da-586cfef96100.png`。
- 保留原始 alpha 轉為 `public/vfx/wind-domain/compass.webp`；未重新繪製使用者已核准的圖片。
- 第 1 排 4 格啟動，共 400ms；第 2 排 4 格一般循環；第 3 排 4 格昇華循環。結束使用現有循環格透明淡出 250ms。
- 同一 Canvas／同一圖集，WebGL 失效時以新的 Canvas 2D 備援；一般透明合成，不加全場震動。
- 以玩家框即時尺寸定位腳下，圓環中心下移至框底部外 1.5% 身高；地面圖垂直投影壓至原比例 58%，呈現低矮透視橢圓。不同圖列使用各自的腳下中心錨點，校正戰鬥框 CSS 縮放。
- 後弧以 `wind-domain-depth.ts` 計算玩家肖像框遮擋區域，保留框外側弧與腳下前緣；同時裁切目的矩形與來源 UV，形成前後穿繞的偽 3D，不把整圈與光霧蓋在角色腿部。維持同一 Canvas、原圖集，WebGL／Canvas 2D 一致，無新增角色貼圖或重繪。
- 一般攻擊短暫提亮風線，玩家立繪保持固定；支援減少動態效果的靜態展示。

## 實際技能狀態

`ranger-wind-domain-state.ts` 讀取戰鬥中的 `RangerWindDomain`，不另算充能、命中、暴擊或技能數值。啟動後持續 8 次玩家行動；昇華疾風層数只依戰鬥規則實際值呈現，最多 5 層。金色格混合比例隨層數從 30% 增至 95%，循環每格從 180ms 加快至 110ms。

普通怪物轉換保留領域剩餘行動；切地圖、重生、開始／退出首領戰等既有戰鬥重置時清理。增益耗盡淡出後，帶施放鍵的回呼只能清理對應舊狀態，不會刪除重新啟動的領域。技能本身沒有新增傷害跳字，既有攻速、普通傷害減益與昇華規則維持不變。

## 生成提示詞

```text
Use case: stylized-concept. Asset type: transparent hand-painted dark fantasy RPG buff VFX concept sprite sheet for ranger WIND DOMAIN, new visual direction: a low horizontal GALE COMPASS beneath the player's feet. 4 columns by 3 rows, twelve distinct equally sized cells aligned on a regular grid. True transparent alpha background. NO characters, NO upright curling ribbons, NO ghost silhouettes, NO rising flames, NO tornado, NO tall vertical vortex. Shape language: flat elliptical compass ring viewed from slight elevation, crisp segmented wind tracks, fine etched arrow-feather motifs, sharp feather-shaped luminous wisps sliding horizontally towards the RIGHT. Clear center reserved for feet. Elegant hand-painted fantasy illustration matching premium 2D RPG spell assets, finely detailed restrained light, teal and silver-white normal state, pale gold and cyan-white ascended state. Every cell has generous transparent padding; all art remains inside its cell; no overlap. Consistent floor ring scale, center and perspective across all cells. Row1 four progressive activation frames: faint short compass arcs appear, etched silver feather motifs spread clockwise, the ellipse completes, then a clean short wind pulse sweeps RIGHT along the ground. Row2 four sustained loop frames: a thin precisely shaped flat turquoise silver gale compass, four stylized arrow-feather compass marks on the ring, two or three horizontal slender razor wind streaks streaming to the right, rotating small light beads, quiet empty space above. Row3 four ascended loop frames: same low planar compass with a second slim segmented pale-gold outer track, brighter cyan-white arrow-feather compass marks, tiny gold sparks and sharper rightward wind streaks; stronger but controlled, no exploding light ball. The silhouette MUST be a wide low floor platform and directional horizontal wind, noticeably unlike a body aura or phantom-step ghost effect. NO labels, NO letters, NO numbers, NO grid outlines, NO background or environment, no opaque floor disk.
```


## 2026-10-05 重製（目前使用）

- 新圖集 `public/vfx/wind-domain-v2/crown.webp` 為4×3／12格：啟動4格、一般循環4格、昇華循環4格。imagegen重繪多層銀青羽刃冠環、交織風流與懸浮箭羽；昇華為獨立金白外冠與五枚金色外緣晶珠。生圖後清理相鄰影格光霧與透明留白，不放大原生來源。
- 啟動400ms、耗盡250ms淡出不變；一般循環每格160ms，昇華依實際0–5層加快至110ms。昇華图列混合由30%增至95%，真實攻擊時短暫提亮，無新增傷害、層數或攻速規則。
- 寬度為玩家框2倍、最大330px及場寬55%；地面圖垂直投影80%，提高羽刃與分層風環的可讀性。腳下中心仍為玩家框底外1.5%高度，依來源錨點校正圖列，避免啟動／一般／昇華切換位移。
- 沿用 `windDomainVisiblePieces` 同時裁切來源UV與目的矩形，後弧避開角色肖像、前弧留在腳下；不把霧或完整圖層覆蓋角色。PC／手機即時定位，單Canvas WebGL／2D共用圖集，無全場震動，減少動態只顯示固定圖格。
- 普通换怪保留剩餘8次行動領域，戰鬥重置／登入替換清理；耗盡與重新啟動保持舊鍵完成回呼去重。未載入／素材失敗仍能清除到期領域，不阻塞掛機。
- 驗證既有 `wind-domain-playback.test.mjs` 與 `wind-domain-state.test.mjs`：實際層數金色提亮、淡出／重啟去重、慢載入／失敗、手機邊界／縮放、角色遮擋與前後弧、減少動態。

- 圖集成品1448×1086／每格362px。採原始完整循環素材；生圖修整版的循環被改成成形階段，未使用。圖集打包逐格處理：Alpha低於24的雜霧移除，邊緣12px羽化，各格縮至300px並補31px真正透明留白，重新封裝4×3，不放大來源；成品所有格邊留白Alpha總和為0，避免串格／方框。
- 打包後各列腳下中心錨點為0.592／0.554／0.492，WebGL與2D共用同一補償；切換到昇華時不因素材原本較高而位移。


## 2026-10-05 已確認風流樣稿版（目前使用）

- 依使用者核准的銀青／金白側面風流樣稿，改用 `public/vfx/wind-domain-v3/aura.webp`：1086×1448、3×4、每格362px，普通6格、昇華6格，沒有角色或冠環。imagegen依樣稿生成，逐格打包清除低Alpha雜霧、保護中央角色區、18px透明留邊；326px圖像置回362px格，不放大來源。
- 銀青細風刃沿玩家兩側由下往上掠過，下方少量風絲朝右；昇華加入獨立金白羽光。兩相鄰影格交叉淡化，不將造型壓扁成地面環。
- Canvas前景覆蓋角色框周邊，使用肖像高度98%、保持來源比例、置中於角色；邊界限定角色框內，避免外部名字與血條。只對`.equipped-title`文字區域裁切來源與目的矩形，不再挖掉整張角色卡片，防止長方形斷口。
- 啟動400ms漸入，耗盡250ms淡出；6格循環每格160ms，昇華實際0–5層加快至110ms並把金色混合由30%增至95%。攻擊短暫提亮，角色不位移、不新增傷害。z-index7低於共用跳字。
- 保留原8次行動、普通換怪未耗盡領域、戰鬥重置與失敗清理。WebGL／2D共用UV與裁切、減少動態靜態圖格。測試改驗證直立比例、外部名字／血條保護及既有淡出／層數／換怪規則。
