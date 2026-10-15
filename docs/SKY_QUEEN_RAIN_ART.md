# 蒼穹箭雨・奧義／萬矢天罰

## 2026-10-05 分層重製（目前版本）

女皇形象以使用者提供的金髮、藍眼、花冠、金色翡翠飾品與白金花衣為準；新素材位於 `public/vfx/sky-queen-rain-v2/`。女皇／天空箭陣／箭矢／命中各自獨立透明圖集，不使用合成整個戰場的影格。女皇、箭陣、箭矢各2×4（普通0–3、昇華4–7）；命中4×4（普通0–7、昇華8–15）。所有來源尺寸由圖檔讀取、共用WebGL／Canvas 2D來源矩形。前三圖1024×1536、命中1252×1252。另以 `frames/` 匯出40張獨立透明WebP影格，遊戲用四張圖集批次載入以降低請求量。來源有少量不等分列，打包先按透明間隙量測分界、各格等比縮至90%內再補透明邊，箭尖使用打包後實際量測錨點；沒有放大原始圖。

女皇兩格闭眼：0–340ms祈禱、340–740ms抬手；740ms第三格首次睜藍眼，独立聖氣影格在胸前／身後四散羽光和花瓣至1120ms；970ms第四格展手。四姿態相同目標矩形／腳點，完整身體依玩家框與canvas可用上方高度縮放、不換大小或位移。昇華同一女皇、增加紫金羽翼。

天空箭陣970ms後出現：普通金白翡翠單層、昇華紫金多層，圖像已畫斜向右下約25度的透視橢圓平面，有前後緣厚度，避免水平圓盤。四格開啟、展開、旋轉、消散，整個箭陣僅±.05rad慢擺、保持斜置透視。

八次雨箭1320–2020ms每100ms命中、主箭2440ms、2920ms收尾不變。各箭留下獨立430ms尾流並從天空向右下傾落；命中才播星芒和短暫細傷口。昇華額外12道淡箭流僅視覺、不發布傷害回呼。實際前八箭的命中暴擊逐枚在怪物周圍點亮印記，主箭強度跟隨真實印記。普通主箭金白羽形光浪；昇華主箭紫金向上星光柱，獨立四格衝擊／扩散／碎羽／淡出。

仍只有一個技能Canvas與9個實際命中／落空回呼、共享傷害層、既有奧義鎖、真實已結算傷害分配、世界王期限與勝利延後規則。全部4圖載入後開始時鐘；任一圖失敗／5秒逾時釋放剩餘9段顯示與奧義鎖一次。減少動態用靜態女皇／箭陣／命中格、300ms完成，不震動；卸載取消所有圖回呼、RAF、觀察器及自有震動。本次沒有修改存檔、登入、每日重置、獎勵或技能數值。

## 以下為原版歷史規格


第 397 版後新增的獨立奧義演出。一般金白聖光、昇華紫白金紋；同一位精靈女皇固定在玩家後方祈禱，背後箭矢升空，再由場外折返落向敵人。透明手繪素材以 imagegen 生成，PNG 轉 WebP 保留 alpha；原圖 1448×1086，實際不等分來源矩形記於 `app/ranger-sky-queen-rain-vfx.tsx`。

## 素材與播放

- `public/vfx/sky-queen-rain/normal.webp`、`ascended.webp`：各包含四種女皇姿態、升空／落下箭、雨箭星芒、主箭、爆裂和消散。
- 單 Canvas，以 WebGL2 優先；初始化失敗／context lost 換新 Canvas 使用 2D，同一 atlas、錨點與時間線。
- 實際載圖完成後起算 2920ms。祈禱 0–740ms，展手 740–970ms；八箭 1320–2020ms，每 100ms 命中一次；主箭 2440ms，2920ms 清理。
- Canvas 向頂部延伸 16%、側邊各 8%，場外箭尾和碎光可超出固定戰鬥高度；女皇固定腳點，圖像保持比例。PC／手機使用雙方肖像即時 DOM rect，抵銷震動導致的座標縮放。
- 一般／昇華特效都覆蓋玩家立繪：玩家層級 2、奧義 Canvas 7、傷害字 10，讓女皇與箭雨完整可見。
- 八次雨箭各自命中才輕震 85ms；主箭命中才整個戰鬥框強震 440ms，桌機 16px／手機 9px。雨箭數字左右错開，主箭 36–60px 大字附擴散光環。
- 昇華只根據前八箭的實際命中暴擊逐枚強調蒼穹印記，最多 8；主箭視覺強度隨層數提高。保留既有每層 +6 個百分點、最多 +48 的規則；主箭暴擊不增印記。

