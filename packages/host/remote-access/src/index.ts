/**
 * @deepseek-ai/dsh-host-remote-access — WebUI-controlled remote access.
 *
 * Two cooperating pieces:
 *
 * 1. An inlined auth proxy: an HTTP server on the loopback interface that
 *    enforces Basic Auth (plus a cookie for browser WebSocket handshakes),
 *    rewrites Host/Origin to the loopback upstream so dsh's /api trust fence
 *    passes, and forwards to the local dsh web server. It is pure Node http,
 *    so it runs identically on Windows, Linux, and macOS.
 *
 * 2. A Cloudflare quick tunnel child process. The cloudflared binary is
 *    fetched per platform from GitHub Releases on first use and cached under
 *    the harness home. Starting the tunnel spawns cloudflared pointing at the
 *    auth proxy; the public `*.trycloudflare.com` URL is parsed from its log.
 *
 * The service exposes Remote methods (`status`, `start`, `stop`, `config`,
 * `updateConfig`) that the browser Settings surface calls through
 * `ctx.remote.remoteAccess`. Config and credentials persist in the settings
 * namespace `remote-access`.
 */

import { createServer, request, type IncomingMessage, type ServerResponse, type Server } from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { arch, platform } from 'node:os'
import { join } from 'node:path'
import type { Duplex } from 'node:stream'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { settingsNamespace, type SettingsScope } from '@deepseek-ai/dsh-settings'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import type {
  RemoteAccessConfig,
  RemoteAccessConfigUpdate,
  RemoteAccessPlatform,
  RemoteAccessState,
  RemoteAccessStatus,
} from './types.ts'

export type * from './types.ts'

/** Stable Cordis plugin name. */
export const name = 'host-remote-access'

/** Settings namespace storing the persisted config + credentials. */
export const SETTINGS_NS = 'remote-access'

/** Where the per-platform cloudflared binary is cached. */
export const BIN_DIR = dshHomePath('remote-access', 'bin')

const COOKIE_NAME = 'dsh_tunnel_auth'
const TUNNEL_URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/

/** Settings section schema (schemastery). */
const ConfigSchema = z.object({
  proxyPort: z.natural().min(1).max(65535).default(8443),
  upstreamPort: z.natural().min(1).max(65535).default(3080),
  user: z.string().default('dsh'),
  pass: z.string().default(''),
  token: z.string().default(''),
})

/** Stored section shape (hand-written to avoid z.infer on schemastery). */
interface StoredConfig {
  proxyPort?: number
  upstreamPort?: number
  user?: string
  pass?: string
  token?: string
}

/** Resolve the GitHub asset key for the current platform. */
export function cloudflaredAssetName(): RemoteAccessPlatform | null {
  const archName = arch() // 'x64' | 'arm64' | ...
  const archSuffix = archName === 'arm64' ? 'arm64' : archName === 'x64' ? 'amd64' : null
  if (archSuffix === null) return 'unsupported'
  switch (platform()) {
    case 'win32': return 'win32-x64'
    case 'linux': return archSuffix === 'arm64' ? 'linux-arm64' : 'linux-x64'
    case 'darwin': return archSuffix === 'arm64' ? 'darwin-arm64' : 'darwin-x64'
    default: return 'unsupported'
  }
}

/** GitHub asset filename for one platform key. */
export function assetFile(platformKey: RemoteAccessPlatform): string {
  switch (platformKey) {
    case 'win32-x64': return 'cloudflared-windows-amd64.exe'
    case 'linux-x64': return 'cloudflared-linux-amd64'
    case 'linux-arm64': return 'cloudflared-linux-arm64'
    case 'darwin-x64': return 'cloudflared-darwin-amd64'
    case 'darwin-arm64': return 'cloudflared-darwin-arm64'
    default: throw new Error(`remote-access: unsupported platform ${platformKey}`)
  }
}

/** Download the cloudflared binary for this platform, cached under the harness home. */
export async function ensureCloudflaredBinary(ctx: Context, platformKey: RemoteAccessPlatform): Promise<string> {
  const file = assetFile(platformKey)
  const target = join(BIN_DIR, file)
  if (existsSync(target)) return target
  mkdirSync(BIN_DIR, { recursive: true })
  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${file}`
  ctx.logger.info(`remote-access: downloading ${file} from ${url}`)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`remote-access: cloudflared download failed (${response.status}): ${url}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  // Atomic-ish write: write to a temp name then rename, so a crash mid-download
  // never leaves a truncated binary that passes the existsSync check.
  const tmp = `${target}.tmp-${Date.now()}`
  writeFileSync(tmp, bytes)
  if (platformKey !== 'win32-x64') {
    try { chmodSync(tmp, 0o755) } catch { /* Windows ignores chmod; harmless */ }
  }
  rmSync(target, { force: true })
  renameSync(tmp, target)
  ctx.logger.info(`remote-access: cloudflared ready at ${target} (${bytes.length} bytes)`)
  return target
}

/** Constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/** Parse an `Authorization: Basic ...` header into [user, pass] or null. */
function parseBasic(header: string | undefined): [string, string] | null {
  if (header === undefined || !header.startsWith('Basic ')) return null
  let decoded: string
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
  } catch {
    return null
  }
  const index = decoded.indexOf(':')
  if (index === -1) return null
  return [decoded.slice(0, index), decoded.slice(index + 1)]
}

/** Whether a request carries the issued cookie. */
function hasCookie(headers: IncomingMessage['headers'], token: string): boolean {
  const cookie = headers.cookie
  if (typeof cookie !== 'string') return false
  for (const part of cookie.split(';')) {
    const [key, value] = part.trim().split('=')
    if (key === COOKIE_NAME && safeEqual(value ?? '', token)) return true
  }
  return false
}

/** Whether the request is authenticated (Basic Auth or the issued cookie). */
function isAuthed(req: IncomingMessage, user: string, pass: string, token: string): boolean {
  const basic = parseBasic(req.headers.authorization)
  if (basic !== null && safeEqual(basic[0], user) && safeEqual(basic[1], pass)) return true
  return hasCookie(req.headers, token)
}

/** Loopback-authority header set that satisfies dsh's /api trust fence. */
function loopbackHeaders(
  req: IncomingMessage,
  upstreamPort: number,
): Record<string, string | string[] | undefined> {
  const headers: Record<string, string | string[] | undefined> = {
    ...req.headers,
    host: `127.0.0.1:${upstreamPort}`,
    origin: `http://127.0.0.1:${upstreamPort}`,
  }
  delete headers['sec-fetch-site']
  delete headers['sec-fetch-mode']
  delete headers['sec-fetch-dest']
  return headers
}

/** Forward one plain-HTTP request to dsh with loopback-authority headers. */
function forwardTo(
  req: IncomingMessage,
  res: ServerResponse,
  upstreamPort: number,
  token: string,
): void {
  const upstream = request({
    host: '127.0.0.1',
    port: upstreamPort,
    method: req.method,
    path: req.url,
    headers: loopbackHeaders(req, upstreamPort),
  }, (ures) => {
    const resHeaders: Record<string, string | string[] | undefined> = { ...ures.headers }
    // Attach the auth cookie on the first response so browser WebSocket
    // handshakes (which cannot send Authorization) stay authenticated.
    const existing = resHeaders['set-cookie']
    const list = existing === undefined ? [] : Array.isArray(existing) ? existing : [existing]
    resHeaders['set-cookie'] = [...list, `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax`]
    res.writeHead(ures.statusCode ?? 502, resHeaders)
    ures.pipe(res)
  })
  upstream.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'text/plain' })
    res.end('remote-access: upstream unreachable')
  })
  req.pipe(upstream)
}

/** Forward a WebSocket upgrade to dsh after auth. */
function forwardUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  upstreamPort: number,
): void {
  const upstream = request({
    host: '127.0.0.1',
    port: upstreamPort,
    method: req.method,
    path: req.url,
    headers: loopbackHeaders(req, upstreamPort),
  })
  upstream.on('upgrade', (ures, usocket, uhead) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\n')
    socket.write(`Upgrade: ${ures.headers.upgrade ?? 'websocket'}\r\n`)
    socket.write(`Connection: ${ures.headers.connection ?? 'Upgrade'}\r\n`)
    if (ures.headers['sec-websocket-accept']) {
      socket.write(`Sec-WebSocket-Accept: ${ures.headers['sec-websocket-accept']}\r\n`)
    }
    socket.write('\r\n')
    socket.write(uhead)
    usocket.pipe(socket)
    socket.pipe(usocket)
  })
  upstream.on('error', () => socket.destroy())
  upstream.end(head)
}

