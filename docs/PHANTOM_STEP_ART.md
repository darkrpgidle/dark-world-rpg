# 幻影步：水波虛影與高速殘影

- 圖集：`public/vfx/phantom-step/wind.webp`，1536×1024，3×2 六格，保留生成圖 Alpha。
- 使用內建 imagegen 生成風絲與碎光；人物虛影使用目前玩家立繪，不生成固定人物。
- `app/ranger-phantom-step-vfx.tsx`：WebGL 以 20 條來源切片繪製兩道透明人物虛影，逐條水平波動；Canvas 2D 備援使用相同切片。人物本體與戰鬥框固定。
- 啟動 450ms 風絲展開，持續時循環第 2～3 格與輕微輪廓波動；剩餘次數依實際防禦狀態，不以時間推算。
- 成功閃避 550ms 殘影向兩側拉開，風絲收束消散；昇華保證閃避實際消耗時，人物切片逐段碎散。
- 下一擊暴擊率與下一主動技能暴擊傷害的待用加成，分別以青色亮光與銀青光環顯示；實際消耗才清除。
- 原本的「閃避！」由戰鬥結算顯示，不重複產生；無全場震動、無額外傷害結算。
- 玩家死亡、戰鬥結束、離開戰鬥及元件卸載清理；普通換敵依原規則保留尚未消耗的防禦次數與加成。減少動態效果使用靜態虛影與風絲，不扭曲抖動。

## 生成提示詞

Use case: stylized-concept. Asset type: transparent hand-painted dark fantasy RPG VFX animation atlas, 3 columns by 2 rows, six equally sized cells, read left-to-right top-to-bottom. Subject: delicate cyan blue wind wisps and watery space distortion around an EMPTY upright human-shaped central area; NO actual human, no face, no clothing, no weapon. The game overlays its own character portrait. Frame 1 tiny wind arc awakening at feet, frame 2 wisps rising along both sides, frame 3 two displaced watery cyan contour trails, frame 4 quick outward stretched wind trails with a small broken silver-cyan light shimmer, frame 5 curls returning toward center, frame 6 tiny fading wisps. Keep central area transparent and empty; sparse thin painterly strokes, readable at small size, each frame contained within its cell with broad transparent margins. Authentic transparent background, no checkerboard painted, no grid lines, no text, no watermark, no ground or environment. Restrained brightness, fantasy wind not electronic glitch.