## 戰鬥與生命週期

- `LiveCombatAction.skyArrows` 傳遞已結算的九段命中、暴擊與傷害權重，不增加 RNG、段數、傷害或終極能量。
- 傷害仍一次結算；顯示按已扣 HP 總量（含 overkill 限制）分配成九段，獨立被動追加保留為追加字。元素、DOT 與獵殺標記爆破在主箭回呼顯示，避免重複總傷害字。
- 使用既有奧義鎖，完成回呼才恢復雙方攻擊，包含同 tick 到期的敵人攻擊。擊殺時保留原目標直到演出結束才進入下一敵人／勝利；不二次扣血或重複領獎。
- 世界王原有 60 秒真實時間期限不延長；蒼穹箭雨演出期間延後超時處決，演出後再檢查原期限。
- 圖檔錯誤／5 秒載入逾時釋放九段顯示及奧義鎖一次；切戰鬥清理數字與待處理勝利，無殘留。減少動態效果使用 300ms 靜態展示，不震動。

## 生成提示詞

### 一般版

Use case: stylized-concept. Asset type: transparent hand-painted fantasy RPG ultimate skill animation sprite atlas, NORMAL version of Sky Queen Arrow Rain. Produce ONE landscape sprite sheet, 4 columns by 3 rows, exactly twelve separate cells, read left to right top to bottom. Real alpha transparent background, NO painted checkerboard, no scene, no text, no labels, no grid lines. Consistent exquisitely painted high fantasy 2D game art, ivory gold holy light and restrained pale cyan, strong readable silhouettes. Each cell entirely isolated with generous transparent margins and no neighboring bleed. Row1 cells1-4: SAME beautiful adult ELVEN QUEEN spectral full body, silver-white long hair, slender pointed ears, elegant gold crown, flowing dignified white gown, facing slightly right, same size, feet at identical baseline, no translation. 1 faint apparition closed eyes palms together at chest in prayer; 2 brighter prayer with a circular ornate gold sacred rune halo BEHIND her upper body; 3 opens eyes, begins spreading hands, eight luminous slender arrows forming as a fan BEHIND her shoulders pointed upward; 4 hands gently open, the eight arrows rising skyward from behind her, white-gold spiritual light and flowing hair, queen remains stationary. No bow held by queen. Row2 isolated reusable ARROW sprites without queen: cell5 single slim holy arrow pointing straight up with short gold tail; cell6 same ascending arrow longer radiant tail; cell7 arrow slanting DOWN RIGHT with long elegant curved trail entering from top-left; cell8 stronger same down-right descending rain arrow with crisp gold head and ivory core. Row3 isolated IMPACT and FINISHER sprites: cell9 small sharp rain-arrow impact starburst with fine golden shards; cell10 a monumental ornate divine MAIN ARROW slanting DOWN RIGHT, much heavier than rain arrow, winglike gold light on shaft, radiant white core and long trail; cell11 enormous main-arrow holy impact, bright compact white center with expanding gold circular shock ring, upward gold shards; cell12 dissipating large shock ring with delicate drifting golden shards, center fading. All detached cutout sprites, queen fully fits cells no cropping. Delicate rune designs abstract not writing. No enemy, player, UI, damage numbers or environment. Make the final impact feel ultimate grade while arrow shape remains readable. This is an animation asset atlas, not a battle screenshot.

### 昇華版

