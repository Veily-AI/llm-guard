/**
 * Interface for encrypted field structure
 * Used for optional transit encryption of prompts/output
 */
export interface EncryptableField {
  /** The encrypted value (base64 encoded) */
  value: string;
  /** True if the value is encrypted */
  encrypted: true;
  /** Key ID used for encryption (required if encrypted: true) */
  keyId: string;
}

/**
 * Response from /v1/transit-crypto/inbound-public-key endpoint
 */
export type InboundPublicKeyResponse = {
  keyId: string;
  algorithm: string;
  hashAlgorithm: string;
  publicKey: string;
};

/**
 * Configuration for the HTTP/2 guard client
 */
export type GuardConfig = {
  /** API key for Bearer authentication (required) */
  apiKey: string;
  /** Additional HTTP headers */
  headers?: Record<string, string>;
  /** Custom path for anonymize (default: /v1/anonymize) */
  anonymizePath?: string;
  /** Custom path for restore (default: /v1/restore) */
  restorePath?: string;
  /** Optional: RSA private key in PEM format for decrypting responses. If provided, publicKey and keyId will be fetched automatically from the API. */
  privateKey?: string;
};

/**
 * Response from the /v1/anonymize endpoint
 */
export type AnonymizeWire = {
  /** Anonymized prompt ready to send to the LLM */
  safePrompt: string;
  /** Mapping ID for later restore */
  mappingId: string;
  /** Optional replacement statistics */
  stats?: {
    replaced: number;
    types: string[];
  };
};

/**
 * Response from the /v1/restore endpoint
 */
export type RestoreWire = {
  /** De-anonymized output with original data - can be plain text or EncryptableField */
  output: string | EncryptableField;
  /** True if output is encrypted */
  encrypted?: boolean;
  /** Key ID used for encryption (if encrypted) */
  keyId?: string;
  /** Algorithm used for encryption (if encrypted) */
  algorithm?: string;
  /** Hash algorithm used for encryption (if encrypted) */
  hashAlgorithm?: string;
};

/**
 * Result of the anonymize operation with restore function included
 */
export type AnonymizeResult = {
  /** Anonymized prompt ready to send to the LLM */
  safePrompt: string;
  /** Async function to restore the LLM output */
  restore: (llmOutput: string) => Promise<string>;
  /** Optional replacement statistics */
  stats?: {
    replaced: number;
    types: string[];
  };
};

/**
 * Options for anonymize operation
 */
export type AnonymizeOptions = {
  /** Optional custom TTL in seconds (default: 3600 = 1 hour, max: 86400 = 24 hours) */
  ttl?: number;
};

/**
 * Request body for /v1/anonymize endpoint
 * Supports both plain text and encrypted prompts (backward compatible)
 */
export type AnonymizeRequest = {
  /** Prompt as plain text or EncryptableField object */
  prompt: string | EncryptableField;
  ttl?: number;
};

/**
 * Request body for /v1/restore endpoint
 * Supports both plain text and encrypted output (backward compatible)
 */
export type RestoreRequest = {
  mappingId: string;
  /** Output as plain text or EncryptableField object */
  output: string | EncryptableField;
  /** Optional: Request encrypted response */
  encryptResponse?: boolean;
  /** Optional: Partner key ID for response encryption */
  partnerKeyId?: string;
};

/**
 * Error response from API
 */
export type ErrorResponse = {
  message?: string;
  error?: string;
};
