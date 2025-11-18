/**
 * Tests for automatic configuration of publicKey and keyId
 * TDD: Tests for simplified configuration with only apiKey and privateKey
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type { GuardConfig } from '../src/types.js';
import { testKeyPair } from './setup.js';

// Use the same key pair as the mock for encryption testing
const privateKey = testKeyPair.privateKey;

describe('@veily/llm-guard - Auto Configuration', () => {
  beforeAll(() => {
    process.env.VEILY_CORE_URL = 'https://core.veily.internal';
  });

  afterAll(() => {
    delete process.env.VEILY_CORE_URL;
  });

  describe('wrap() with auto-configured encryption', () => {
    it('should automatically obtain publicKey and keyId when only privateKey is provided', async () => {
      const { wrap } = await import('../src/guard.js');

      const cfg: GuardConfig = {
        apiKey: 'test-api-key',
        privateKey: privateKey, // Only privateKey - should auto-fetch publicKey/keyId
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

    it('should cache publicKey and keyId after first fetch', async () => {
      const { wrap } = await import('../src/guard.js');

      const cfg: GuardConfig = {
        apiKey: 'test-api-key',
        privateKey: privateKey,
      };

      // First call - should fetch publicKey/keyId
      const result1 = await wrap(
        'My email is juan@example.com',
        (safe) => Promise.resolve(`Response: ${safe}`),
        cfg
      );

      expect(result1).toBeDefined();

      // Second call - should use cached values
      const result2 = await wrap(
        'My email is juan@example.com',
        (safe) => Promise.resolve(`Response: ${safe}`),
        cfg
      );

      expect(result2).toBeDefined();
    });

    it('should work without encryption when privateKey is not provided (backward compatible)', async () => {
      const { wrap } = await import('../src/guard.js');

      const cfg: GuardConfig = {
        apiKey: 'test-api-key',
        // No privateKey - should work as before
      };

      const result = await wrap(
        'My email is juan@example.com',
        (safe) => Promise.resolve(`Response: ${safe}`),
        cfg
      );

      expect(result).toBeDefined();
      expect(result).toContain('juan@example.com');
    });

    it('should throw error if privateKey is invalid format', async () => {
      const { wrap } = await import('../src/guard.js');

      const cfg: GuardConfig = {
        apiKey: 'test-api-key',
        privateKey: 'invalid-key-format',
      };

      await expect(
        wrap('My email is juan@example.com', (safe) => Promise.resolve(`Response: ${safe}`), cfg)
      ).rejects.toThrow('Invalid private key format');
    });
  });

  describe('anonymize() with auto-configured encryption', () => {
    it('should automatically obtain publicKey and keyId when only privateKey is provided', async () => {
      const { anonymize } = await import('../src/guard.js');

      const cfg: GuardConfig = {
        apiKey: 'test-api-key',
        privateKey: privateKey, // Only privateKey - should auto-fetch publicKey/keyId
      };

      const result = await anonymize('My email is juan@example.com', cfg);

      expect(result.safePrompt).toBeDefined();
      expect(result.restore).toBeDefined();
      expect(typeof result.restore).toBe('function');

      // Restore should work correctly and decrypt response
      const restored = await result.restore(result.safePrompt);
      expect(restored).toContain('juan@example.com');
    });
  });

  describe('createSession() with auto-configured encryption', () => {
    it('should support auto-configuration in session', async () => {
      const { createSession } = await import('../src/guard.js');

      const cfg: GuardConfig = {
        apiKey: 'test-api-key',
        privateKey: privateKey, // Only privateKey - should auto-fetch publicKey/keyId
      };

      const session = await createSession(cfg);
      const result = await session.protect('My email is juan@example.com', (safe) =>
        Promise.resolve(`Response: ${safe}`)
      );

      expect(result).toBeDefined();
      expect(result).toContain('juan@example.com');
    });
  });
});
