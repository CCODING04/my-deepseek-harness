/** Appearance row store: snapshot-mirror action and the revision guard. */
import { describe, expect, it } from 'vitest'
import { createAppearanceRowStore } from '../src/client/settings-store.ts'

describe('createAppearanceRowStore', () => {
  it('init shape: system preference with decorations on and revision at -1', () => {
    const store = createAppearanceRowStore().create()
    expect(store.getSnapshot()).toEqual({ preference: 'system', decorations: true, revision: -1 })
  })

  it('sync mirrors the preference and advances the revision', () => {
    const store = createAppearanceRowStore().create()
    store.actions.sync('dark', true, 0)
    expect(store.getSnapshot()).toEqual({ preference: 'dark', decorations: true, revision: 0 })
    store.actions.sync('light', true, 2)
    expect(store.getSnapshot().preference).toBe('light')
    expect(store.getSnapshot().revision).toBe(2)
  })

  it('revision guard drops stale and duplicate writes', () => {
    const store = createAppearanceRowStore().create()
    store.actions.sync('dark', true, 3)
    store.actions.sync('system', true, 2)
    store.actions.sync('system', true, 3)
    expect(store.getSnapshot().preference).toBe('dark')
    expect(store.getSnapshot().revision).toBe(3)
  })

  it('a decorations-only change lands on the same revision', () => {
    const store = createAppearanceRowStore().create()
    store.actions.sync('light', true, 4)
    store.actions.sync('light', false, 4)
    expect(store.getSnapshot()).toEqual({ preference: 'light', decorations: false, revision: 4 })
    // An identical repeat is dropped (no spurious renders).
    store.actions.sync('light', false, 4)
    expect(store.getSnapshot().decorations).toBe(false)
  })
})
