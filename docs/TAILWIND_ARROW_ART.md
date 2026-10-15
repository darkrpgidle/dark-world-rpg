# 追風箭生圖與製作紀錄

日期：2026-10-01。使用內建 imagegen；所有圖集以真正透明背景生成，轉 WebP 時驗證尺寸與 Alpha 不變。

## 主箭提示詞

```text
Use case: stylized-concept. Transparent RGBA production sprite atlas for a modest beginner dark-fantasy ranger TAILWIND ARROW. EXACTLY SIX equal landscape cells, THREE columns TWO rows, left-to-right then down. Single slim physical silver arrow pointing RIGHT, dark teal feather fletching, pale emerald turquoise short double wind filaments, soft tiny afterimage. No character no bow no scene no ground no text no labels no grid. SAME camera, arrow proportions and anchor each frame, arrow TIP at 75% cell width and 50% cell height. Frame1 quick crescent wind on fletching during launch; frame2 arrow in flight two thin short wind ribbons; frame3 same arrow with faint short ghost trace; frame4 arrow hits: tiny diagonal green slash sparkle at tip, arrow vanishes; frame5 fading tiny slash; frame6 two fading motes. Extremely restrained VFX for early game, crisp handpainted steel details. No explosion, no large rings, no lasers, no huge glow. Transparent empty margin around every cell, no overlaps. Code moves arrow continuously from player left to monster right; keep the tip anchor fixed in each cell.
```

## 昇華追加箭提示詞

```text
Use case: stylized-concept. Transparent RGBA production follow-up arrow sprite atlas for a modest dark-fantasy ranger TAILWIND ARROW. EXACTLY FOUR equal landscape cells TWO columns TWO rows reading left to right then down. One slim silver arrow with pale emerald teal feather fletching, pointing RIGHT, slightly ethereal and thinner than the primary arrow, extremely short faint twin airflow ribbons. TIP fixed at 75% cell width, 50% height for every cell. Frame1 slender arrow in flight; frame2 same arrow with a tiny pale ghost trail; frame3 arrow disappears into a tiny sharp green diagonal impact sparkle at TIP location; frame4 only two fading tiny motes at same tip. Handpainted crisp steel, very restrained glow, genuinely transparent background empty padding. No words labels grid scenery characters bow explosions rings lasers or multiple arrows. Game code translates the entire sprite between actors; no change of arrow position within cells.
```

## 充能回復提示詞

```text
Use case: stylized-concept. Transparent RGBA four-frame sprite atlas TWO columns TWO rows for a tiny CHARGE RECOVERY wind cue in a dark fantasy ranger game. Each equal cell contains only a very small airy emerald-teal wind swirl at exact cell center. Frame1 two thin wisps emerge; frame2 a small delicate elliptical swirl forms; frame3 wisps contract inward; frame4 just two vanishing green motes. Handpainted understated, fine brush wind strokes, no solid disc, no magical runes, no text, no labels, no grid, no scenery, no characters, no arrow, no heavy glow, no huge portal. Same size and camera in all cells. Isolated on truly transparent background with broad empty margins, each swirl fits inside middle half of its cell. Will be displayed at just 45-65 pixels beside the player only when actual skill charge recovery succeeds.
```

## 實際播放

| 素材 | 規格 | 時序與事件 |
|---|---|---|
| `public/vfx/tailwind-arrow/main.webp` | 1536 × 1024；3 × 2；6 格 | 500ms；270ms 抵達怪物，顯示主箭傷害與小型風痕 |
| `public/vfx/tailwind-arrow/echo.webp` | 1536 × 1024；2 × 2；4 格 | 主箭命中回呼後才啟動；飛行 170ms，總長 300ms；依昇華追加箭實際命中／暴擊顯示獨立「追擊」數字，落空只穿過並淡出 |
| `public/vfx/tailwind-arrow/charge.webp` | 1536 × 1024；2 × 2；4 格 | 320ms；僅實際回復自身充能時在玩家身旁播放小風旋 |

`app/ranger-tailwind-arrow-vfx.tsx` 負責 WebGL 與 Canvas 2D 備援，依雙方肖像即時錨點縮放，保持來源長寬比、透明普通合成，無全場強震。主箭寬度最多 115px、追加箭最多 95px、回復風旋最多 64px。每格使用獨立箭尖／碎光錨點補償，減少動態效果使用靜態格。

`app/skill-live-combat.ts` 提供真實充能回復及追加箭結果；只新增顯示資訊，保持既有隨機判定次序與總伤害。傷害拆分是已結算總數的分配，不額外派發傷害。推圖及個人／世界首領均接入，切換戰鬥與播放完成時清理。



## 2026-10-05 重製（目前使用）

- 普通：`public/vfx/tailwind-arrow-v3/frames.webp`；昇華追擊：`public/vfx/tailwind-arrow-v3/ascended.webp`。普通由imagegen生成，昇華依原圖編輯為銀白淡金箭芯／風刃；均1448×1086、4×3、每格362×362、RGBA透明，WebP保留原尺寸與Alpha，不放大來源。
- 第1–2格為朝右銀青箭矢，三道螺旋風流纏繞箭身；第3–4格為獨立旋風，跟隨箭矢移動並略轉；第5–12格為三葉風刃由命中點旋開、碎散。完全沒有盔甲、盾牌或固定長尾流；這些裂甲素材只供穿雲箭使用。
- 主箭270ms命中、850ms收尾；實際暴擊才觸發昇華追擊，170ms獨立命中、750ms收尾。兩道短殘影跟隨飛行，箭尖约94%／中央51%；接觸時飛行層消失，胸前8格風刃每格60ms。昇華使用獨立金白圖集，稍放大风刃。
- 充能回復仍使用既有4格风旋320ms，只由真實回復結果觸發。全部維持單技能Canvas、WebGL及Canvas2D共用UV／旋轉；z-index7蓋過怪物、低於共用跳字12，無全場震動。減少動態只顯示固定風刃格。
- 傷害、暴擊、額外箭的獨立命中與回復機率均不變；回呼只發布一次已結算數值。落空穿越後淡出，不播命中風刃；慢載入以播放開始計時、5秒停滯保護、換怪／卸載清理。
- `tests/tailwind-playback.test.mjs`驗證兩種renderer、螺旋跟隨箭矢及旋轉、主箭連續位移、8格風刃固定敵框、獨立昇華圖集與170ms回呼、減少動態、慢載入／圖檔失敗／停滯去重。
