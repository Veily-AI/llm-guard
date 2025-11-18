/**
 * @veily/llm-guard
 *
 * HTTP/2 client to protect LLM prompts without exposing PII.
 * This package does NOT call the LLM, it only anonymizes and de-anonymizes prompts.
 *
 * @packageDocumentation
 */

export { anonymize, wrap, createSession } from './guard.js';
export type {
  GuardConfig,
  AnonymizeResult,
  AnonymizeWire,
  RestoreWire,
  AnonymizeOptions,
  EncryptableField,
} from './types.js';
export {
  encryptWithPublicKey,
  decryptWithPrivateKey,
  validatePublicKey,
  validatePrivateKey,
  createEncryptableField,
} from './crypto.js';
export type { EncryptableField as CryptoEncryptableField } from './crypto.js';
