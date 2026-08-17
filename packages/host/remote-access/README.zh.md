# @deepseek-ai/dsh-host-remote-access

English | [中文](README.zh.md)

为 dsh web GUI 提供 **WebUI 可控的远程访问**:一个内联的**认证代理** + 按平台自动获取的 **Cloudflare 隧道**,两者都通过生成的 Typert Remote 由浏览器设置页驱动。

## 功能

两个组件都只在本机回环接口上运行:

1. **内联认证代理** — 纯 Node `http` 服务,监听 `127.0.0.1:<proxyPort>`(默认 8443)。它强制 HTTP Basic Auth(并签发 `dsh_tunnel_auth` cookie,使无法携带 `Authorization` 头的浏览器 WebSocket 握手也能通过认证),把 `Host`/`Origin` 重写为回环上游以通过 dsh 的 `/api` trust fence,然后转发到本机 dsh web 服务。因为是纯 Node `http`,在 Windows / Linux / macOS 上行为完全一致。

2. **Cloudflare quick tunnel** — `cloudflared` 二进制按平台从 GitHub Releases 首次使用时自动下载(缓存在 `~/.dsh/remote-access/bin/`),以子进程方式启动并指向认证代理。公网 `*.trycloudflare.com` URL 从其日志输出中解析。

服务暴露 Remote 方法(`status` / `start` / `stop` / `config` / `updateConfig`),经 [`api-remotes`](../../api/remotes/README.md) 挂载为 `remoteAccess` 命名空间。配置与凭据持久化在 settings 命名空间 `remote-access`(`~/.dsh/settings.yaml`)。

## Remote 接口

| 方法 | 行为 |
| --- | --- |
| `status()` | 生命周期快照:`stopped` / `starting` / `running` / `error`、公网 URL、端口、平台二进制键、二进制是否就绪、失败详情。 |
| `start()` | 确保 cloudflared 二进制存在(缺失则下载),挂载认证代理,spawn quick tunnel 并等待其 URL。 |
| `stop()` | 结束隧道子进程并关闭认证代理。 |
| `config()` | 返回持久化配置(端口、user、pass、token)。 |
| `updateConfig(update)` | 持久化配置;显式传空 `pass` 或 `token` 表示重新生成(对应"重新生成密码")。 |

## 安全说明

- 代理**只监听回环接口**;公网暴露面是 Cloudflare 边缘,每个请求都必须携带 Basic Auth 凭据。
- dsh 的 `trustedHosts` 只是防 DNS rebinding 的护栏,**不是**认证层——认证代理是公网 URL 与 agent(可执行 shell 命令)之间唯一的门。请勿泄露生成的密码。
- 端口修改在下次 `start()` 时生效;凭据修改立即生效。

## Model Experience

无——本包不注册任何 prompt、工具、消息或 provider 请求。

#### KV Cache effect

无;本包从不组装模型输入。

## 已知限制与后续工作

- **每次启动 quick tunnel URL 都会变化** — `*.trycloudflare.com` 是随机临时主机名。固定 URL 需要命名隧道(Cloudflare 账户 + 自有域名),作为后续工作。
- **dsh 内部没有认证层** — 远程访问依赖代理的 Basic Auth,没有按用户账户体系。
- **首次启动需要出站 HTTPS 访问 `github.com`** 下载二进制。
