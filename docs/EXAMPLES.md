# Usage Examples

Complete examples showing how to use `@veily/llm-guard` to protect LLM prompts.

## Prerequisites

```bash
npm install @veily/llm-guard
```

**Requirements:**

- Node.js >= 16.0.0
- A Veily API key
- (Optional) RSA private key in PEM format for transit encryption

**Note:** The SDK is pre-configured with the production core URL. Just provide your API key and start protecting PII. Encryption is completely optional - if you don't provide `privateKey`, prompts are still sent over HTTPS (just not encrypted).

## Example 1: One-Liner with wrap()

The simplest way to protect prompts:

```typescript
import { wrap } from '@veily/llm-guard';

const config = {
  apiKey: 'your-api-key-here',
};

async function myLLM(prompt: string): Promise<string> {
  // Your LLM call here (OpenAI, Anthropic, etc.)
  return `Response to: ${prompt}`;
}

const result = await wrap(
  'My email is juan.perez@example.com and my phone is +56912345678',
  myLLM,
  config
);

console.log(result); // PII automatically restored
```

## Example 2: Manual Control

For fine-grained control over anonymization and restoration:

```typescript
import { anonymize } from '@veily/llm-guard';

const config = {
  apiKey: 'your-api-key-here',
};

// Step 1: Anonymize
const { safePrompt, restore, stats } = await anonymize(
  'Name: María González, ID: 12.345.678-9',
  config
);

console.log('Safe prompt:', safePrompt);
console.log('Stats:', stats);

// Step 2: Call your LLM
const llmOutput = await myLLM(safePrompt);

// Step 3: Restore original data
const finalOutput = await restore(llmOutput);
console.log('Final output:', finalOutput);
```

## Example 3: Session API

For multiple calls with the same configuration:

```typescript
import { createSession } from '@veily/llm-guard';

const session = createSession({
  apiKey: 'your-api-key-here',
});

// Process multiple prompts
const prompts = [
  'User: admin@veily.com',
  'Client: Carlos Rodríguez, Tel: +56987654321',
  'Text without PII',
];

for (const prompt of prompts) {
  const result = await session.protect(prompt, myLLM);
  console.log('Result:', result);
}
```

## Example 4: Error Handling

Proper error handling:

```typescript
import { wrap } from '@veily/llm-guard';

try {
  const result = await wrap('My prompt', myLLM, { apiKey: 'your-key' });
  console.log(result);
} catch (error) {
  if (error instanceof Error) {
    if (error.message.includes('VEILY_CORE_URL')) {
      console.error('Environment variable not set');
    } else if (error.message.includes('apiKey')) {
      console.error('Invalid API key');
    } else {
      console.error('Unexpected error:', error.message);
    }
  }
}
```

## Example 5: TTL Support

Control how long mappings are stored:

```typescript
import { anonymize } from '@veily/llm-guard';
import type { AnonymizeOptions } from '@veily/llm-guard';

const config = {
  apiKey: 'your-api-key-here',
};

// Default TTL: 3600 seconds (1 hour)
const result1 = await anonymize('My email is maria@company.com', config);

// Custom TTL: 7200 seconds (2 hours)
const options: AnonymizeOptions = { ttl: 7200 };
const result2 = await anonymize('My email is maria@company.com', config, options);

// With wrap()
const final = await wrap(
  'My email is test@example.com',
  myLLM,
  config,
  { ttl: 3600 } // 1 hour
);
```

## Example 6: With OpenAI

Real-world example with OpenAI:

```typescript
import { wrap } from '@veily/llm-guard';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const config = {
  apiKey: 'your-veily-api-key',
};

const result = await wrap(
  'My email is contact@company.com, can you help me?',
  async (safePrompt) => {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: safePrompt }],
    });
    return completion.choices[0].message.content || '';
  },
  config
);

console.log('Response:', result);
// OpenAI never saw the real email address!
```

## Example 7: Custom Paths

Use custom endpoint paths:

```typescript
import { wrap } from '@veily/llm-guard';

const config = {
  apiKey: 'your-api-key-here',
  anonymizePath: '/custom/anonymize',
  restorePath: '/custom/restore',
};

const result = await wrap('Sensitive data', myLLM, config);
```

## Complete Working Example

Here's a complete, runnable example:

```typescript
import { wrap } from '@veily/llm-guard';

// Mock LLM (replace with your actual LLM)
async function mockLLM(prompt: string): Promise<string> {
  return `Processed: ${prompt}`;
}

async function main() {
  const config = {
    apiKey: 'your-api-key-here', // Replace with your actual API key
  };

  try {
    const result = await wrap(
      'My email is juan.perez@example.com and my name is Juan Pérez',
      mockLLM,
      config
    );

    console.log('Success:', result);
    // Output: "Processed: My email is juan.perez@example.com and my name is Juan Pérez"
    // (Original data restored)
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
```

