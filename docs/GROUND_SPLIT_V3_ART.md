# 裂地斬 v3 素材生成紀錄

日期：2026-10-01。使用內建 imagegen，兩張素材皆要求透明背景。

## 主斬（12 格，4 × 3）

```text
Use case: stylized-concept. Production transparent sprite atlas for dark fantasy RPG ground splitting sword skill. EXACTLY 12 equal cells in a 4 columns by 3 rows grid, reading left to right then down. Wide landscape canvas, each cell wide landscape same fixed camera. Truly transparent RGBA background, no grid, no text, no labels, no character or scenery. Hand painted premium game VFX golden orange sharp heavy sword energy arc, dark brown angular stone debris grey dust. The shared virtual ground line lies at 75 percent of each cell height. Action moves LEFT to RIGHT. Frames1-3 heavy golden sword arc plunges down at left side. Frames4-6 jagged glowing ground fissure travels from left to right with stone debris. Frames7-8 explosive upward rocks at right-side target and a brief shattered golden shield symbol above impact. Frames9-12 rocks settle and dust/glow dissipates. Keep consistent scale and anchors, all effects contained in each cell with transparent padding no overlap between cells. Each cell is one successive animation pose, no duplicate full explosions. Only isolated effects not solid ground platforms. Generate usable sprite sheet, not concept presentation.
```

## 地脈崩裂（6 格，3 × 2）

```text
Use case: stylized-concept. Transparent production sprite atlas for dark fantasy RPG ground shock follow-up. EXACTLY SIX equal cells, THREE columns TWO rows, reading left to right then down. Wide landscape canvas. Each cell same fixed camera and scale, no text no labels no grid no background or scenery. Handpainted golden orange glowing fissures, dark brown angular rock fragments grey dust, match a heavy ground-splitting sword effect. No character, weapon or platform. At same CENTER of every cell, a low oval shockwave erupting from a fissure at 75 percent cell height. Frame1 thin fissure glows; frame2 compressed golden energy in crack; frame3 sudden low wide shock ring with upwards rock chips; frame4 ring expands with scattered rocks; frame5 settling rocks/dust; frame6 almost vanished embers. Effects entirely inside each cell with transparent margin, no cross-cell overlap. Truly transparent RGBA. Readable stone and gold details, avoid overexposed white.
```

輸出：`public/vfx/ground-split-v3/main.webp`（1672 × 940）及 `shock.webp`（1536 × 1024）。轉為 WebP 時逐像素驗證 Alpha 與尺寸不變。圖集依列由左至右、由上至下播放，來源矩形內縮 1px。

