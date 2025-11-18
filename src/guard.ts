/**
 * Public API for @veily/llm-guard
 *
 * Provides three levels of abstraction:
 * 1. wrap() - Simplest one-liner
 * 2. anonymize()/restore() - Manual two-step control
 * 3. createSession() - Stateful API for multiple calls
 */

import {
  GuardConfig,
  AnonymizeResult,
  AnonymizeWire,
  RestoreWire,
  AnonymizeOptions,
  EncryptableField,
  InboundPublicKeyResponse,
} from './types.js';
import { getTransport } from './http.js';
import {
  encryptWithPublicKey,
  decryptWithPrivateKey,
  validatePublicKey,
  validatePrivateKey,
  createEncryptableField,
} from './crypto.js';

/**
 * Cache for public key and key ID per API key
 * Avoids multiple requests to the same endpoint
 */
const keyCache = new Map<string, { publicKey: string; keyId: string }>();

/**
 * Gets the tenant's inbound public key and key ID from the API
 * This is called automatically when privateKey is provided
 */
async function fetchInboundPublicKey(
  cfg: GuardConfig & { baseURL: string }
): Promise<{ publicKey: string; keyId: string }> {
  // Check cache first
  const cacheKey = cfg.apiKey;
  const cached = keyCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch from API
  const transport = getTransport(cfg);
  const response = await transport.getJSON<InboundPublicKeyResponse>({
    path: '/v1/transit-crypto/inbound-public-key',
  });

  // Validate response
  if (!response?.publicKey || !response?.keyId) {
    throw new Error(
      'Invalid response from /v1/transit-crypto/inbound-public-key. Missing publicKey or keyId.'
    );
  }

  // Validate public key format
  if (!validatePublicKey(response.publicKey)) {
    throw new Error('Invalid public key format received from API. Expected PEM format.');
  }

  // Cache result
  const result = {
    publicKey: response.publicKey,
    keyId: response.keyId,
  };
  keyCache.set(cacheKey, result);

  return result;
}

/**
 * Gets the anonymize/restore paths with defaults
 */
function getPaths(cfg: GuardConfig) {
  return {
    anonymize: cfg.anonymizePath ?? '/v1/anonymize',
    restore: cfg.restorePath ?? '/v1/restore',
  };
}

/**
 * Gets the baseURL - hardcoded to production core URL
 * Environment variable only used for internal testing
 */
function getBaseURL(): string {
  // Production URL (hardcoded) - only override in tests via env var
  const baseURL = process.env.VEILY_CORE_URL || 'https://api.veily.dev';
  return baseURL;
}

/**
 * Validates basic configuration and adds internal baseURL
 * Auto-fetches publicKey and keyId if privateKey is provided
 */
async function validateConfig(
  cfg: GuardConfig
): Promise<GuardConfig & { baseURL: string; publicKey?: string; keyId?: string }> {
  // Validate required apiKey
  if (!cfg?.apiKey) {
    throw new Error('cfg.apiKey is required');
  }

  if (typeof cfg.apiKey !== 'string' || cfg.apiKey.trim() === '') {
    throw new Error('cfg.apiKey is required');
  }

  const baseURL = getBaseURL();

  // If privateKey is provided, auto-fetch publicKey and keyId
  if (cfg.privateKey) {
    // Validate private key format
    if (!validatePrivateKey(cfg.privateKey)) {
      throw new Error(
        'Invalid private key format. Expected PEM format with -----BEGIN PRIVATE KEY-----'
      );
    }

    // Fetch publicKey and keyId automatically from API
    const keyInfo = await fetchInboundPublicKey({ ...cfg, baseURL });
    return {
      ...cfg,
      baseURL,
      publicKey: keyInfo.publicKey,
      keyId: keyInfo.keyId,
    };
  }

  // Return config with internal baseURL from env var
  return {
    ...cfg,
    baseURL,
  };
}

/**
 * Encrypts a prompt if encryption is configured
 *
 * @param prompt - The plain text prompt
 * @param cfg - Guard configuration (may include publicKey and keyId)
 * @returns Encrypted field if encryption is enabled, or plain text string
 */
function encryptPromptIfNeeded(
  prompt: string,
  cfg: GuardConfig & { baseURL: string; publicKey?: string; keyId?: string }
): string | EncryptableField {
  // If no encryption config, return plain text (backward compatible)
  if (!cfg.publicKey || !cfg.keyId) {
    return prompt;
  }

  // Encryption config is already validated in validateConfig, so we can encrypt directly
  const encryptedValue = encryptWithPublicKey(prompt, cfg.publicKey);

  // Return as EncryptableField
  return createEncryptableField(encryptedValue, cfg.keyId);
}

