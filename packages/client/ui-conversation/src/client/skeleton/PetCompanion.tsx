/**
 * Pet companion on the composer's left edge — a small Pokémon buddy with
 * three poses driven by live state:
 *   - idle:    empty draft, harness not running (breathing)
 *   - typing:  the user is writing (draft non-empty; fast input wiggle)
 *   - working: the harness is generating (thinking sway)
 * Every pet speaks its own lines (Pikachu "皮卡皮!", Psyduck "嘎?", Gengar
 * "嘿嘿嘿…", Jigglypuff "啵啵哩~"). Interactions:
 *   - clicking the buddy pets it (a jump + a heart bubble, then an idle line)
 *   - clicking while the harness is running reports the LIVE session state
 *     (turns · steps from the sessionStats projection) instead
 *   - a small switch button opens the roster picker
 *   - every finished run plays a short celebration jump with a "done" bubble
 * The choice persists in localStorage. Pose art lives under
 * apps/web/public/pokemon/pets/ (<pet>-<pose>.png); while a pose file is
 * missing the img falls back to the single official-artwork sprite for that
 * pet (or Pikachu).
 */
import { useEffect, useRef, useState } from 'react'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { UseProjection } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: merges the sessionStats key into SessionProjectionMap.
import type {} from '@deepseek-ai/dsh-session-stats/client'
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

/** Mood bubble flavors: a plain phrase, a petting heart, a run-finished cheer. */
export type PetMoodKind = 'phrase' | 'heart' | 'celebrate'

/** Mood bubble content: copy plus which tint to render. */
export interface PetMood {
  text: string
  kind: PetMoodKind
}

/** Per-pet personality copy, rotated randomly per bubble by pose. */
const PET_PHRASES: Record<PetId, Record<PetPose, readonly string[]>> = {
  pikachu: {
    idle: ['皮卡皮!', '今天要捕捉哪只精灵?', '等你下达指令~', '尾巴在充电中…'],
    typing: ['快输入啦!', '捕捉信号中…', '招式就绪!'],
    working: ['思考中…', '发动十万伏特!', '正在检索招式表…', '击中要害!'],
  },
  psyduck: {
    idle: ['嘎?', '头痛…想不起来了', '发呆中…', '今天也是个好天气?'],
    typing: ['嘎嘎!', '在看了在看了'],
    working: ['嘎?在想了…', '头疼也要想!', '唔…招式是啥来着'],
  },
  gengar: {
    idle: ['嘿嘿嘿…', '来玩捉迷藏吧', '暗处观察中…', '你的影子在动哦'],
    typing: ['嘿嘿,快输入吧', '影子里等你'],
    working: ['暗影球准备…', '嘿嘿,思考中', '潜入你的会话里了'],
  },
  jigglypuff: {
    idle: ['啵啵哩~', '想唱歌给你听', '胖丁甜甜的~', '呼噜呼噜…'],
    typing: ['啵啵!快点啦', '歌声准备中…'],
    working: ['唱首歌助助兴~', '啵啵哩哩…', '要用歌声催眠它!'],
  },
}

const CELEBRATE_TEXT = '完成啦!'
const HEART = '♥'

/** How long a mood bubble stays up before fading. */
const BUBBLE_MS = 2200

/** Duration of the one-shot jump animation (must match the CSS keyframes). */
const JUMP_MS = 700

function storedPet(): PetId {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return PET_ROSTER.some(pet => pet.id === value) ? value as PetId : 'pikachu'
  } catch {
    return 'pikachu'
  }
}

/** Random pick that never yields undefined under noUncheckedIndexedAccess. */
function pick(list: readonly string[]): string {
  return list[Math.floor(Math.random() * list.length)] ?? list[0] ?? ''
}

export interface PetCompanionProps {
  /** True while the harness is producing a reply (working pose). */
  running: boolean
  /** Current composer draft text (typing pose when non-empty). */
  draft: string
  /** Optional projection seat: lets the buddy read live session state
   *  (turns · steps) so its working bubble reports real battle progress. */
  useProjection?: UseProjection
}

/**
 * Render the composer's pet companion.
 * @param props - live state feeding the pose selection.
 * @returns the positioned buddy + its picker menu.
 */
