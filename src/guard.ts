/**
 * Public API for @veily/llm-guard
 *
 * Provides three levels of abstraction:
 * 1. wrap() - Simplest one-liner
 * 2. anonymize()/restore() - Manual two-step control
 * 3. createSession() - Stateful API for multiple calls
 */

import { GuardConfig, AnonymizeResult, AnonymizeWire, RestoreWire } from "./types.js";
import { getTransport } from "./http.js";

/**
 * Gets the anonymize/restore paths with defaults
 */
function getPaths(cfg: GuardConfig) {
  return {
    anonymize: cfg.anonymizePath ?? "/v1/anonymize",
    restore: cfg.restorePath ?? "/v1/restore",
  };
}

/**
 * Validates basic configuration
 */
function validateConfig(cfg: GuardConfig): void {
  if (!cfg?.baseURL) {
    throw new Error("cfg.baseURL is required");
  }
  if (typeof cfg.baseURL !== "string" || cfg.baseURL.trim() === "") {
    throw new Error("cfg.baseURL is required");
  }
}

/**
 * Anonymize: anonymizes a prompt and returns safePrompt + restore() function
 *
 * @param prompt - The original prompt with potential PII
 * @param cfg - Core service configuration
 * @returns Object with safePrompt and async restore function
 *
 * @example
 * ```ts
 * const { safePrompt, restore } = await anonymize(
 *   "My email is juan@example.com",
 *   { baseURL: "https://core.veily.internal" }
 * );
 * const llmOutput = await openai(safePrompt);
 * const final = await restore(llmOutput);
 * ```
 */
export async function anonymize(prompt: string, cfg: GuardConfig): Promise<AnonymizeResult> {
  // Validations
  if (typeof prompt !== "string") {
    throw new Error("prompt must be a string");
  }
  validateConfig(cfg);

  const transport = getTransport(cfg);
  const paths = getPaths(cfg);

  // Call to /v1/anonymize
  const response = await transport.postJSON<AnonymizeWire>({
    path: paths.anonymize,
    body: { prompt },
  });

  // Validate response
  if (!response?.safePrompt || !response?.mappingId) {
    throw new Error("Invalid response from /anonymize");
  }

  // Create restore function with captured mappingId
  const restore = async (llmOutput: string): Promise<string> => {
    if (typeof llmOutput !== "string") {
      throw new Error("llmOutput must be a string");
    }

    const restoreResponse = await transport.postJSON<RestoreWire>({
      path: paths.restore,
      body: {
        mappingId: response.mappingId,
        output: llmOutput,
      },
    });

    if (!restoreResponse?.output) {
      throw new Error("Invalid response from /restore");
    }

    return restoreResponse.output;
  };

  return {
    safePrompt: response.safePrompt,
    restore,
    stats: response.stats,
  };
}

/**
 * Wrap: one-liner that encapsulates anonymize -> caller -> restore
 *
 * @param prompt - The original prompt with potential PII
 * @param caller - Function that calls the LLM with the safePrompt
 * @param cfg - Core service configuration
 * @returns Final output from the LLM with restored data
 *
 * @example
 * ```ts
 * const final = await wrap(
 *   "My email is juan@example.com",
 *   async (safe) => openai.chat.completions.create({
 *     messages: [{ role: "user", content: safe }]
 *   }).then(r => r.choices[0].message.content),
 *   { baseURL: "https://core.veily.internal" }
 * );
 * ```
 */
export async function wrap(
  prompt: string,
  caller: (safePrompt: string) => Promise<string>,
  cfg: GuardConfig
): Promise<string> {
  // Validations
  if (typeof prompt !== "string") {
    throw new Error("prompt must be a string");
  }
  if (typeof caller !== "function") {
    throw new Error("caller must be a function");
  }
  validateConfig(cfg);

  // 1. Anonymize
  const { safePrompt, restore } = await anonymize(prompt, cfg);

  // 2. Call user's LLM
  const llmOutput = await caller(safePrompt);

  // 3. Restore
  return await restore(llmOutput);
}

/**
 * CreateSession: creates a session with pre-configured settings
 *
 * Useful when you need to make multiple calls with the same config.
 *
 * @param cfg - Core service configuration
 * @returns Object with protect() and anonymize() methods
 *
 * @example
 * ```ts
 * const session = createSession({ baseURL: "https://core.veily.internal" });
 *
 * const result1 = await session.protect(prompt1, caller);
 * const result2 = await session.protect(prompt2, caller);
 * ```
 */
export function createSession(cfg: GuardConfig) {
  validateConfig(cfg);

  return {
    /**
     * Equivalent to wrap() but with config already set
     */
    protect(prompt: string, caller: (safePrompt: string) => Promise<string>): Promise<string> {
      return wrap(prompt, caller, cfg);
    },

    /**
     * Equivalent to anonymize() but with config already set
     */
    anonymize(prompt: string): Promise<AnonymizeResult> {
      return anonymize(prompt, cfg);
    },
  };
}
