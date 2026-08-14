/**
 * Vision-supplier card controller: edits the `host-image-input` settings
 * section's `providers` list. The list is order = priority (first supplier
 * tried first; failures fall through to the next), so "default supplier"
 * means "first entry". Edits stage in a local draft and write on save.
 */

import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** Settings namespace the Host image-input plugin serves. */
export const VISION_NS = 'host-image-input'

/** One configured vision supplier (mirrors the Host provider schema). */
export interface VisionProviderEntry {
  name: string
  endpoint: string
  apiKey: string
  model: string
  maxTokens: number
  usesMaxCompletionTokens: boolean
  authHeader: string
}

/** Card snapshot. */
export interface VisionProvidersState {
  available: boolean
  writable: boolean
  saving: boolean
  failed: boolean
  dirty: boolean
  invalid: boolean
  /** The stored list (Host truth). */
  providers: VisionProviderEntry[]
  /** The locally staged list (edits apply here until save). */
  draft: VisionProviderEntry[]
}

/** Registration-side face the card's slot entry injects. */
export interface VisionProvidersFace {
  hooks: {
    /** Card snapshot bound by the renderer as useVisionProviders. */
    visionProviders: SnapshotStore<VisionProvidersState>
  }
  actions: {
    /** Move one entry up/down in priority order. */
    move: (index: number, delta: number) => void
    /** Remove one entry. */
    remove: (index: number) => void
    /** Append a new supplier. */
    add: (entry: VisionProviderEntry) => void
    /** Patch one staged entry (e.g. the add form). */
    edit: (index: number, patch: Partial<VisionProviderEntry>) => void
    /** Write the staged list. */
    save: () => void
    /** Drop staged edits. */
    discard: () => void
  }
}

const EMPTY: VisionProviderEntry = {
  name: '', endpoint: '', apiKey: '', model: '', maxTokens: 800,
  usesMaxCompletionTokens: false, authHeader: 'Authorization',
}

/** Bridges the `host-image-input` settings scope onto the supplier card. */
export class VisionProvidersController {
  private readonly store: SnapshotStore<VisionProvidersState>
  private draft: VisionProviderEntry[] = []
  private saving = false
  private failed = false

  /**
   * @param scope - the bound settings scope for the `host-image-input` namespace.
   */
  constructor(private readonly scope: SettingsScope<{ providers?: VisionProviderEntry[] }>) {
    this.store = createSnapshotStore(this.projection())
    this.draft = this.stored()
    scope.subscribe(() => {
      // A change from another surface re-seeds the draft (draft edits stay
      // local until save; a foreign write wins).
      this.draft = this.stored()
      this.publish()
    })
  }

  private stored(): VisionProviderEntry[] {
    const value = this.scope.getSnapshot().value
    return Array.isArray(value?.providers)
      ? value.providers.map(entry => ({ ...EMPTY, ...entry }))
      : []
  }

  private projection(): VisionProvidersState {
    const snapshot = this.scope.getSnapshot()
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      saving: this.saving,
      failed: this.failed,
      invalid: false,
      dirty: JSON.stringify(this.draft) !== JSON.stringify(this.stored()),
      providers: this.stored(),
      draft: this.draft,
    }
  }

  /** The slot-entry injection face: snapshot hook + list actions. */
  inject(): VisionProvidersFace {
    return {
      hooks: { visionProviders: this.store },
      actions: {
        move: (index, delta) => {
          const target = index + delta
          if (target < 0 || target >= this.draft.length) return
          const next = [...this.draft]
          const entry = next[index]
          const other = next[target]
          // noUncheckedIndexedAccess: guard instead of asserting.
          if (entry === undefined || other === undefined) return
          next[index] = other
          next[target] = entry
          this.draft = next
          this.publish()
        },
        remove: (index) => {
          this.draft = this.draft.filter((_, i) => i !== index)
          this.publish()
        },
        add: (entry) => {
          this.draft = [...this.draft, entry]
          this.publish()
        },
        edit: (index, patch) => {
          this.draft = this.draft.map((entry, i) => (i === index ? { ...entry, ...patch } : entry))
          this.publish()
        },
        save: () => { void this.save() },
        discard: () => {
          if (!this.projection().dirty && !this.failed) return
          this.draft = this.stored()
          this.failed = false
          this.publish()
        },
      },
    }
  }

  private async save(): Promise<void> {
    if (this.saving) return
    this.saving = true
    this.failed = false
    this.publish()
    try {
      await this.scope.set('providers', this.draft)
      this.failed = JSON.stringify(this.stored()) !== JSON.stringify(this.draft)
    } catch {
      this.failed = true
    }
    this.saving = false
    this.publish()
  }

  private publish(): void {
    this.store.set(this.projection())
  }
}
