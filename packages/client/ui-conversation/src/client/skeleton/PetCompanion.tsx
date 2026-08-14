/**
 * Pet companion on the composer's left edge — a small Pokémon buddy with
 * three poses driven by live state:
 *   - idle:    empty draft, harness not running (breathing)
 *   - typing:  the user is writing (draft non-empty; fast input wiggle)
 *   - working: the harness is generating (thinking sway)
 * Clicking the buddy opens a picker with four Pokémon; the choice persists
 * in localStorage. Pose art lives under apps/web/public/pokemon/pets/
 * (<pet>-<pose>.png); while a pose file is missing the img falls back to the
 * single official-artwork sprite for that pet (or Pikachu).
 */
import { useState } from 'react'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './PetCompanion.module.css'

/** Selectable companion roster. */
export const PET_ROSTER = [
  { id: 'pikachu', name: '皮卡丘' },
  { id: 'psyduck', name: '可达鸭' },
  { id: 'gengar', name: '耿鬼' },
  { id: 'jigglypuff', name: '胖丁' },
] as const

export type PetId = typeof PET_ROSTER[number]['id']
export type PetPose = 'idle' | 'typing' | 'working'

/** localStorage key for the durable companion choice. */
const STORAGE_KEY = 'dsh-pokemon-pet'

/** Fallback art for pets whose pose art has not been generated yet. */
const FALLBACK_ART = '/pokemon/pikachu.png'

function storedPet(): PetId {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return PET_ROSTER.some(pet => pet.id === value) ? value as PetId : 'pikachu'
  } catch {
    return 'pikachu'
  }
}

export interface PetCompanionProps {
  /** True while the harness is producing a reply (working pose). */
  running: boolean
  /** Current composer draft text (typing pose when non-empty). */
  draft: string
}

/**
 * Render the composer's pet companion.
 * @param props - live state feeding the pose selection.
 * @returns the positioned buddy + its picker menu.
 */
export function PetCompanion({ running, draft }: PetCompanionProps) {
  const [pet, setPet] = useState<PetId>(storedPet)
  const [open, setOpen] = useState(false)

  const pose: PetPose = running ? 'working' : draft.trim() !== '' ? 'typing' : 'idle'
  // Pose art: official artwork (idle, png), back sprite (typing, png) and the
  // animated battle sprite (working, gif) — see apps/web/public/pokemon/pets/.
  const poseExt = pose === 'working' ? 'gif' : 'png'
  const current = PET_ROSTER.find(entry => entry.id === pet) ?? PET_ROSTER[0]
  const items: MenuEntry[] = PET_ROSTER.map(entry => ({
    id: entry.id,
    label: entry.name,
    icon: <img
      className={css.menuIcon}
      src={`/pokemon/pets/${entry.id}-idle.png`}
      alt=""
      width={18}
      height={18}
      draggable={false}
      onError={(event) => {
        const img = event.currentTarget
        if (!img.src.endsWith(FALLBACK_ART)) img.src = FALLBACK_ART
      }}
    />,
  }))

  return (
    <div className={css.anchor}>
      <Menu
        open={open}
        items={items}
        selectedId={pet}
        onSelect={(id) => {
          setPet(id as PetId)
          setOpen(false)
          try { localStorage.setItem(STORAGE_KEY, id) } catch { /* private mode */ }
        }}
        onClose={() => { setOpen(false) }}
        side="top"
        anchor={
          <button
            type="button"
            className={css.buddy}
            aria-label={`伙伴:${current.name}`}
            title={current.name}
            onClick={() => { setOpen(!open) }}
          >
            <img
              className={css.art}
              data-pose={pose}
              src={`/pokemon/pets/${pet}-${pose}.${poseExt}`}
              alt=""
              width={48}
              height={48}
              draggable={false}
              onError={(event) => {
                // Pose art missing: fall back to the single sprite (only
                // replace once, so a broken fallback cannot loop).
                const img = event.currentTarget
                if (!img.src.endsWith(FALLBACK_ART)) img.src = FALLBACK_ART
              }}
            />
          </button>
        }
      />
    </div>
  )
}
