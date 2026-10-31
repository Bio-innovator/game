import { BUILDING_BY_ID } from "../data/buildings.js";
import { isOperational } from "../core/state.js";


function completedBuildings(state) {
  return Object.values(state.maps).flatMap((map) => map.buildings.filter((building) => isOperational(building)));
}

export const ACHIEVEMENTS = [
  {
    id: "first-ignition",
    name: "第一次点火",
    description: "建成第一座能源设施。",
    quoteId: "wilde-stars",
    test: (state) => completedBuildings(state).some((building) => BUILDING_BY_ID[building.id]?.category === "energy"),
  },
  {
    id: "first-line",
    name: "第一条产线",
    description: "同一张地图同时拥有采集与加工设施。",
    quoteId: "haldane-universe",
    test: (state) => Object.values(state.maps).some((map) => {
      const categories = new Set(map.buildings.filter((building) => isOperational(building)).map((building) => BUILDING_BY_ID[building.id]?.category));
      return categories.has("extraction") && categories.has("processing");
    }),
  },
  {
    id: "first-blackout",
    name: "第一次断电",
    description: "首次出现供给低于需求。",
    quoteId: "clarke-magic",
    test: (state) => Object.values(state.maps).some((map) => map.energy.demand > map.energy.supply),
  },
  {
    id: "first-pulse",
    name: "第一次脉冲",
    description: "撑过第一次日冕脉冲。",
    quoteId: "nietzsche-stronger",
    test: (state) => state.stats.pulses >= 1,
  },
  {
    id: "first-research",
    name: "重新点亮知识",
    description: "完成第一项科技。",
    quoteId: "bacon-knowledge",
    test: (state) => state.techs.length >= 1,
  },
  {
    id: "first-trade",
    name: "跨图联网",
    description: "建成第一条商路。",
    quoteId: "anonymous-network",
    test: (state) => state.routes.length >= 1,
  },
  {
    id: "first-upgrade",
    name: "深层升级",
    description: "首次把设施升级到 Lv.2。",
    quoteId: "anonymous-first",
    test: (state) => Object.values(state.maps).some((map) => map.buildings.some((building) => (building?.count ?? 0) >= 2)),
  },
  {
    id: "underground-pioneer",
    name: "地下开拓者",
    description: "首次打通地下层。",
    quoteId: "anonymous-first",
    test: (state) => Object.values(state.maps).some((map) => (map.layers?.length ?? 0) > 1),
  },
  {
    id: "mega-structure",
    name: "巨型工程",
    description: "建成第一座 5×5 设施。",
    quoteId: "clarke-magic",
    test: (state) => Object.values(state.maps).some((map) => map.buildings.some((building) => building && !building.anchor && (building.size?.w ?? 1) >= 5)),
  },
  {
    id: "moon-vanguard",
    name: "月背先遣",
    description: "运载器在月背着陆。",
    quoteId: "armstrong-step",
    test: (state) => state.rocket.stage === "landed",
  },
];

export function getNewAchievements(state) {
  const unlocked = new Set(state.achievements ?? []);
  return ACHIEVEMENTS.filter((achievement) => !unlocked.has(achievement.id) && achievement.test(state));
}