## Example 8: With Optional Encryption (Simplified)

For enhanced security, enable transit encryption. Simply provide your private key - the SDK will automatically fetch your public key and key ID from the API:

```typescript
import { wrap } from '@veily/llm-guard';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Simplest configuration - just provide privateKey
// SDK automatically:
// 1. Fetches publicKey and keyId from /v1/transit-crypto/inbound-public-key
// 2. Encrypts prompts before sending
// 3. Decrypts responses after receiving
const config = {
  apiKey: process.env.VEILY_API_KEY,
  privateKey: process.env.VEILY_PRIVATE_KEY, // RSA private key in PEM format
};

// Same API - encryption and decryption happen automatically
const result = await wrap(
  'My email is contact@company.com, can you help me?',
  async (safePrompt) => {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: safePrompt }],
    });
    return completion.choices[0].message.content || '';
  },
  config
);

console.log('Response:', result);
// Data is encrypted in transit (RSA-OAEP) + anonymized before reaching LLM
// Maximum security with minimal configuration
```

**Important:**

- Encryption is completely optional. If you don't provide `privateKey`, prompts are still sent over HTTPS (just not encrypted).
- Public keys are automatically fetched and cached per API key (one request per API key).
- Uses RSA-OAEP with SHA-256 (industry standard, same as Veily Core backend).

## Example 9: Encryption with Manual Control

For manual control, you can use the `anonymize()` function:

```typescript
import { anonymize } from '@veily/llm-guard';

const config = {
  apiKey: 'your-api-key-here',
  privateKey: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----',
};

// Step 1: Anonymize (prompt is automatically encrypted when privateKey is provided)
// SDK automatically:
// - Validates private key format (PEM)
// - Fetches publicKey and keyId from API (cached)
// - Encrypts prompt with RSA-OAEP
// - Sends encrypted prompt to Veily Core
const { safePrompt, restore, stats } = await anonymize(
  'Name: María González, Email: maria@company.com',
  config
);

console.log('Safe prompt:', safePrompt);
// Prompt was encrypted (RSA-OAEP) before sending to Veily
// Veily decrypts internally, processes, and can encrypt response if requested

// Step 2: Call your LLM
const llmOutput = await myLLM(safePrompt);

// Step 3: Restore original data (response automatically decrypted if encrypted)
const finalOutput = await restore(llmOutput);
console.log('Final output:', finalOutput);
// If response was encrypted, SDK automatically decrypts before returning
```

## Example 10: Using Crypto Functions Directly (Advanced)

For advanced use cases, you can use the crypto functions directly:

```typescript
import {
  encryptWithPublicKey,
  decryptWithPrivateKey,
  validatePublicKey,
  validatePrivateKey,
  createEncryptableField,
} from '@veily/llm-guard';

// Validate keys
const isValid = validatePublicKey(publicKeyPem);
const isValidPrivate = validatePrivateKey(privateKeyPem);

// Encrypt plain text
const encrypted = encryptWithPublicKey('My secret message', publicKeyPem);
// Returns: Base64-encoded cipher text

// Decrypt cipher text
const decrypted = decryptWithPrivateKey(encrypted, privateKeyPem);
// Returns: Original plain text

// Create EncryptableField for API requests
const field = createEncryptableField(encrypted, 'tenant-123-inbound-456');
// Returns: { value: encrypted, encrypted: true, keyId: "tenant-123-inbound-456" }
```

**Note:** Most users don't need to use these functions directly - the SDK handles encryption/decryption automatically when `privateKey` is provided in config.

## Notes

- **No Setup Required**: The SDK is pre-configured with the production core URL (`https://api.veily.dev`)
- **API Key**: Obtained from Veily dashboard
- **Security**: The core URL is hardcoded in the SDK, never exposed
- **TTL**: Mappings expire after TTL (default 1 hour, max 24 hours)
- **Encryption**: Optional - adds RSA-OAEP encryption layer beyond HTTPS
  - Uses RSA-OAEP with SHA-256 (same as Veily Core backend)
  - Public keys are automatically fetched and cached per API key
  - Zero runtime dependencies (uses Node.js `crypto` module)
- **Backward Compatible**: Encryption is opt-in, existing code works unchanged
- **Key Management**: Private key stored securely (env vars, secrets manager). Public key fetched automatically.
