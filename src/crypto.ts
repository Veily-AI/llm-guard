/**
 * Transit encryption support for @veily/llm-guard
 *
 * Provides RSA-OAEP encryption using Node.js crypto module (zero dependencies).
 * This module enables optional encryption of prompts before sending to Veily Core,
 * ensuring data is encrypted in transit even over HTTPS.
 *
 * Features:
 * - RSA-OAEP encryption with SHA-256 (same as backend)
 * - PEM format validation
 * - EncryptableField format support
 * - Zero runtime dependencies (uses Node.js crypto)
 */

import { publicEncrypt, privateDecrypt, constants } from 'node:crypto';

/**
 * Interface for encrypted field structure
 * Matches the EncryptableField interface from Veily Core
 */
export interface EncryptableField {
  /** The encrypted value (base64 encoded) */
  value: string;
  /** True if the value is encrypted */
  encrypted: true;
  /** Key ID used for encryption (required if encrypted: true) */
  keyId: string;
}

/**
 * Validates if a string is a valid PEM-formatted public key
 *
 * @param publicKey - The public key string to validate
 * @returns True if valid PEM format, false otherwise
 */
export function validatePublicKey(publicKey: string): boolean {
  if (!publicKey || typeof publicKey !== 'string') {
    return false;
  }

  // Basic PEM format check for RSA public key
  const publicKeyRegex =
    /^-----BEGIN PUBLIC KEY-----\n([A-Za-z0-9+/=\s]+)\n-----END PUBLIC KEY-----$/;

  return publicKeyRegex.test(publicKey.trim());
}

/**
 * Validates if a string is a valid PEM-formatted private key
 *
 * @param privateKey - The private key string to validate
 * @returns True if valid PEM format, false otherwise
 */
export function validatePrivateKey(privateKey: string): boolean {
  if (!privateKey || typeof privateKey !== 'string') {
    return false;
  }

  // Basic PEM format check for RSA private key
  const privateKeyRegex =
    /^-----BEGIN PRIVATE KEY-----\n([A-Za-z0-9+/=\s]+)\n-----END PRIVATE KEY-----$/;

  return privateKeyRegex.test(privateKey.trim());
}

/**
 * Encrypts plain text using RSA-OAEP with SHA-256
 * Uses the same algorithm as Veily Core for compatibility
 *
 * @param plainText - The plain text to encrypt (UTF-8)
 * @param publicKeyPem - The RSA public key in PEM format
 * @returns Base64-encoded cipher text
 * @throws Error if encryption fails or public key is invalid
 *
 * @example
 * ```ts
 * const encrypted = encryptWithPublicKey(
 *   "My secret prompt",
 *   "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
 * );
 * // Returns: "base64-encoded-cipher-text"
 * ```
 */
export function encryptWithPublicKey(plainText: string, publicKeyPem: string): string {
  if (typeof plainText !== 'string') {
    throw new Error('plainText must be a string');
  }

  if (!publicKeyPem || typeof publicKeyPem !== 'string') {
    throw new Error('publicKey must be a non-empty string');
  }

  // Validate PEM format
  if (!validatePublicKey(publicKeyPem)) {
    throw new Error(
      'Invalid public key format. Expected PEM format with -----BEGIN PUBLIC KEY-----'
    );
  }

  try {
    const buffer = Buffer.from(plainText, 'utf-8');

    // Encrypt using RSA-OAEP with SHA-256 (same as backend)
    const encrypted = publicEncrypt(
      {
        key: publicKeyPem,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      buffer
    );

    // Return base64-encoded cipher text
    return encrypted.toString('base64');
  } catch (error) {
    throw new Error(
      `Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Decrypts cipher text using RSA-OAEP with SHA-256
 * Uses the same algorithm as Veily Core for compatibility
 *
 * @param cipherTextBase64 - The base64-encoded cipher text
 * @param privateKeyPem - The RSA private key in PEM format
 * @returns Decrypted plain text (UTF-8)
 * @throws Error if decryption fails or private key is invalid
 *
 * @example
 * ```ts
 * const decrypted = decryptWithPrivateKey(
 *   "base64-encoded-cipher-text",
 *   "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
 * );
 * // Returns: "My secret prompt"
 * ```
 */
export function decryptWithPrivateKey(cipherTextBase64: string, privateKeyPem: string): string {
  if (typeof cipherTextBase64 !== 'string') {
    throw new Error('cipherTextBase64 must be a string');
  }

  if (!privateKeyPem || typeof privateKeyPem !== 'string') {
    throw new Error('privateKey must be a non-empty string');
  }

  // Validate PEM format
  if (!validatePrivateKey(privateKeyPem)) {
    throw new Error(
      'Invalid private key format. Expected PEM format with -----BEGIN PRIVATE KEY-----'
    );
  }

  try {
    const buffer = Buffer.from(cipherTextBase64, 'base64');

    // Decrypt using RSA-OAEP with SHA-256 (same as backend)
    const decrypted = privateDecrypt(
      {
        key: privateKeyPem,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      buffer
    );

    // Return decrypted plain text (UTF-8)
    return decrypted.toString('utf-8');
  } catch (error) {
    throw new Error(
      `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Creates an EncryptableField object for API requests
 *
 * @param encryptedValue - The base64-encoded encrypted value
 * @param keyId - The key ID used for encryption (required)
 * @returns EncryptableField object ready for API request
 * @throws Error if keyId is empty
 *
 * @example
 * ```ts
 * const field = createEncryptableField("base64value", "tenant-123-inbound-456");
 * // Returns: { value: "base64value", encrypted: true, keyId: "tenant-123-inbound-456" }
 * ```
 */
export function createEncryptableField(encryptedValue: string, keyId: string): EncryptableField {
  if (!keyId || typeof keyId !== 'string' || keyId.trim() === '') {
    throw new Error('keyId is required and must be a non-empty string');
  }

  if (!encryptedValue || typeof encryptedValue !== 'string') {
    throw new Error('encryptedValue must be a non-empty string');
  }

  return {
    value: encryptedValue,
    encrypted: true,
    keyId: keyId.trim(),
  };
}
