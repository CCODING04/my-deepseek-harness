/**
 * @deepseek-ai/dsh-host-image-input — the image-prompt preprocessor plugin.
 * Provides two cooperating surfaces:
 *
 * 1. `ctx.imagePromptPreprocessor` — the OPTIONAL service the API gateway
 *    consumes: when a prompt carries images addressed to a model without
 *    image input, images are staged into a local directory and the agent
 *    receives a plain-text instruction pointing at the dedicated
 *    `analyze_image` tool. The durable message keeps the original content,
 *    so the transcript still renders the images and the user's own words
 *    stay untouched.
 *
 * 2. A dedicated `analyze_image` tool — one agent call analyzes ALL staged
 *    images in a single VL request with thinking disabled and a bounded
 *    response, so the tool round is fast (~1-2 s), the response is compact,
 *    and the main model only ever sees the distilled description.
 *
 * Staging hygiene: each new prompt replaces the previous batch for the same
 * session, a startup sweep removes directories older than 24 h, and the
 * gateway calls `cleanup(sessionId)` when a session is archived or its
 * workspace is deleted.
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {
  ImagePromptPreprocessor, PreparedImagePrompt, PromptContentPart,
} from '@deepseek-ai/dsh-host-apiproxy'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
// Type-only: merges `ctx.tools` into this program's Context.
import type {} from '@deepseek-ai/dsh-tools'
import {
  mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

export const name = 'host-image-input'

/** Canonical image MIME type → file extension. */
const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** Instruction template: the agent analyzes the staged files via analyze_image. */
export const DEFAULT_INSTRUCTION = [
  '用户在这条消息中附上了 N 张图片,图片已保存到本地文件:',
  '<paths>',
  '请先调用 `analyze_image` 工具分析这些图片(把全部文件路径一次性放入 `images` 数组),再结合图片内容和用户输入进行回复。如果工具不可用,请如实告知用户图片暂时无法识别。',
].join('\n')

/** Default analysis question when the agent does not ask anything specific. */
const DEFAULT_QUESTION = '请简要描述图片内容并转录图中关键文字。用中文回答。'

/** Plugin configuration. */
export interface Config {
  /** Master switch; false declines every prompt (original reject behavior). */
  enabled?: boolean
  /** Staging root for image files handed to the agent. */
  directory?: string
  /** Instruction template; `N` and `<paths>` are substituted per prompt. */
  instruction?: string
  /** Dedicated analyzer settings (VL endpoint). */
  analyzer?: {
    /**
     * Ordered VL provider list: each entry is tried in turn until one
     * succeeds (primary + fallbacks). Add any OpenAI-compatible vision
     * vendor here — e.g. MiniMax (`model: 'MiniMax-M2.5'`).
     */
    providers?: Array<{
      /** Display name for logs. */
      name?: string
      /** OpenAI-compatible chat endpoint (base URL). */
      endpoint: string
      /** Bearer key. */
      apiKey: string
      /** VL model id. */
      model: string
      /** Response token cap per batch. @default 800 */
      maxTokens?: number
      /**
       * Send `max_completion_tokens` instead of `max_tokens` (Xiaomi MiMo
       * API accepts the former). @default false
       */
      usesMaxCompletionTokens?: boolean
      /**
       * Auth header name. Xiaomi accepts `api-key` in curl; the OpenAI SDK
       * path uses `Authorization: Bearer`. @default 'Authorization'
       */
      authHeader?: string
    }>
    /**
     * Legacy single-provider fields — treated as providers[0] when
     * `providers` is absent. Endpoint/key default to the shared
     * ~/.qwen-mm-plugins/config (DASHSCOPE_BASE_URL / DASHSCOPE_API_KEY),
     * model to QWEN_MM_API_VL_MODEL then 'qwen3.7-plus'.
     */
    endpoint?: string
    apiKey?: string
    model?: string
    maxTokens?: number
  }
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  directory: z.string().default(''),
  instruction: z.string().default(DEFAULT_INSTRUCTION),
  analyzer: z.object({
    providers: z.array(z.object({
      name: z.string(),
      endpoint: z.string(),
      apiKey: z.string(),
      model: z.string(),
      maxTokens: z.natural().default(800),
      usesMaxCompletionTokens: z.boolean().default(false),
      authHeader: z.string().default('Authorization'),
    })).default([]),
    endpoint: z.string().default(''),
    apiKey: z.string().default(''),
    model: z.string().default(''),
    maxTokens: z.natural().default(800),
  }).default({
    providers: [],
    endpoint: '',
    apiKey: '',
    model: '',
    maxTokens: 800,
  }),
})

