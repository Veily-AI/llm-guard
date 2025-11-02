# @veily/llm-guard - Technical Overview

> **Version:** 0.1.0  
> **Last Updated:** November 2, 2025  
> **Production Core URL:** `https://u3wmtdzmxm.us-east-1.awsapprunner.com`

## 📋 Table of Contents

- [Architecture](#-architecture)
- [Data Flow](#-data-flow)
- [Core Components](#-core-components)
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
    │  │ (API layer)│    │ (HTTP/2 pool)│  │
    │  └────────────┘    └──────┬───────┘  │
    └──────────────────────────┼───────────┘
                               │
                               │ POST /v1/anonymize
                               │ POST /v1/restore
                               │ GET  /v1/metrics
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
3. **HTTP/2 Performance**: Keep-alive connections with connection pooling
4. **Type Safety**: Full TypeScript support with strict types
5. **Zero Dependencies**: No runtime dependencies

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
│    - Adds TTL if specified (default: 1h)            │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ POST /v1/anonymize
                   │ Body: { prompt: "...", ttl: 3600 }
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
│    (closure with captured mappingId)                │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ POST /v1/restore
                   │ Body: {
                   │   mappingId: "map-abc-xyz-123",
                   │   output: "Your email is [EMAIL_123]"
                   │ }
                   ▼
┌─────────────────────────────────────────────────────┐
│ 3. Core Service                                     │
│    - Validates mappingId ownership (OWASP)          │
│    - Checks TTL expiration                          │
│    - Retrieves original PII                         │
│    - Replaces tokens with original data             │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ 200 OK
                   │ { output: "Your email is juan@example.com" }
                   ▼
┌─────────────────────────────────────────────────────┐
│ 4. SDK returns restored string                      │
│    "Your email is juan@example.com"                 │
└─────────────────────────────────────────────────────┘
```

### 3. Metrics Flow

```
┌─────────────────────────────────────────────────────┐
│ 1. getMetrics() called                              │
│    { apiKey: "your-key" }                           │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ GET /v1/metrics
                   │ Headers: { authorization: "Bearer key" }
                   ▼
┌─────────────────────────────────────────────────────┐
│ 2. Core Service                                     │
│    - Queries tenant usage data                      │
│    - Aggregates cycle statistics                    │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ 200 OK
                   │ {
                   │   totalCycles: 1523,
                   │   successfulDeliveries: 1498,
                   │   completedCycles: 1487,
                   │   totalPiiReplaced: 4521,
                   │   piiTypes: ["email", "name", "phone"]
                   │ }
                   ▼
┌─────────────────────────────────────────────────────┐
│ 3. SDK returns MetricsResponse                      │
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
  timeoutMs?: number; // Optional: Request timeout (default: 2000ms)
  headers?: Record; // Optional: Additional HTTP headers
  anonymizePath?: string; // Optional: Custom path (default: /v1/anonymize)
  restorePath?: string; // Optional: Custom path (default: /v1/restore)
  metricsPath?: string; // Optional: Custom path (default: /v1/metrics)
};
```

**Note**: `baseURL` is NOT in public API - it's hardcoded internally

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
  output: string;
};

type MetricsResponse = {
  totalCycles?: number;
  successfulDeliveries?: number;
  completedCycles?: number;
  totalPiiReplaced?: number;
  piiTypes?: string[];
  [key: string]: unknown;
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

### 2. `http.ts` - HTTP/2 Transport Layer

**Purpose**: High-performance HTTP/2 client with connection pooling

#### Key Features

- ✅ HTTP/2 with keep-alive (persistent connections)
- ✅ Connection pool per origin (singleton pattern)
- ✅ Configurable timeouts with automatic cleanup
- ✅ Robust error handling with context
- ✅ Automatic JSON serialization/deserialization
- ✅ Support for GET and POST methods

#### H2Transport Class

```typescript
class H2Transport implements Transport {
  private client: http2.ClientHttp2Session;
  private basePath: string;
  private headers: Record<string, string>;
  private timeoutMs: number;

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

### 3. `guard.ts` - Public API Layer

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
  "My email is test@example.com",
  async (safe) => callLLM(safe),
  { apiKey: "key" },
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
3. Gets hardcoded baseURL: `https://u3wmtdzmxm.us-east-1.awsapprunner.com`
4. POST `/v1/anonymize` with `{ prompt, ttl? }`
5. Validates response (`safePrompt` and `mappingId` required)
6. **Creates closure** with captured `mappingId` and `transport`
7. Returns `{ safePrompt, restore, stats }`

**Closure Pattern** (Critical Design):

```typescript
// Inside anonymize()
const restore = async (llmOutput: string): Promise<string> => {
  // mappingId is captured from outer scope (closure)
  const response = await transport.postJSON<RestoreWire>({
    path: paths.restore,
    body: { mappingId: response.mappingId, output: llmOutput },
  });
  return response.output;
};
```

**Why Closure?**

- User doesn't need to manage `mappingId`
- Impossible to lose mapping reference
- Type-safe (TypeScript enforces correct usage)

#### Level 3: `getMetrics()` - Usage Tracking

```typescript
async function getMetrics(cfg: GuardConfig): Promise<MetricsResponse>;
```

**Use Case**: Track usage for billing, analytics, monitoring

**Flow**:

1. Validates `cfg.apiKey`
2. GET `/v1/metrics`
3. Returns aggregated tenant metrics

**Example**:

```typescript
const metrics = await getMetrics({ apiKey: "key" });
console.log(metrics.totalCycles); // 1523
```

#### Level 4: `createSession()` - Stateful API

```typescript
function createSession(cfg: GuardConfig): {
  protect(prompt, caller, options?): Promise<string>;
  anonymize(prompt, options?): Promise<AnonymizeResult>;
  getMetrics(): Promise<MetricsResponse>;
};
```

**Use Case**: Multiple calls with same configuration

**Advantages**:

- Config validated once
- Transport reused automatically
- Cleaner code (no config repetition)

**Example**:

```typescript
const session = createSession({ apiKey: "key" });

const r1 = await session.protect(prompt1, caller);
const r2 = await session.protect(prompt2, caller, { ttl: 7200 });
const metrics = await session.getMetrics();
```

---

### 4. `index.ts` - Public Entry Point

**Purpose**: Control what's exported to npm consumers

```typescript
// Functions
export { anonymize, wrap, createSession, getMetrics } from "./guard.js";

// Types
export type {
  GuardConfig,
  AnonymizeResult,
  AnonymizeWire,
  RestoreWire,
  AnonymizeOptions,
  MetricsResponse,
} from "./types.js";
```

**Not Exported** (internal only):

- `H2Transport` class
- `getTransport()` function
- `validateConfig()` function
- `getBaseURL()` function

---

## 🚀 Performance Optimizations

### 1. HTTP/2 Multiplexing

```
Single TCP Connection
─────────────────────────────────────
Request 1 (anonymize) ──┐
Request 2 (restore)  ───┤  All use same
Request 3 (metrics)  ───┤  connection
Request 4 (anonymize) ──┘  simultaneously

Benefits:
- No connection overhead per request
- Parallel requests without blocking
- Automatic header compression
```

### 2. Connection Pooling Benchmark

```typescript
// WITHOUT pool (naive implementation)
for (let i = 0; i < 100; i++) {
  await anonymize(...); // Creates new connection each time
}
// Total time: ~10-15 seconds (100-150ms each)

// WITH pool (current implementation)
for (let i = 0; i < 100; i++) {
  await anonymize(...); // Reuses connection
}
// Total time: ~3-5 seconds (30-50ms each)
// Performance gain: 3-5x faster
```

### 3. Lazy Initialization

```typescript
// Session creation is instant
const session = createSession(cfg); // ~0ms

// Connection created on first use
const result1 = await session.protect(...); // ~100ms (first)
const result2 = await session.protect(...); // ~30ms (reused)
```

### 4. Configurable Timeouts per Environment

```typescript
// Development: generous timeout for debugging
const devConfig = { apiKey: "...", timeoutMs: 10000 };

// Production: aggressive timeout for fast failure
const prodConfig = { apiKey: "...", timeoutMs: 1500 };

// Staging: balanced
const stagingConfig = { apiKey: "...", timeoutMs: 3000 };
```

**Recommendation**: Set timeout based on your SLA

- P99 < 50ms → `timeoutMs: 1000`
- P99 < 100ms → `timeoutMs: 2000`
- P99 < 200ms → `timeoutMs: 3000`

---

## 🔐 Security

### 1. Input Validation

```typescript
// ✅ Type validation
if (typeof prompt !== "string") {
  throw new Error("prompt must be a string");
}

// ✅ API key validation (required)
if (!cfg?.apiKey || cfg.apiKey.trim() === "") {
  throw new Error("cfg.apiKey is required");
}

// ✅ Response validation
if (!response?.safePrompt || !response?.mappingId) {
  throw new Error("Invalid response from /anonymize");
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
throw new Error("HTTP/2 request timeout");

// ❌ BAD: Leaks PII
console.log(`Anonymizing: "${prompt}"`);

// ✅ GOOD: No PII in logs
console.log("Anonymize request initiated");
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
const baseURL = "https://u3wmtdzmxm.us-east-1.awsapprunner.com";

// Benefits:
// ✅ Users can't point to malicious servers
// ✅ Veily controls infrastructure endpoints
// ✅ Can update URL without user changes
// ✅ Reduces attack surface
```

---

## 🧪 Testing

### Test Strategy

| Type        | Tool        | Purpose                         |
| ----------- | ----------- | ------------------------------- |
| Unit Tests  | Jest        | Mock HTTP transport, test logic |
| Type Tests  | TypeScript  | Ensure type safety              |
| Integration | Mock server | Test HTTP/2 flows               |

### Current Test Coverage

```
✅ 21 tests passing
✅ 100% of public API covered
✅ All error paths tested
✅ TTL validation tested
✅ Metrics endpoint tested
```

### Mock Implementation

```typescript
// test/setup.ts
jest.unstable_mockModule("../src/http.js", () => ({
  getTransport: jest.fn(() => ({
    postJSON: async ({ path, body }) => {
      if (path.endsWith("/v1/anonymize")) {
        return {
          safePrompt: anonymizeMock(body.prompt),
          mappingId: "mock-id",
          stats: { replaced: 1, types: ["email"] },
        };
      }
      if (path.endsWith("/v1/restore")) {
        return { output: restoreMock(body.output) };
      }
    },
    getJSON: async ({ path }) => {
      if (path.endsWith("/v1/metrics")) {
        return {
          totalCycles: 42,
          successfulDeliveries: 40,
        };
      }
    },
  })),
}));
```

---

## 🏗️ Deployment

### Infrastructure Requirements

**Minimum**:

- Node.js >= 18.0.0
- NPM package manager
- API key from Veily

**No Additional Setup**:

- ❌ No environment variables required
- ❌ No database connections
- ❌ No external services to configure

### Recommended Architecture

```
┌────────────────────────────────────────────┐
│          Production Environment            │
│                                            │
│  ┌──────────────┐      ┌───────────────┐  │
│  │  App Servers │─────▶│  Veily Core   │  │
│  │ (llm-guard)  │ HTTP/2│ (Production)  │  │
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

## 📊 Monitoring & Metrics

### Recommended Metrics to Track

```typescript
// 1. Latency
const start = Date.now();
const result = await wrap(prompt, caller, config);
const duration = Date.now() - start;
metrics.histogram("llm_guard.latency", duration);

// 2. PII Detection Rate
const { stats } = await anonymize(prompt, config);
if (stats) {
  metrics.increment("pii.detected", stats.replaced, {
    types: stats.types.join(","),
  });
}

// 3. Error Rate
try {
  await wrap(prompt, caller, config);
  metrics.increment("requests", 1, { status: "success" });
} catch (error) {
  metrics.increment("requests", 1, {
    status: "error",
    type: error.message.includes("timeout") ? "timeout" : "other",
  });
}

// 4. Usage Tracking
const metrics = await getMetrics(config);
console.log("Billing cycles:", metrics.successfulDeliveries);
```

---

## 🔄 Versioning

Following [Semantic Versioning](https://semver.org/):

```
0.1.0 → Initial release
      → + TTL support
      → + Metrics endpoint
      → + Hardcoded core URL

0.2.0 → (Future) New features
1.0.0 → (Future) Stable API
```

---

## 📚 References

- [HTTP/2 RFC 7540](https://httpwg.org/specs/rfc7540.html)
- [Node.js HTTP/2 API](https://nodejs.org/api/http2.html)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [Semantic Versioning](https://semver.org/)

---

## 🤝 Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for development guidelines.

---

**Documentation Version:** 2.0  
**Last Updated:** November 2, 2025  
**Production Ready:** ✅ Yes
