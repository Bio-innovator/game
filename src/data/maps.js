export const MAP_SIZE = 24;
export const TILE_SIZE = 24;
export const DAY_SECONDS = 60;

export const MAPS = [
  {
    id: 'ash',
    name: '灰烬平原',
    english: 'Ash Plains',
    description: '旧城市在低饱和的灰烬中延伸。地势平坦，风从未真正停下。',
    terrain: '灰褐尘壳覆盖破碎混凝土，裸露钢筋与风蚀沟壑构成主要地貌。',
    paletteKey: 'ash',
    palette: {
      ground: '#4A4642',
      groundAlt: '#575049',
      detail: '#706257',
      edge: '#302F31',
      accent: '#A0855B'
    },
    unlockTech: null,
    quotaCost: 0,
    startingResources: {
      steel: 90,
      metal: 30,
      rare: 0,
      biomass: 20,
      chem: 0,
      chip: 0,
      helium3: 0,
      fuel: 0,
      data: 0
    },
    baseCapacity: {
      storage: 250,
      logistics: 20,
      steel: 250,
      metal: 250,
      rare: 150,
      biomass: 200,
      chem: 200,
      chip: 150,
      helium3: 100,
      fuel: 100,
      data: 1000
    },
    solar: 1,
    wind: 1.5,
    hazard: {
      id: 'ashStorm',
      name: '灰烬风暴',
      description: '风暴持续期间全图产出减半，并可能切断外露商路。',
      minDays: 8,
      maxDays: 12,
      durationSeconds: 20,
      productionMultiplier: 0.5,
      durabilityLoss: 0,
      energyMultiplier: 1,
      routeCutChance: 0.08,
      destroyChance: 0
    }
  },
  {
    id: 'swamp',
    name: '锈蚀沼泽',
    english: 'Rust Mire',
    description: '酸液沿废弃管道回流。这里的生态仍然旺盛，只是不再欢迎访客。',
    terrain: '墨绿色酸沼、锈蚀管桥与暗色菌床交错，浅水会持续侵蚀结构。',
    paletteKey: 'swamp',
    palette: {
      ground: '#263D35',
      groundAlt: '#315044',
      detail: '#4F6650',
      edge: '#192A29',
      accent: '#8A7B45'
    },
    unlockTech: 'tech_purification2',
    quotaCost: 2,
    startingResources: {
      steel: 400,
      metal: 140,
      rare: 30,
      biomass: 60,
      chem: 40,
      chip: 40,
      helium3: 0,
      fuel: 0,
      data: 0
    },
    baseCapacity: {
      storage: 700,
      logistics: 24,
      steel: 700,
      metal: 300,
      rare: 180,
      biomass: 350,
      chem: 300,
      chip: 180,
      helium3: 100,
      fuel: 100,
      data: 1200
    },
    solar: 0.65,
    wind: 0.8,
    hazard: {
      id: 'corrosion',
      name: '腐蚀潮',
      description: '腐蚀期持续损耗建筑耐久，维修站可抵消部分损伤。',
      minDays: 6,
      maxDays: 10,
      durationSeconds: 30,
      productionMultiplier: 0.85,
      durabilityLoss: 0.08,
      energyMultiplier: 1,
      routeCutChance: 0.05,
      destroyChance: 0
    }
  },
  {
    id: 'rift',
    name: '裂谷矿带',
    english: 'Rift Belt',
    description: '矿脉暴露在地表，岩层却没有停止移动。收益与断层同样醒目。',
    terrain: '铁灰断崖与深黑裂隙切割矿区，稀土晶体沿破碎岩壁裸露。',
    paletteKey: 'rift',
    palette: {
      ground: '#4B5157',
      groundAlt: '#5B6165',
      detail: '#77756E',
      edge: '#292E35',
      accent: '#9B7658'
    },
    unlockTech: 'tech_deep_drill1',
    quotaCost: 3,
    startingResources: {
      steel: 500,
      metal: 140,
      rare: 40,
      biomass: 40,
      chem: 40,
      chip: 40,
      helium3: 0,
      fuel: 0,
      data: 0
    },
    baseCapacity: {
      storage: 900,
      logistics: 26,
      steel: 900,
      metal: 400,
      rare: 300,
      biomass: 200,
      chem: 220,
      chip: 180,
      helium3: 100,
      fuel: 100,
      data: 1200
    },
    solar: 0.9,
    wind: 0.65,
    hazard: {
      id: 'collapse',
      name: '断层塌方',
      description: '塌方会重创随机建筑，并可能摧毁未加固格位。',
      minDays: 7,
      maxDays: 11,
      durationSeconds: 8,
      productionMultiplier: 0.7,
      durabilityLoss: 0.15,
      energyMultiplier: 1,
      routeCutChance: 0.12,
      destroyChance: 0.08
    }
  },
  {
    id: 'ice',
    name: '永夜冰原',
    english: 'Night Ice',
    description: '太阳只剩星图上的坐标。冰层之下，氦-3比热量更容易获得。',
    terrain: '青白冰脊覆盖永夜荒原，蓝黑裂谷中可见冻结的旧钻井。',
    paletteKey: 'ice',
    palette: {
      ground: '#9BB8BC',
      groundAlt: '#B5CCCE',
      detail: '#D1E1DE',
      edge: '#536F7D',
      accent: '#75A9B5'
    },
    unlockTech: 'tech_insulation3',
    quotaCost: 4,
    startingResources: {
      steel: 600,
      metal: 160,
      rare: 60,
      biomass: 50,
      chem: 60,
      chip: 60,
      helium3: 20,
      fuel: 0,
      data: 0
    },
    baseCapacity: {
      storage: 1000,
      logistics: 28,
      steel: 1000,
      metal: 350,
      rare: 250,
      biomass: 220,
      chem: 280,
      chip: 220,
      helium3: 300,
      fuel: 150,
      data: 1400
    },
    solar: 0,
    wind: 1.15,
    hazard: {
      id: 'deepFreeze',
      name: '极寒锋面',
      description: '低温使全图建筑能耗提高百分之四十，并降低生产效率。',
      minDays: 6,
      maxDays: 9,
      durationSeconds: 30,
      productionMultiplier: 0.8,
      durabilityLoss: 0.03,
      energyMultiplier: 1.4,
      routeCutChance: 0.08,
      destroyChance: 0
    }
  },
  {
    id: 'orbit',
    name: '轨道残骸带',
    english: 'Orbital Debris',
    description: '失效卫星仍在执行无人接收的指令。这里适合发射，不适合停留。',
    terrain: '深蓝虚空上漂浮合金碎片与断裂舱体，辐射尘沿旧轨道聚集。',
    paletteKey: 'orbit',
    palette: {
      ground: '#17283D',
      groundAlt: '#203752',
      detail: '#36536C',
      edge: '#0D182A',
      accent: '#788DA8'
    },
    unlockTech: 'tech_space1',
    quotaCost: 5,
    startingResources: {
      steel: 600,
      metal: 180,
      rare: 80,
      biomass: 40,
      chem: 80,
      chip: 80,
      helium3: 40,
      fuel: 40,
      data: 0
    },
    baseCapacity: {
      storage: 1000,
      logistics: 35,
      steel: 1000,
      metal: 500,
      rare: 400,
      biomass: 200,
      chem: 350,
      chip: 400,
      helium3: 250,
      fuel: 300,
      data: 1800
    },
    solar: 1.35,
    wind: 0,
    hazard: {
      id: 'radiationFront',
      name: '辐射锋面',
      description: '辐射尘损伤建筑并干扰商路，断线概率显著提高。',
      minDays: 5,
      maxDays: 9,
      durationSeconds: 24,
      productionMultiplier: 0.75,
      durabilityLoss: 0.06,
      energyMultiplier: 1.1,
      routeCutChance: 0.18,
      destroyChance: 0.02
    }
  },
  {
    id: 'moon',
    name: '月背盆地',
    english: 'Farside Basin',
    description: '无线电静默覆盖盆地。文明的副本将在这里第一次不再听见地球。',
    terrain: '冷灰紫月壤环绕环形山，玻璃化陨石坑与氦-3富集层散布其间。',
    paletteKey: 'moon',
    palette: {
      ground: '#5A5868',
      groundAlt: '#6B6879',
      detail: '#878292',
      edge: '#383746',
      accent: '#AAA0B7'
    },
    unlockTech: 'rocket_landed',
    quotaCost: 0,
    startingResources: {
      steel: 800,
      metal: 1200,
      rare: 400,
      biomass: 120,
      chem: 240,
      chip: 300,
      helium3: 120,
      fuel: 100,
      data: 100
    },
    baseCapacity: {
      storage: 650,
      logistics: 40,
      steel: 900,
      metal: 1500,
      rare: 400,
      biomass: 250,
      chem: 400,
      chip: 400,
      helium3: 500,
      fuel: 350,
      data: 2500
    },
    solar: 0,
    wind: 0,
    hazard: {
      id: 'meteorShower',
      name: '陨石雨',
      description: '高频陨石打击随机格位，对未加固建筑造成严重破坏。',
      minDays: 4,
      maxDays: 7,
      durationSeconds: 16,
      productionMultiplier: 0.8,
      durabilityLoss: 0.2,
      energyMultiplier: 1.15,
      routeCutChance: 0.15,
      destroyChance: 0.1
    }
  }
];

export const MAP_BY_ID = Object.fromEntries(
  MAPS.map((map) => [map.id, map])
);
