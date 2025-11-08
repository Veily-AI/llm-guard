/**
 * Global setup for Jest with ESM
 * Configures the HTTP module mock for tests
 */

import { jest } from "@jest/globals";
import type { AnonymizeRequest, RestoreRequest } from "../src/types.js";

// Mock the http module before any import
jest.unstable_mockModule("../src/http.js", () => {
  return {
    getTransport: jest.fn(() => {
      return {
        postJSON: jest.fn(({ path, body }: { path: string; body: unknown }) => {
          if (path.endsWith("/v1/anonymize") || path.endsWith("/custom/anonymize")) {
            const requestBody = body as AnonymizeRequest;
            const prompt = requestBody.prompt;
            const ttl = requestBody.ttl;
            let safe = prompt;
            let replaced = 0;
            const types: string[] = [];

            // Validate TTL if provided
            if (ttl !== undefined && (ttl <= 0 || ttl > 86400)) {
              throw new Error(
                "HTTP error 400: Invalid request: ttl must be between 1 and 86400 seconds"
              );
            }

            // Simulate PII detection and anonymization
            if (safe.includes("juan.perez@example.com")) {
              safe = safe.replace(/juan\.perez@example\.com/gi, "fake.user@example.com");
              replaced++;
              types.push("email");
            }

            if (safe.includes("Juan Pérez")) {
              safe = safe.replace(/Juan Pérez/g, "Fake Name");
              replaced++;
              types.push("name");
            }

            if (safe.includes("+56 9 9876 5432")) {
              safe = safe.replace(/\+56 9 9876 5432/g, "+XX X XXXX XXXX");
              replaced++;
              types.push("phone");
            }

            return Promise.resolve({
              safePrompt: safe,
              mappingId: `map_${Math.random().toString(36).slice(2, 10)}`,
              stats: replaced > 0 ? { replaced, types } : undefined,
            });
          }

          if (path.endsWith("/v1/restore") || path.endsWith("/custom/restore")) {
            const requestBody = body as RestoreRequest;
            let restored = requestBody.output;

            // Simulate restoration of original data
            restored = restored.replace(/fake\.user@example\.com/gi, "juan.perez@example.com");
            restored = restored.replace(/Fake Name/g, "Juan Pérez");
            restored = restored.replace(/\+XX X XXXX XXXX/g, "+56 9 9876 5432");

            return Promise.resolve({ output: restored });
          }

          throw new Error(`Path not supported in mock: ${path}`);
        }),
        getJSON: jest.fn(({ path }: { path: string }) => {
          if (path.endsWith("/v1/metrics")) {
            return Promise.resolve({
              totalCycles: 42,
              successfulDeliveries: 40,
              completedCycles: 38,
              totalPiiReplaced: 156,
              piiTypes: ["email", "name", "phone"],
            });
          }

          throw new Error(`Path not supported in mock: ${path}`);
        }),
        close: jest.fn(),
      };
    }),
    __resetTransportPool: jest.fn(),
  };
});

// Export so TypeScript doesn't complain
export {};
