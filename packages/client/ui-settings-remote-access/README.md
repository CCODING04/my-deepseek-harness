# @deepseek-ai/dsh-client-ui-settings-remote-access

English | [中文](README.zh.md)

Remote access control section for Web Settings: tunnel state, start/stop/restart, public URL, and credential management.

## What it does

The browser plugin registers one localized `settings.section` contribution with id `remote-access` (ordered right after General). The section calls the Host [`remoteAccess`](../../host/remote-access/README.md) namespace through the [`api-remotes`](../../api/remotes/README.md) assembly:

- **Status card** — lifecycle state with a colored dot (stopped/starting/running/error), the public URL with copy/open actions when running, platform key, and whether the cloudflared binary is present.
- **Controls** — start / stop / restart buttons; while running or starting the section polls every 4 s so the URL and state stay fresh.
- **Configuration** — proxy port, upstream port, username, and password as staged draft fields with a save action; port changes take effect on the next start.
- **Credentials** — username/password readback plus a "regenerate password" action (writes a blank `pass`, which the Host replaces with a fresh secret).

Drafts are staged until Save, so navigation away never commits a half-typed edit. Loading and failure states stay local with a retry action.

## Model Experience

None — this package only controls a Host-owned process surface from browser Settings and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **No auto-refresh while stopped** — polling runs only while the tunnel is running or starting; a stopped tunnel shows the last snapshot until the section remounts or a control is pressed.
- **Credentials shown in plain text** — the password field is editable text (not a masked secret input), matching the "copy to phone" workflow; a masked toggle is a follow-up.
