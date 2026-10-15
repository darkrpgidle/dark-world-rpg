# 獵殺標記與死亡鎖定

## 資產與播放

- 內建 imagegen 生成兩張透明手繪圖集，均為 1536×1024、3×2 六格。
- `public/vfx/hunter-mark/mark.webp`：青綠／淡金狩獵準星，前三格光線收攏與鎖定，後三格持續循環。
- `public/vfx/hunter-mark/burst.webp`：符文向內刺入、亮點壓縮、尖銳爆破、碎片與光屑消散。
- `app/ranger-hunter-mark-vfx.tsx`：一個 Canvas 繪製印記、三個暴擊符文與所有追加爆破；WebGL 為主，Canvas 2D 共用圖集備援。
- 印記貼在敵人框水平中央、高 44% 的胸前位置，尺寸為框寬 58%，最大 110px；依實際框尺寸縮放，PC／手機同一規則。印記最後 300ms 淡出與碎光消散。
- 昇華符文依實際標記暴擊累積點亮，包括多段技能各自確認的暴擊，不以動畫格數計數。
- 三次暴擊僅準備爆破；下一主動技能成功命中才產生死亡鎖定追加事件。爆破是否命中、是否暴擊與裝備倍率取戰鬥結算結果，不另擲亂數。
- 爆破接在觸發它的主動技能傷害顯示回呼之後；六格／650ms，第 3 格 200ms 顯示獨立「死亡鎖定」傷害字。落空只顯示收束與消散，不播放命中爆發格。
- 追加傷害從同次已結算主傷害拆分顯示，總傷害、扣血、戰鬥計時與存檔結構不變；可與追風箭昇華箭同時拆分。
- 標記到期／怪物死亡清除印記，爆破可完成本次回饋；切換戰鬥與卸載清除待用回呼、RAF、監聽器與紋理。減少動態效果使用靜態影格，不震動。
- 三符文已充滿時，待用爆破指示依實際 pending 狀態保留至消耗，不依標記時間臆測取消。

## 印記生成提示詞

Use case: stylized-concept. Asset: transparent dark fantasy RPG skill sprite atlas, 3 columns and 2 rows, six equal square cells, read left-to-right top-to-bottom. A small elegant hunter targeting sigil, deep teal green with pale gold highlights. No creature or character. Six successive animation frames: 1 four thin inward approaching light strokes, 2 strokes form an angular pointed diamond crosshair, 3 complete compact hunter emblem with a delicate broken circular outer ring, 4 gently brighter complete emblem, 5 softly rotated outer ring around SAME stationary central diamond emblem, 6 complete emblem with subdued glow. All cells centered identically, emblem size consistent frames3-6. Leave broad transparent margins, central opening empty, fine hand-painted sharp strokes, restrained luminosity, clean readable at small size. No text, no numbers, no grid lines, no environment, no background, true alpha transparency. Do not paint the three charging dots; game renders them separately.

## 爆破生成提示詞

Use case: stylized-concept. Asset: transparent dark fantasy RPG hunter mark detonation VFX atlas, 3 columns 2 rows, six equal square cells read left-to-right top-to-bottom, each effect centered with transparent margins. Colors deep teal green and pale golden highlights, painted thin sharp fantasy strokes. Frame1 three tiny angular glyph light shards rushing inward around a small hunter diamond sigil; frame2 compressed bright point; frame3 sharp compact radial teal-gold crystalline light burst with thin pointed spokes; frame4 expanded broken ring and scattered sharp small luminous shards; frame5 dissipating fine shards; frame6 sparse fading teal gold motes. No person, no monster, no weapon, no text or numbers, no cell borders, no environment or ground, genuinely transparent background. Small localized chest-sized burst, not huge explosion; constant center anchor in all frames.


## 2026-10-05 重製（目前使用）

- imagegen生成單張 `public/vfx/hunter-mark-v2/frames.webp`，1254×1254 RGBA，4×4／16格，來源名義格寬313.5px；WebGL／Canvas2D以相同分數格邊界向內取样，保持原尺寸與Alpha，不放大來源。
- 第1–4格：三道爪痕聚集、金色獵眼睜開、透空獵眼印記／輕眨；第5–6格：獨立青綠刃符／金白亮刃符；第7格：命中三爪痕；第8格：昇華已鎖定獵眼；第9–16格：三刃收網、壓縮、三爪斬爆、碎片至光屑消散。
- 400ms施放時三枚刃符由外圍收向胸前，標記普通尺寸為敵框寬80%、最大150px，胸前44%高度。持續中央透空，三刃約34度／秒繞行；獵眼每1800ms換輕眨格。命中脈衝180ms印記略收緊並閃出爪痕；普通成功命中也有回饋，不增加暴擊計數。
- 昇華依引擎0–3次實際暴擊逐一將青綠刃符換成金白格；三次／pending後停止繞行，刃尖朝內，中央獵眼鎖定。保持原下一主動技能命中才觸發死亡鎖定，不增加傷害或改變獨立命中／暴擊。
- 追加爆破仍650ms，影格時間0／100／200／275／350／425／500／575ms，第3格200ms沿共用傷害層發布一次已結算數值。落空僅第1–2格收網與淡出。推圖／個人／世界首領仍用原入口，不增加浮字DOM。
- 單Canvas含標記、刃符與所有爆破，z-index7高於怪物、低於共用跳字12，WebGL／2D共用旋轉與UV。減少動態採固定獵眼／刃符與爆破，無繞行、爪痕動作或震動。到期300ms淡出，pending超時保留至真實消耗；換怪、登入替換與卸載沿既有清理。
- 測試覆蓋兩renderer、三刃繞行／實際暴擊亮起／鎖定停止旋轉、普通命中爪痕、慢載入200ms命中、落空、並行爆破去重、手機邊界、減少動態與卸載；實際React戰鬥回呼及引擎暴擊／爆破規則亦驗證。
