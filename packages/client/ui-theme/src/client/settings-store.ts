/**
 * Appearance row slot store: a mirror of the theme service snapshot. The
 * plugin's apply-world change listener is the only writer; the row component
 * reads via props.useStore.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import type { ThemePreference } from '../theme-settings.ts'

/** Store state mirrored from the theme snapshot. */
export interface AppearanceRowState {
  /** Persisted preference (selection state reads this, never the resolved active theme). */
  preference: ThemePreference
  /** Poké ornaments toggle state. */
  decorations: boolean
  /** Service revision; -1 until first sync so revision 0 lands as a change. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type AppearanceRowActions = {
  sync: (draft: AppearanceRowState, preference: ThemePreference, decorations: boolean, revision: number) => void
}

/**
 * Declares the Appearance row state and write surface.
 * @returns the store handle.
 */
export function createAppearanceRowStore(): EngineStoreHandle<AppearanceRowState, AppearanceRowActions> {
  return defineStore({
    init: (): AppearanceRowState => ({ preference: 'system', decorations: true, revision: -1 }),
    actions: {
      sync: (d, preference: ThemePreference, decorations: boolean, revision: number) => {
        // A decorations toggle reuses the current theme revision (it is not a
        // theme change), so only skip when every field is unchanged.
        if (revision <= d.revision && preference === d.preference && decorations === d.decorations) return
        d.preference = preference
        d.decorations = decorations
        d.revision = revision
      },
    },
  })
}
