# @veily/llm-guard

🛡️ **Protect LLM prompts without exposing PII** using your core service via **HTTP/2**.

This package **DOES NOT call the LLM**: it only **anonymizes** (`anonymize`) and **de-anonymizes** (`restore`) prompts.

[![npm version](https://img.shields.io/npm/v/@veily/llm-guard.svg)](https://www.npmjs.com/package/@veily/llm-guard)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## ✨ Features

- 🚀 **HTTP/2** with keep-alive for **low latency**
- 🔒 **No LLM calls** - only anonymize/restore
- 📦 **Simple API** - one-liner or manual control
- ⚡ **TypeScript** first with complete types
- 🔐 **OWASP** compliant - doesn't log PII, strict validations
- 🎯 **Zero dependencies** in production

---

## 📦 Installation

```bash
npm install @veily/llm-guard
```

---

## 🚀 Usage

### One-Liner (Recommended)

The simplest way to protect your prompts:

```typescript
import { wrap } from "@veily/llm-guard";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const final = await wrap(
  "My email is juan.perez@example.com and my name is Juan Pérez",
  async (safePrompt) => {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: safePrompt }],
    });
    return completion.choices[0].message.content || "";
  },
  {
    baseURL: "https://core.veily.internal",
    apiKey: process.env.VEILY_API_KEY,
  }
);

console.log(final); // Contains original data restored
```

### Two-Step API

For more control over the process:

```typescript
import { anonymize } from "@veily/llm-guard";

// 1. Anonymize - anonymize the prompt
const { safePrompt, restore, stats } = await anonymize("My email is juan.perez@example.com", {
  baseURL: "https://core.veily.internal",
});

console.log(safePrompt); // Anonymized email
console.log(stats); // { replaced: 1, types: ['email'] }

// 2. Call your LLM with the safePrompt
const llmOutput = await myLLM(safePrompt);

// 3. Restore - de-anonymize the output
const finalOutput = await restore(llmOutput);
console.log(finalOutput); // Original data restored
```

### Session API

For multiple calls with the same configuration:

```typescript
import { createSession } from "@veily/llm-guard";

const session = createSession({
  baseURL: "https://core.veily.internal",
  apiKey: process.env.VEILY_API_KEY,
  timeoutMs: 2500,
});

// Option 1: protect (one-liner)
const result1 = await session.protect(prompt1, caller);

// Option 2: manual anonymize
const { safePrompt, restore } = await session.anonymize(prompt2);
const llmOutput = await myLLM(safePrompt);
const result2 = await restore(llmOutput);
```

---

## ⚙️ Configuration

```typescript
type GuardConfig = {
  /** Base URL of the core service (required) */
  baseURL: string;

  /** API key for Bearer authentication (optional) */
  apiKey?: string;

  /** Timeout in milliseconds (default: 2000ms) */
  timeoutMs?: number;

  /** Additional HTTP headers (optional) */
  headers?: Record<string, string>;

  /** Custom path for anonymize (default: /v1/anonymize) */
  anonymizePath?: string;

  /** Custom path for restore (default: /v1/restore) */
  restorePath?: string;
};
```

### Example with all options:

```typescript
const config: GuardConfig = {
  baseURL: "https://core.veily.internal",
  apiKey: "your-api-key",
  timeoutMs: 3000,
  headers: {
    "X-Custom-Header": "value",
  },
  anonymizePath: "/api/v2/anonymize",
  restorePath: "/api/v2/deanonymize",
};
```

---

## 🔥 Latency Optimization

To achieve **low latency**, follow these recommendations:

### 1. **Infrastructure**

- Deploy the core **in the same VPC/cluster** as your application
- Use a **private endpoint** (internal NLB/ALB) to reduce hops
- Enable **warm pools** in the core to avoid cold starts

### 2. **Configuration**

```typescript
const config = {
  baseURL: "http://core-internal.veily.svc.cluster.local", // Internal DNS
  timeoutMs: 1500, // Adjust according to your SLA
};
```

### 3. **HTTP/2 Keep-Alive**

This package uses **persistent HTTP/2 connections** that are automatically reused:

- **First call**: ~50-100ms (includes handshake)
- **Subsequent calls**: ~10-30ms (reuses connection)

### 4. **Monitoring**

```typescript
const { safePrompt, restore, stats } = await anonymize(prompt, config);
console.log(`Replacements: ${stats?.replaced}, Types: ${stats?.types}`);
```

---

## 🔐 Security (OWASP)

This package follows OWASP best practices:

### ✅ Implemented

- **Doesn't log PII**: Internal logs never expose sensitive data
- **Strict validation**: All inputs are validated (type, structure)
- **Safe errors**: Error messages don't leak sensitive information
- **TLS/HTTPS**: Always use HTTPS in production (`https://...`)
- **Timeouts**: Prevents denial-of-service attacks

### 🔒 Recommendations

1. **Use TLS 1.3+** on your core endpoint
2. **Rotate API keys** periodically
3. **Rate limit** at the core (not at the client)
4. **Monitor** unauthorized access attempts
5. **Audit** core logs (not client logs)

```typescript
// ✅ Good: HTTPS + rotated API key
const config = {
  baseURL: "https://core.veily.internal",
  apiKey: process.env.VEILY_API_KEY, // From env vars
};

// ❌ Bad: HTTP + hardcoded key
const config = {
  baseURL: "http://core.veily.internal", // ⚠️ No TLS
  apiKey: "hardcoded-key-123", // ⚠️ Exposed in code
};
```

---

## 📊 Stats and Monitoring

The result of `anonymize()` includes optional statistics:

```typescript
const { safePrompt, restore, stats } = await anonymize(
  "Email: juan@example.com, Tel: +56912345678",
  config
);

console.log(stats);
// {
//   replaced: 2,
//   types: ['email', 'phone']
// }
```

Use them for:

- **Metrics**: Amount of PII detected by type
- **Alerts**: Abnormal PII spikes may indicate leaks
- **Debug**: Verify that anonymization works

---

## 🧪 Testing

```bash
# Run tests
npm test

# With coverage
npm test -- --coverage

# Watch mode
npm run test:watch
```

---

## 🏗️ Build

```bash
# Compile TypeScript
npm run build

# Result in dist/
ls dist/
# index.js  index.d.ts  guard.js  guard.d.ts  http.js  http.d.ts  types.d.ts
```

---

## 📝 Requirements

- **Node.js**: >= 18.0.0 (for native HTTP/2)
- **TypeScript**: >= 5.0 (if using TypeScript)

---

## 🤝 Contributing

This is a **public** package maintained by Veily. To contribute:

1. Fork the repository
2. Create a branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

MIT © [Veily](https://veily.com)

---

## 🔗 Links

- [Complete Documentation](./docs/overview.md)
- [NPM Package](https://www.npmjs.com/package/@veily/llm-guard)
- [GitHub](https://github.com/veily/llm-guard)
- [Issues](https://github.com/veily/llm-guard/issues)

---

## ❓ FAQ

### Does this package call the LLM?

**No**. It only anonymizes and de-anonymizes. You call your LLM with the `safePrompt`.

### Does it work with any LLM?

**Yes**. OpenAI, Anthropic, Cohere, local models, etc. It's LLM-agnostic.

### What types of PII does it detect?

It depends on your **core service**. This client only makes the HTTP/2 calls. The detection logic is in the backend.

### Can I use HTTP/1.1?

No. This package requires HTTP/2 for low latency. Make sure your core supports HTTP/2.

### How do I handle errors?

```typescript
try {
  const final = await wrap(prompt, caller, config);
} catch (error) {
  if (error.message.includes("timeout")) {
    // Handle timeout
  } else if (error.message.includes("HTTP 401")) {
    // Handle auth error
  } else {
    // Handle other errors
  }
}
```

---

**Made with ❤️ by the Veily team**
