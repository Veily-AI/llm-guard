# @veily/llm-guard - Technical Overview

> **Version:** 0.3.2  
> **Last Updated:** November 2, 2025  
> **Production Core URL:** `https://api.veily.dev`  
> **Protocol:** HTTPS (HTTP/1.1 with keep-alive)  
> **Transit Encryption:** RSA-OAEP with SHA-256 (optional)

## 📋 Table of Contents

- [Architecture](#-architecture)
- [Data Flow](#-data-flow)
- [Core Components](#-core-components)
- [Transit Encryption](#-transit-encryption)
- [API Reference](#-api-reference)
- [Performance](#-performance-optimizations)
- [Security](#-security)
- [Testing](#-testing)
- [Deployment](#-deployment)

---

## 📐 Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────┐
│              Your Application                       │
│  ┌──────────────────────────────────────────────┐  │
│  │  import { wrap } from '@veily/llm-guard'     │  │
│  └────────────────────┬─────────────────────────┘  │
└───────────────────────┼─────────────────────────────┘
                        │
                        │ HTTP/2 with keep-alive
                        │ (hardcoded core URL)
                        ▼
    ┌───────────────────────────────────────┐
    │     @veily/llm-guard (npm package)    │
    │  ┌────────────┐    ┌──────────────┐  │
    │  │  guard.ts  │───▶│   http.ts    │  │
    │  │ (API layer)│    │ (HTTPS pool) │  │
    │  └─────┬──────┘    └──────┬───────┘  │
    │        │                   │          │
    │  ┌─────▼───────────────────▼──────┐      │
    │  │     crypto.ts (optional)    │      │
    │  │  RSA-OAEP encryption       │      │
    │  └────────────────────────────┘      │
    └──────────────────────────┼───────────┘
                               │
                               │ HTTPS with keep-alive
                               │ POST /v1/anonymize
                               │ POST /v1/restore
                               ▼
          ┌────────────────────────────────┐
          │   Veily Core Service           │
          │   (Production)                 │
          │   - PII Detection              │
          │   - Anonymization              │
          │   - Mapping Storage (TTL)      │
          │   - Usage Tracking             │
          └────────────────────────────────┘
```

### Key Design Principles

1. **Zero Configuration**: Core URL is hardcoded, users only provide API key
2. **Infrastructure Abstraction**: Users never know where core is hosted
3. **HTTPS Performance**: Keep-alive connections with connection pooling
4. **Optional Transit Encryption**: RSA-OAEP encryption for enhanced security
5. **Type Safety**: Full TypeScript support with strict types
6. **Zero Dependencies**: No runtime dependencies (uses Node.js crypto)
7. **Cloud Compatible**: Works with AWS App Runner, GCP Cloud Run, Azure
8. **Backward Compatible**: Encryption is opt-in, existing code works unchanged

---

## 🔄 Data Flow

### 1. Anonymize Flow

```
┌─────────────────────────────────────────────────────┐
│ 1. User provides prompt with PII                    │
│    "My email is juan@example.com"                   │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ 2. anonymize() function called                      │
│    - Validates apiKey (required)                    │
│    - Validates prompt (string)                      │
│    - If privateKey provided:                        │
│      • Fetches publicKey + keyId from API           │
│      • Encrypts prompt with RSA-OAEP                │
│    - Adds TTL if specified (default: 1h)            │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ POST /v1/anonymize
                   │ Body: {
                   │   prompt: "..." | { encrypted, value, keyId },
                   │   ttl: 3600
                   │ }
                   │ Headers: { authorization: "Bearer key" }
                   ▼
┌─────────────────────────────────────────────────────┐
│ 3. Core Service                                     │
│    - Detects PII using LLM                          │
│    - Replaces with fake data (Faker.js)             │
│    - Stores mapping with TTL                        │
│    - Generates unique mappingId                     │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ 200 OK
                   │ {
                   │   safePrompt: "My email is [EMAIL_123]",
                   │   mappingId: "map-abc-xyz-123",
                   │   stats: { replaced: 1, types: ["email"] }
                   │ }
                   ▼
┌─────────────────────────────────────────────────────┐
│ 4. SDK returns AnonymizeResult                      │
│    {                                                │
│      safePrompt: "...",                             │
│      restore: async (output) => { ... },           │
│      stats: { ... }                                 │
│    }                                                │
└─────────────────────────────────────────────────────┘
```

### 2. Restore Flow

```
┌─────────────────────────────────────────────────────┐
│ 1. User receives LLM output                         │
│    "Your email is [EMAIL_123]"                      │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ 2. restore() function called                        │
│    (closure with captured mappingId + config)       │
│    - If encryption enabled: requests encrypted resp │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ POST /v1/restore
                   │ Body: {
                   │   mappingId: "map-abc-xyz-123",
                   │   output: "Your email is [EMAIL_123]",
                   │   encryptResponse: true (if encryption)
                   │ }
                   ▼
┌─────────────────────────────────────────────────────┐
│ 3. Core Service                                     │
│    - Validates mappingId ownership (OWASP)          │
│    - Checks TTL expiration                          │
│    - Retrieves original PII                         │
│    - Replaces tokens with original data             │
│    - If encryptResponse=true: encrypts output       │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ 200 OK
                   │ {
                   │   output: "Your email is juan@example.com"
                   │     | { encrypted: true, value: "...", keyId: "..." }
                   │ }
                   ▼
┌─────────────────────────────────────────────────────┐
│ 4. SDK automatically decrypts if encrypted          │
│    Returns restored string                          │
│    "Your email is juan@example.com"                 │
└─────────────────────────────────────────────────────┘
```

---

## 🧩 Core Components

### 1. `types.ts` - Type Definitions

**Purpose**: TypeScript contracts for all interfaces

#### GuardConfig (Public API)

```typescript
type GuardConfig = {
  apiKey: string; // Required: Bearer token for authentication
  headers?: Record<string, string>; // Optional: Additional HTTP headers
  anonymizePath?: string; // Optional: Custom path (default: /v1/anonymize)
  restorePath?: string; // Optional: Custom path (default: /v1/restore)
  privateKey?: string; // Optional: RSA private key in PEM format (enables encryption)
};
```

**Note**: `baseURL` is NOT in public API - it's hardcoded internally

**Encryption**: If `privateKey` is provided:

- SDK automatically fetches `publicKey` and `keyId` from `/v1/transit-crypto/inbound-public-key`
- Prompts are encrypted with RSA-OAEP before sending
- Responses are automatically decrypted
- Keys are cached per API key to avoid repeated requests

#### AnonymizeOptions

```typescript
type AnonymizeOptions = {
  ttl?: number; // Time-to-live in seconds (default: 3600, max: 86400)
};
```

#### Wire Types (HTTP responses)

```typescript
type AnonymizeWire = {
  safePrompt: string;
  mappingId: string;
  stats?: { replaced: number; types: string[] };
};

type RestoreWire = {
  output: string | EncryptableField; // Plain text or encrypted
  encrypted?: boolean; // True if output is encrypted
  keyId?: string; // Key ID if encrypted
  algorithm?: string; // Encryption algorithm if encrypted
  hashAlgorithm?: string; // Hash algorithm if encrypted
};

type EncryptableField = {
  value: string; // Base64-encoded encrypted value
  encrypted: true;
  keyId: string; // Required key ID
};

type InboundPublicKeyResponse = {
  keyId: string;
  algorithm: string;
  hashAlgorithm: string;
  publicKey: string; // PEM format
};
```

#### Result Types (SDK enriched)

```typescript
type AnonymizeResult = {
  safePrompt: string;
  restore: (llmOutput: string) => Promise<string>; // Closure with mappingId
  stats?: { replaced: number; types: string[] };
};
```

---

### 2. `http.ts` - HTTPS Transport Layer

**Purpose**: High-performance HTTPS client with connection pooling and keep-alive

#### Key Features

- ✅ HTTP/1.1 with keep-alive (persistent connections)
- ✅ Connection pool per origin (singleton pattern)
- ✅ Robust error handling with context
- ✅ Automatic JSON serialization/deserialization
- ✅ Support for GET and POST methods

#### HttpsTransport Class

```typescript
class HttpsTransport implements Transport {
  private agent: https.Agent;
  private baseURL: URL;
  private headers: Record<string, string>;

  constructor(cfg: GuardConfig & { baseURL: string });

  // POST request with JSON body
  postJSON<T>(opts: { path: string; body: any }): Promise<T>;

  // GET request
  getJSON<T>(opts: { path: string }): Promise<T>;

  // Cleanup connection
  close(): void;
}
```

#### Connection Pool Strategy

```typescript
// Singleton pool by origin
const transportPool = Map<string, H2Transport>;

// First call: creates new session
getTransport({ apiKey: "...", ... });
// → new URL("https://u3wmtdzmxm.us-east-1.awsapprunner.com").origin
// → Creates HTTP/2 session, stores in pool

// Subsequent calls: reuses session
getTransport({ apiKey: "...", ... });
// → Retrieves from pool (no handshake, ~60ms faster)
```

**Performance Impact**:

- First request: ~100-150ms (includes TLS handshake)
- Subsequent requests: ~30-50ms (reuses connection)
- Latency reduction: **~60-100ms per request**

---

### 3. `crypto.ts` - Transit Encryption Module

**Purpose**: Optional RSA-OAEP encryption for enhanced security beyond HTTPS

#### Key Features

- ✅ RSA-OAEP with SHA-256 (same as backend)
- ✅ Zero runtime dependencies (uses Node.js `crypto`)
- ✅ PEM format validation
- ✅ EncryptableField format support
- ✅ Automatic key fetching and caching

#### Public Functions

```typescript
// Encrypt plain text with RSA public key
function encryptWithPublicKey(plainText: string, publicKeyPem: string): string;

// Decrypt cipher text with RSA private key
function decryptWithPrivateKey(cipherTextBase64: string, privateKeyPem: string): string;

// Validate PEM format public key
function validatePublicKey(publicKey: string): boolean;

// Validate PEM format private key
function validatePrivateKey(privateKey: string): boolean;

// Create EncryptableField for API requests
function createEncryptableField(encryptedValue: string, keyId: string): EncryptableField;
```

#### Encryption Flow

```typescript
// 1. User provides privateKey in config
const cfg = { apiKey: '...', privateKey: '-----BEGIN PRIVATE KEY-----\n...' };

// 2. SDK automatically fetches publicKey and keyId (cached)
// GET /v1/transit-crypto/inbound-public-key
const { publicKey, keyId } = await fetchInboundPublicKey(cfg);

// 3. Prompt encrypted before sending
const encrypted = encryptWithPublicKey(prompt, publicKey);
const field = createEncryptableField(encrypted, keyId);

// 4. POST /v1/anonymize with encrypted prompt
await transport.postJSON({ path: '/v1/anonymize', body: { prompt: field } });

// 5. Response encrypted (if requested)
// 6. SDK automatically decrypts response
const decrypted = decryptWithPrivateKey(response.value, privateKey);
```

**Key Caching**: Public keys are cached per API key to avoid repeated requests

---

### 4. `guard.ts` - Public API Layer

**Purpose**: Three levels of abstraction for different use cases

#### Level 1: `wrap()` - One-Liner API

```typescript
async function wrap(
  prompt: string,
  caller: (safePrompt: string) => Promise<string>,
  cfg: GuardConfig,
  options?: AnonymizeOptions
): Promise<string>;
```

**Use Case**: Simplest integration - entire flow in one call

**Flow**:

1. Validates config (apiKey required)
2. Calls `anonymize(prompt, cfg, options)` → gets `{ safePrompt, restore }`
3. Calls `caller(safePrompt)` → gets `llmOutput`
4. Calls `restore(llmOutput)` → gets `finalOutput`
5. Returns `finalOutput`

**Example**:

```typescript
const result = await wrap(
  'My email is test@example.com',
  async (safe) => callLLM(safe),
  { apiKey: 'key' },
  { ttl: 7200 }
);
```

#### Level 2: `anonymize()` + `restore()` - Manual Control

```typescript
async function anonymize(
  prompt: string,
  cfg: GuardConfig,
  options?: AnonymizeOptions
): Promise<AnonymizeResult>;
```

**Use Case**: Fine-grained control, access to stats, custom LLM flow

**Flow**:

1. Validates `prompt` (must be string, non-empty)
2. Validates `cfg.apiKey` (required)
3. Gets hardcoded baseURL: `https://api.veily.dev`
4. If `cfg.privateKey` provided:
   - Validates private key format (PEM)
   - Fetches `publicKey` and `keyId` from `/v1/transit-crypto/inbound-public-key` (cached)
   - Encrypts prompt with RSA-OAEP
   - Sends as `EncryptableField` object
5. POST `/v1/anonymize` with `{ prompt: string | EncryptableField, ttl? }`
6. Validates response (`safePrompt` and `mappingId` required)
7. **Creates closure** with captured `mappingId`, `transport`, and `config` (for decryption)
8. Returns `{ safePrompt, restore, stats }`

**Closure Pattern** (Critical Design):

```typescript
// Inside anonymize()
const restore = async (llmOutput: string): Promise<string> => {
  // mappingId, transport, and validatedCfg captured from outer scope (closure)
  const shouldEncryptResponse = !!validatedCfg.publicKey && !!validatedCfg.keyId;

  const response = await transport.postJSON<RestoreWire>({
    path: paths.restore,
    body: {
      mappingId: response.mappingId,
      output: llmOutput,
      encryptResponse: shouldEncryptResponse,
    },
  });

  // If response is encrypted, automatically decrypt
  if (response.encrypted && typeof response.output === 'object') {
    const encryptedField = response.output as EncryptableField;
    return decryptWithPrivateKey(encryptedField.value, validatedCfg.privateKey);
  }

  return response.output as string;
};
```

**Why Closure?**

- User doesn't need to manage `mappingId`
- Impossible to lose mapping reference
- Type-safe (TypeScript enforces correct usage)

#### Level 3: `createSession()` - Stateful API

```typescript
function createSession(cfg: GuardConfig): {
  protect(prompt, caller, options?): Promise<string>;
  anonymize(prompt, options?): Promise<AnonymizeResult>;
};
```

**Use Case**: Multiple calls with same configuration

**Advantages**:

- Config validated once
- Transport reused automatically
- Cleaner code (no config repetition)

**Example**:

```typescript
const session = createSession({ apiKey: 'key' });

const r1 = await session.protect(prompt1, caller);
const r2 = await session.protect(prompt2, caller, { ttl: 7200 });
```

---

### 5. `index.ts` - Public Entry Point

**Purpose**: Control what's exported to npm consumers

```typescript
// Functions
export { anonymize, wrap, createSession } from './guard.js';

// Crypto functions (optional, for advanced use)
export {
  encryptWithPublicKey,
  decryptWithPrivateKey,
  validatePublicKey,
  validatePrivateKey,
  createEncryptableField,
} from './crypto.js';

// Types
export type {
  GuardConfig,
  AnonymizeResult,
  AnonymizeWire,
  RestoreWire,
  AnonymizeOptions,
  EncryptableField,
} from './types.js';
```

**Not Exported** (internal only):

- `HttpsTransport` class
- `getTransport()` function
- `validateConfig()` function
- `getBaseURL()` function
- `fetchInboundPublicKey()` function
- `encryptPromptIfNeeded()` function

---

## 🔐 Transit Encryption

### Overview

Transit encryption adds an **optional** RSA-OAEP encryption layer beyond HTTPS. This ensures that even if HTTPS is compromised, prompts remain encrypted.

### How It Works

1. **User provides `privateKey`** in `GuardConfig`
2. **SDK automatically fetches** `publicKey` and `keyId` from `/v1/transit-crypto/inbound-public-key`
3. **Prompt is encrypted** with RSA-OAEP before sending to Veily Core
4. **Core processes** encrypted prompt (decrypts internally, processes, re-encrypts response)
5. **Response is encrypted** (if requested)
6. **SDK automatically decrypts** response before returning to user

### Key Features

- **Zero Configuration**: Just provide `privateKey`, SDK handles the rest
- **Automatic Key Management**: Public key and key ID fetched and cached automatically
- **Backward Compatible**: Encryption is opt-in, existing code works unchanged
- **Performance Optimized**: Keys cached per API key (one request per API key)
- **Industry Standard**: RSA-OAEP with SHA-256 (same as Veily Core backend)

### Encryption Algorithm

- **Algorithm**: RSA-OAEP (Optimal Asymmetric Encryption Padding)
- **Hash**: SHA-256
- **Key Format**: PEM (Privacy-Enhanced Mail)
- **Encryption Format**: Base64-encoded cipher text

### Example Flow

```typescript
// User config (minimal)
const config = {
  apiKey: 'your-api-key',
  privateKey: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----',
};

// SDK automatically:
// 1. Validates private key format
// 2. Fetches publicKey and keyId (GET /v1/transit-crypto/inbound-public-key)
// 3. Encrypts prompt with RSA-OAEP
// 4. Sends encrypted prompt to /v1/anonymize
// 5. Receives encrypted response (if requested)
// 6. Decrypts response automatically

const result = await wrap(prompt, llmCaller, config);
// Result is decrypted and ready to use
```

### Security Considerations

- **Private Key Storage**: Store `privateKey` securely (environment variables, secrets manager)
- **Key Rotation**: When keys rotate, SDK automatically fetches new public key
- **Caching**: Keys cached per API key - invalidate cache by creating new transport instance
- **HTTPS Still Required**: Encryption is **in addition to** HTTPS, not a replacement

---

## 🚀 Performance Optimizations

### 1. HTTPS Keep-Alive

```
Persistent Connection with Keep-Alive
─────────────────────────────────────
Request 1 (anonymize) ──┐
Request 2 (restore)  ───┤  Reuse same
Request 3 (metrics)  ───┤  TCP connection
Request 4 (anonymize) ──┘  via keep-alive

Benefits:
- No TLS handshake overhead per request
- Connection reuse reduces latency
- Compatible with all cloud providers
```

### 2. Connection Pooling Benchmark

```typescript
// WITHOUT keep-alive (naive implementation)
for (let i = 0; i < 100; i++) {
  await anonymize(...); // Creates new connection each time
}
// Total time: ~15-20 seconds (150-200ms each)

// WITH keep-alive (current implementation)
for (let i = 0; i < 100; i++) {
  await anonymize(...); // Reuses connection
}
// Total time: ~6-8 seconds (60-80ms each)
// Performance gain: 2-3x faster
```

### 3. Lazy Initialization

```typescript
// Session creation is instant
const session = createSession(cfg); // ~0ms

// Connection created on first use
const result1 = await session.protect(...); // ~100ms (first)
const result2 = await session.protect(...); // ~30ms (reused)
```

---

## 🔐 Security

### 1. Input Validation

```typescript
// ✅ Type validation
if (typeof prompt !== 'string') {
  throw new Error('prompt must be a string');
}

// ✅ API key validation (required)
if (!cfg?.apiKey || cfg.apiKey.trim() === '') {
  throw new Error('cfg.apiKey is required');
}

// ✅ Private key format validation (if provided)
if (cfg.privateKey && !validatePrivateKey(cfg.privateKey)) {
  throw new Error('Invalid private key format. Expected PEM format');
}

// ✅ Public key validation (from API)
if (response?.publicKey && !validatePublicKey(response.publicKey)) {
  throw new Error('Invalid public key format received from API');
}

// ✅ Response validation
if (!response?.safePrompt || !response?.mappingId) {
  throw new Error('Invalid response from /anonymize');
}

// ✅ TTL validation (done by core)
if (options?.ttl && (options.ttl < 1 || options.ttl > 86400)) {
  // Core returns 400 Bad Request
}
```

### 2. Error Messages (OWASP Compliant)

```typescript
// ❌ BAD: Exposes internal details
throw new Error(`Failed to connect to ${baseURL}: ${error.stack}`);

// ✅ GOOD: Generic, no sensitive info
throw new Error('HTTP request failed');

// ❌ BAD: Leaks PII
console.log(`Anonymizing: "${prompt}"`);

// ✅ GOOD: No PII in logs
console.log('Anonymize request initiated');
```

### 3. Headers Security

```typescript
// Always included
{
  "content-type": "application/json"
}

// If apiKey provided (authentication)
{
  "authorization": "Bearer ${cfg.apiKey}"
}

// Custom headers (user-provided)
{
  ...cfg.headers
}
```

**⚠️ Important**: Never log headers (may contain tokens)

### 4. Hardcoded Core URL (Security by Design)

```typescript
// Users NEVER see the core URL
const baseURL = process.env.VEILY_CORE_URL || 'https://api.veily.dev';

// Benefits:
// ✅ Users can't point to malicious servers
// ✅ Veily controls infrastructure endpoints
// ✅ Can update URL without user changes
// ✅ Reduces attack surface
// ✅ Environment variable only for internal testing
```

### 5. Transit Encryption Security

```typescript
// ✅ Private key never sent over network
const config = { apiKey: '...', privateKey: '...' };
// Only public key is fetched (public information)

// ✅ Key ID verification
if (encryptedField.keyId !== validatedCfg.keyId) {
  throw new Error('Key ID mismatch'); // Prevents key confusion attacks
}

// ✅ Automatic decryption
// SDK automatically decrypts responses when encryption is enabled
// User doesn't need to manually decrypt

// ✅ PEM format validation
// Invalid keys are rejected before encryption attempts
```

---

## 🧪 Testing

### Test Strategy

| Type        | Tool        | Purpose                         |
| ----------- | ----------- | ------------------------------- |
| Unit Tests  | Jest        | Mock HTTP transport, test logic |
| Type Tests  | TypeScript  | Ensure type safety              |
| Integration | Mock server | Test HTTPS flows                |

### Current Test Coverage

```
✅ 28+ tests passing
✅ 100% of public API covered
✅ All error paths tested
✅ TTL validation tested
✅ Crypto module tests (encryption/decryption)
✅ Encryption integration tests
✅ Key validation tests
✅ Backward compatibility tests (without encryption)
```

### Mock Implementation

```typescript
// test/setup.ts
jest.unstable_mockModule('../src/http.js', () => ({
  getTransport: jest.fn(() => ({
    postJSON: async ({ path, body }) => {
      if (path.endsWith('/v1/anonymize')) {
        return {
          safePrompt: anonymizeMock(body.prompt),
          mappingId: 'mock-id',
          stats: { replaced: 1, types: ['email'] },
        };
      }
      if (path.endsWith('/v1/restore')) {
        return { output: restoreMock(body.output) };
      }
    },
  })),
}));
```

### Encryption Tests

```typescript
// test/crypto.spec.ts
describe('crypto module', () => {
  it('should encrypt and decrypt correctly');
  it('should validate PEM formats');
  it('should create EncryptableField objects');
});

// test/guard-encryption.spec.ts
describe('guard with encryption', () => {
  it('should encrypt prompts when privateKey provided');
  it('should decrypt responses automatically');
  it('should work without encryption (backward compatible)');
});
```

---

## 🏗️ Deployment

### Infrastructure Requirements

**Minimum**:

- Node.js >= 16.0.0
- NPM package manager
- API key from Veily

**Optional for Encryption**:

- RSA private key in PEM format (for transit encryption)

**No Additional Setup**:

- ❌ No environment variables required (unless testing)
- ❌ No database connections
- ❌ No external services to configure
- ❌ No additional dependencies (uses Node.js `crypto`)

### Recommended Architecture

```
┌────────────────────────────────────────────┐
│          Production Environment            │
│                                            │
│  ┌──────────────┐      ┌───────────────┐  │
│  │  App Servers │─────▶│  Veily Core   │  │
│  │ (llm-guard)  │ HTTPS │ (Production)  │  │
│  └──────────────┘      └───────────────┘  │
│         │                                  │
└─────────┼──────────────────────────────────┘
          │
          │ HTTPS
          ▼
    ┌─────────┐
    │   LLM   │
    │ OpenAI  │
    └─────────┘
```

### Configuration per Environment

```typescript
// No environment-specific config needed!
// Just different API keys

// Development
const config = { apiKey: process.env.DEV_API_KEY };

// Staging
const config = { apiKey: process.env.STAGING_API_KEY };

// Production
const config = { apiKey: process.env.PROD_API_KEY };
```

---

## 📊 Monitoring

### Recommended Metrics to Track

```typescript
// 1. Latency
const start = Date.now();
const result = await wrap(prompt, caller, config);
const duration = Date.now() - start;
metrics.histogram('llm_guard.latency', duration);

// 2. PII Detection Rate
const { stats } = await anonymize(prompt, config);
if (stats) {
  metrics.increment('pii.detected', stats.replaced, {
    types: stats.types.join(','),
  });
}

// 3. Error Rate
try {
  await wrap(prompt, caller, config);
  metrics.increment('requests', 1, { status: 'success' });
} catch (error) {
  metrics.increment('requests', 1, {
    status: 'error',
    type: error.message.includes('401') ? 'unauthorized' : 'other',
  });
}
```

---

## 🔄 Versioning

Following [Semantic Versioning](https://semver.org/):

```
0.1.0 → Initial release
      → + TTL support
      → + Hardcoded core URL

0.3.0 → Transit encryption
      → + RSA-OAEP encryption (optional)
      → + Automatic key fetching
      → + Crypto module (zero dependencies)
      → + Backward compatible

0.3.2 → Current version

1.0.0 → (Future) Stable API
```

---

## 📚 References

- [Node.js HTTPS API](https://nodejs.org/api/https.html)
- [Node.js Crypto API](https://nodejs.org/api/crypto.html)
- [RSA-OAEP Encryption](https://en.wikipedia.org/wiki/Optimal_asymmetric_encryption_padding)
- [HTTP Keep-Alive](https://en.wikipedia.org/wiki/HTTP_persistent_connection)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [Semantic Versioning](https://semver.org/)

---

## 🤝 Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines.

---

**Documentation Version:** 3.0  
**Last Updated:** November 2, 2025  
**Production Ready:** ✅ Yes  
**Transit Encryption:** ✅ Optional (RSA-OAEP)
