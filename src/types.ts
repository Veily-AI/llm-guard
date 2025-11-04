/**
 * Configuration for the HTTP/2 guard client
 */
export type GuardConfig = {
  /** API key for Bearer authentication (required) */
  apiKey: string;
  /** Timeout in milliseconds (default: 2000ms) */
  timeoutMs?: number;
  /** Additional HTTP headers */
  headers?: Record<string, string>;
  /** Custom path for anonymize (default: /v1/anonymize) */
  anonymizePath?: string;
  /** Custom path for restore (default: /v1/restore) */
  restorePath?: string;
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
  /** De-anonymized output with original data */
  output: string;
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
