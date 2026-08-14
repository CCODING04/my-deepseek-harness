/**
 * Image-prompt preprocessor contract. The gateway consumes this OPTIONAL
 * service: when a prompt carries images addressed to a model without image
 * input, a registered preprocessor turns the image parts into a plain-text
 * model projection (e.g. staged local files + an analysis instruction),
 * while the original content — images included — stays the durable display
 * surface.
 * @module @deepseek-ai/dsh-host-apiproxy/image-preprocessor
 */

import type { PromptContentPart } from './api/index.ts'

/** The model-facing projection of an image-bearing prompt (text parts only). */
export interface PreparedImagePrompt {
  /** Plain-text parts the model request consumes (no image parts). */
  modelParts: PromptContentPart[]
}

/**
 * Preprocess an image-bearing prompt for a text-only model.
 * Implementations are plugins (e.g. @deepseek-ai/dsh-host-image-input) that
 * stage the image bytes locally and emit an instruction text; returning
 * `undefined` leaves the gateway's original reject-with-error behavior.
 */
export interface ImagePromptPreprocessor {
  /**
   * Build the model projection for one prompt.
   * @param sessionId - owning session (scopes staged files and caches).
   * @param content - the original prompt parts (text and image).
   * @returns the model projection, or undefined to decline.
   */
  prepare: (
    sessionId: string,
    content: readonly PromptContentPart[],
  ) => Promise<PreparedImagePrompt | undefined>
  /**
   * Drop every staged artifact owned by one session. The gateway calls this
   * when a session is archived or its workspace is deleted; implementations
   * must be total (best-effort, never throw).
   * @param sessionId - the removed session.
   */
  cleanup: (sessionId: string) => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Optional image-prompt preprocessor provided by a plugin. */
    imagePromptPreprocessor?: ImagePromptPreprocessor
  }
}
