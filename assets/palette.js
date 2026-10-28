// 全局有限色板：所有像素矩阵只引用这里的单字符键。
export const PALETTE = {
  '.': null,
  '0': '#101216', // 最深描边
  '1': '#1E1E22', // 通用描边
  '2': '#34343C', // 冷灰暗部
  '3': '#4A4A52', // 铁灰
  '4': '#6B6B76', // 金属中间色
  '5': '#8A8A96', // 金属亮部
  '6': '#C4C4CE', // 冷白高光
  '7': '#E7E5DC', // 旧纸白
  '8': '#543B32', // 焦褐
  '9': '#825442', // 锈褐
  'a': '#B47A50', // 土黄
  'b': '#D0AC72', // 沙尘亮部
  'c': '#1E3028', // 沼泽深色
  'd': '#304B38', // 墨绿
  'e': '#4F6944', // 苔绿
  'f': '#849453', // 生物质
  'g': '#3FD0C9', // 能量青
  'h': '#237E7D', // 能量暗部
  'i': '#A0EEE5', // 能量高光
  'j': '#E0533D', // 灾变橙红
  'k': '#91382F', // 灾变暗部
  'l': '#F2A65A', // 火光
  'm': '#B48CE0', // 科研紫
  'n': '#674D8B', // 科研暗部
  'o': '#DECDF4', // 科研高光
  'p': '#1D2B42', // 残骸深蓝
  'q': '#304A68', // 宇宙钢蓝
  'r': '#567B96', // 冰影蓝
  's': '#91BBC7', // 冰青
  't': '#D5EEEA', // 冰白
  'u': '#453F55', // 月背暗紫灰
  'v': '#6D647C', // 月背中间色
  'w': '#A098A9', // 月背亮部
  'x': '#D4A85E', // 燃料黄
  'y': '#78B964', // 生物高光
  'z': '#D9E0E5', // 合金高光
};

export const MAP_PALETTES = {
  ash: {
    base: PALETTE['9'],
    dark: PALETTE['8'],
    light: PALETTE['a'],
    accent: PALETTE['b'],
  },
  swamp: {
    base: PALETTE.d,
    dark: PALETTE.c,
    light: PALETTE.e,
    accent: PALETTE.f,
  },
  rift: {
    base: PALETTE['3'],
    dark: PALETTE['2'],
    light: PALETTE['4'],
    accent: PALETTE['5'],
  },
  ice: {
    base: PALETTE.s,
    dark: PALETTE.r,
    light: PALETTE.t,
    accent: PALETTE.i,
  },
  orbit: {
    base: PALETTE.p,
    dark: PALETTE['0'],
    light: PALETTE.q,
    accent: PALETTE.r,
  },
  moon: {
    base: PALETTE.v,
    dark: PALETTE.u,
    light: PALETTE.w,
    accent: PALETTE['6'],
  },
};

export const RESOURCE_COLORS = {
  steel: PALETTE['9'],
  metal: PALETTE['5'],
  rare: PALETTE.l,
  biomass: PALETTE.y,
  chem: PALETTE.f,
  chip: PALETTE.g,
  data: PALETTE.m,
  helium3: PALETTE.t,
  fuel: PALETTE.x,
  energy: PALETTE.g,
};
