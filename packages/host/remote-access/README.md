# @deepseek-ai/dsh-host-remote-access

English | [中文](README.zh.md)

WebUI-controlled remote access for the dsh web GUI: an inlined **auth proxy** plus a per-platform **Cloudflare Tunnel**, both driven from the browser Settings surface through generated Typert Remotes.

## What it does

Two cooperating pieces run on the loopback interface only:

1. **Inlined auth proxy** — a pure Node `http` server listening on `127.0.0.1:<proxyPort>` (default 8443). It enforces HTTP Basic Auth (plus a `dsh_tunnel_auth` cookie so browser WebSocket handshakes, which cannot carry `Authorization` headers, stay authenticated), rewrites `Host`/`Origin` to the loopback upstream so dsh's `/api` trust fence passes, and forwards to the local dsh web server. Being plain Node `http`, it runs identically on Windows, Linux, and macOS.

2. **Cloudflare quick tunnel** — the `cloudflared` binary is fetched per platform from GitHub Releases on first use (cached under `~/.dsh/remote-access/bin/`) and spawned as a child process pointing at the auth proxy. The public `*.trycloudflare.com` URL is parsed from its log output.

The service exposes Remote methods (`status`, `start`, `stop`, `config`, `updateConfig`) mounted as the `remoteAccess` namespace through [`api-remotes`](../../api/remotes/README.md). Configuration and credentials persist in the settings namespace `remote-access` (`~/.dsh/settings.yaml`).

## Remote surface

| Method | Behavior |
| --- | --- |
| `status()` | Lifecycle snapshot: `stopped` / `starting` / `running` / `error`, public URL, ports, platform binary key, binary presence, failure detail. |
| `start()` | Ensures the cloudflared binary (downloads if missing), mounts the auth proxy, spawns the quick tunnel, waits for its URL. |
| `stop()` | Kills the tunnel child process and closes the auth proxy. |
| `config()` | Returns the persisted config (ports, user, pass, token). |
| `updateConfig(update)` | Persists config; an explicitly blank `pass` or `token` requests a freshly generated value (used by "regenerate"). |

## Security notes

- The proxy listens on **loopback only**; the public exposure is the Cloudflare edge, and every request must present the Basic Auth credentials.
- `trustedHosts` in dsh is a DNS-rebinding fence, **not** an authentication layer — the auth proxy is the only gate between the public URL and the agent (which can run shell commands). Keep the generated password secret.
- Port changes take effect on the next `start()`; credential changes apply immediately.

## Model Experience

None — this package registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **Quick-tunnel URL changes on every start** — `*.trycloudflare.com` is a random ephemeral hostname. A stable URL requires a named Cloudflare Tunnel (user account + own domain), which is a follow-up.
- **No authentication layer inside dsh itself** — remote access relies on the proxy's Basic Auth; there is no per-user account system.
- **Binary download requires outbound HTTPS** to `github.com` on first start.
