/**
 * Tests for crypto module - Transit encryption support
 * TDD: Write tests first, then implement
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { generateKeyPairSync } from 'node:crypto';

// Generate a real RSA-2048 key pair for testing
let testPublicKey: string;
let testPrivateKey: string;

beforeAll(() => {
  const keyPair = generateKeyPairSync('rsa', {
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
  testPublicKey = keyPair.publicKey;
  testPrivateKey = keyPair.privateKey;
});

describe('crypto module - RSA-OAEP encryption', () => {
  describe('encryptWithPublicKey()', () => {
    it('should encrypt plain text with valid RSA public key', async () => {
      const { encryptWithPublicKey } = await import('../src/crypto.js');

      const plainText = 'This is a test message';

      const encrypted = encryptWithPublicKey(plainText, testPublicKey);

      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(encrypted.length).toBeGreaterThan(0);
      // Base64 encoded cipher text should not match plain text
      expect(encrypted).not.toBe(plainText);
      // Should be base64 encoded
      expect(/^[A-Za-z0-9+/=]+$/.test(encrypted)).toBe(true);
    });

    it('should encrypt different messages differently', async () => {
      const { encryptWithPublicKey } = await import('../src/crypto.js');

      const msg1 = 'Message 1';
      const msg2 = 'Message 2';

      const encrypted1 = encryptWithPublicKey(msg1, testPublicKey);
      const encrypted2 = encryptWithPublicKey(msg2, testPublicKey);

      // Different messages should produce different cipher texts
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should throw error for invalid public key format', async () => {
      const { encryptWithPublicKey } = await import('../src/crypto.js');

      const invalidKey = 'not-a-valid-key';

      expect(() => {
        encryptWithPublicKey('test', invalidKey);
      }).toThrow();
    });

    it('should throw error for empty public key', async () => {
      const { encryptWithPublicKey } = await import('../src/crypto.js');

      expect(() => {
        encryptWithPublicKey('test', '');
      }).toThrow();
    });

    it('should handle empty plain text', async () => {
      const { encryptWithPublicKey } = await import('../src/crypto.js');

      const encrypted = encryptWithPublicKey('', testPublicKey);
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
    });
  });

  describe('validatePublicKey()', () => {
    it('should validate correct PEM format public key', async () => {
      const { validatePublicKey } = await import('../src/crypto.js');

      expect(validatePublicKey(testPublicKey)).toBe(true);
    });

    it('should reject invalid PEM format', async () => {
      const { validatePublicKey } = await import('../src/crypto.js');

      expect(validatePublicKey('invalid-key')).toBe(false);
      expect(validatePublicKey('')).toBe(false);
      expect(validatePublicKey('-----BEGIN PUBLIC KEY-----')).toBe(false);
    });

    it('should reject private key format', async () => {
      const { validatePublicKey } = await import('../src/crypto.js');

      const privateKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----`;

      expect(validatePublicKey(privateKey)).toBe(false);
    });
  });

  describe('decryptWithPrivateKey()', () => {
    it('should decrypt cipher text with matching private key', async () => {
      const { encryptWithPublicKey, decryptWithPrivateKey } = await import('../src/crypto.js');

      const plainText = 'This is a secret message';

      // First encrypt with public key
      const encrypted = encryptWithPublicKey(plainText, testPublicKey);

      // Then decrypt with private key
      const decrypted = decryptWithPrivateKey(encrypted, testPrivateKey);

      expect(decrypted).toBe(plainText);
    });

    it('should throw error for invalid private key format', async () => {
      const { decryptWithPrivateKey, encryptWithPublicKey } = await import('../src/crypto.js');

      const encrypted = encryptWithPublicKey('test', testPublicKey);
      const invalidKey = 'not-a-valid-key';

      expect(() => {
        decryptWithPrivateKey(encrypted, invalidKey);
      }).toThrow();
    });

    it('should throw error if trying to decrypt with wrong private key', async () => {
      const { encryptWithPublicKey, decryptWithPrivateKey } = await import('../src/crypto.js');
      const { generateKeyPairSync: nodeGenerateKeyPair } = await import('node:crypto');

      // Generate a different key pair
      const otherKeyPair = nodeGenerateKeyPair('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const plainText = 'test message';
      const encrypted = encryptWithPublicKey(plainText, testPublicKey);

      // Try to decrypt with wrong private key
      expect(() => {
        decryptWithPrivateKey(encrypted, otherKeyPair.privateKey);
      }).toThrow('Decryption failed');
    });
  });

  describe('validatePrivateKey()', () => {
    it('should validate correct PEM format private key', async () => {
      const { validatePrivateKey } = await import('../src/crypto.js');

      expect(validatePrivateKey(testPrivateKey)).toBe(true);
    });

    it('should reject invalid PEM format', async () => {
      const { validatePrivateKey } = await import('../src/crypto.js');

      expect(validatePrivateKey('invalid-key')).toBe(false);
      expect(validatePrivateKey('')).toBe(false);
      expect(validatePrivateKey('-----BEGIN PRIVATE KEY-----')).toBe(false);
    });

    it('should reject public key format', async () => {
      const { validatePrivateKey } = await import('../src/crypto.js');

      expect(validatePrivateKey(testPublicKey)).toBe(false);
    });
  });

  describe('createEncryptableField()', () => {
    it('should create EncryptableField object with encrypted value', async () => {
      const { createEncryptableField } = await import('../src/crypto.js');

      const encryptedValue = 'base64encryptedvalue';
      const keyId = 'tenant-123-inbound-456';

      const field = createEncryptableField(encryptedValue, keyId);

      expect(field).toEqual({
        value: encryptedValue,
        encrypted: true,
        keyId: keyId,
      });
    });

    it('should require keyId when creating EncryptableField', async () => {
      const { createEncryptableField } = await import('../src/crypto.js');

      expect(() => {
        createEncryptableField('value', '');
      }).toThrow('keyId is required');
    });
  });
});
