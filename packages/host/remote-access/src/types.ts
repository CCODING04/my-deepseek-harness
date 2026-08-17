/**
 * Wire payload types for the remote-access domain, client-safe JSON.
 * @module @deepseek-ai/dsh-host-remote-access/types
 */

/** Current platform classification for the cloudflared binary asset. */
export type RemoteAccessPlatform = 'win32-x64' | 'linux-x64' | 'linux-arm64' | 'darwin-x64' | 'darwin-arm64' | 'unsupported'

/** Tunnel lifecycle state as surfaced to the browser. */
export type RemoteAccessState = 'stopped' | 'starting' | 'running' | 'error'

/** One Remote status snapshot. */
export interface RemoteAccessStatus {
  /** Lifecycle state. */
  state: RemoteAccessState
  /** Public tunnel URL, present while running. */
  url?: string
  /** Local auth-proxy listen port. */
  proxyPort: number
  /** dsh web upstream port the proxy forwards to. */
  upstreamPort: number
  /** Platform binary asset name resolved for this machine. */
  platform: RemoteAccessPlatform
  /** Whether the cloudflared binary is present on disk. */
  binaryPresent: boolean
  /** Human-readable failure detail when state is `error`. */
  error?: string
}

/** Stored remote-access configuration. */
export interface RemoteAccessConfig {
  /** Auth-proxy listen port (default 8443). */
  proxyPort: number
  /** dsh web upstream port the proxy forwards to (default 3080). */
  upstreamPort: number
  /** HTTP Basic Auth username. */
  user: string
  /** HTTP Basic Auth password. */
  pass: string
  /** Opaque cookie token for browser WebSocket handshakes. */
  token: string
}

/** Update request: every field optional, absent fields keep their stored value. */
export interface RemoteAccessConfigUpdate {
  /** Auth-proxy listen port. */
  proxyPort?: number
  /** dsh web upstream port the proxy forwards to. */
  upstreamPort?: number
  /** HTTP Basic Auth username. */
  user?: string
  /** HTTP Basic Auth password. */
  pass?: string
  /** Opaque cookie token for browser WebSocket handshakes. */
  token?: string
}