/** The inlined auth-proxy HTTP server, created on demand. */
function createAuthProxy(
  proxyPort: number,
  upstreamPort: number,
  user: string,
  pass: string,
  token: string,
): Server {
  const server = createServer((req, res) => {
    if (!isAuthed(req, user, pass, token)) {
      res.writeHead(401, {
        'WWW-Authenticate': 'Basic realm="dsh remote access"',
        'Content-Type': 'text/plain; charset=utf-8',
      })
      res.end('authentication required')
      return
    }
    forwardTo(req, res, upstreamPort, token)
  })
  server.on('upgrade', (req, socket, head) => {
    if (!isAuthed(req, user, pass, token)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm="dsh remote access"\r\n\r\n')
      socket.destroy()
      return
    }
    forwardUpgrade(req, socket, head, upstreamPort)
  })
  server.listen(proxyPort, '127.0.0.1')
  return server
}

/** Generate a strong random credential. */
function generateSecret(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = randomBytes(24)
  let out = ''
  for (const byte of bytes) out += alphabet[byte % alphabet.length]
  return out
}

/** Random hex token for the auth cookie. */
function generateToken(): string {
  return createHash('sha256').update(randomBytes(32)).digest('hex').slice(0, 48)
}

/**
 * The remote-access gateway: process ownership plus Remote control methods.
 * @module @deepseek-ai/dsh-host-remote-access
 */
export class RemoteAccessService extends TypertRemoteService {
  static inject = ['settings']

  private proxyServer: Server | undefined
  private tunnelProcess: ChildProcess | undefined
  private state: RemoteAccessState = 'stopped'
  private url: string | undefined
  private error: string | undefined
  private registry: SettingsScope<StoredConfig> | undefined
  private lastConfig: RemoteAccessConfig = {
    proxyPort: 8443,
    upstreamPort: 3080,
    user: 'dsh',
    pass: '',
    token: '',
  }

  constructor(ctx: Context) {
    super(ctx, 'remoteAccess')
    // Own the child process and proxy socket lifecycle for this fiber.
    ctx.effect(() => () => {
      this.teardownTunnel()
      this.teardownProxy()
    }, 'remote-access.teardown')
  }

