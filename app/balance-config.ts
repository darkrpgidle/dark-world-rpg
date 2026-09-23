/**
 * 暗黑世界：唯一的遊戲平衡設定檔。
 *
 * 調整數值時只修改這個檔案；介面、存檔與戰鬥程式會自動讀取這些設定。
 * 名稱、文案、圖片等非數值內容仍保留在 game-data.ts。
 */

export const balanceConfig = {
  progression: {
    mapFloors: 30,
    experienceMultiplier: 3,
    dodgeCap: 40,
    damageReductionCap: 80,
    maxEnhancement: 15,
    experienceRequired: {
      early: { throughLevel: 10, base: 120, perLevel: 90 },
      mid: { throughLevel: 30, base: 930, perLevel: 320 },
      late: { throughLevel: 60, base: 7330, perLevel: 2200 },
      endgame: { base: 73330, perLevel: 18000, quadratic: 450 },
    },
    newcomerExperience: { throughLevel: 10, multiplier: 2, endsAtLevel: 30 },
  },

  maps: [
    { power: [1000, 5500], phasePower: [4000, 5200], bossPower: 5800, exp: [6, 12] },
    { power: [3000, 7600], phasePower: [6500, 7500], bossPower: 8000, exp: [15, 28] },
    { power: [6000, 12300], phasePower: [10500, 12000], bossPower: 13000, exp: [35, 55] },
    { power: [10000, 18000], phasePower: [15000, 17500], bossPower: 19000, exp: [70, 105] },
    { power: [16000, 26500], phasePower: [21500, 25500], bossPower: 28000, exp: [130, 190] },
    { power: [24000, 38000], phasePower: [29000, 35000], bossPower: 42000, exp: [230, 320] },
    { power: [35000, 58000], phasePower: [42000, 50000], bossPower: 65000, exp: [380, 520] },
    { power: [50000, 85000], phasePower: [60000, 70000], bossPower: 95000, exp: [600, 800] },
    { power: [70000, 120000], phasePower: [85000, 100000], bossPower: 140000, exp: [900, 1200] },
  ],

  mapFloors: {
    phaseTwoStartMultiplier: 1.05,
    phaseThreeStartMultiplier: 1.05,
    monsterHealth: {
      normal: 0.55,
      elite: 0.75,
      guardian: 1,
      boss: 1.3,
      minimum: 100,
      // 實際戰鬥生命倍率：提高戰鬥回合數，但不提高怪物傷害。
      // 相較舊值：普通怪約 1.7 倍、精英約 1.9 倍、守關者約 2 倍、首領約 4.8 倍生命。
      // 目標是讓裝備、技能與強化有足夠時間發揮，而非靠一兩次普攻直接結束戰鬥。
      combatMultiplier: { normal: 0.78, elite: 1.05, guardian: 1.45, boss: 0.48 },
    },
    experienceTier: { normal: 1, elite: 3, guardian: 6, boss: 12 },
  },

  // 地圖 1～3 保持新手節奏；從毒霧沼澤開始，讓換裝、強化與技能升級成為必要投資。
  // 索引與地圖 ID 對應（索引 0 保留）。
  lateGameMonsterScaling: {
    health: [1, 1, 1, 1, 1.15, 1.35, 1.6, 1.9, 2.25, 2.65],
    defense: [1, 1, 1, 1, 1.08, 1.18, 1.32, 1.5, 1.7, 1.95],
    attack: [1, 1, 1, 1, 1.04, 1.1, 1.18, 1.28, 1.4, 1.55],
  },

  // 每隻怪物的個體戰鬥傾向：以地圖／樓層基準值為底，再套用生命、攻擊、防禦與攻速倍率。
  // health：生命倍率；attack：攻擊倍率；defense：防禦倍率；speed：攻擊速度倍率。
  monsterProfiles: {
    腐骨鼠: { health: 0.72, attack: 0.68, defense: 0.62, speed: 1.28 },
    遊魂: { health: 0.86, attack: 0.76, defense: 0.78, speed: 1.12 },
    墓地守衛: { health: 1.08, attack: 0.92, defense: 1.18, speed: 0.84 },
    食屍鬼: { health: 1.16, attack: 1.12, defense: 0.92, speed: 0.9 },
    墓園騎士: { health: 1.3, attack: 1.24, defense: 1.28, speed: 0.78 },
    骨弓手: { health: 0.78, attack: 1.08, defense: 0.68, speed: 1.08 },
    骸骨犬: { health: 0.9, attack: 1.18, defense: 0.74, speed: 1.22 },
    荒原亡兵: { health: 1.12, attack: 0.94, defense: 1.08, speed: 0.92 },
    咒骸: { health: 1.02, attack: 1.2, defense: 0.98, speed: 0.96 },
    白骨巨獸: { health: 1.38, attack: 1.3, defense: 1.32, speed: 0.72 },
    礦穴蝠: { health: 0.74, attack: 0.82, defense: 0.6, speed: 1.32 },
    鐵殼蟲: { health: 1.24, attack: 0.78, defense: 1.42, speed: 0.7 },
    墮落礦工: { health: 1.04, attack: 1.06, defense: 1.02, speed: 0.94 },
    岩魔: { health: 1.34, attack: 1.18, defense: 1.36, speed: 0.68 },
    黑鐵監工: { health: 1.42, attack: 1.32, defense: 1.26, speed: 0.76 },
    毒囊蛛: { health: 0.8, attack: 1.02, defense: 0.66, speed: 1.2 },
    泥沼屍: { health: 1.18, attack: 0.96, defense: 1.08, speed: 0.74 },
    瘴氣妖: { health: 0.96, attack: 1.26, defense: 0.82, speed: 1.02 },
    蛇人祭司: { health: 1.02, attack: 1.34, defense: 0.9, speed: 0.98 },
    腐沼巨鱷: { health: 1.46, attack: 1.38, defense: 1.3, speed: 0.64 },
    影狼: { health: 0.88, attack: 1.24, defense: 0.7, speed: 1.3 },
    血鴉: { health: 0.7, attack: 1.1, defense: 0.58, speed: 1.38 },
    黑木精: { health: 1.2, attack: 0.9, defense: 1.24, speed: 0.82 },
    墮落獵人: { health: 0.98, attack: 1.28, defense: 0.86, speed: 1.06 },
    永夜樹妖: { health: 1.5, attack: 1.18, defense: 1.4, speed: 0.62 },
    小惡魔: { health: 0.76, attack: 1.16, defense: 0.64, speed: 1.26 },
    獄火犬: { health: 0.94, attack: 1.3, defense: 0.76, speed: 1.18 },
    魅魔: { health: 0.86, attack: 1.22, defense: 0.82, speed: 1.1 },
    惡魔衛士: { health: 1.28, attack: 1.12, defense: 1.34, speed: 0.8 },
    城塞領主: { health: 1.52, attack: 1.42, defense: 1.46, speed: 0.66 },
    星塵獸: { health: 0.82, attack: 1.14, defense: 0.72, speed: 1.24 },
    虛空眼: { health: 0.9, attack: 1.36, defense: 0.76, speed: 1.02 },
    失落法師: { health: 0.96, attack: 1.4, defense: 0.8, speed: 0.94 },
    星界守衛: { health: 1.3, attack: 1.18, defense: 1.38, speed: 0.78 },
    墜星巨像: { health: 1.58, attack: 1.46, defense: 1.5, speed: 0.58 },
    霜魂: { health: 0.86, attack: 1.12, defense: 0.84, speed: 1.16 },
    熔火靈: { health: 0.92, attack: 1.44, defense: 0.7, speed: 1.08 },
    寒焰騎士: { health: 1.32, attack: 1.22, defense: 1.42, speed: 0.74 },
    冰晶龍: { health: 1.44, attack: 1.38, defense: 1.28, speed: 0.7 },
    霜火君王: { health: 1.62, attack: 1.5, defense: 1.52, speed: 0.6 },
    時蝕蟲: { health: 0.9, attack: 1.3, defense: 0.74, speed: 1.34 },
    裂隙幽影: { health: 0.82, attack: 1.42, defense: 0.68, speed: 1.26 },
    逆時行者: { health: 1.04, attack: 1.36, defense: 0.92, speed: 1.1 },
    輪迴衛士: { health: 1.38, attack: 1.24, defense: 1.44, speed: 0.82 },
    時墟主宰: { health: 1.68, attack: 1.54, defense: 1.58, speed: 0.64 },
    深淵王: { health: 1.7, attack: 1.58, defense: 1.56, speed: 0.68 },
    黑月龍神: { health: 1.82, attack: 1.66, defense: 1.64, speed: 0.62 },
    輪迴魔神: { health: 1.95, attack: 1.74, defense: 1.72, speed: 0.58 },
  },

  combat: {
    // 流亡黯道式命中判定：命中值與閃避值先換算成評等，再計算命中率。
    evasionModel: {
      accuracyMultiplier: 1.25,
      evasionMultiplier: 0.3,
      minimumHitChance: 5,
      maximumHitChance: 95,
      statToRating: 10,
      monsterEvasionBase: 20,
      monsterEvasionPerMap: 22,
      // 後段地圖額外增加的固定閃避率，直接從玩家命中率扣除。
      monsterEvasionBonusByMap: [0, 0, 1, 2, 3, 4, 5, 6, 7, 8],
      monsterAccuracyBase: 100,
      monsterAccuracyPerMap: 5,
      suppressionAccuracyPerPoint: 5,
      bossEvasionPerLevel: 1.7,
      bossAccuracyPerLevel: 1.6,
    },
    baseDamage: { base: 11, randomRange: 5, minimum: 3, skillBonus: 7, setTierBonus: 5 },
    // 怪物攻防只由地圖、樓層、怪物類型與玩家實際裝備屬性決定；
    // 推薦戰力僅作為地圖頁的資訊提示，絕不直接參與戰鬥結果。
    monsterStats: {
      baseAttack: 40,
      baseDefense: 40,
      floorAttackGrowth: 2.2,
      floorDefenseGrowth: 1.8,
      mapAttackGrowth: 2.5,
      mapDefenseGrowth: 2.5,
      attackScale: 0.11,
      normalAttackScale: 0.22,
      // 每張地圖的固定攻擊基準。此值由地圖設定提供，不讀取玩家戰力。
      recommendedPowerAttackScale: 0.045,
      // 攻擊面板值就是基礎傷害核心；只有怪物防禦、技能倍率與詞綴會再改變結果。
      playerAttackScale: 1,
    },
    // 防禦採用「防禦 / (防禦 + 地圖門檻)」：高等裸裝不會天然接近上限，
    // 但穿著當前地圖的胸甲、頭盔、鞋子與護腕時能明顯提高存活力。
    defenseMitigation: { baseThreshold: 500, perMapThreshold: 400, cap: 0.75 },
    // 普通怪物也要隨樓層逐步施壓：前段不再長時間停留在最低傷害，
    // 後段則讓空裝角色有機會因累積受傷而死亡，必須持續更換與強化裝備。
    monsterDamage: {
      base: 3.2,
      floorGrowth: 0.28,
      mapGrowth: 0.22,
      normalPressure: 1.35,
      // 每張地圖第 10、20、30 關是節奏緩衝點，怪物攻擊降低 15%。
      milestoneAttackReduction: 0.15,
      minimum: 2,
    },
    // 新版裝備最多 5 條詞綴，降低高階敵人倍率，避免戰鬥詞綴削減後難度失控。
    tierDefense: { normal: 1, elite: 1.18, guardian: 1.38, boss: 1.62 },
    tierAttack: { normal: 1, elite: 1.15, guardian: 1.5, boss: 1.72 },
    // 後段地圖對玩家造成的總傷害減免，地圖 1 為 0%，地圖 9 為 9%。
    monsterDamageReductionByMap: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    // 玩家戰力低於當前樓層需求時，依戰力比施加境界壓制。
    realmSuppression: {
      light: { minimumRatio: 0.85, damageMultiplier: 1.1, defenseMultiplier: 1.05, hitBonus: 5 },
      medium: { minimumRatio: 0.7, damageMultiplier: 1.25, defenseMultiplier: 1.12, hitBonus: 10 },
      heavy: { minimumRatio: 0.5, damageMultiplier: 1.5, defenseMultiplier: 1.25, hitBonus: 15 },
      abyss: { minimumRatio: 0, damageMultiplier: 2, defenseMultiplier: 1.4, hitBonus: 20 },
    },
    guardianCheckpoints: {
      floor10: { defense: 1.15, attack: 1.3 },
      floor20: { defense: 1.25, attack: 1.4 },
    },
  },

  character: {
    levelGrowth: { hp: 24, attack: 8, defense: 5 },
    combatPower: { base: 1350, perLevel: 56 },
    baseStats: {
      戰士: { hp: 620, attack: 54, defense: 36, speed: 100, hit: 100, dodge: 5, crit: 8, lifesteal: 0 },
      遊俠: { hp: 410, attack: 54, defense: 21, speed: 122, hit: 100, dodge: 10, crit: 12, lifesteal: 0 },
      法師: { hp: 390, attack: 68, defense: 19, speed: 108, hit: 112, dodge: 4, crit: 8, lifesteal: 0 },
    },
  },

  equipment: {
    sceneMaxQualityIndex: 4,
    // 品質詞綴上限：普通 0、良好 1、優秀 2、史詩 3、傳奇 4、神話 5。
    maxAffixesByQuality: [0, 1, 2, 3, 4, 5],
    // 首領傷害統一作用於菁英、守關者與首領；不再保留精英傷害詞綴。
    allowedAffixes: [
      "生命", "生命%", "攻擊", "攻擊%", "防禦", "防禦%", "攻速",
      "命中", "閃避", "暴擊", "暴擊傷害", "吸血", "傷害減免", "技能傷害",
      "首領傷害", "首領減傷", "經驗", "金幣", "資源掉落率", "元寶掉率",
    ],
    mapPowerScale: [0, 1, 1.55, 2.25, 3.2, 4.45, 6, 8, 10.5, 13.5],
    dropPower: { base: 80, qualityGrowth: 38, maximumMultiplier: 1.18 },
    baseScaleByMap: [0, 2, 2.9, 6.15, 8.7, 12.15, 13.4, 17, 23, 32],
    // 普通到神話的基礎能力總差距為 30%，六個品質平均遞進。
    baseQualityMultipliers: [1, 1.06, 1.12, 1.18, 1.24, 1.3],
    // [屬性、常數、每張地圖成長]。胸甲保有最高防禦，武器保有最高攻擊。
    baseStats: {
      武器: [["攻擊", 18, 4]],
      頭盔: [["防禦", 8, 2]],
      胸甲: [["防禦", 16, 4], ["生命", 45, 15]],
      手套: [["攻擊", 6, 2]],
      鞋子: [["防禦", 5, 1]],
      項鍊: [["生命", 30, 12]],
      戒指: [["攻擊", 5, 2]],
      腰帶: [["生命", 70, 30]],
      護腕: [["防禦", 6, 2]],
      披風: [["生命", 40, 15]],
    },
    sockets: {
      maxSockets: 2,
      naturalDropChance: { oneSocket: 0.08, twoSockets: 0.02 },
      drillingStoneDropChance: 0.0005,
    },
    enhancement: { firstFivePerLevel: 3, nextFivePerLevel: 4, finalFivePerLevel: 5 },
    enhancementAttempt: {
      goldCost: {
        base: 200,
        earlyGrowth: 1.2,
        middleGrowth: 1.35,
        lateGrowth: 1.5,
      },
      // 實際強化費用 = 地圖基準 × 品質倍率 × 部位倍率 × 等級倍率。
      baseGoldByMap: [800, 950, 1150, 1400, 1700, 2050, 2450, 2900, 3400],
      levelMultiplierByCurrentLevel: [1, 1, 1.05, 1.1, 1.15, 1.22, 1.3, 1.4, 1.52, 1.65, 1.8, 1.98, 2.18, 2.4, 2.65],
      qualityMultiplier: { 普通: 0.8, 良好: 0.95, 優秀: 1.1, 史詩: 1.3, 傳奇: 1.6, 神話: 2 },
      slotMultiplier: { 武器: 1.1, 頭盔: 0.95, 胸甲: 1.15, 手套: 1, 鞋子: 0.95, 項鍊: 1.05, 戒指: 1.05, 腰帶: 1.1, 護腕: 0.95, 披風: 1.05 },
      stoneCost: {
        middleBase: 5,
        middlePerLevel: 2,
        lateBase: 15,
        lateGrowth: 1.2,
      },
      successByCurrentLevel: [100, 100, 95, 90, 85, 75, 65, 55, 45, 35, 25, 20, 15, 10, 5],
    },
    statWeights: { 生命: 0.25, "生命%": 3, 攻擊: 4, "攻擊%": 5, 防禦: 3, "防禦%": 4, 攻速: 4, 命中: 5, 閃避: 8, 暴擊: 8, 暴擊傷害: 7, 吸血: 10, 經驗: 5, 金幣: 4, 首領傷害: 7, 傷害減免: 10, 技能傷害: 7, 首領減傷: 9, 資源掉落率: 4, 元寶掉率: 12 },
    affixes: {
      flatQualityMultipliers: [[0.08, 0.12], [0.13, 0.18], [0.19, 0.24], [0.25, 0.3], [0.3, 0.4], [0.45, 0.6]],
      percentQualityBands: {
        "生命%": [[1, 2], [2, 3], [3, 4], [3, 6], [4, 8], [5, 10]],
        "攻擊%": [[1, 2], [2, 3], [3, 4], [3, 6], [4, 8], [5, 10]],
        "防禦%": [[1, 2], [2, 3], [3, 4], [3, 6], [4, 8], [5, 10]],
        暴擊: [[1, 1], [2, 2], [3, 4], [3, 6], [4, 8], [6, 10]],
        暴擊傷害: [[5, 5], [5, 8], [6, 10], [8, 12], [8, 14], [10, 16]],
        命中: [[1, 2], [3, 3], [4, 5], [6, 7], [8, 10], [12, 15]],
        閃避: [[1, 1], [2, 2], [4, 4], [4, 6], [5, 8], [5, 10]],
        吸血: [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [7, 9]],
        首領傷害: [[1, 1], [2, 2], [3, 4], [5, 6], [7, 9], [11, 15]],
        傷害減免: [[0, 0], [1, 1], [2, 2], [3, 3], [4, 5], [7, 9]],
        經驗: [[2, 4], [5, 7], [8, 10], [11, 14], [15, 18], [21, 26]],
        金幣: [[2, 4], [5, 7], [8, 10], [11, 14], [15, 18], [21, 26]],
        技能傷害: [[1, 1], [2, 2], [3, 4], [5, 6], [7, 9], [11, 14]],
        首領減傷: [[1, 1], [2, 2], [3, 4], [5, 6], [7, 9], [11, 14]],
        資源掉落率: [[2, 3], [4, 5], [6, 8], [9, 12], [13, 17], [20, 26]],
        元寶掉率: [[1, 3], [1, 3], [1, 3], [1, 3], [1, 3], [1, 3]],
      },
      speedQualityBands: [[1, 3], [2, 6], [3, 8], [4, 10], [5, 10], [8, 12]],
      percentMapGrowth: { 暴擊: 0.45, 命中: 0.5, 閃避: 0.35, 吸血: 0.35, 首領傷害: 0.6, 傷害減免: 0.35, 經驗: 0.55, 金幣: 0.6 },
      speedMapGrowth: 0,
    },
  },

  economy: {
    gold: {
      monsterDropBaseByMap: [80, 150, 260, 420, 680, 1000, 1500, 2200, 3200],
      floorGrowth: 0.03,
      tierMultiplier: { normal: 1, elite: 2, guardian: 4, boss: 8 },
      goldAffixEffectiveness: 1,
      dismantleGoldAffixEffectiveness: 0.5,
    },
    dismantle: {
      qualityMultiplier: { 普通: 1, 良好: 2, 優秀: 4, 史詩: 8, 傳奇: 16, 神話: 30 },
      baseByMap: [120, 220, 380, 620, 1000, 1500, 2300, 3400, 5000],
    },
    enhancementStones: {
      combatDropChanceMultiplier: 0.5,
      dismantleYieldMultiplier: 0.5,
    },
    costs: {
      socketFirst: 50_000,
      socketSecond: 200_000,
      gemFusionBeginner: 10_000,
      gemFusionIntermediate: 50_000,
      reforge: { baseGold: 600, baseStones: 1, targetedGold: 1_800, targetedStones: 3, repeatMultiplier: 1.5 },
      rerollBase: 5_000,
      affixLockFirst: 50_000,
      affixLockSecond: 150_000,
      skillReset: 50_000,
    },
  },

  gems: {
    tiers: {
      beginner: { label: "初階", mapFrom: 1, dropChance: 0.01 },
      intermediate: { label: "中階", mapFrom: 4, dropChance: 0.005 },
      advanced: { label: "高階", mapFrom: 7, dropChance: 0.001 },
    },
    fusion: {
      materialCount: 3,
      beginnerToIntermediateSuccess: 0.5,
      intermediateToAdvancedSuccess: 0.3,
      failureKeepsOneMaterial: true,
    },
    values: {
      redIron: { stat: "攻擊%", beginner: 3, intermediate: 5, advanced: 8 },
      azureGuard: { stat: "防禦%", beginner: 3, intermediate: 5, advanced: 8 },
      emeraldLife: { stat: "生命%", beginner: 4, intermediate: 7, advanced: 10 },
      thunderlight: { stat: "攻速", beginner: 3, intermediate: 5, advanced: 8 },
      eagleEye: { stat: "命中", beginner: 3, intermediate: 6, advanced: 10 },
      phantom: { stat: "閃避", beginner: 2, intermediate: 4, advanced: 6 },
      sunburst: { stat: "暴擊", beginner: 2, intermediate: 4, advanced: 6 },
      blooddrop: { stat: "吸血", beginner: 1, intermediate: 3, advanced: 5 },
      wisdom: { stat: "經驗", beginner: 4, intermediate: 7, advanced: 10 },
      greed: { stat: "金幣", beginner: 4, intermediate: 7, advanced: 10 },
    },
  },
} as const;
