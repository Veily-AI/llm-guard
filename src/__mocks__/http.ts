/**
 * Mock of HTTP module for tests
 * Simulates the behavior of /v1/anonymize and /v1/restore endpoints from the core
 */

import type { AnonymizeRequest, RestoreRequest, RestoreWire, EncryptableField } from '../types.js';
import { generateKeyPairSync } from 'node:crypto';
import { privateDecrypt, publicEncrypt, constants } from 'node:crypto';

// Generate test key pair for decryption in mock
const testKeyPair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
  },
});

/**
 * Decrypts an encrypted value using the test private key
 * In real usage, the backend uses the tenant's private key
 */
function decryptTestValue(encryptedValue: string): string {
  try {
    const buffer = Buffer.from(encryptedValue, 'base64');
    const decrypted = privateDecrypt(
      {
        key: testKeyPair.privateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      buffer
    );
    return decrypted.toString('utf-8');
  } catch (error) {
    // If decryption fails, return as-is (might be plain text in test)
    return encryptedValue;
  }
}

/**
 * Encrypts plain text using the test public key
 * In real usage, the backend uses the tenant's inbound public key
 */
function encryptTestValue(plainText: string): string {
  try {
    const buffer = Buffer.from(plainText, 'utf-8');
    const encrypted = publicEncrypt(
      {
        key: testKeyPair.publicKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      buffer
    );
    return encrypted.toString('base64');
  } catch (error) {
    throw new Error(
      `Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export class FakeTransport {
  private lastMappingId = 'map-123-test';

  postJSON<T>({ path, body }: { path: string; body: unknown }): Promise<T> {
    if (path.endsWith('/v1/anonymize') || path.endsWith('/custom/anonymize')) {
      const requestBody = body as AnonymizeRequest;

      // Handle encrypted prompts (EncryptableField format)
      let prompt: string;
      if (typeof requestBody.prompt === 'object' && requestBody.prompt.encrypted === true) {
        const encryptedField = requestBody.prompt;
        // Decrypt using test private key (simulating backend decryption)
        prompt = decryptTestValue(encryptedField.value);
      } else {
        prompt = requestBody.prompt as string;
      }
      const ttl = requestBody.ttl;
      let safe = prompt;
      let replaced = 0;
      const types: string[] = [];

      // Validate TTL if provided
      if (ttl !== undefined && (ttl <= 0 || ttl > 86400)) {
        return Promise.reject(
          new Error('HTTP error 400: Invalid request: ttl must be between 1 and 86400 seconds')
        );
      }

      // Simulate PII detection and anonymization
      if (safe.includes('juan.perez@example.com')) {
        safe = safe.replace(/juan\.perez@example\.com/gi, 'fake.user@example.com');
        replaced++;
        types.push('email');
      }

      if (safe.includes('Juan Pérez')) {
        safe = safe.replace(/Juan Pérez/g, 'Fake Name');
        replaced++;
        types.push('name');
      }

      if (safe.includes('+56 9 9876 5432')) {
        safe = safe.replace(/\+56 9 9876 5432/g, '+XX X XXXX XXXX');
        replaced++;
        types.push('phone');
      }

      // Generate unique mappingId for this anonymization
      this.lastMappingId = `map_${Math.random().toString(36).slice(2, 10)}`;

      return Promise.resolve({
        safePrompt: safe,
        mappingId: this.lastMappingId,
        stats: replaced > 0 ? { replaced, types } : undefined,
      } as T);
    }

    if (path.endsWith('/v1/restore') || path.endsWith('/custom/restore')) {
      const requestBody = body as RestoreRequest;

      // Handle encrypted output (EncryptableField format)
      let output: string;
      if (typeof requestBody.output === 'object' && requestBody.output.encrypted === true) {
        const encryptedField = requestBody.output;
        // Decrypt using test private key (simulating backend decryption)
        output = decryptTestValue(encryptedField.value);
      } else {
        output = requestBody.output as string;
      }
      let restored = output;

      // Simulate restoration of original data
      restored = restored.replace(/fake\.user@example\.com/gi, 'juan.perez@example.com');
      restored = restored.replace(/Fake Name/g, 'Juan Pérez');
      restored = restored.replace(/\+XX X XXXX XXXX/g, '+56 9 9876 5432');

      // If client requested encrypted response (encryptResponse: true without partnerKeyId),
      // encrypt the restored output using test public key
      if (requestBody.encryptResponse === true && !requestBody.partnerKeyId) {
        const encryptedValue = encryptTestValue(restored);
        const response: RestoreWire = {
          output: {
            value: encryptedValue,
            encrypted: true,
            keyId: 'test-key-id', // Use same keyId as in test config
          } as EncryptableField,
          encrypted: true,
          keyId: 'test-key-id',
          algorithm: 'RSA-OAEP',
          hashAlgorithm: 'SHA-256',
        };
        return Promise.resolve(response as T);
      }

      // Return plain text response (backward compatible)
      return Promise.resolve({ output: restored } as T);
    }

    throw new Error(`Path not supported in FakeTransport: ${path}`);
  }

  getJSON<T>({ path }: { path: string }): Promise<T> {
    if (path.endsWith('/v1/metrics')) {
      return Promise.resolve({
        totalCycles: 42,
        successfulDeliveries: 40,
        completedCycles: 38,
        totalPiiReplaced: 156,
        piiTypes: ['email', 'name', 'phone'],
      } as T);
    }

    // Mock endpoint for getting inbound public key
    if (path.endsWith('/v1/transit-crypto/inbound-public-key')) {
      return Promise.resolve({
        keyId: 'test-key-id',
        algorithm: 'RSA-OAEP',
        hashAlgorithm: 'SHA-256',
        publicKey: testKeyPair.publicKey,
      } as T);
    }

    throw new Error(`Path not supported in FakeTransport: ${path}`);
  }

  close() {
    // No-op in mock
  }
}

export function getTransport(_cfg: unknown) {
  return new FakeTransport();
}

export function __resetTransportPool() {
  // No-op in mock
}