  /** Load persisted config after the service mounts. */
  protected async [Service.init](): Promise<void> {
    try {
      // Register ONCE for this fiber; a second register() of the same
      // namespace fails loud, so reads and writes share this registry.
      const registry = this.ctx.settings.register(settingsNamespace(SETTINGS_NS), ConfigSchema)
      this.registry = registry
      const stored = registry.get() as StoredConfig | undefined
      // `registry.get()` resolves schema defaults even before any stored
      // section exists, so emptiness of the credential fields — not the
      // object itself — is the seed signal: a fresh install must mint a
      // password and cookie token before the WebUI can show them.
      if (stored === undefined || stored.pass === undefined || stored.pass === '' || stored.token === undefined || stored.token === '') {
        // Seed defaults so the WebUI card shows editable values.
        const seed: StoredConfig = {
          proxyPort: stored?.proxyPort ?? 8443,
          upstreamPort: stored?.upstreamPort ?? 3080,
          user: stored?.user ?? 'dsh',
          pass: stored?.pass !== undefined && stored.pass !== '' ? stored.pass : generateSecret(),
          token: stored?.token !== undefined && stored.token !== '' ? stored.token : generateToken(),
        }
        await registry.update(seed)
        this.lastConfig = {
          proxyPort: seed.proxyPort ?? 8443,
          upstreamPort: seed.upstreamPort ?? 3080,
          user: seed.user ?? 'dsh',
          pass: seed.pass ?? '',
          token: seed.token ?? '',
        }
        return
      }
      this.lastConfig = {
        proxyPort: stored.proxyPort ?? 8443,
        upstreamPort: stored.upstreamPort ?? 3080,
        user: stored.user ?? 'dsh',
        pass: stored.pass ?? '',
        token: stored.token ?? '',
      }
    } catch (error) {
      this.ctx.logger.warn(`remote-access: config load failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** Persist the current config back into the settings namespace. */
  private async persistConfig(): Promise<void> {
    const registry = this.registry
    if (registry === undefined) return
    try {
      await registry.update(this.lastConfig as StoredConfig)
    } catch (error) {
      this.ctx.logger.warn(`remote-access: config persist failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** @returns the current lifecycle snapshot. */
  @Remote('status')
  status(): RemoteAccessStatus {
    const platformKey = cloudflaredAssetName()
    const binaryPresent = platformKey === null || platformKey === 'unsupported'
      ? false
      : existsSync(join(BIN_DIR, assetFile(platformKey)))
    return {
      state: this.state,
      ...(this.url === undefined ? {} : { url: this.url }),
      proxyPort: this.lastConfig.proxyPort,
      upstreamPort: this.lastConfig.upstreamPort,
      platform: platformKey ?? 'unsupported',
      binaryPresent,
      ...(this.error === undefined ? {} : { error: this.error }),
    }
  }

  /**
   * Start the tunnel: ensure the cloudflared binary, mount the auth proxy on
   * the configured port, then spawn the quick tunnel and wait for its URL.
   * @returns the new lifecycle snapshot.
   */
  @Remote('start')
  async start(): Promise<RemoteAccessStatus> {
    if (this.state === 'running' || this.state === 'starting') return this.status()
    const platformKey = cloudflaredAssetName()
    if (platformKey === null || platformKey === 'unsupported') {
      this.state = 'error'
      this.error = `unsupported platform: ${platform()} ${arch()}`
      return this.status()
    }
    this.state = 'starting'
    this.error = undefined
    try {
      const binary = await ensureCloudflaredBinary(this.ctx, platformKey)
      // Mount the auth proxy before spawning the tunnel so cloudflared's
      // origin is immediately answerable.
      this.teardownProxy()
      this.proxyServer = createAuthProxy(
        this.lastConfig.proxyPort,
        this.lastConfig.upstreamPort,
        this.lastConfig.user,
        this.lastConfig.pass,
        this.lastConfig.token,
      )
      const url = await this.spawnTunnel(binary, this.lastConfig.proxyPort)
      this.url = url
      this.state = 'running'
      return this.status()
    } catch (error) {
      this.state = 'error'
      this.error = error instanceof Error ? error.message : String(error)
      this.teardownProxy()
      return this.status()
    }
  }

  /**
   * Stop the tunnel and the auth proxy.
   * @returns the new lifecycle snapshot.
   */
  @Remote('stop')
  stop(): RemoteAccessStatus {
    this.teardownTunnel()
    this.teardownProxy()
    this.state = 'stopped'
    this.url = undefined
    return this.status()
  }

  /** @returns the persisted configuration. */
  @Remote('config')
  config(): RemoteAccessConfig {
    return { ...this.lastConfig }
  }

  /**
   * Update persisted configuration. Applied live for credentials; port
   * changes take effect on the next start. An explicitly blank `pass` or
   * `token` requests a freshly generated value (used by "regenerate").
   * @param update - fields to change.
   * @returns the resulting configuration.
   */
  @Remote('updateConfig')
  async updateConfig(update: RemoteAccessConfigUpdate): Promise<RemoteAccessConfig> {
    const next: RemoteAccessConfig = {
      proxyPort: update.proxyPort ?? this.lastConfig.proxyPort,
      upstreamPort: update.upstreamPort ?? this.lastConfig.upstreamPort,
      user: update.user ?? this.lastConfig.user,
      pass: update.pass === '' ? generateSecret() : update.pass ?? this.lastConfig.pass,
      token: update.token === '' ? generateToken() : update.token ?? this.lastConfig.token,
    }
    this.lastConfig = next
    await this.persistConfig()
    return { ...next }
  }

  /** Spawn cloudflared quick tunnel and resolve its public URL. */
  private spawnTunnel(binary: string, proxyPort: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(binary, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${proxyPort}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      this.tunnelProcess = child
      let output = ''
      let settled = false
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          reject(new Error(`cloudflared did not report a URL within 60s:\n${output.slice(-2000)}`))
        }
      }, 60_000)
      const onData = (chunk: Buffer): void => {
        output += chunk.toString('utf8')
        const match = output.match(TUNNEL_URL_PATTERN)
        if (!settled && match !== null) {
          settled = true
          clearTimeout(timer)
          resolve(match[0])
        }
      }
      child.stdout?.on('data', onData)
      child.stderr?.on('data', onData)
      child.on('error', (err) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          reject(new Error(`cloudflared spawn failed: ${err.message}`))
        }
      })
      child.on('exit', (code) => {
        clearTimeout(timer)
        if (!settled) {
          settled = true
          reject(new Error(`cloudflared exited before reporting a URL (code ${String(code)})`))
        }
      })
    })
  }

  private teardownTunnel(): void {
    const child = this.tunnelProcess
    if (child === undefined) return
    this.tunnelProcess = undefined
    if (child.exitCode === null && child.signalCode === null) {
      child.kill()
      // Windows: cloudflared may need a harder nudge.
      if (platform() === 'win32') {
        setTimeout(() => { try { child.kill('SIGKILL') } catch { /* already gone */ } }, 500)
      }
    }
  }

  private teardownProxy(): void {
    const server = this.proxyServer
    if (server === undefined) return
    this.proxyServer = undefined
    server.closeAllConnections?.()
    server.close()
  }

  /** Service teardown owned by the fiber. */
}

export default RemoteAccessService
