# @veily/llm-guard - Technical Overview

## 📐 Architecture

```
┌─────────────────┐
│  Your Application│
└────────┬────────┘
         │
         │ import { wrap }
         ▼
┌─────────────────────────────────────┐
│      @veily/llm-guard (HTTP/2)      │
│  ┌─────────┐    ┌──────────┐       │
│  │  guard  │───▶│   http   │       │
│  └─────────┘    └────┬─────┘       │
└───────────────────────┼─────────────┘
                        │ HTTP/2 keep-alive
                        │ POST /v1/redact
                        │ POST /v1/restore
                        ▼
          ┌───────────────────────┐
          │   Veily Core Service  │
          │  (PII Detection +     │
          │   Anonymization)      │
          └───────────────────────┘
```

---

## 🔄 Data Flow

### 1. **Anonymize Flow**

```
User sends original prompt
        ↓
  ┌──────────────┐
  │ anonymize()  │
  └─────┬────────┘
       │
       │ POST /v1/anonymize
       │ { prompt: "Email: juan@example.com" }
       ▼
  ┌──────────┐
  │   Core   │ ← Detects PII (email)
  └────┬─────┘   Generates mappingId
       │
       │ 200 OK
       │ { safePrompt: "Email: [EMAIL_XXX]",
       │   mappingId: "map-12345",
       │   stats: { replaced: 1, types: ["email"] } }
       ▼
  ┌──────────────────┐
  │ Return           │
  │ { safePrompt,    │
  │   restore(),     │
  │   stats }        │
  └──────────────────┘
```

### 2. **Restore Flow**

```
User receives LLM output
        ↓
  ┌──────────┐
  │ restore()│
  └────┬─────┘
       │
       │ POST /v1/restore
       │ { mappingId: "map-12345",
       │   output: "Your email is [EMAIL_XXX]" }
       ▼
  ┌──────────┐
  │   Core   │ ← Looks up mapping
  └────┬─────┘   Restores original PII
       │
       │ 200 OK
       │ { output: "Your email is juan@example.com" }
       ▼
  ┌──────────────────┐
  │ Return final     │
  │ output with      │
  │ original data    │
  └──────────────────┘
```

---

## 🏗️ Internal Components

### `types.ts`

Defines TypeScript contracts:

- **GuardConfig**: Client configuration
- **AnonymizeWire**: Response from `/v1/anonymize` endpoint
- **RestoreWire**: Response from `/v1/restore` endpoint
- **AnonymizeResult**: Enriched result with `restore()` function

### `http.ts`

**Responsibility**: Low-latency HTTP/2 transport

**Features**:

- ✅ HTTP/2 with keep-alive (persistent connection)
- ✅ Connection pool per origin (singleton)
- ✅ Configurable timeouts
- ✅ Robust error handling
- ✅ Automatic JSON parsing

**Classes**:

```typescript
class H2Transport implements Transport {
  private client: http2.ClientHttp2Session;
  private basePath: string;
  private headers: Record<string, string>;
  private timeoutMs: number;

  postJSON<T>(opts: PostOptions): Promise<T>;
  close(): void;
}
```

**Functions**:

- `getTransport(cfg)`: Gets/creates transport from pool
- `__resetTransportPool()`: Clears pool (tests only)

**Pool Strategy**:

```typescript
// Key: origin (https://core.veily.internal)
// Value: H2Transport instance (reusable)
const pool = Map<string, H2Transport>;

// First call: creates connection
getTransport({ baseURL: "https://core.veily.internal" });
// → Creates new HTTP/2 session, saves in pool

// Subsequent calls: reuses
getTransport({ baseURL: "https://core.veily.internal" });
// → Returns existing session (no handshake)
```

**Advantages**:

- Reduces latency by ~40-60ms per request
- Avoids SSL/TLS handshake overhead
- Native HTTP/2 multiplexing

### `guard.ts`

**Responsibility**: Public API with 3 levels of abstraction

#### 1. `wrap()` - One-liner

```typescript
async function wrap(
  prompt: string,
  caller: (safePrompt: string) => Promise<string>,
  cfg: GuardConfig
): Promise<string>;
```

**Flow**:

1. Calls `anonymize()` → gets `safePrompt`
2. Calls `caller(safePrompt)` → gets `llmOutput`
3. Calls `restore(llmOutput)` → gets `finalOutput`
4. Returns `finalOutput`

#### 2. `anonymize()` - Manual control

```typescript
async function anonymize(prompt: string, cfg: GuardConfig): Promise<AnonymizeResult>;
```

**Flow**:

1. Validates `prompt` (string type)
2. Validates `cfg.baseURL` (required)
3. POST `/v1/anonymize` with `{ prompt }`
4. Validates response (`safePrompt`, `mappingId`)
5. Creates `restore()` closure with captured `mappingId`
6. Returns `{ safePrompt, restore, stats }`

**Closure Pattern**:

```typescript
const restore = async (llmOutput: string): Promise<string> => {
  // mappingId is captured from outer scope
  const response = await transport.postJSON<RestoreWire>({
    path: paths.restore,
    body: { mappingId: response.mappingId, output: llmOutput },
  });
  return response.output;
};
```

#### 3. `createSession()` - Stateful API

```typescript
function createSession(cfg: GuardConfig): {
  protect(prompt, caller): Promise<string>;
  anonymize(prompt): Promise<AnonymizeResult>;
};
```

**Advantages**:

- No need to repeat configuration
- Single validation of `cfg`
- Automatically reuses transport

