/**
 * Appearance preference row registered into the General section item slot
 * (figma 501:30012 'Frame 2117131228'): title + three preference cubes.
 * Registered by this package — the theme feature owns its own settings
 * surface. Selection follows the persisted preference, never the resolved
 * active theme.
 */
import clsx from 'clsx'
import {
  IconDarkOutline16, IconFollowsystemOutline16, IconLightOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { ThemePalette, ThemePreference } from '../theme-settings.ts'
import type { ThemeKey } from './locales.ts'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { createAppearanceRowStore } from './settings-store.ts'
import css from './AppearanceRow.module.css'

/** Injected business face: the preference write (t rides the standard locale seat). */
export interface AppearanceRowInjected {
  /** Switch the theme preference. */
  setTheme: (id: ThemePreference) => void
  /** Toggle the Poké ornaments layer. */
  setDecorations: (value: boolean) => void
  /** Switch the color palette. */
  setPalette: (value: ThemePalette) => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type AppearanceRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createAppearanceRowStore>>
  & PropsLocale<'settings.theme'> & AppearanceRowInjected

/** Cube order and icons (figma 501:30015-30017: Light, Dark, System). */
const CUBES: readonly { id: ThemePreference; labelKey: ThemeKey; Icon: typeof IconLightOutline16 }[] = [
  { id: 'light', labelKey: 'appearance.light', Icon: IconLightOutline16 },
  { id: 'dark', labelKey: 'appearance.dark', Icon: IconDarkOutline16 },
  { id: 'system', labelKey: 'appearance.system', Icon: IconFollowsystemOutline16 },
]

/** Palette order with their swatch tint (the Pokéball trio of palettes). */
const PALETTES: readonly { id: ThemePalette; labelKey: ThemeKey; swatch: string | undefined }[] = [
  { id: 'classic', labelKey: 'appearance.palette.classic', swatch: css.swatchClassic },
  { id: 'gengar', labelKey: 'appearance.palette.gengar', swatch: css.swatchGengar },
  { id: 'ocean', labelKey: 'appearance.palette.ocean', swatch: css.swatchOcean },
]

/**
 * Render the Appearance row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function AppearanceRow({ t, setTheme, setDecorations, setPalette, useStore }: AppearanceRowComponentProps) {
  const preference = useStore(s => s.preference)
  const decorations = useStore(s => s.decorations)
  const palette = useStore(s => s.palette)
  return (
    <div className={css.group}>
      <div className={css.title}>{t('appearance.title')}</div>
      <div className={css.cubeRow}>
        {CUBES.map(({ id, labelKey, Icon }) => (
          <button
            key={id}
            type="button"
            className={clsx(css.themeCube, preference === id && css.selected)}
            aria-pressed={preference === id}
            onClick={() => { setTheme(id) }}
          >
            <Icon />
            {t(labelKey)}
          </button>
        ))}
      </div>
      <div className={css.title}>{t('appearance.palette')}</div>
      <div className={css.cubeRow}>
        {PALETTES.map(({ id, labelKey, swatch }) => (
          <button
            key={id}
            type="button"
            className={clsx(css.themeCube, palette === id && css.selected)}
            aria-pressed={palette === id}
            onClick={() => { setPalette(id) }}
          >
            <span className={swatch} aria-hidden />
            {t(labelKey)}
          </button>
        ))}
      </div>
      <div className={css.decorRow}>
        <button
          type="button"
          className={clsx(css.decorToggle, decorations && css.decorToggleOn)}
          aria-label={t('appearance.decorations')}
          aria-pressed={decorations}
          onClick={() => { setDecorations(!decorations) }}
        >
          <span className={css.decorThumb} />
        </button>
        <span className={css.decorLabel}>{t('appearance.decorations')}</span>
      </div>
    </div>
  )
}
