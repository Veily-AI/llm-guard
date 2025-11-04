# Usage Examples

Complete examples showing how to use `@veily/llm-guard` to protect LLM prompts.

## Prerequisites

```bash
npm install @veily/llm-guard
```

**Requirements:**

- Node.js >= 16.0.0
- A Veily API key

**Note:** The SDK is pre-configured with the production core URL. Just provide your API key and start protecting PII.

## Example 1: One-Liner with wrap()

The simplest way to protect prompts:

```typescript
import { wrap } from "@veily/llm-guard";

const config = {
  apiKey: "your-api-key-here",
};

async function myLLM(prompt: string): Promise<string> {
  // Your LLM call here (OpenAI, Anthropic, etc.)
  return `Response to: ${prompt}`;
}

const result = await wrap(
  "My email is juan.perez@example.com and my phone is +56912345678",
  myLLM,
  config
);

console.log(result); // PII automatically restored
```

## Example 2: Manual Control

For fine-grained control over anonymization and restoration:

```typescript
import { anonymize } from "@veily/llm-guard";

const config = {
  apiKey: "your-api-key-here",
};

// Step 1: Anonymize
const { safePrompt, restore, stats } = await anonymize(
  "Name: María González, ID: 12.345.678-9",
  config
);

console.log("Safe prompt:", safePrompt);
console.log("Stats:", stats);

// Step 2: Call your LLM
const llmOutput = await myLLM(safePrompt);

// Step 3: Restore original data
const finalOutput = await restore(llmOutput);
console.log("Final output:", finalOutput);
```

## Example 3: Session API

For multiple calls with the same configuration:

```typescript
import { createSession } from "@veily/llm-guard";

const session = createSession({
  apiKey: "your-api-key-here",
  timeoutMs: 2500,
});

// Process multiple prompts
const prompts = [
  "User: admin@veily.com",
  "Client: Carlos Rodríguez, Tel: +56987654321",
  "Text without PII",
];

for (const prompt of prompts) {
  const result = await session.protect(prompt, myLLM);
  console.log("Result:", result);
}
```

## Example 4: Error Handling

Proper error handling:

```typescript
import { wrap } from "@veily/llm-guard";

try {
  const result = await wrap("My prompt", myLLM, { apiKey: "your-key" });
  console.log(result);
} catch (error) {
  if (error instanceof Error) {
    if (error.message.includes("VEILY_CORE_URL")) {
      console.error("Environment variable not set");
    } else if (error.message.includes("apiKey")) {
      console.error("Invalid API key");
    } else {
      console.error("Unexpected error:", error.message);
    }
  }
}
```

## Example 5: TTL Support

Control how long mappings are stored:

```typescript
import { anonymize } from "@veily/llm-guard";
import type { AnonymizeOptions } from "@veily/llm-guard";

const config = {
  apiKey: "your-api-key-here",
};

// Default TTL: 3600 seconds (1 hour)
const result1 = await anonymize("My email is maria@company.com", config);

// Custom TTL: 7200 seconds (2 hours)
const options: AnonymizeOptions = { ttl: 7200 };
const result2 = await anonymize("My email is maria@company.com", config, options);

// With wrap()
const final = await wrap(
  "My email is test@example.com",
  myLLM,
  config,
  { ttl: 3600 } // 1 hour
);
```

## Example 6: With OpenAI

Real-world example with OpenAI:

```typescript
import { wrap } from "@veily/llm-guard";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const config = {
  apiKey: "your-veily-api-key",
};

const result = await wrap(
  "My email is contact@company.com, can you help me?",
  async (safePrompt) => {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: safePrompt }],
    });
    return completion.choices[0].message.content || "";
  },
  config
);

console.log("Response:", result);
// OpenAI never saw the real email address!
```

## Example 7: Custom Paths

Use custom endpoint paths:

```typescript
import { wrap } from "@veily/llm-guard";

const config = {
  apiKey: "your-api-key-here",
  anonymizePath: "/custom/anonymize",
  restorePath: "/custom/restore",
};

const result = await wrap("Sensitive data", myLLM, config);
```

## Example 8: Custom Timeout

Configure request timeout:

```typescript
import { createSession } from "@veily/llm-guard";

const session = createSession({
  apiKey: "your-api-key-here",
  timeoutMs: 5000, // 5 seconds
});

const result = await session.protect("Test prompt", myLLM);
```

## Complete Working Example

Here's a complete, runnable example:

```typescript
import { wrap } from "@veily/llm-guard";

// Mock LLM (replace with your actual LLM)
async function mockLLM(prompt: string): Promise<string> {
  return `Processed: ${prompt}`;
}

async function main() {
  const config = {
    apiKey: "your-api-key-here", // Replace with your actual API key
  };

  try {
    const result = await wrap(
      "My email is juan.perez@example.com and my name is Juan Pérez",
      mockLLM,
      config
    );

    console.log("Success:", result);
    // Output: "Processed: My email is juan.perez@example.com and my name is Juan Pérez"
    // (Original data restored)
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
```

## Notes

- **No Setup Required**: The SDK is pre-configured with the production core URL
- **API Key**: Obtained from Veily dashboard
- **Security**: The core URL is hardcoded in the SDK, never exposed
- **TTL**: Mappings expire after TTL (default 1 hour, max 24 hours)
