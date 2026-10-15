# 破星狙擊：符文蓄壓與貫穿光柱

## 圖片與播放

使用者核准的內建 imagegen 12 格樣稿 `exec-5dd46a2a-9aba-42ab-9bc0-95722fc57d45.png` 保留原始透明 alpha，轉為 `public/vfx/starbreak-snipe/frames.webp`。圖集尺寸 1536×1024；手繪第二排的射擊格寬度不同，因此 `STARBREAK_CELLS` 記錄每格實際來源矩形與符文／命中錨點，不按均等格裁掉符文。

時間線共 820ms：第 1～4 格（0、90、180、270ms）符文星光聚集，第 5 格（340ms）壓縮閃亮，第 6 格（370ms）射出，第 7 格（410ms）命中，第 8 格（455ms）貫穿碎光，第 9～12 格（505、585、665、740ms）收细與碎散。圖片載入完成的第一個繪製影格才開始計時。

一個 Canvas 內分別畫符文、光柱窄帶與命中星芒，全部取自同一張核准圖片。符文與星芒保持來源長寬比，窄光柱依即時玩家與敵人距離伸展並旋轉，尾光繼續穿過敵人。符文定位玩家前方、星芒定位怪物胸前；每格重讀雙方 DOM 框與戰鬥框縮放比例，PC／手機共用比例定位。

## 命中與數字

沿用 `resolveLiveCombatAttack` 的實際施放／命中／暴擊，不新增傷害結算或亂數。一般戰鬥與個人／世界首領的已結算傷害字只延後到 410ms 接觸回呼，不延後扣血與戰鬥排程。同次獵殺標記追加爆破也從該回呼接續，保持獨立數字。

命中時有冰藍白芯光柱與星芒、30～46px 冰白傷害字，一次 220ms 短震（PC 6px、手機 3px）。落空保留蓄力與貫穿射線，不選取接觸星芒與碎片，不震動。昇華星隕貫殺沿用既有充能回復規則，不虛構額外攻擊。

WebGL 不可用或 context loss 使用新的 Canvas 2D；兩者使用相同取格、錨點與時間線。減少動態效果顯示靜態接觸格，沒有震動。圖片失敗／5 秒逾時仍釋放已结算顯示一次並清理；戰鬥重置清空待顯示回呼與特效，卸載取消 RAF、觀察器與自有震動。

## 生成提示詞

```text
Use case: stylized-concept. Asset type: transparent hand-painted VFX sprite concept sheet for STARBREAK SNIPE, a powerful ranger skill in a dark fantasy side-view 2D RPG. Twelve frames in a precisely aligned 4 columns by 3 rows atlas, read left to right then top to bottom. True transparent alpha background. Direction always LEFT TO RIGHT, player would be on left and enemy on right, but NO characters or silhouettes. Premium painterly fantasy spell artwork with sharp readable energy shapes, ice-blue outer glow, brilliant white core, a restrained touch of star-violet. Generous transparent margins; contain artwork entirely within every cell, no overlap between cells. Row1 frames1-4 QUICK INCANTATION AND COMPRESSION: a compact vertical rune hoop on the LEFT of the cell, seen slightly obliquely as an upright ellipse with its aperture aiming RIGHT, delicate original arcane glyphs and fine concentric engraved arcs rotate slowly, sparse starlight is pulled into its center, successive frames increasingly concentrate a white star point in the opening. No horizontal floor magic circle. Row2 frames5-8 INSTANT FULL-POWER SHOT: frame5 rune hoop tightly contracts with a brilliant contained white ignition star; frame6 a long thick, straight penetrating ice-blue WHITE-CORE LIGHT COLUMN erupts horizontally toward the RIGHT from the hoop, sharp spear-shaped leading point and thin violet-blue star trails; frame7 the beam reaches almost across the cell, white center densely luminous and edges clean, a crisp compact starburst at its rightward target contact; frame8 same trajectory with piercing diagonal star shards erupting at contact and a narrow beam continuing beyond contact to the right. Make the beam look like one decisive high-speed heavy shot, not repeated arrows, lightning, or a slowly moving ball. Row3 frames9-12 IMPACT AND DISSIPATION: frame9 bright compact ice-white impact star at the RIGHT with pointed crystalline light fragments and thinner remaining beam; frame10 beam rapidly narrows to a fine blue-white line while rune hoop breaks into delicate arc fragments; frame11 sparse fading horizontal star trail and small right-side spark fragments; frame12 almost empty with only a few dim ice-blue motes. Keep casting hoop placement left and impact location right consistent across frames. Detailed spell illustration, elegant strong silhouette, controlled bloom, transparent empty surroundings. NO readable text, NO frame numbers, NO grid borders, NO terrain, NO background, NO UI, NO bow, NO characters.
```


## 2026-10-05 Z字急煞甩尾重製（歷史v472）

新素材 `public/vfx/starbreak-snipe-v2/atlas.webp`：1252×1252 真透明RGBA、4×4；普通0–7／昇華8–15，各包含兩格箭、兩格急煞甩尾、兩格星傷及兩格碎晶。以imagegen生成獨立影格，native1254縮小至可均分1252，未放大。箭朝右，以實際箭尖錨點旋轉；命中星傷放在怪物前景、低於共用跳字。

普通銀藍、昇華紫金。50–145ms向右；145–185ms第一折角停頓；185–275ms向左下；275–315ms第二折角停頓；315–410ms最後向右命中。兩折角的慣性弧尾由影格呈現；每筆畫16個固定尾流取樣，按實際抵達時間470ms淡去，起射端先消失。昇華折角保留星核、命中後依序閃亮；只視覺呈現、不追加傷害。

接觸410ms／全長820ms及實際命中、充能回復回呼保持原契約；暴擊實際回復時沿用既有recovery.webp及570ms起始回流。落空不選傷口／碎晶、不震動。雙方即時框及畫面變換比例決定路線，resize不重啟時間；WebGL及2D同來源。減少動態為靜態命中格，載入失敗／逾時／切場清理維持原入口。不改存檔、登入、每日重置或獎勵流程。


## 2026-10-05 星焰裂流與背後炸穿（目前版本）

新透明圖集 `public/vfx/starbreak-snipe-v3/atlas.webp` 為1252×1252 RGBA、4×4，普通0–7、昇華8–15。映射：0星焰箭、1獨立橫向星焰裂流、2–3急煞爆星甩尾、4細貫穿傷口、5分岔裂紋、6–7向右錐形碎星噴流。圖片由imagegen生成、保留alpha；不把battle背景或角色放入圖格。

路線與410ms單次命中保留。Z每笔16個固定尾流取樣，厚度提高至箭尺寸25%，使用專用星焰素材；每段560ms由起射端淡去。折角爆星放大並向外翻湧。命中前65ms細傷口，接續分岔裂紋；普通命中70ms後向右炸穿，昇華150ms後炸穿、其間一束紫金能量沿已形成Z路徑追入傷口。碎星噴流原點固定在怪物胸前，向右噴射並按右邊界限制尺寸，怪物與命中點不位移。

全長仍820ms；昇華既有570ms充能回流依實際回復事件觸發。不增加傷害或回呼、落空不播傷口和出口爆裂；減少動態只顯示靜態裂紋，不播Z流、急煞或爆裂。前景低於共用傷害層。WebGL與2D共用素材和時序，失敗、逾時與換場收尾沿用。此次未修改玩家資料、登入、每日重置或獎勵。