interface ImagePart {
  type: 'image'
  mediaType: string
  data: string
  name?: string
}

function isImagePart(part: PromptContentPart): part is PromptContentPart & { type: 'image' } {
  return part.type === 'image'
}

/** Parse the shared Qwen-MM-Plugins config file (KEY=VALUE lines). */
function readQwenConfigFile(): Record<string, string> {
  try {
    const out: Record<string, string> = {}
    for (const line of readFileSync(join(homedir(), '.qwen-mm-plugins', 'config'), 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (trimmed === '' || trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const index = trimmed.indexOf('=')
      let value = trimmed.slice(index + 1).trim()
      if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) {
        value = value.slice(1, -1)
      }
      out[trimmed.slice(0, index).trim()] = value
    }
    return out
  } catch {
    return {}
  }
}

interface ResolvedProvider {
  name: string
  endpoint: string
  apiKey: string
  model: string
  maxTokens: number
  usesMaxCompletionTokens: boolean
  authHeader: string
}

/**
 * Fold plugin config into the ordered provider list: explicit `providers`
 * first, then the legacy single-provider fields (defaults inherited from the
 * shared Qwen-MM config file), so any OpenAI-compatible vision vendor can be
 * added by configuration alone.
 */
function resolveProviders(raw: NonNullable<Config['analyzer']>): ResolvedProvider[] {
  const shared = readQwenConfigFile()
  if (raw.providers !== undefined && raw.providers.length > 0) {
    return raw.providers.map(provider => ({
      name: provider.name || provider.model,
      endpoint: provider.endpoint.replace(/\/+$/, ''),
      // Empty key falls back to the shared Qwen-MM config (DASHSCOPE_API_KEY)
      // so a provider list can name an endpoint/model without repeating keys.
      apiKey: provider.apiKey || shared['DASHSCOPE_API_KEY'] || '',
      model: provider.model,
      maxTokens: provider.maxTokens ?? 800,
      usesMaxCompletionTokens: provider.usesMaxCompletionTokens ?? false,
      authHeader: provider.authHeader ?? 'Authorization',
    }))
  }
  return [{
    name: 'qwen',
    endpoint: (raw.endpoint
      || shared['DASHSCOPE_BASE_URL']
      || process.env['DASHSCOPE_BASE_URL']
      || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, ''),
    apiKey: raw.apiKey
      || shared['DASHSCOPE_API_KEY']
      || process.env['DASHSCOPE_API_KEY']
      || '',
    model: raw.model
      || shared['QWEN_MM_API_VL_MODEL']
      || 'qwen3.7-plus',
    maxTokens: raw.maxTokens ?? 800,
    usesMaxCompletionTokens: false,
    authHeader: 'Authorization',
  }]
}

/** Session-scoped staging directory (session id sanitized for the filesystem). */
function sessionDir(root: string, sessionId: string): string {
  return join(root, sessionId.replace(/[^A-Za-z0-9_-]/g, '_'))
}

/**
 * Persist one prompt's images into the session directory. The directory is
 * cleared first: staged copies are a per-prompt cache, and the previous
 * batch (already analyzed by the agent) is disposable.
 */
function stageImages(root: string, sessionId: string, images: readonly ImagePart[]): string[] {
  const dir = sessionDir(root, sessionId)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const stamp = Date.now()
  return images.map((image, index) => {
    const ext = EXTENSIONS[image.mediaType] ?? 'bin'
    const path = join(dir, `${stamp}-${index + 1}.${ext}`)
    writeFileSync(path, Buffer.from(image.data, 'base64'))
    return path
  })
}

/** Remove staging directories older than 24 h (orphan sweep at plugin boot). */
function sweepStaleDirs(root: string, maxAgeMs: number): void {
  try {
    for (const entry of readdirSync(root)) {
      const dir = join(root, entry)
      try {
        if (Date.now() - statSync(dir).mtimeMs > maxAgeMs) rmSync(dir, { recursive: true, force: true })
      } catch { /* raced removal */ }
    }
  } catch { /* root missing or unreadable */ }
}

/**
 * Register the preprocessor service and the dedicated analyze_image tool.
 * @param ctx - host context (the gateway consumes the provided service;
 * `tools` registers the analyzer tool for the agent loop).
 * @param config - validated plugin configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const root = config.directory !== undefined && config.directory !== ''
    ? config.directory
    : join(tmpdir(), 'dsh-image-inputs')
  const instruction = config.instruction ?? DEFAULT_INSTRUCTION
  // Provider order: the durable WebUI supplier settings (when present), else
  // the plugin config (cordis.patch.yml / shared Qwen-MM config file).
  let providers = resolveProviders(config.analyzer ?? { providers: [], endpoint: '', apiKey: '', model: '', maxTokens: 800 })
  // The settings service arrives through an OPTIONAL inject block: it may not
  // be provided yet (or at all) when this plugin's own apply runs, so a plain
  // ctx.get here could silently miss it and the WebUI card would never see the
  // namespace.
  ctx.inject(['settings'], (settingsCtx) => {
    const registry = settingsCtx.settings.register(settingsNamespace(SETTINGS_NS), VisionSettingsSchema)
    const stored = registry.get() as VisionSettings | undefined
    if (stored === undefined || stored.providers === undefined || stored.providers.length === 0) {
      // Seed the section with the resolved defaults (e.g. the shared Qwen-MM
      // config's provider) so the WebUI card shows and edits them instead of
      // an empty list. Keys stay blank: an empty key falls back to the shared
      // config file, so no secret is duplicated into settings.yaml.
      const seed = providers.map(provider => ({
        name: provider.name,
        endpoint: provider.endpoint,
        apiKey: '',
        model: provider.model,
        maxTokens: provider.maxTokens,
        usesMaxCompletionTokens: provider.usesMaxCompletionTokens,
        authHeader: provider.authHeader,
      }))
      void registry.update({ providers: seed })
    } else {
      providers = stored.providers.map(provider => ({
        name: provider.name || provider.model,
        endpoint: provider.endpoint.replace(/\/+$/, ''),
        apiKey: provider.apiKey,
        model: provider.model,
        maxTokens: provider.maxTokens,
        usesMaxCompletionTokens: provider.usesMaxCompletionTokens,
        authHeader: provider.authHeader,
      }))
    }
  })
  sweepStaleDirs(root, 24 * 60 * 60 * 1000)

  const preprocessor: ImagePromptPreprocessor = {
    prepare: (sessionId, content) => {
      if (!config.enabled) return Promise.resolve(undefined)
      const images = content.filter(isImagePart) as ImagePart[]
      if (images.length === 0) return Promise.resolve(undefined)
      try {
        const paths = stageImages(root, sessionId, images)
        const text = instruction
          .replaceAll('N', String(images.length))
          .replace('<paths>', paths.map((path, index) => `${index + 1}. ${path}`).join('\n'))
        const userText = content.filter(part => part.type === 'text')
        const modelParts: PreparedImagePrompt['modelParts'] = [
          { type: 'text', text },
          ...userText,
        ]
        return Promise.resolve({ modelParts })
      } catch (error: unknown) {
        ctx.logger.warn(`host-image-input: staging failed: ${error instanceof Error ? error.message : String(error)}`)
        return Promise.resolve(undefined)
      }
    },
    cleanup: (sessionId) => {
      try {
        rmSync(sessionDir(root, sessionId), { recursive: true, force: true })
      } catch { /* already gone */ }
    },
  }
  ctx.provide('imagePromptPreprocessor', preprocessor)

  // Dedicated analyzer tool: one call per prompt, thinking disabled, bounded
  // response — the compact path that keeps the main model's context lean.
  const tools = ctx.get('tools')
  if (tools !== undefined) {
    tools.register({
      name: 'analyze_image',
      description:
        '分析已暂存的图片内容。图片由系统在用户发送时保存为本地文件,传入 `images` 文件绝对路径数组(可多张,一次调用)。'
        + '返回:各图片的中文内容描述与关键文字转录。分析已针对速度与长度优化,不要再用其他视觉工具重复分析同一批图片。',
      parameters: {
        type: 'object',
        properties: {
          images: {
            type: 'array',
            items: { type: 'string' },
            description: '图片文件绝对路径数组(多张一次传入)',
          },
          question: {
            type: 'string',
            description: '针对图片的具体问题;省略时默认全面描述并转录关键文字',
          },
        },
        required: ['images'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
          additionalProperties: false,
        },
        render: (_args, value) => [{
          type: 'text',
          text: (value as { text: string }).text,
        }],
      },
      execute: async (args) => {
        const { images, question } = args as { images: string[]; question?: string }
        const content: Array<Record<string, unknown>> = [
          { type: 'text', text: question ?? DEFAULT_QUESTION },
        ]
        for (const path of images) {
          const bytes = readFileSync(path)
          const lower = path.toLowerCase()
          const mediaType = lower.endsWith('.png') ? 'image/png'
            : lower.endsWith('.webp') ? 'image/webp'
              : lower.endsWith('.gif') ? 'image/gif'
                : 'image/jpeg'
          content.push({
            type: 'image_url',
            image_url: { url: `data:${mediaType};base64,${bytes.toString('base64')}` },
          })
        }
        // Try each configured provider in order (primary + fallbacks).
        const failures: string[] = []
        for (const provider of providers) {
          if (provider.apiKey === '') {
            failures.push(`${provider.name}: no api key`)
            continue
          }
          try {
            // Some vendors reject unknown parameters (e.g. enable_thinking);
            // retry without it when the first attempt is a 400 on that field.
            for (const withThinking of [false, undefined]) {
              const body: Record<string, unknown> = {
                model: provider.model,
                messages: [{ role: 'user', content }],
                ...(provider.usesMaxCompletionTokens
                  ? { max_completion_tokens: provider.maxTokens }
                  : { max_tokens: provider.maxTokens }),
                ...(withThinking === false ? { enable_thinking: false } : {}),
              }
              const response = await fetch(`${provider.endpoint}/chat/completions`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  [provider.authHeader]: provider.authHeader === 'Authorization'
                    ? `Bearer ${provider.apiKey}`
                    : provider.apiKey,
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(120_000),
              })
              if (!response.ok) {
                const detail = await response.text().catch(() => '')
                if (withThinking === false && detail.toLowerCase().includes('enable_thinking')) {
                  continue // retry without the unknown field
                }
                throw new Error(`${response.status}: ${detail.slice(0, 160)}`)
              }
              const json = await response.json() as {
                choices?: Array<{ message?: { content?: unknown } }>
              }
              const text = json.choices?.[0]?.message?.content
              return { text: typeof text === 'string' ? text : '' }
            }
          } catch (error: unknown) {
            failures.push(`${provider.name}: ${error instanceof Error ? error.message : String(error)}`)
          }
        }
        throw new Error(`analyze_image: 所有视觉供应商均失败 — ${failures.join(' | ')}`)
      },
      isConcurrencySafe: () => false,
    })
  }
}

export const inject = ['tools']

/** Settings namespace the WebUI supplier card edits (same shape as providers). */
export const SETTINGS_NS = 'host-image-input'

const ProviderSettingsSchema = z.object({
  name: z.string().default(''),
  endpoint: z.string(),
  apiKey: z.string().default(''),
  model: z.string(),
  maxTokens: z.natural().default(800),
  usesMaxCompletionTokens: z.boolean().default(false),
  authHeader: z.string().default('Authorization'),
})

const VisionSettingsSchema = z.object({
  providers: z.array(ProviderSettingsSchema).default([]),
})

/** Stored section shape (hand-written to avoid z.infer on schemastery). */
interface VisionSettings {
  providers?: Array<{
    name: string
    endpoint: string
    apiKey: string
    model: string
    maxTokens: number
    usesMaxCompletionTokens: boolean
    authHeader: string
  }>
}