/**
 * Anonymize: anonymizes a prompt and returns safePrompt + restore() function
 *
 * @param prompt - The original prompt with potential PII
 * @param cfg - Core service configuration
 * @param options - Optional anonymize options (e.g., TTL)
 * @returns Object with safePrompt and async restore function
 *
 * @example
 * ```ts
 * const { safePrompt, restore } = await anonymize(
 *   "My email is juan@example.com",
 *   { baseURL: "https://core.veily.internal" },
 *   { ttl: 7200 }
 * );
 * const llmOutput = await openai(safePrompt);
 * const final = await restore(llmOutput);
 * ```
 */
export async function anonymize(
  prompt: string,
  cfg: GuardConfig,
  options?: AnonymizeOptions
): Promise<AnonymizeResult> {
  // Validations
  if (typeof prompt !== 'string') {
    throw new Error('prompt must be a string');
  }
  const validatedCfg = await validateConfig(cfg);

  const transport = getTransport(validatedCfg);
  const paths = getPaths(validatedCfg);

  // Encrypt prompt if encryption is configured (optional, backward compatible)
  const encryptedPrompt = encryptPromptIfNeeded(prompt, validatedCfg);

  // Build request body with optional TTL
  // Prompt can be string (plain text) or EncryptableField (encrypted)
  const requestBody: { prompt: string | EncryptableField; ttl?: number } = {
    prompt: encryptedPrompt,
  };
  if (options?.ttl !== undefined) {
    requestBody.ttl = options.ttl;
  }

  // Call to /v1/anonymize
  const response = await transport.postJSON<AnonymizeWire>({
    path: paths.anonymize,
    body: requestBody,
  });

  // Validate response
  if (!response?.safePrompt || !response?.mappingId) {
    throw new Error('Invalid response from /anonymize');
  }

  // Create restore function with captured mappingId and config
  const restore = async (llmOutput: string): Promise<string> => {
    if (typeof llmOutput !== 'string') {
      throw new Error('llmOutput must be a string');
    }

    // If encryption is configured, request encrypted response
    // This ensures that if we encrypt prompts, we also get encrypted responses
    const shouldEncryptResponse = !!validatedCfg.publicKey && !!validatedCfg.keyId;

    const restoreResponse = await transport.postJSON<RestoreWire>({
      path: paths.restore,
      body: {
        mappingId: response.mappingId,
        output: llmOutput,
        encryptResponse: shouldEncryptResponse,
        // Don't provide partnerKeyId - server will use tenant's inbound public key
      },
    });

    if (!restoreResponse?.output) {
      throw new Error('Invalid response from /restore');
    }

    // If response is encrypted, decrypt it automatically
    if (
      restoreResponse.encrypted === true &&
      typeof restoreResponse.output === 'object' &&
      restoreResponse.output !== null &&
      'encrypted' in restoreResponse.output &&
      restoreResponse.output.encrypted === true &&
      'value' in restoreResponse.output &&
      'keyId' in restoreResponse.output
    ) {
      const encryptedField = restoreResponse.output;

      // Verify we have private key for decryption
      if (!validatedCfg.privateKey) {
        throw new Error(
          'Received encrypted response but no privateKey provided in config. ' +
            'Please provide privateKey to decrypt responses.'
        );
      }

      // Verify keyId matches (security check)
      if (encryptedField.keyId !== validatedCfg.keyId) {
        throw new Error(
          `Key ID mismatch. Expected ${validatedCfg.keyId}, got ${encryptedField.keyId}`
        );
      }

      // Decrypt the response
      return decryptWithPrivateKey(encryptedField.value, validatedCfg.privateKey);
    }

    // Response is plain text (backward compatible)
    return typeof restoreResponse.output === 'string'
      ? restoreResponse.output
      : String(restoreResponse.output);
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
  cfg: GuardConfig,
  options?: AnonymizeOptions
): Promise<string> {
  // Validations
  if (typeof prompt !== 'string') {
    throw new Error('prompt must be a string');
  }
  if (typeof caller !== 'function') {
    throw new Error('caller must be a function');
  }

  const validatedCfg = await validateConfig(cfg);

  // 1. Anonymize
  const { safePrompt, restore } = await anonymize(prompt, validatedCfg, options);

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
export async function createSession(cfg: GuardConfig) {
  const validatedCfg = await validateConfig(cfg);

  return {
    /**
     * Equivalent to wrap() but with config already set
     */
    protect(
      prompt: string,
      caller: (safePrompt: string) => Promise<string>,
      options?: AnonymizeOptions
    ): Promise<string> {
      return wrap(prompt, caller, validatedCfg, options);
    },

    /**
     * Equivalent to anonymize() but with config already set
     */
    anonymize(prompt: string, options?: AnonymizeOptions): Promise<AnonymizeResult> {
      return anonymize(prompt, validatedCfg, options);
    },
  };
}
