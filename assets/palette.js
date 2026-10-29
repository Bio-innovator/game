// 全局有限色板：所有像素矩阵只引用这里的单字符键。
export const DARK = {
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

export const LIGHT = {
  '.': null,
  '0': '#24262B', // 最深描边
  '1': '#34363C', // 通用描边
  '2': '#555962', // 冷灰暗部
  '3': '#70757D', // 铁灰
  '4': '#92979E', // 金属中间色
  '5': '#B0B5BA', // 金属亮部
  '6': '#D8DBDC', // 冷白高光
  '7': '#F2EFE6', // 旧纸白
  '8': '#65483B', // 焦褐
  '9': '#93634B', // 锈褐
  'a': '#B98B5E', // 土黄
  'b': '#D5B982', // 沙尘亮部
  'c': '#31483B', // 沼泽深色
  'd': '#4B6650', // 墨绿
  'e': '#70866A', // 苔绿
  'f': '#98A66B', // 生物质
  'g': '#168F91', // 能量青
  'h': '#25696B', // 能量暗部
  'i': '#63C9C2', // 能量高光
  'j': '#C84B35', // 灾变橙红
  'k': '#8C382E', // 灾变暗部
  'l': '#D98B3F', // 火光
  'm': '#805BA6', // 科研紫
  'n': '#594071', // 科研暗部
  'o': '#C0A5D8', // 科研高光
  'p': '#3C4C60', // 残骸深蓝
  'q': '#5C748A', // 宇宙钢蓝
  'r': '#7898AA', // 冰影蓝
  's': '#A6C6CC', // 冰青
  't': '#E0F0EC', // 冰白
  'u': '#5A5264', // 月背暗紫灰
  'v': '#847B8D', // 月背中间色
  'w': '#B0A8B5', // 月背亮部
  'x': '#B98432', // 燃料黄
  'y': '#61994F', // 生物高光
  'z': '#E1E5E6', // 合金高光
};

// 默认导出保持深色，兼容既有素材校验与调用方。
export const PALETTE = DARK;

function createMapPalettes(palette) {
  return {
    ash: {
      base: palette['9'],
      dark: palette['8'],
      light: palette['a'],
      accent: palette['b'],
    },
    swamp: {
      base: palette.d,
      dark: palette.c,
      light: palette.e,
      accent: palette.f,
    },
    rift: {
      base: palette['3'],
      dark: palette['2'],
      light: palette['4'],
      accent: palette['5'],
    },
    ice: {
      base: palette.s,
      dark: palette.r,
      light: palette.t,
      accent: palette.i,
    },
    orbit: {
      base: palette.p,
      dark: palette['0'],
      light: palette.q,
      accent: palette.r,
    },
    moon: {
      base: palette.v,
      dark: palette.u,
      light: palette.w,
      accent: palette['6'],
    },
  };
}

function createResourceColors(palette) {
  return {
    steel: palette['9'],
    metal: palette['5'],
    rare: palette.l,
    biomass: palette.y,
    chem: palette.f,
    chip: palette.g,
    data: palette.m,
    helium3: palette.t,
    fuel: palette.x,
    energy: palette.g,
  };
}

const MAP_PALETTES_BY_THEME = {
  dark: createMapPalettes(DARK),
  light: createMapPalettes(LIGHT),
};

const RESOURCE_COLORS_BY_THEME = {
  dark: createResourceColors(DARK),
  light: createResourceColors(LIGHT),
};

export const MAP_PALETTES = MAP_PALETTES_BY_THEME.dark;
export const RESOURCE_COLORS = RESOURCE_COLORS_BY_THEME.dark;

export function getPalette(theme = 'dark') {
  return theme === 'light' ? LIGHT : DARK;
}

export function getMapPalette(theme = 'dark') {
  return theme === 'light' ? MAP_PALETTES_BY_THEME.light : MAP_PALETTES;
}

export function getResourceColors(theme = 'dark') {
  return theme === 'light' ? RESOURCE_COLORS_BY_THEME.light : RESOURCE_COLORS;
}