Use case: identity-preserve / stylized-concept. Edit the previous transparent fantasy RPG sprite atlas into its ASCENDED version Sky Queen Arrow Rain: Myriad Arrows Judgment. Keep the exact SAME adult silver-haired elven queen identity, face, pointed ears, hair, full white gown, poses, positions, scale, identical four-column three-row twelve-cell atlas layout and all arrow directions. Preserve genuine alpha transparency and isolated sprites, no painted backdrop or checkerboard. Change only magical ornamentation, light and ascended effects. PALETTE: piercing violet-white radiant core, elegant warm platinum gold outlines and pale lavender spiritual haze, clearly distinct from ordinary golden version, not red or dark sinister. Top row queen 4 poses: apparition hands praying; prayer closed eyes; eyes open palms spreading; open hands decree. Behind queen add a refined larger concentric CROWN HALO with eight clearly separated small star-shaped sockets arranged around upper circle, a slender celestial crown silhouette along halo top, runes abstract and elegant. Last two queen poses have eight holy violet-white gold-edged arrows fanned behind shoulders aimed UP, luminous winglike ethereal ribbons sweeping upward, no physical wings attached to queen, no bow. Row2 keep four detached arrow assets: two vertical UP arrows then two down-RIGHT descending arrows, now sharp violet-white cores with gold filigree and slender lavender motion trails. Bottom row: cell9 small isolated violet-white gold critical starburst, cell10 HUGE ornate divine main arrow down RIGHT carrying eight small gold star sigils along shaft and radiant light wings, cell11 monumental white-violet impact with expanding gold crown-shaped shock ring and lavender rays with white hot readable center, cell12 fading platinum-gold circular shockwave, lavender star dust and delicate rune fragments. All effects must stay within their own cells with transparent margins, no cropping or cell overlap. Premium hand-painted 2D high-fantasy ultimate animation asset quality. No text, numbers, labels, grid lines, UI, enemies or scenery. Maintain all cell sprite composition anchors to normal sheet. The eight halo sockets are usable art for game code to illuminate according to real critical mark count; do not invent extra damage arrows.


## 2026-10-05 箭陣位置與高清修正

舊圓環取玩家到敵人之間的64%位置，且來源每格512×384，中心隨高度向下推。改用 `public/vfx/sky-queen-rain-v3/array-normal.webp`、`array-ascended.webp` 兩張獨立1774×887原生高清圖（正常單環／昇華三層），取完整圖片、不從小圖集切格或放大像素；保留斜置透視，以170ms透明度開啟、±.03rad慢擺、最後400ms淡出。

Canvas上緣從-16%延伸至-42%（全高150%）提供專用天空區；依當下双方肖像上緣決定天空區下界，圓環中心對齊怪物附近，完整含小角度旋轉的包圍盒位於双方框頂部以上，左右不超出canvas。大小同时受天空空間、敵人寬度與原生像素／顯示密度限制。女皇維持原先畫面尺寸與腳點，不因canvas增加天空空間而放大。雨箭升至圈內、下降也從圈內斜面上的同一錨點開始，避免圈在一邊、箭從另一邊出現。

九段實際命中、2920ms演出、奧義鎖、暴擊印記與已結算傷害契約不變。新增手機／桌機與WebGL／2D的頭頂空間及怪物中心對位檢查；此次無玩家資料／伺服器狀態變更。


## 2026-10-05 完整召喚流程修正（目前行為）

保留女皇、天空高清圓環與箭矢造型，增加獨立 `public/vfx/sky-queen-rain-v4/summoning.webp`（2×4，普通0–3／昇華4–7）：聖氣連接帶、箭陣匯聚星芒、小箭凝聚與主箭凝聚。740ms睜眼時由女皇胸前／抬手處的光流漸伸向天空，970ms抵達並開啟箭陣，1170ms光流漸散；不是發射傷害箭。

新生成素材原生1086×1448，保留透明alpha並以無損WebP封裝；每格543×362，重置中心與透明留白，不放大低解析圖。`frames/`另存八張獨立透明影格供檢視。普通版金白／翡翠，昇華版紫白／金色。

刪除所有由女皇身旁升起的箭與折返段。每支雨箭在其下降前90ms於箭陣內凝聚，保持相同材質、方向與箭尖錨點，尺寸由55%漸至100%後直接從該位置下降。主箭2100–2180ms在箭陣中央蓄聚，2180ms開始降下、2440ms命中。沒有空間跳轉、換成不同箭姿勢或先从女皇身旁發射主箭。

