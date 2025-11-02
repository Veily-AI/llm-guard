/**
 * Mock of HTTP module for tests
 * Simulates the behavior of /v1/anonymize and /v1/restore endpoints from the core
 */

export class FakeTransport {
  private lastMappingId = "map-123-test";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  postJSON<T>({ path, body }: { path: string; body: any }): Promise<T> {
    if (path.endsWith("/v1/anonymize") || path.endsWith("/custom/anonymize")) {
      const prompt: string = body.prompt as string;
      const ttl: number | undefined = body.ttl;
      let safe = prompt;
      let replaced = 0;
      const types: string[] = [];

      // Validate TTL if provided
      if (ttl !== undefined && (ttl <= 0 || ttl > 86400)) {
        return Promise.reject(
          new Error("HTTP error 400: Invalid request: ttl must be between 1 and 86400 seconds")
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

      // Generate unique mappingId for this anonymization
      this.lastMappingId = `map_${Math.random().toString(36).slice(2, 10)}`;

      return Promise.resolve({
        safePrompt: safe,
        mappingId: this.lastMappingId,
        stats: replaced > 0 ? { replaced, types } : undefined,
      } as T);
    }

    if (path.endsWith("/v1/restore") || path.endsWith("/custom/restore")) {
      const out: string = body.output as string;
      let restored = out;

      // Simulate restoration of original data
      restored = restored.replace(/fake\.user@example\.com/gi, "juan.perez@example.com");
      restored = restored.replace(/Fake Name/g, "Juan Pérez");
      restored = restored.replace(/\+XX X XXXX XXXX/g, "+56 9 9876 5432");

      return Promise.resolve({ output: restored } as T);
    }

    throw new Error(`Path not supported in FakeTransport: ${path}`);
  }

  getJSON<T>({ path }: { path: string }): Promise<T> {
    if (path.endsWith("/v1/metrics")) {
      return Promise.resolve({
        totalCycles: 42,
        successfulDeliveries: 40,
        completedCycles: 38,
        totalPiiReplaced: 156,
        piiTypes: ["email", "name", "phone"],
      } as T);
    }

    throw new Error(`Path not supported in FakeTransport: ${path}`);
  }

  close() {
    // No-op in mock
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getTransport(_cfg: any) {
  return new FakeTransport();
}

export function __resetTransportPool() {
  // No-op in mock
}
