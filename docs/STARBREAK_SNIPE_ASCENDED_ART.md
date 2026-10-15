# 星隕貫殺：昇華破星狙擊

一般版第 396 版先完成部署後，再製作本套昇華圖片並整合。使用內建 imagegen 編輯原本的 12 格圖集，保持尺寸、影格配置與符文／光柱／星芒位置，改成紫白光柱、金色星紋與紫金碎星；另生成獨立的 4 格星光回流圖集。

素材：`public/vfx/starbreak-snipe/ascended.webp`（1536×1024，12 格）與 `recovery.webp`（1536×1024，2×2 四格）；均保留原始透明 alpha。主光柱共用原版取格與 820ms 時間線，410ms 只顯示一次已結算傷害。

`LiveCombatAction.starbreakChargeRecovered` 直接記錄戰鬥規則的 `attackChargeRecovered > 0`，不新增判定或修改傷害、暴擊與充能數值。昇華已啟用時換用紫金主圖集；只有昇華、實際命中且成功回復充能時，才在主斬之後播放回流。

回流從主光柱播放時間 570ms 起，在 160ms 內由敵人側返回玩家，再化為小型金紫星紋與碎光消散；共 360ms。回流圖慢載入時，主傷害仍在 410ms 顯示，回流從自己的載入完成時間開始；空白等待時暫停 RAF，5 秒逾時清理。圖片失敗只結束回流，不重複傷害或震動。全部效果仍在同一個 Canvas 內，WebGL 與 Canvas 2D 共用影格與錨點。減少動態效果使用玩家旁靜態回復星紋。

## 昇華主圖提示詞

```text
Edit this exact transparent 1536x1024 hand-painted STARBREAK SNIPE 12-frame sprite atlas into its ASCENDED STARFALL PIERCER version. Preserve EXACT output dimensions, all twelve source cell placements, each rune hoop position, beam axis, contact-star position, timing poses, transparent padding and alpha. Preserve the left-to-right cast and source geometry so the edited atlas fits the same animation crop rectangles. Change the artistic appearance to radiant STAR-VIOLET and lavender outer energy with a dense brilliant WHITE beam core, thin elegant PALE-GOLD rune engravings and gold star diamonds. The incantation hoops in the top row gain crisp gold astronomical glyph strokes. The middle-row firing beams are violet-white with a subtle gold filament along the core and more powerful pointed crystalline star glints, still one straight penetrating shot. Contact bursts on the right gain sharp violet-white facets and small gold star shards; bottom-row fading trails retain violet and tiny gold flecks. Clearly more exalted than the ordinary ice-blue version, controlled bloom and sharp readability, preserve the original silhouettes and all cell boundaries. No extra panels, no characters, no text or numbers, no opaque background. True transparent alpha. Do not move, resize or reflow any of the twelve effects or invent a new layout.
```

## 回流提示詞

```text
Use case: stylized-concept. Asset type: transparent hand-painted fantasy RPG charging RECOVERY VFX sprite atlas, 2 columns by 2 rows, four equally sized square cells in row-major order. A small PALE-GOLD star seed with a lavender-violet-white light ribbon trailing to the RIGHT, moving LEFT toward the caster. No arrowhead or weapon: this is returning recovered astral energy, a delicate diamond star and a curved filament, not another damaging projectile. Frame1 one bright tiny gold star seed on the LEFT with a short violet white ribbon extending right. Frame2 same left-pointing star seed and longer silky curling trail extending right with sparse gold sparks. Frame3 seed gathers into a small compact gold-violet circular recovery sigil with four fine star points and a delicate curved ribbon, centered. Frame4 that compact sigil gently dissolves into a few pale gold and lavender motes. Preserve consistent scale and layout in each frame, broad transparent margins, every effect contained in its own cell, no overlap. Match premium hand-painted dark-fantasy RPG spell art, sharp delicate details, controlled luminance. True transparent alpha background. No characters, bows, silhouettes, text, numbers, grid lines, scenery or background.
```