### `index.ts`

**Responsibility**: Public entry point

Exports only what's necessary:

```typescript
export { anonymize, wrap, createSession } from "./guard";
export type { GuardConfig, AnonymizeResult } from "./types";
```

---

## 🚀 Performance Optimizations

### 1. **HTTP/2 Multiplexing**

```
Request 1 (anonymize) ──┐
Request 2 (restore) ─────┤ Same TCP connection
Request 3 (anonymize) ──┘ No handshake overhead
```

### 2. **Connection Pooling**

```typescript
// Without pool (inefficient):
getTransport(cfg) → New connection (100ms)
getTransport(cfg) → New connection (100ms)
// Total: 200ms

// With pool (efficient):
getTransport(cfg) → New connection (100ms)
getTransport(cfg) → Reuses (0ms)
// Total: 100ms
```

### 3. **Lazy Initialization**

The HTTP/2 client is only created when making the first call:

```typescript
// Doesn't create connection
const session = createSession(cfg);

// Connection is created here
const result = await session.protect(prompt, caller);
```

### 4. **Configurable Timeouts**

```typescript
// Development: longer timeouts
const devConfig = { baseURL: "...", timeoutMs: 5000 };

// Production: aggressive timeouts
const prodConfig = { baseURL: "...", timeoutMs: 1200 };
```

---

## 🔐 Security

### Implemented Validations

#### Input Validation

```typescript
// ✅ Type validation
if (typeof prompt !== "string") {
  throw new Error("prompt must be a string");
}

// ✅ Config validation
if (!cfg?.baseURL) {
  throw new Error("cfg.baseURL is required");
}

// ✅ Output validation
if (!response?.safePrompt || !response?.mappingId) {
  throw new Error("Invalid response from /anonymize");
}
```

#### Error Messages

```typescript
// ❌ Bad: exposes internal details
throw new Error(`Failed to connect to ${cfg.baseURL}: ${internalError}`);

// ✅ Good: generic message
throw new Error("HTTP/2 request timeout");
```

### Secure Headers

```typescript
// Base headers (always)
{
  "content-type": "application/json"
}

// + Auth header (if apiKey)
{
  "authorization": "Bearer ${cfg.apiKey}"
}

// + Custom headers (if cfg.headers)
{
  ...cfg.headers
}
```

**Note**: Never log headers that may contain tokens.

---

## 🧪 Testing

### Strategy

1. **Unit Tests**: Mock HTTP transport
2. **Integration Tests**: Mock HTTP/2 server
3. **E2E Tests**: Real server (CI/CD)

### Mocks

```typescript
// src/__mocks__/http.ts
export class FakeTransport {
  postJSON({ path, body }) {
    if (path.endsWith("/v1/anonymize")) {
      return Promise.resolve({
        safePrompt: anonymize(body.prompt),
        mappingId: "mock-123",
        stats: { replaced: 1, types: ["email"] },
      });
    }
    // ...
  }
}
```

---

## 📊 Recommended Metrics

To monitor in production:

### Latency

```typescript
const start = Date.now();
const result = await wrap(prompt, caller, cfg);
const duration = Date.now() - start;

// Send to your metrics system
metrics.histogram("llm_guard.wrap.duration", duration, {
  status: "success",
});
```

### PII Detection Rate

```typescript
const { stats } = await anonymize(prompt, cfg);
if (stats) {
  metrics.increment("llm_guard.pii.detected", stats.replaced, {
    types: stats.types.join(","),
  });
}
```

### Error Rate

```typescript
try {
  await wrap(prompt, caller, cfg);
  metrics.increment("llm_guard.requests", 1, { status: "success" });
} catch (error) {
  metrics.increment("llm_guard.requests", 1, {
    status: "error",
    error_type: error.message.includes("timeout") ? "timeout" : "other",
  });
}
```

---

## 🏗️ Deployment

### Recommended Infrastructure

```
┌──────────────────────────────────────────┐
│          Same VPC / Cluster              │
│                                          │
│  ┌─────────────┐      ┌──────────────┐  │
│  │   App Pods  │─────▶│  Core Service│  │
│  │  (llm-guard)│      │  (Internal   │  │
│  └─────────────┘      │   ALB/NLB)   │  │
│                       └──────────────┘  │
└──────────────────────────────────────────┘
         │
         │ HTTPS (public)
         ▼
    ┌─────────┐
    │   LLM   │
    │ (OpenAI)│
    └─────────┘
```

### Configuration per Environment

```typescript
// config/development.ts
export const config = {
  baseURL: "http://localhost:3000",
  timeoutMs: 5000,
};

// config/staging.ts
export const config = {
  baseURL: "https://core-staging.veily.internal",
  apiKey: process.env.VEILY_STAGING_KEY,
  timeoutMs: 2500,
};

// config/production.ts
export const config = {
  baseURL: "https://core.veily.internal",
  apiKey: process.env.VEILY_PROD_KEY,
  timeoutMs: 1500,
};
```

---

## 🔄 Versioning

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking API changes
- **MINOR**: New compatible features
- **PATCH**: Compatible bug fixes

Example:

```
0.1.0 → Initial release
0.2.0 → Add createSession() API
0.2.1 → Fix timeout bug
1.0.0 → Stable release
```

---

## 📚 References

- [HTTP/2 Specification](https://httpwg.org/specs/rfc7540.html)
- [Node.js HTTP/2 API](https://nodejs.org/api/http2.html)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

---

## 🤝 Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

---

**Documentation last updated**: 2025-11-01
