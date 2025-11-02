# @veily/llm-guard

🛡️ **Protect LLM prompts by anonymizing PII before sending to OpenAI, Anthropic, or any LLM provider.**

[![npm version](https://img.shields.io/npm/v/@veily/llm-guard.svg)](https://www.npmjs.com/package/@veily/llm-guard)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)

---

## 🎯 What Problem Does This Solve?

**Problem:** When you send prompts to LLMs (OpenAI, Anthropic, etc.), you risk exposing user PII in their logs.

**Solution:** This SDK anonymizes PII before sending to the LLM, then restores it in the response. The LLM never sees real data.

```typescript
// Before: ❌ Unsafe
await openai.create({ content: "Email: juan@company.com" });

// After: ✅ Safe
await wrap("Email: juan@company.com", (safe) => openai.create({ content: safe }), { apiKey });
// LLM sees: "Email: [EMAIL_123]" - Real email never exposed
```

---

## ✨ Features

- 🚀 **HTTPS with keep-alive** - Persistent connections for low latency
- 🔒 **Zero-trust PII protection** - LLMs never see real data
- 📦 **Simple one-liner API** - Just wrap your LLM call
- ⚡ **TypeScript-first** - Complete type definitions
- 🎯 **Zero runtime dependencies** - Pure Node.js
- 📊 **Usage metrics** - Track anonymization and billing
- ⏱️ **TTL support** - Control mapping storage (1h-24h)
- ☁️ **Cloud-ready** - Compatible with AWS, GCP, Azure

---

## 📦 Installation

```bash
npm install @veily/llm-guard
```

**Requirements:**

- Node.js >= 16.0.0
- A Veily API key (contact Veily to obtain one)

---

## ⚙️ Configuration

### You Only Need an API Key

```typescript
import { wrap } from "@veily/llm-guard";

const config = {
  apiKey: "your-veily-api-key", // Required - Get this from Veily
};

// That's it! The SDK is pre-configured and ready to use
```

### Configuration Options (All Optional)

```typescript
type GuardConfig = {
  // Required
  apiKey: string;

  // Optional
  timeoutMs?: number; // Request timeout (default: 2000ms)
  headers?: Record; // Additional HTTP headers
  anonymizePath?: string; // Custom path (default: /v1/anonymize)
  restorePath?: string; // Custom path (default: /v1/restore)
  metricsPath?: string; // Custom path (default: /v1/metrics)
};
```

**Example with custom timeout:**

```typescript
const config = {
  apiKey: "your-veily-api-key",
  timeoutMs: 5000, // 5 seconds instead of default 2s
};
```

### TTL Options

```typescript
type AnonymizeOptions = {
  ttl?: number; // Seconds to keep mapping (default: 3600, max: 86400)
};

// Short TTL for real-time chat
{
  ttl: 3600;
} // 1 hour

// Long TTL for async workflows
{
  ttl: 86400;
} // 24 hours
```

---

## 🚀 Quick Start

### Basic Usage (One-Liner)

```typescript
import { wrap } from "@veily/llm-guard";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const result = await wrap(
  "My customer María González (maria@company.com) needs help",
  async (safePrompt) => {
    // safePrompt has PII anonymized
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: safePrompt }],
    });
    return completion.choices[0].message.content || "";
  },
  { apiKey: "your-veily-api-key" }
);

console.log(result);
// María's real data is restored in the response
// OpenAI never saw it!
```

**That's it!** Three lines of code to add complete PII protection.

---

## 📖 API Variants

### 1. `wrap()` - One-Liner (Recommended)

Handles everything automatically:

```typescript
import { wrap } from "@veily/llm-guard";

const result = await wrap("Prompt with PII", async (safePrompt) => yourLLM(safePrompt), {
  apiKey: "your-key",
});
```

**With TTL:**

```typescript
const result = await wrap(
  "Prompt with PII",
  async (safe) => yourLLM(safe),
  { apiKey: "your-key" },
  { ttl: 7200 } // 2 hours
);
```

### 2. `anonymize()` - Manual Control

For fine-grained control:

```typescript
import { anonymize } from "@veily/llm-guard";

// Step 1: Anonymize
const { safePrompt, restore, stats } = await anonymize(
  "Contact: juan@example.com, Phone: +1234567890",
  { apiKey: "your-key" }
);

console.log(safePrompt);
// "Contact: [EMAIL_abc], Phone: [PHONE_xyz]"

console.log(stats);
// { replaced: 2, types: ['email', 'phone'] }

// Step 2: Send to LLM
const llmResponse = await yourLLM(safePrompt);

// Step 3: Restore
const final = await restore(llmResponse);
// Original data restored
```

### 3. `createSession()` - Multiple Calls

Reuse configuration:

```typescript
import { createSession } from "@veily/llm-guard";

const session = createSession({
  apiKey: "your-key",
  timeoutMs: 3000,
});

// Process multiple prompts
const r1 = await session.protect(prompt1, yourLLM);
const r2 = await session.protect(prompt2, yourLLM, { ttl: 7200 });

// Get metrics
const metrics = await session.getMetrics();
```

### 4. `getMetrics()` - Usage Tracking

```typescript
import { getMetrics } from "@veily/llm-guard";

const metrics = await getMetrics({ apiKey: "your-key" });

console.log(metrics);
// {
//   totalCycles: 1523,
//   successfulDeliveries: 1498,
//   totalPiiReplaced: 4521,
//   piiTypes: ['email', 'name', 'phone']
// }
```

---

## 🔌 Integration Examples

### With OpenAI

```typescript
import OpenAI from "openai";
import { wrap } from "@veily/llm-guard";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const result = await wrap(
  userPrompt,
  async (safe) => {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: safe }],
    });
    return completion.choices[0].message.content || "";
  },
  { apiKey: process.env.VEILY_API_KEY }
);
```

### With Anthropic

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { wrap } from "@veily/llm-guard";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const result = await wrap(
  userPrompt,
  async (safe) => {
    const message = await anthropic.messages.create({
      model: "claude-3-opus-20240229",
      messages: [{ role: "user", content: safe }],
    });
    return message.content[0].text;
  },
  { apiKey: process.env.VEILY_API_KEY }
);
```

### With Any LLM

```typescript
import { wrap } from "@veily/llm-guard";

// Works with any LLM that accepts a string prompt
const result = await wrap(
  userPrompt,
  async (safe) => {
    // Your custom LLM call here
    return await myLLM.generate(safe);
  },
  { apiKey: process.env.VEILY_API_KEY }
);
```

---

## 🔐 Security Best Practices

### Store API Keys Securely

```typescript
// ✅ GOOD: Environment variables
const config = {
  apiKey: process.env.VEILY_API_KEY,
};

// ❌ BAD: Hardcoded
const config = {
  apiKey: "veily_sk_1234567890", // Never commit this!
};
```

### Error Handling

```typescript
try {
  const result = await wrap(prompt, llmCaller, config);
} catch (error) {
  if (error.message.includes("timeout")) {
    console.error("Request timed out");
  } else if (error.message.includes("401")) {
    console.error("Invalid API key");
  } else {
    console.error("Error:", error.message);
  }
}
```

### What This SDK Protects Against

- ✅ **No PII in LLM provider logs** - They never see real data
- ✅ **No PII in SDK logs** - Sensitive data never logged
- ✅ **Secure transport** - HTTPS with TLS 1.3
- ✅ **Input validation** - All data validated before sending
- ✅ **Safe errors** - Error messages don't leak PII

---

## 🚀 Performance

The SDK uses HTTP/2 with connection pooling:

| Request Type        | Latency                      |
| ------------------- | ---------------------------- |
| First request       | ~100ms (includes handshake)  |
| Subsequent requests | ~30-50ms (reuses connection) |

**Result:** 3-5x faster than creating new connections each time.

---

## 📊 Monitoring Statistics

Track what PII is being detected:

```typescript
const { safePrompt, restore, stats } = await anonymize(
  "Email: juan@example.com, Phone: +56912345678",
  { apiKey: "your-key" }
);

console.log(stats);
// {
//   replaced: 2,
//   types: ['email', 'phone']
// }
```

**Use for:**

- Compliance reporting
- Quality assurance
- Anomaly detection

---

## ❓ FAQ

**Does this package call the LLM?**  
No. It only anonymizes/de-anonymizes. You call your LLM with the safe prompt.

**Does it work with any LLM?**  
Yes. OpenAI, Anthropic, Google, local models, etc. It's LLM-agnostic.

**What PII types are detected?**  
Emails, phones, names, addresses, IDs, credit cards, and more. Detection is LLM-based for accuracy.

**How much does it cost?**  
Contact Veily for pricing. Billing is based on successful anonymization cycles.

**Where is my data stored?**  
Mappings are stored temporarily (default: 1h, max: 24h) then permanently deleted.

**Do I need to configure anything?**  
No. Just provide your API key. The core URL is pre-configured.

**Can I use this in production?**  
Yes. Fully tested (21 tests), type-safe, zero dependencies, OWASP compliant.

---

## 🎓 How It Works

1. SDK sends prompt to Veily's core service
2. Core detects PII using LLM
3. PII replaced with fake data + mapping stored
4. You receive safe prompt
5. You send safe prompt to your LLM (OpenAI, etc.)
6. SDK automatically restores original data in response

**Key benefit:** LLM providers never see or store real PII.

---

## 🔧 Advanced Configuration

### Custom Timeout

```typescript
const config = {
  apiKey: "your-key",
  timeoutMs: 5000, // 5 seconds (default: 2s)
};
```

### Custom Headers

```typescript
const config = {
  apiKey: "your-key",
  headers: {
    "X-Request-ID": "unique-id",
  },
};
```

### Custom TTL

```typescript
const result = await anonymize(
  prompt,
  { apiKey: "your-key" },
  { ttl: 7200 } // 2 hours
);
```

---

## 💡 Common Use Cases

### Customer Support Chatbot

```typescript
const response = await wrap(
  customerMessage, // May contain customer PII
  async (safe) => openai.chat(safe),
  { apiKey: veilyKey }
);
// Customer PII protected from OpenAI
```

### Document Analysis

```typescript
const { safePrompt, restore } = await anonymize(
  documentText,
  { apiKey: veilyKey },
  { ttl: 86400 } // 24h for long analysis
);

const analysis = await llm.analyze(safePrompt);
const final = await restore(analysis);
```

### Compliance (GDPR/HIPAA)

```typescript
const session = createSession({ apiKey: veilyKey });

for (const query of userQueries) {
  const response = await session.protect(query, llmCaller);
}

// Audit log
const metrics = await session.getMetrics();
console.log(`Protected ${metrics.totalPiiReplaced} PII items`);
```

---

## 🆘 Troubleshooting

### "cfg.apiKey is required"

```typescript
// ❌ Wrong
await wrap(prompt, caller, {});

// ✅ Correct
await wrap(prompt, caller, { apiKey: "your-key" });
```

### "HTTP error 401: Unauthorized"

Your API key is invalid. Verify with Veily.

### "HTTP/2 request timeout"

Increase timeout:

```typescript
{ apiKey: "key", timeoutMs: 5000 }
```

---

## 📚 Full API Reference

### `wrap(prompt, caller, config, options?)`

**Parameters:**

- `prompt: string` - Original prompt with PII
- `caller: (safePrompt: string) => Promise<string>` - Your LLM function
- `config: GuardConfig` - Configuration with API key
- `options?: AnonymizeOptions` - Optional TTL

**Returns:** `Promise<string>` - Final output with restored data

### `anonymize(prompt, config, options?)`

**Parameters:**

- `prompt: string` - Original prompt
- `config: GuardConfig` - Configuration
- `options?: AnonymizeOptions` - Optional TTL

**Returns:** `Promise<AnonymizeResult>`

```typescript
{
  safePrompt: string;
  restore: (output: string) => Promise<string>;
  stats?: { replaced: number; types: string[] };
}
```

### `getMetrics(config)`

**Parameters:**

- `config: GuardConfig` - Configuration with API key

**Returns:** `Promise<MetricsResponse>` - Usage statistics

### `createSession(config)`

**Parameters:**

- `config: GuardConfig` - Configuration

**Returns:** Session with methods:

- `protect(prompt, caller, options?)` - Same as `wrap()`
- `anonymize(prompt, options?)` - Same as `anonymize()`
- `getMetrics()` - Same as `getMetrics()`

---

## 🔗 Documentation

- [📖 Technical Overview](./docs/OVERVIEW.md) - Architecture and internals
- [💡 Usage Examples](./docs/EXAMPLES.md) - 10+ code examples
- [🤝 Contributing Guide](./CONTRIBUTING.md) - Development guidelines

---

## 🐛 Support

- **NPM Package**: https://www.npmjs.com/package/@veily/llm-guard
- **GitHub**: https://github.com/Veily-AI/llm-guard
- **Issues**: https://github.com/Veily-AI/llm-guard/issues
- **Email**: support@veily.com

---

## 📄 License

MIT © [Veily](https://veily.com)

---

**Made with ❤️ by the Veily team**
