/**
 * Tests for @veily/llm-guard
 *
 * Following TDD: write tests first, then implement.
 * The HTTP module mock is configured in setup.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import type { GuardConfig } from "../src/types.js";

describe("@veily/llm-guard - TDD Suite", () => {
  // Set up environment variable for tests only (users don't need this)
  beforeAll(() => {
    process.env.VEILY_CORE_URL = "https://core.veily.internal";
  });

  afterAll(() => {
    delete process.env.VEILY_CORE_URL;
  });

  describe("wrap() - One-liner API", () => {
    it("should process prompt without PII correctly", async () => {
      const { wrap } = await import("../src/guard.js");

      const cfg: GuardConfig = { apiKey: "test-api-key" };
      const result = await wrap("hello world", async (p) => p.toUpperCase(), cfg);
      expect(result).toBe("HELLO WORLD");
    });

    it("should anonymize, process and restore PII", async () => {
      const { wrap } = await import("../src/guard.js");

      const cfg: GuardConfig = { apiKey: "test-api-key" };
      const final = await wrap(
        "My email is juan.perez@example.com and my name is Juan Pérez",
        async (safe) => `ECHO: ${safe}`,
        cfg
      );

      expect(final).toContain("ECHO:");
      expect(final).toContain("juan.perez@example.com");
      expect(final).toContain("Juan Pérez");
      expect(final).not.toContain("fake.user@example.com");
      expect(final).not.toContain("Fake Name");
    });

    it("should handle multiple PII types", async () => {
      const { wrap } = await import("../src/guard.js");

      const cfg: GuardConfig = { apiKey: "test-api-key" };
      const final = await wrap(
        "Contact: juan.perez@example.com, +56 9 9876 5432, Juan Pérez",
        async (safe) => `Data: ${safe}`,
        cfg
      );

      expect(final).toContain("juan.perez@example.com");
      expect(final).toContain("+56 9 9876 5432");
      expect(final).toContain("Juan Pérez");
    });

    it("should reject non-string prompt", async () => {
      const { wrap } = await import("../src/guard.js");

      const cfg: GuardConfig = { apiKey: "test-api-key" };
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        wrap(123 as any, async (p) => p, cfg)
      ).rejects.toThrow("prompt must be a string");
    });

    it("should reject config without apiKey", async () => {
      const { wrap } = await import("../src/guard.js");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(wrap("test", async (p) => p, {} as any)).rejects.toThrow(
        "cfg.apiKey is required"
      );
    });
  });

  describe("anonymize() - Two-step API", () => {
    it("should return safePrompt and restore function", async () => {
      const { anonymize } = await import("../src/guard.js");

      const cfg: GuardConfig = { apiKey: "test-api-key" };
      const result = await anonymize("Tel: +56 9 9876 5432; Name: Juan Pérez", cfg);

      expect(result.safePrompt).toBeDefined();
      expect(typeof result.restore).toBe("function");
      expect(result.safePrompt).toContain("+XX X XXXX XXXX");
      expect(result.safePrompt).toContain("Fake Name");
    });

    it("should restore correctly with restore()", async () => {
      const { anonymize } = await import("../src/guard.js");

      const cfg: GuardConfig = { apiKey: "test-api-key" };
      const r = await anonymize("My name is Juan Pérez", cfg);
      const restored = await r.restore(`Processed: ${r.safePrompt}`);

      expect(restored).toContain("Juan Pérez");
      expect(restored).not.toContain("Fake Name");
    });

    it("should include stats when there are replacements", async () => {
      const { anonymize } = await import("../src/guard.js");

      const cfg: GuardConfig = { apiKey: "test-api-key" };
      const r = await anonymize("Email: juan.perez@example.com", cfg);

      expect(r.stats).toBeDefined();
      expect(r.stats?.replaced).toBeGreaterThan(0);
      expect(r.stats?.types).toContain("email");
    });

    it("should handle prompts without PII", async () => {
      const { anonymize } = await import("../src/guard.js");

      const cfg: GuardConfig = { apiKey: "test-api-key" };
      const r = await anonymize("Text without sensitive data", cfg);
      expect(r.safePrompt).toBe("Text without sensitive data");
    });
  });

  describe("createSession() - Session API", () => {
    it("should create session with protect()", async () => {
      const { createSession } = await import("../src/guard.js");

      const cfg: GuardConfig = { apiKey: "test-api-key" };
      const session = createSession(cfg);
      const result = await session.protect(
        "Contact: juan.perez@example.com",
        async (safe) => `Response: ${safe}`
      );

      expect(result).toContain("juan.perez@example.com");
      expect(result).not.toContain("fake.user@example.com");
    });

    it("should create session with anonymize()", async () => {
      const { createSession } = await import("../src/guard.js");

      const cfg: GuardConfig = { apiKey: "test-api-key" };
      const session = createSession(cfg);
      const r = await session.anonymize("Juan Pérez");

      expect(r.safePrompt).toContain("Fake Name");
      const restored = await r.restore(r.safePrompt);
      expect(restored).toContain("Juan Pérez");
    });
  });

  describe("Validations and errors", () => {
    it("should validate prompt type in anonymize", async () => {
      const { anonymize } = await import("../src/guard.js");

      const cfg: GuardConfig = { apiKey: "test-api-key" };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(anonymize(null as any, cfg)).rejects.toThrow("prompt must be a string");
    });

    it("should validate apiKey in config", async () => {
      const { anonymize } = await import("../src/guard.js");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(anonymize("test", { apiKey: "" } as any)).rejects.toThrow(
        "cfg.apiKey is required"
      );
    });

    it("should use hardcoded production URL when env var not set", async () => {
      const { anonymize } = await import("../src/guard.js");

      // Temporarily remove env var to test production default
      const originalUrl = process.env.VEILY_CORE_URL;
      delete process.env.VEILY_CORE_URL;

      // Should work with hardcoded production URL
      await expect(anonymize("test", { apiKey: "test" })).resolves.toBeDefined();

      // Restore env var for other tests
      process.env.VEILY_CORE_URL = originalUrl;
    });
  });

  describe("Custom configuration", () => {
    it("should accept custom paths", async () => {
      const { wrap } = await import("../src/guard.js");

      const customCfg: GuardConfig = {
        apiKey: "test-api-key",
        anonymizePath: "/custom/anonymize",
        restorePath: "/custom/restore",
      };

      await expect(wrap("test", async (p) => p, customCfg)).resolves.toBeDefined();
    });

    it("should accept custom timeout", async () => {
      const { wrap } = await import("../src/guard.js");

      const timeoutCfg: GuardConfig = {
        apiKey: "test-api-key",
        timeoutMs: 5000,
      };

      await expect(wrap("test", async (p) => p, timeoutCfg)).resolves.toBeDefined();
    });

    it("should work without any environment variables", async () => {
      const { wrap } = await import("../src/guard.js");

      const cfg: GuardConfig = {
        apiKey: "test-key",
      };

      // Should work with hardcoded production URL (env var only for tests)
      await expect(wrap("test", async (p) => p, cfg)).resolves.toBeDefined();
    });
  });

  describe("TTL support", () => {
    it("should accept TTL parameter in anonymize", async () => {
      const { anonymize } = await import("../src/guard.js");

      const cfg: GuardConfig = { apiKey: "test-api-key" };
      const result = await anonymize("My email is juan.perez@example.com", cfg, { ttl: 7200 });

      expect(result.safePrompt).toBeDefined();
      expect(result.restore).toBeDefined();
    });

    it("should work without TTL parameter (default)", async () => {
      const { anonymize } = await import("../src/guard.js");

      const cfg: GuardConfig = { apiKey: "test-api-key" };
      const result = await anonymize("My email is juan.perez@example.com", cfg);

      expect(result.safePrompt).toBeDefined();
      expect(result.restore).toBeDefined();
    });
  });
});
