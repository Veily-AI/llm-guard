/**
 * Tests for encryption support in guard module
 * TDD: Write tests first, then implement
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type { GuardConfig } from '../src/types.js';
import { testKeyPair } from './setup.js';

// Use the same key pair as the mock for encryption testing
const privateKey = testKeyPair.privateKey;

describe('@veily/llm-guard - Encryption Support', () => {
  beforeAll(() => {
    process.env.VEILY_CORE_URL = 'https://core.veily.internal';
  });

  afterAll(() => {
    delete process.env.VEILY_CORE_URL;
  });

  describe('wrap() with encryption', () => {
    it('should encrypt prompt and decrypt response when privateKey is provided', async () => {
      const { wrap } = await import('../src/guard.js');

      const cfg: GuardConfig = {
        apiKey: 'test-api-key',
        privateKey: privateKey, // SDK automatically fetches publicKey and keyId
      };

      // Mock should receive encrypted field and return encrypted response
      const result = await wrap(
        'My email is juan@example.com',
        (safe) => Promise.resolve(`Response: ${safe}`),
        cfg
      );

      expect(result).toBeDefined();
      expect(result).toContain('Response:');
      // Should decrypt and restore correctly
      expect(result).toContain('juan@example.com');
    });

    it('should work without encryption when privateKey is not provided', async () => {
      const { wrap } = await import('../src/guard.js');

      const cfg: GuardConfig = {
        apiKey: 'test-api-key',
        // No privateKey - should work without encryption
      };

      const result = await wrap(
        'My email is juan@example.com',
        (safe) => Promise.resolve(`Response: ${safe}`),
        cfg
      );

      expect(result).toBeDefined();
      expect(result).toContain('juan@example.com');
    });
  });

  describe('anonymize() with encryption', () => {
    it('should encrypt prompt and decrypt response when privateKey is provided', async () => {
      const { anonymize } = await import('../src/guard.js');

      const cfg: GuardConfig = {
        apiKey: 'test-api-key',
        privateKey: privateKey, // SDK automatically fetches publicKey and keyId
      };

      const result = await anonymize('My email is juan@example.com', cfg);

      expect(result.safePrompt).toBeDefined();
      expect(result.restore).toBeDefined();
      expect(typeof result.restore).toBe('function');

      // Restore should work correctly and decrypt response
      const restored = await result.restore(result.safePrompt);
      expect(restored).toContain('juan@example.com');
    });

    it('should work without encryption when privateKey is not provided', async () => {
      const { anonymize } = await import('../src/guard.js');

      const cfg: GuardConfig = {
        apiKey: 'test-api-key',
        // No privateKey - should work without encryption
      };

      const result = await anonymize('My email is juan@example.com', cfg);

      expect(result.safePrompt).toBeDefined();
      expect(result.restore).toBeDefined();
    });

    it('should validate privateKey format', async () => {
      const { anonymize } = await import('../src/guard.js');

      const cfg: GuardConfig = {
        apiKey: 'test-api-key',
        privateKey: 'invalid-key-format',
      };

      await expect(anonymize('test', cfg)).rejects.toThrow('Invalid private key format');
    });
  });

  describe('createSession() with encryption', () => {
    it('should support encryption with decryption in session', async () => {
      const { createSession } = await import('../src/guard.js');

      const cfg: GuardConfig = {
        apiKey: 'test-api-key',
        privateKey: privateKey, // SDK automatically fetches publicKey and keyId
      };

      const session = await createSession(cfg);
      const result = await session.protect('My email is juan@example.com', (safe) =>
        Promise.resolve(`Response: ${safe}`)
      );

      expect(result).toBeDefined();
      expect(result).toContain('juan@example.com');
    });

    it('should support encryption with decryption in session.anonymize()', async () => {
      const { createSession } = await import('../src/guard.js');

      const cfg: GuardConfig = {
        apiKey: 'test-api-key',
        privateKey: privateKey, // SDK automatically fetches publicKey and keyId
      };

      const session = await createSession(cfg);
      const result = await session.anonymize('My email is juan@example.com');

      expect(result.safePrompt).toBeDefined();
      expect(result.restore).toBeDefined();

      // Restore should decrypt response
      const restored = await result.restore(result.safePrompt);
      expect(restored).toContain('juan@example.com');
    });
  });
});