export function PetCompanion({ running, draft, useProjection }: PetCompanionProps) {
  const [pet, setPet] = useState<PetId>(storedPet)
  const [open, setOpen] = useState(false)
  const [mood, setMood] = useState<PetMood | null>(null)
  const [jumping, setJumping] = useState(false)
  const jumpTimer = useRef<number | undefined>(undefined)
  const prevRunning = useRef(running)
  const prevPose = useRef<PetPose>('idle')

  const pose: PetPose = running ? 'working' : draft.trim() !== '' ? 'typing' : 'idle'

  // Live session reading: turns + steps from the durable sessionStats
  // projection (present only when a session with stats is open).
  const sessionStats = useProjection?.('sessionStats')
  const statusText = sessionStats === undefined || sessionStats.turns <= 0
    ? null
    : `第 ${sessionStats.turns} 轮 · 第 ${sessionStats.steps} 步`

  /** One-shot jump: the celebration/petting hop, played via a data-mood class. */
  const triggerJump = (): void => {
    if (jumpTimer.current !== undefined) window.clearTimeout(jumpTimer.current)
    setJumping(true)
    jumpTimer.current = window.setTimeout(() => { setJumping(false) }, JUMP_MS)
  }

  /** Pet the buddy: a hop with a heart bubble — or live battle status while running. */
  const petBuddy = (): void => {
    triggerJump()
    if (running) {
      setMood({ text: statusText ?? pick(PET_PHRASES[pet].working), kind: 'phrase' })
      return
    }
    setMood({ text: HEART, kind: 'heart' })
    window.setTimeout(() => {
      // The heart flashes briefly, then the buddy says an idle line.
      setMood({ text: pick(PET_PHRASES[pet].idle), kind: 'phrase' })
    }, 420)
  }

  // Working onset: the buddy announces it started thinking, with live state.
  useEffect(() => {
    const was = prevPose.current
    prevPose.current = pose
    if (pose === 'working' && was !== 'working') {
      setMood({ text: statusText ?? pick(PET_PHRASES[pet].working), kind: 'phrase' })
    }
  }, [pose, pet, statusText])

  // Run-finished celebration: the harness just stopped producing → cheer.
  useEffect(() => {
    const wasRunning = prevRunning.current
    prevRunning.current = running
    if (wasRunning && !running) {
      triggerJump()
      const done = sessionStats === undefined || sessionStats.turns <= 0
        ? CELEBRATE_TEXT
        : `完成 ${sessionStats.turns} 轮!`
      setMood({ text: done, kind: 'celebrate' })
    }
  }, [running, statusText, sessionStats])

  // Mood bubble auto-fade.
  useEffect(() => {
    if (mood === null) return
    const id = window.setTimeout(() => { setMood(null) }, BUBBLE_MS)
    return () => { window.clearTimeout(id) }
  }, [mood])

  // Clear the jump timer on unmount.
  useEffect(() => () => {
    if (jumpTimer.current !== undefined) window.clearTimeout(jumpTimer.current)
  }, [])

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
      {mood !== null && (
        <div className={`${css.bubble} ${mood.kind === 'heart' ? css.bubbleHeart : mood.kind === 'celebrate' ? css.bubbleCelebrate : ''}`} role="status">
          {mood.text}
        </div>
      )}
      <div className={css.row}>
        <button
          type="button"
          className={css.buddy}
          aria-label={`伙伴:${current.name}(点击抚摸)`}
          title={current.name}
          onClick={petBuddy}
        >
          <img
            className={css.art}
            data-pose={pose}
            data-mood={jumping ? 'jump' : undefined}
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
        <Menu
          open={open}
          items={items}
          selectedId={pet}
          onSelect={(id) => {
            setPet(id as PetId)
            setOpen(false)
            try { localStorage.setItem(STORAGE_KEY, id) } catch { /* private mode */ }
            setMood({ text: '换装完成!', kind: 'celebrate' })
            triggerJump()
          }}
          onClose={() => { setOpen(false) }}
          side="top"
          align="end"
          anchor={(
            <button
              type="button"
              className={css.switcher}
              aria-label="切换伙伴"
              title="切换伙伴"
              aria-expanded={open}
              onClick={() => { setOpen(!open) }}
            >
              <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden>
                <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        />
      </div>
    </div>
  )
}
