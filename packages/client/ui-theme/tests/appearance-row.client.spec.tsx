// @vitest-environment jsdom
/** AppearanceRow behavior: three cubes, selection follows the persisted
 * preference, clicks drive setTheme. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { AppearanceRow } from '../src/client/AppearanceRow.tsx'
import type { AppearanceRowComponentProps } from '../src/client/AppearanceRow.tsx'
import { createAppearanceRowStore } from '../src/client/settings-store.ts'
import type { ThemePreference } from '../src/client/index.ts'

afterEach(cleanup)

const COPY: Record<string, string> = {
  'appearance.title': 'Appearance',
  'appearance.light': 'Light',
  'appearance.dark': 'Dark',
  'appearance.system': 'System',
  'appearance.decorations': 'Poké ornaments (stickers & art)',
  'appearance.palette': 'Palette',
  'appearance.palette.classic': 'Pokéball Red',
  'appearance.palette.gengar': 'Gengar Violet',
  'appearance.palette.ocean': 'Ocean Blue',
}

/** Empty global standard-kit hooks (the row reads neither). */
function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  return bindSnapshotSelector(store)
}
function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceListState>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined,
  })
  return bindSnapshotSelector(store)
}

function mount(preference: ThemePreference = 'system') {
  // Real store instance — the sanctioned zero-machinery path for tests.
  const store = createAppearanceRowStore().create()
  store.actions.sync(preference, true, 'classic', 0)
  const setTheme = vi.fn()
  const setDecorations = vi.fn()
  const setPalette = vi.fn()
  const props: AppearanceRowComponentProps = {
    useSessions: emptySessions(),
    useWorkspaces: emptyWorkspaces(),
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: (key: string) => COPY[key] ?? key,
    setTheme,
    setDecorations,
    setPalette,
  }
  render(<AppearanceRow {...props} />)
  return { store, setTheme, setDecorations, setPalette }
}

const pressed = (name: RegExp): string | null =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed')

describe('AppearanceRow', () => {
  it('renders the title and three cubes with the preference cube selected', () => {
    mount('dark')
    expect(screen.getByText('Appearance')).toBeDefined()
    expect(pressed(/Dark/)).toBe('true')
    expect(pressed(/Light/)).toBe('false')
    expect(pressed(/System/)).toBe('false')
  })

  it('click drives setTheme; selection follows the store mirror, not the click echo', () => {
    const b = mount('dark')
    fireEvent.click(screen.getByRole('button', { name: /Light/ }))
    expect(b.setTheme).toHaveBeenCalledWith('light')
    // No store write yet: selection is unchanged.
    expect(pressed(/Dark/)).toBe('true')
    act(() => { b.store.actions.sync('light', true, 'classic', 1) })
    expect(pressed(/Light/)).toBe('true')
    expect(pressed(/Dark/)).toBe('false')
  })

  it('renders the decorations toggle and drives setDecorations', () => {
    const b = mount('light')
    const toggle = screen.getByRole('button', { name: /Poké ornaments/ })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(toggle)
    expect(b.setDecorations).toHaveBeenCalledWith(false)
  })

  it('renders the palette row with classic selected and drives setPalette', () => {
    const b = mount('system')
    expect(pressed(/Pokéball Red/)).toBe('true')
    expect(pressed(/Gengar Violet/)).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: /Gengar Violet/ }))
    expect(b.setPalette).toHaveBeenCalledWith('gengar')
    // No store write yet: selection is unchanged.
    expect(pressed(/Pokéball Red/)).toBe('true')
    act(() => { b.store.actions.sync('system', true, 'gengar', 1) })
    expect(pressed(/Gengar Violet/)).toBe('true')
    expect(pressed(/Pokéball Red/)).toBe('false')
  })
})
