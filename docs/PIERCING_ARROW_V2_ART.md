# 穿雲箭 v2 生圖與播放紀錄

日期：2026-10-01。內建 imagegen 生成透明圖集；初階技能採單支銀色箭、淡青短尾流與小型命中碎光。

## 生圖提示詞

```text
Use case: stylized-concept. Production VFX sprite atlas for a FIRST LEVEL ranger piercing arrow in a dark fantasy side-view game. Understated, small scale, simple practical physical silver arrow with muted teal feather fletching and very thin pale teal-white short airflow trail. EXACTLY 6 equally sized cells in THREE columns TWO rows, left to right then down. Each cell landscape, truly transparent RGBA background, no grid no words no numbers no labels no characters no bow no scenery. Frame1 single arrow pointing exactly right, thin sharp steel arrowhead at 75 percent cell width, shaft behind it, compact short tail. Frame2 same single arrow slightly brighter very narrow short airflow. Frame3 same arrow with small thin slipstream. Frame4 tiny sharp white-teal impact sparkle centered at same arrowhead location, arrow partly disappears. Frame5 tiny fading impact sparks, no arrow. Frame6 only 2 faint disappearing sparks. Consistent camera/size/anchors, horizontal shaft centered vertically, arrowhead at same x across frames1-4. Keep empty transparent safe margins around each cell. Handpainted crisp readable, minimal glow, no huge explosion no rings no ornate magic no lightning no multiple arrows no long laser beam. Game code moves arrow from left player to right enemy; do NOT draw motion across cell positions.
```

## 圖集與接入

- `public/vfx/piercing-arrow-v2/frames.webp`：1536 × 1024，3 欄 × 2 列，共 6 格；轉 WebP 時驗證尺寸及 Alpha 不變。
- `app/ranger-piercing-arrow-vfx.tsx`：WebGL 播放，Canvas 2D 備援；0～180ms 從玩家前方連續飛到敵人中心，180ms 命中小閃光與傷害顯示，470ms 完成清理。依每格箭尖／碎光錨點補償，避免命中位置跳動。
- PC／手機共用雙方肖像即時尺寸，箭圖寬度上限 120px；普通透明合成，無全場震動或大爆炸。
- 落空繼續飛越敵人並淡出，不播放命中碎光；減少動態效果顯示靜態命中格。
- 推圖、個人首領及世界首領均接入新版實際穿雲箭施放事件；傷害數字由實際影格進度回呼顯示，不改動傷害結算與技能數值。



## 2026-10-05 穿雲箭重製（目前使用）

- 普通／破界穿心使用 `public/vfx/piercing-arrow-v3/frames.webp`、`ascended.webp`，均1448×1086、4×3、每格362×362、真正透明Alpha。imagegen重繪銀箭／青綠尾流與鋼甲斜裂，昇華獨立銀白淡金版；原尺寸轉WebP，不放大來源。
- 180ms快速命中與共用傷害回呼不變，總演出960ms。24段尾流依箭尖通過時間生成，固定在原路徑；每段700ms由起射端往怪物逐漸淡去。尾流不隨箭頭移動。
- 命中後8格鋼甲固定怪物胸前，由亮斜裂口、分成兩半、向左右崩碎到消散，每格85ms。昇華使用淡金箭芯／裂縫，稍擴大甲片外拋；不新增第二箭或額外傷害，既有下一主動技能忽防規則不變。
- `app/page.tsx`依既有穿雲箭昇華選擇傳入視覺旗標；推圖、個人／世界首領均沿用既有實際施放與回呼。落空只有穿過的箭與尾流，不裂甲；減少動態固定裂甲格。單Canvas WebGL／2D，z-index7高於怪物且低於跳字12。
- `tests/piercing-arrow-playback.test.mjs`驗證180ms命中、尾流固定與漸淡、8格裂甲錨點、昇華獨立圖集與相同時序、手機比例、減少動態、失敗／5秒RAF保護與一次發布。
