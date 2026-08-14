/* The vision-supplier card: ordered provider list with add/move/remove plus
   a compact add form. Order is priority; the first entry is the default. */

import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { PluginCard } from './PluginCard.tsx'
import type { VisionProvidersFace, VisionProviderEntry } from './vision-providers-card-controller.ts'
import type {} from './slot-contract.ts'
import css from './VisionProvidersCard.module.css'

/** Props the renderer binds for the vision-supplier card. */
export type VisionProvidersCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'settings.plugins'>
  & InjectFace<VisionProvidersFace>

/** Blank add-form draft. */
function blankEntry(): VisionProviderEntry {
  return {
    name: '', endpoint: '', apiKey: '', model: '', maxTokens: 800,
    usesMaxCompletionTokens: false, authHeader: 'Authorization',
  }
}

/**
 * Render the vision-supplier card.
 * @param props - locale copy, the card snapshot, and its list actions.
 * @returns the card.
 */
export function VisionProvidersCard(props: VisionProvidersCardProps) {
  const { t } = props
  const state = props.useVisionProviders(snapshot => snapshot)
  const [form, setForm] = useState<VisionProviderEntry>(blankEntry)
  const [showForm, setShowForm] = useState(false)

  if (!state.available) return null
  const disabled = !state.writable

  const add = (): void => {
    if (form.endpoint.trim() === '' || form.model.trim() === '') return
    props.actions.add({ ...form, name: form.name.trim() || form.model.trim() })
    setForm(blankEntry())
    setShowForm(false)
  }

  return (
    <PluginCard
      t={t}
      titleKey="visionTitle"
      descriptionKey="visionDescription"
      state={state}
      onSave={props.actions.save}
      onDiscard={props.actions.discard}
    >
      {state.draft.length === 0 && !showForm && (
        <div className={css.empty}>{t('visionEmpty')}</div>
      )}
      {state.draft.map((entry, index) => (
        <div key={`${entry.name}-${index}`} className={css.row}>
          {index === 0 && <span className={css.defaultBadge}>{t('visionDefault')}</span>}
          <div className={css.rowBody}>
            <span className={css.rowName}>{entry.name || entry.model || `#${index + 1}`}</span>
            <span className={css.rowMeta}>{entry.model} · {entry.endpoint.replace(/\/+$/, '') || '—'}</span>
          </div>
          <div className={css.rowActions}>
            <button type="button" disabled={disabled || index === 0} title={t('visionUp')}
              onClick={() => { props.actions.move(index, -1) }}>↑</button>
            <button type="button" disabled={disabled || index === state.draft.length - 1} title={t('visionDown')}
              onClick={() => { props.actions.move(index, 1) }}>↓</button>
            <button type="button" disabled={disabled} title={t('visionRemove')}
              onClick={() => { props.actions.remove(index) }}>✕</button>
          </div>
        </div>
      ))}

      {showForm ? (
        <div className={css.form}>
          <div className={css.formGrid}>
            <input
              className={css.input}
              placeholder={t('visionName')}
              value={form.name}
              disabled={disabled}
              onChange={(e) => { setForm({ ...form, name: e.target.value }) }}
            />
            <input
              className={css.input}
              placeholder={t('visionEndpoint') + '(https://…/v1)'}
              value={form.endpoint}
              disabled={disabled}
              onChange={(e) => { setForm({ ...form, endpoint: e.target.value }) }}
            />
            <input
              className={css.input}
              placeholder={t('visionModel')}
              value={form.model}
              disabled={disabled}
              onChange={(e) => { setForm({ ...form, model: e.target.value }) }}
            />
            <input
              className={css.input}
              placeholder={t('visionKey')}
              type="password"
              value={form.apiKey}
              disabled={disabled}
              onChange={(e) => { setForm({ ...form, apiKey: e.target.value }) }}
            />
          </div>
          <label className={css.check}>
            <input
              type="checkbox"
              checked={form.usesMaxCompletionTokens}
              disabled={disabled}
              onChange={(e) => { setForm({ ...form, usesMaxCompletionTokens: e.target.checked }) }}
            />
            {t('visionMaxCompletion')}
          </label>
          <div className={css.formActions}>
            <button type="button" className={css.addBtn} disabled={disabled} onClick={add}>{t('visionAdd')}</button>
            <button type="button" className={css.cancelBtn} disabled={disabled}
              onClick={() => { setShowForm(false); setForm(blankEntry()) }}>{t('cancel')}</button>
          </div>
        </div>
      ) : (
        <button type="button" className={css.addBtn} disabled={disabled} onClick={() => { setShowForm(true) }}>
          {t('visionAddSupplier')}
        </button>
      )}
    </PluginCard>
  )
}
