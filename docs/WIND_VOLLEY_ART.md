# 疾風連射影格製作與實裝

使用內建 imagegen 生成兩張透明 1536×1024、3×2 的六格圖集，再保留原始 alpha 轉為 WebP。素材路徑為 `public/vfx/wind-volley-v2/arrows.webp` 與 `sixth.webp`。

一般五箭：青綠／青白風刃，每箭起射間隔 70ms、飛行 160ms，30ms 起手；怪物命中高度依序 78%、64.5%、51%、37.5%、24%。第五箭於 470ms 抵達，第六箭於 540ms 抵達胸前。各箭前三格飛行、後三格碎光消散。玩家立繪固定，只對實際命中的敵人框輕震。

`skill-live-combat.ts` 直接提供原五箭與六重風葬的命中、暴擊、實際傷害百分比，不新增亂數或傷害結算。跳字按實際比例分配已結算的總傷害，保留整數餘額，落空不分配傷害。獵殺標記追加傷害沿用自己的獨立顯示流程。

單 Canvas 使用 WebGL 旋轉圖片沿箭路飛行，失敗或 context loss 切换新 Canvas 2D。以素材載入完成的第一影格起算；載入失敗／逾時仍釋放已結算跳字一次。減少動態效果使用靜態命中格，取消震動。怪物與玩家座標取即時 DOM 框並校正 CSS 縮放。

## 一般箭提示詞

```text
Transparent hand-painted dark fantasy RPG VFX sprite atlas. 3 columns by 2 rows, six equally sized square cells, read left-to-right then top-to-bottom. Teal green and cyan-white swift wind arrow, pointing RIGHT horizontally. No bow or character. Frames1-3: same compact razor-sharp arrowhead on right, long slender curved twin wind ribbons trailing left, motion streaks becoming longer, centered identical trajectory. Frames4-6: small sharp cyan-white arrow impact star, crescent wind-blade shards, then thin fading particles, impact centered. Sharp readable silhouettes with tasteful painterly detail, brighter core and restrained teal edges, not giant magic explosion. Broad transparent margins in every cell, all artwork contained within each cell. True transparent alpha background; no text, no numbers, no grid lines, no background or environment.
```

## 昇華箭提示詞

```text
Transparent hand-painted dark fantasy RPG VFX sprite atlas, 3 columns by 2 rows, six equally sized square cells, read left-to-right then top-to-bottom. Ascended piercing wind arrow pointing RIGHT horizontally. Distinct violet-magenta red outer energy and brilliant WHITE narrow core. No bow or character. Frames1-3: a powerful long razor arrowhead on right with sharp magenta-violet ribbon tail trailing left, progressive faster motion streaks, identical centered trajectory. Frames4-6: compact penetrating violet-magenta slash star and a narrow white core, then pointed shard trails, then fading purple-red light fragments. More forceful than ordinary green arrow, elegant sharp fantasy illustration, not oversized explosion. Broad transparent margins in each cell, contained artwork, no text, no grid, no person, no monster, no background or environment. True alpha transparency.
```
