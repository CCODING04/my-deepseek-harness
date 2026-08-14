/** `settings.theme` namespace dictionaries (the Appearance row's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'appearance.title': '外观',
  'appearance.light': '浅色',
  'appearance.dark': '深色',
  'appearance.system': '跟随系统',
  'appearance.decorations': 'Poké 装饰(挂件与背景)',
  'appearance.palette': '配色',
  'appearance.palette.classic': '精灵球红',
  'appearance.palette.gengar': '耿鬼紫',
  'appearance.palette.ocean': '深海蓝',
} satisfies Record<string, string>

/** The settings.theme namespace key union. */
export type ThemeKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'appearance.title': 'Appearance',
  'appearance.light': 'Light',
  'appearance.dark': 'Dark',
  'appearance.system': 'System',
  'appearance.decorations': 'Poké ornaments (stickers & art)',
  'appearance.palette': 'Palette',
  'appearance.palette.classic': 'Pokéball Red',
  'appearance.palette.gengar': 'Gengar Violet',
  'appearance.palette.ocean': 'Ocean Blue',
} satisfies Record<ThemeKey, string>
