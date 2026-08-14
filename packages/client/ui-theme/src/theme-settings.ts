/** Theme preferences stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Built-in preferences accepted at the registry and settings boundaries. */
export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const

/** Settings namespace owned by the theme plugin. */
export const THEME_SETTINGS_NAMESPACE = 'ui-theme'

/** Field carrying the selected built-in theme preference. */
export const THEME_PREFERENCE_FIELD = 'preference'

/** Field carrying the Poké ornaments toggle (floating stickers, sidebar art). */
export const DECORATIONS_FIELD = 'decorations'

/** Built-in color palettes selectable by the product Appearance row. */
export const THEME_PALETTES = ['classic', 'gengar', 'ocean'] as const

/** Field carrying the selected color palette. */
export const PALETTE_FIELD = 'palette'

/** Theme preference persisted by the product Appearance row. */
export type ThemePreference = typeof THEME_PREFERENCES[number]

/** Color palette id persisted by the product Appearance row. */
export type ThemePalette = typeof THEME_PALETTES[number]

/** Default preference when the user-settings document has no override. */
export const DEFAULT_PREFERENCE: ThemePreference = 'system'

/** Default palette when the user-settings document has no override. */
export const DEFAULT_PALETTE: ThemePalette = 'classic'

/** Durable theme section shared by the Host schema and the browser scope. */
export interface ThemeSettings {
  /** Selected built-in preference. */
  preference: ThemePreference
  /** Poké ornaments toggle: floating stickers and sidebar background art. */
  decorations: boolean
  /** Color palette: classic Pokéball red / Gengar violet / ocean blue. */
  palette: ThemePalette
}

/** Durable theme schema; also the wire envelope the browser scope validates against. */
export const ThemeSettingsSchema: z<ThemeSettings> = z.object({
  [THEME_PREFERENCE_FIELD]: z.union([...THEME_PREFERENCES]).default(DEFAULT_PREFERENCE),
  [DECORATIONS_FIELD]: z.boolean().default(true),
  [PALETTE_FIELD]: z.union([...THEME_PALETTES]).default(DEFAULT_PALETTE),
})

/**
 * Narrow one wire or registry value to a persistable palette.
 * @param value - value crossing the settings or registry boundary.
 * @returns whether the value is a built-in palette.
 */
export function isThemePalette(value: unknown): value is ThemePalette {
  return THEME_PALETTES.some(palette => palette === value)
}

/**
 * Narrow one wire or registry value to a persistable preference.
 * @param value - value crossing the settings or registry boundary.
 * @returns whether the value is a built-in preference.
 */
export function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.some(preference => preference === value)
}