新增第五組圖載入門檻，仍在素材齊備後開始2920ms時間線；任一圖失敗／逾時釋放原九段顯示與奧義鎖一次。既有九段命中、傷害、暴擊印記、額外陪襯箭無傷害與減少動態規則不變。測試涵蓋普通箭與主箭在凝聚／下降交界的材質、方向、尺寸及箭尖連續，WebGL與Canvas相同。不改玩家／伺服器資料。

## 異次元聖光水箭重製（取代上方舊流程）

女皇身份與閉眼→740ms睜眼聖氣→抬手保留；箭陣改為女皇頭頂，以斜面填滿的光水異次元入口呈現。`sky-queen-rain-v5/array-normal.webp`與`array-ascended.webp`各為原生独立透明圖；`water.webp`為2×4，普通0–3、昇華4–7：向右聖水箭、巨型主箭、光弓、聖光水爆。透明獨立影格另存frames/。

一般箭命中前330ms從入口淡入並緩緩探出，命中前90ms高速射向怪物。主箭2040ms開始凝聚，光弓向後拉，箭陣2040–2380ms逐漸縮小與淡去；2380ms放弦，剩餘入口能量隨箭同行，2440ms敵人身上爆出大型光水衝擊。水爆具聖光核心、水刃、液態衝擊波及光滴。箭尖錨點與方向全程連續，普通白金／淡青，昇華紫金／冰藍。

仍為2920ms／九段已結算命中與原標記加成；落空不出水爆，減少動態使用靜態圖，載入失敗與卸載清理沿用保護。五組素材全部就緒才啟動，不改戰鬥數值、存檔與共用跳字。

本次素材由內建imagegen生成：入口1774×887，戰鬥素材1086×1448；依生成物件實際區域分離重排成2×4，每格543×362，無損WebP保留原生alpha、不上採樣。聖箭尖統一對齊(.85,.5)。

## 聖箭與強悍水浪補強（保留女皇與入口）

`sky-queen-rain-v6/arrows.webp`2×2，普通小箭／主箭在上排、昇華在下排：明確箭頭、箭身、箭羽與白金聖光包覆，附細薄流動水尾，保留v5女皇頭顶異次元入口与拉弓收陣。

普通及昇華各一張`hit-{normal|ascended}.webp`2×2真實变化命中素材：聖箭尖扎入→強悍厚重水浪炸裂→水牆向外翻捲→水浪崩散、光滴殘留。小箭0–30／30–85／85–150／150–220ms，主箭0–45／45–150／150–300／300–480ms；同一怪物胸口錨點。尺寸依敵人框並受原生像素／裝置密度限制；落空不畫水爆，減少動態用靜態水浪。七組素材完整載入才啟動；失敗、背景、卸載保護与九段傷害回呼、2920ms收尾不改。

本批三張素材由內建imagegen生成；實際原生1254×1254（並非提示詞要求的2048），每格627×627。依實際箭尖及水浪起點重排，無損WebP保留RGBA、不上採樣；另存12張獨立透明影格於v6/frames。箭尖固定(.85,.5)，水浪起點置中。生成方向：实体金色聖箭與箭羽／厚重藍色翻捲水浪／紫金冰藍昇華，最后格崩散、中央透空；保留女皇与v5入口。

## 昇華光水炮八格（2026-10-07）

萬矢天罰專用 `sky-queen-rain-v7/cannon.webp`：兩格紫金聖箭聚水、兩格箭頭領先的冰藍螺旋高壓水炮、四格接觸壓爆／厚重水浪／雙層翻捲／水滴泡沫消散。只替換昇華箭與命中，普通版、女皇、頭頂入口及最後拉弓收陣保持原流程。飛行尾流增加液態厚度；九段命中、2920ms收尾、印記與所有傷害回呼不變，落空不畫命中水浪。

核准RGBA來源1024×1536，按實際不等高物件區域分離、等比縮小並補透明留白，打包成1024×2048的2×4圖集（每格512×512，並非提高來源解析度）；`frames/`保存八張獨立透明WebP。箭尖(.85,.5)，命中點(.5,.5)。`scripts/pack-sky-cannon.mjs`保留裁切與錨點資料，來源不得上採樣。昇華等待第八圖載完再起時鐘；WebGL與2D共用取格，失敗與減少動態保護保留。
