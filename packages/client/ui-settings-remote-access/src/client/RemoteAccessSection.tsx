/** Remote access control section: tunnel state, start/stop, credentials. */

import { useCallback, useEffect, useId, useState } from 'react'
import type {
  InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {
  RemoteAccessConfig,
  RemoteAccessConfigUpdate,
  RemoteAccessStatus,
} from '@deepseek-ai/dsh-api-remotes/client'
import css from './RemoteAccessSection.module.css'

/** Registration-side Remote face used by the section. */
export interface RemoteAccessSectionInjected {
  /** Read a current tunnel status snapshot. */
  status: () => Promise<RemoteAccessStatus>
  /** Start the tunnel and return the resulting snapshot. */
  start: () => Promise<RemoteAccessStatus>
  /** Stop the tunnel and return the resulting snapshot. */
  stop: () => Promise<RemoteAccessStatus>
  /** Read the current persisted configuration. */
  config: () => Promise<RemoteAccessConfig>
  /** Persist configuration changes and return the resulting configuration. */
  updateConfig: (update: RemoteAccessConfigUpdate) => Promise<RemoteAccessConfig>
}

/** Full component props assembled by the Settings slot renderer. */
export type RemoteAccessSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.remoteAccess'>
  & InjectFace<RemoteAccessSectionInjected>

/** One lifecycle view folded from the latest status snapshot. */
interface ViewState {
  status: 'loading' | 'error' | 'ready'
  snapshot?: RemoteAccessStatus
  config?: RemoteAccessConfig
}

/** Poll interval while the tunnel is running or starting. */
const POLL_MS = 4000

/** Render the remote-access control panel. */
export function RemoteAccessSection({ t, status, start, stop, config, updateConfig }: RemoteAccessSectionProps) {
  const titleId = useId()
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [configSaved, setConfigSaved] = useState<'idle' | 'saved' | 'failed'>('idle')
  const [regenDone, setRegenDone] = useState(false)
  // Draft fields (staged until Save).
  const [draftProxyPort, setDraftProxyPort] = useState('')
  const [draftUpstreamPort, setDraftUpstreamPort] = useState('')
  const [draftUser, setDraftUser] = useState('')
  const [draftPass, setDraftPass] = useState('')
  const [dirty, setDirty] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [snapshot, cfg] = await Promise.all([status(), config()])
      setState(() => {
        const next = { status: 'ready' as const, snapshot, config: cfg }
        // Seed drafts from config only when they have not been touched.
        setDraftProxyPort(draft => draft === '' ? String(cfg.proxyPort) : draft)
        setDraftUpstreamPort(draft => draft === '' ? String(cfg.upstreamPort) : draft)
        setDraftUser(draft => draft === '' ? cfg.user : draft)
        setDraftPass(draft => draft === '' ? cfg.pass : draft)
        return next
      })
    } catch {
      setState(current => current.status === 'ready' ? current : { status: 'error' })
    }
  }, [config, status])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Poll while the tunnel is live so the URL and state stay fresh.
  const running = state.snapshot?.state === 'running' || state.snapshot?.state === 'starting'
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => { void refresh() }, POLL_MS)
    return () => { clearInterval(timer) }
  }, [running, refresh])

  const run = useCallback(async (action: () => Promise<RemoteAccessStatus>): Promise<void> => {
    setBusy(true)
    try {
      const snapshot = await action()
      setState(current => ({ ...current, snapshot }))
    } catch {
      setState(current => ({ ...current, status: 'error' }))
    } finally {
      setBusy(false)
    }
  }, [])

  const onStart = (): void => { void run(start) }
  const onStop = (): void => { void run(stop) }
  const onRestart = (): void => { void run(async () => { await stop(); return await start() }) }

  const onCopy = async (): Promise<void> => {
    const url = state.snapshot?.url
    if (url === undefined) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => { setCopied(false) }, 1500)
    } catch { /* clipboard unavailable */ }
  }

  const onSaveConfig = async (): Promise<void> => {
    const proxyPort = Number(draftProxyPort)
    const upstreamPort = Number(draftUpstreamPort)
    if (!Number.isInteger(proxyPort) || proxyPort < 1 || proxyPort > 65535
      || !Number.isInteger(upstreamPort) || upstreamPort < 1 || upstreamPort > 65535) {
      setConfigSaved('failed')
      return
    }
    setBusy(true)
    try {
      const next = await updateConfig({
        proxyPort,
        upstreamPort,
        user: draftUser,
        pass: draftPass,
      })
      setState(previous => ({ ...previous, config: next }))
      setConfigSaved('saved')
      setDirty(false)
      setTimeout(() => { setConfigSaved('idle') }, 2000)
    } catch {
      setConfigSaved('failed')
    } finally {
      setBusy(false)
    }
  }

  const onRegenerate = async (): Promise<void> => {
    if (!window.confirm(t('regenConfirm'))) return
    setBusy(true)
    try {
      const next = await updateConfig({ pass: '' })
      // A blank pass asks the Host to generate a fresh secret; the resulting
      // config carries it.
      setDraftPass(next.pass)
      setRegenDone(true)
      setTimeout(() => { setRegenDone(false) }, 2500)
    } finally {
      setBusy(false)
    }
  }

  const snapshot = state.snapshot
  const cfg = state.config
  const markDirty = (): void => { setDirty(true) }
  const stateLabel = snapshot === undefined ? '' : (
    snapshot.state === 'stopped' ? t('stateStopped')
      : snapshot.state === 'starting' ? t('stateStarting')
        : snapshot.state === 'running' ? t('stateRunning')
          : t('stateError')
  )

  return (
    <div className={css.section} aria-busy={busy || state.status === 'loading'}>
      <h2 className={css.heading} id={titleId}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>

      {state.status === 'error' && snapshot === undefined ? (
        <div className={css.failure} role="alert">
          <p>{t('error')}</p>
          <button type="button" onClick={() => { setState({ status: 'loading' }); void refresh() }}>{t('retry')}</button>
        </div>
      ) : null}

      {snapshot !== undefined ? (
        <>
          <div className={css.card} data-remote-state={snapshot.state}>
            <div className={css.stateRow}>
              <span className={css.stateDot} data-state={snapshot.state} aria-hidden="true" />
              <strong>{stateLabel}</strong>
              {snapshot.state === 'error' && snapshot.error !== undefined
                ? <span className={css.errorText}>{snapshot.error}</span>
                : null}
            </div>

            {snapshot.url !== undefined ? (
              <div className={css.urlRow}>
                <span className={css.urlLabel}>{t('url')}</span>
                <code className={css.url}>{snapshot.url}</code>
                <button type="button" onClick={onCopy} className={css.linkButton}>
                  {copied ? t('copied') : t('copy')}
                </button>
                <a className={css.linkButton} href={snapshot.url} target="_blank" rel="noreferrer">{t('open')}</a>
              </div>
            ) : null}

            <div className={css.metaRow}>
              <span>{t('platform')}: <code>{snapshot.platform}</code></span>
              <span data-binary-present={snapshot.binaryPresent ? 'true' : 'false'}>
                {snapshot.binaryPresent ? t('binaryPresent') : t('binaryMissing')}
              </span>
            </div>

            <div className={css.actions}>
              {snapshot.state === 'running' || snapshot.state === 'starting' ? (
                <button type="button" onClick={onStop} disabled={busy} className={css.danger}>
                  {busy ? t('busy') : t('stop')}
                </button>
              ) : (
                <button type="button" onClick={onStart} disabled={busy} className={css.primary}>
                  {busy ? t('busy') : t('start')}
                </button>
              )}
              {snapshot.state === 'running' ? (
                <button type="button" onClick={onRestart} disabled={busy}>{t('restart')}</button>
              ) : null}
            </div>
          </div>

          {cfg !== undefined ? (
            <>
              <h3 className={css.subheading}>{t('configTitle')}</h3>
              <div className={css.form} data-fieldset>
                <label className={css.field}>
                  <span>{t('proxyPort')}</span>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={draftProxyPort}
                    onChange={(event) => { setDraftProxyPort(event.currentTarget.value); markDirty() }}
                  />
                </label>
                <label className={css.field}>
                  <span>{t('upstreamPort')}</span>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={draftUpstreamPort}
                    onChange={(event) => { setDraftUpstreamPort(event.currentTarget.value); markDirty() }}
                  />
                </label>
                <label className={css.field}>
                  <span>{t('userLabel')}</span>
                  <input
                    type="text"
                    value={draftUser}
                    onChange={(event) => { setDraftUser(event.currentTarget.value); markDirty() }}
                  />
                </label>
                <label className={css.field}>
                  <span>{t('passLabel')}</span>
                  <input
                    type="text"
                    value={draftPass}
                    onChange={(event) => { setDraftPass(event.currentTarget.value); markDirty() }}
                  />
                </label>
                <div className={css.formActions}>
                  <button type="button" onClick={onSaveConfig} disabled={busy || !dirty}>
                    {busy ? t('busy') : t('saveConfig')}
                  </button>
                  {configSaved === 'saved' ? <span className={css.ok}>{t('configSaved')}</span> : null}
                  {configSaved === 'failed' ? <span className={css.errorText}>{t('configFailed')}</span> : null}
                </div>
              </div>

              <h3 className={css.subheading}>{t('credentialTitle')}</h3>
              <div className={css.credentialRow}>
                <span>{t('userLabel')}: <code>{cfg.user}</code></span>
                <span>{t('passLabel')}: <code>{cfg.pass === '' ? '—' : cfg.pass}</code></span>
                <button type="button" onClick={onRegenerate} disabled={busy}>{t('regenerate')}</button>
                {regenDone ? <span className={css.ok}>{t('regenDone')}</span> : null}
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
