/** Remote access control registered into Web Settings. */

import type {
  RemoteAccessConfig,
  RemoteAccessConfigUpdate,
  RemoteAccessStatus,
} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  RemoteAccessSection,
  type RemoteAccessSectionInjected,
} from './RemoteAccessSection.tsx'
import { en, zh, type RemoteAccessLocaleKey } from './locales.ts'

export type {
  RemoteAccessSectionInjected,
  RemoteAccessSectionProps,
} from './RemoteAccessSection.tsx'
export type { RemoteAccessLocaleKey } from './locales.ts'
export type {
  RemoteAccessConfig,
  RemoteAccessConfigUpdate,
  RemoteAccessStatus,
} from '@deepseek-ai/dsh-api-remotes/client'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Remote access control copy. */
    'settings.remoteAccess': RemoteAccessLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.remoteAccess'

/** Services required by the Settings registration and generated Remote face. */
export const inject = ['slots', 'locale', 'remote', 'remote.remoteAccess']

/** Unwrap one generated Remote result, throwing its failure detail. */
async function unwrap<T>(
  method: () => Promise<{ ok: true; value: T } | { ok: false; error: { code: string; message: string } }>,
): Promise<T> {
  const result = await method()
  if (!result.ok) {
    throw new Error(`remoteAccess: ${result.error.code}: ${result.error.message}`)
  }
  return result.value
}

/** Contribute the remote-access section to Settings. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-remote-access: dictionaries')

  const t = ctx.locale.bind(NS)

  const injected = (): RemoteAccessSectionInjected => ({
    status: () => unwrap<RemoteAccessStatus>(() => ctx.remote.remoteAccess.status()),
    start: () => unwrap<RemoteAccessStatus>(() => ctx.remote.remoteAccess.start()),
    stop: () => unwrap<RemoteAccessStatus>(() => ctx.remote.remoteAccess.stop()),
    config: () => unwrap<RemoteAccessConfig>(() => ctx.remote.remoteAccess.config()),
    updateConfig: (update: RemoteAccessConfigUpdate): Promise<RemoteAccessConfig> =>
      unwrap<RemoteAccessConfig>(() => ctx.remote.remoteAccess.updateConfig(update)),
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'remote-access',
    order: 8,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, RemoteAccessSection))
}
