/**
 * Tests for @veily/llm-guard
 *
 * Following TDD: write tests first, then implement.
 * The HTTP module mock is configured in setup.ts
 */

import { describe, it, expect } from "@jest/globals";
import type { GuardConfig } from "../src/types.js";

describe("@veily/llm-guard - TDD Suite", () => {
  describe("wrap() - One-liner API", () => {
    it("should process prompt without PII correctly", async () => {
      const { wrap } = await import("../src/guard.js");

      const cfg: GuardConfig = { baseURL: "https://core.veily.internal" };
      const result = await wrap("hello world", async (p) => p.toUpperCase(), cfg);
      expect(result).toBe("HELLO WORLD");
    });

    it("should anonymize, process and restore PII", async () => {
      const { wrap } = await import("../src/guard.js");

      const cfg: GuardConfig = { baseURL: "https://core.veily.internal" };
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

      const cfg: GuardConfig = { baseURL: "https://core.veily.internal" };
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

      const cfg: GuardConfig = { baseURL: "https://core.veily.internal" };
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        wrap(123 as any, async (p) => p, cfg)
      ).rejects.toThrow("prompt must be a string");
    });

    it("should reject config without baseURL", async () => {
      const { wrap } = await import("../src/guard.js");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(wrap("test", async (p) => p, {} as any)).rejects.toThrow(
        "cfg.baseURL is required"
      );
    });
  });

  describe("anonymize() - Two-step API", () => {
    it("should return safePrompt and restore function", async () => {
      const { anonymize } = await import("../src/guard.js");

      const cfg: GuardConfig = { baseURL: "https://core.veily.internal" };
      const result = await anonymize("Tel: +56 9 9876 5432; Name: Juan Pérez", cfg);

      expect(result.safePrompt).toBeDefined();
      expect(typeof result.restore).toBe("function");
      expect(result.safePrompt).toContain("+XX X XXXX XXXX");
      expect(result.safePrompt).toContain("Fake Name");
    });

    it("should restore correctly with restore()", async () => {
      const { anonymize } = await import("../src/guard.js");

      const cfg: GuardConfig = { baseURL: "https://core.veily.internal" };
      const r = await anonymize("My name is Juan Pérez", cfg);
      const restored = await r.restore(`Processed: ${r.safePrompt}`);

      expect(restored).toContain("Juan Pérez");
      expect(restored).not.toContain("Fake Name");
    });

    it("should include stats when there are replacements", async () => {
      const { anonymize } = await import("../src/guard.js");

      const cfg: GuardConfig = { baseURL: "https://core.veily.internal" };
      const r = await anonymize("Email: juan.perez@example.com", cfg);

      expect(r.stats).toBeDefined();
      expect(r.stats?.replaced).toBeGreaterThan(0);
      expect(r.stats?.types).toContain("email");
    });

    it("should handle prompts without PII", async () => {
      const { anonymize } = await import("../src/guard.js");

      const cfg: GuardConfig = { baseURL: "https://core.veily.internal" };
      const r = await anonymize("Text without sensitive data", cfg);
      expect(r.safePrompt).toBe("Text without sensitive data");
    });
  });

  describe("createSession() - Session API", () => {
    it("should create session with protect()", async () => {
      const { createSession } = await import("../src/guard.js");

      const cfg: GuardConfig = { baseURL: "https://core.veily.internal" };
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

      const cfg: GuardConfig = { baseURL: "https://core.veily.internal" };
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

      const cfg: GuardConfig = { baseURL: "https://core.veily.internal" };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(anonymize(null as any, cfg)).rejects.toThrow("prompt must be a string");
    });

    it("should validate baseURL in config", async () => {
      const { anonymize } = await import("../src/guard.js");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(anonymize("test", { baseURL: "" } as any)).rejects.toThrow(
        "cfg.baseURL is required"
      );
    });
  });

  describe("Custom configuration", () => {
    it("should accept custom paths", async () => {
      const { wrap } = await import("../src/guard.js");

      const customCfg: GuardConfig = {
        baseURL: "https://custom.veily.internal",
        anonymizePath: "/custom/anonymize",
        restorePath: "/custom/restore",
      };

      await expect(wrap("test", async (p) => p, customCfg)).resolves.toBeDefined();
    });

    it("should accept apiKey in headers", async () => {
      const { wrap } = await import("../src/guard.js");

      const authCfg: GuardConfig = {
        baseURL: "https://core.veily.internal",
        apiKey: "test-api-key-12345",
      };

      await expect(wrap("test", async (p) => p, authCfg)).resolves.toBeDefined();
    });

    it("should accept custom timeout", async () => {
      const { wrap } = await import("../src/guard.js");

      const timeoutCfg: GuardConfig = {
        baseURL: "https://core.veily.internal",
        timeoutMs: 5000,
      };

      await expect(wrap("test", async (p) => p, timeoutCfg)).resolves.toBeDefined();
    });
  });
});
