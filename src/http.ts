/**
 * HTTP/2 transport with keep-alive for low latency
 *
 * Features:
 * - Persistent connection (reuse by origin)
 * - Configurable timeout
 * - Connection pool to avoid repeated handshakes
 */

import http2 from "http2";
import { URL } from "url";
import { GuardConfig } from "./types.js";

type PostOptions = {
  path: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
};

export interface Transport {
  postJSON<T = unknown>(opts: PostOptions): Promise<T>;
  close(): void;
}

/**
 * HTTP/2 client with keep-alive
 */
export class H2Transport implements Transport {
  private client: http2.ClientHttp2Session;
  private basePath: string;
  private headers: Record<string, string>;
  private timeoutMs: number;

  constructor(cfg: GuardConfig) {
    if (!cfg?.baseURL) {
      throw new Error("cfg.baseURL is required");
    }

    const u = new URL(cfg.baseURL);

    // Connect with HTTP/2 (keep-alive by default)
    this.client = http2.connect(u.origin, {
      maxOutstandingPings: 1,
      // Keep connection open
      settings: {
        enableConnectProtocol: true,
      },
    });

    this.basePath = u.pathname.replace(/\/$/, "");
    this.timeoutMs = cfg.timeoutMs ?? 2000;

    // Base headers
    this.headers = {
      "content-type": "application/json",
      ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
      ...(cfg.headers ?? {}),
    };

    // Session error handling
    this.client.on("error", (err) => {
      // Prevent unhandled errors from closing the process
      // eslint-disable-next-line no-console
      console.error("HTTP/2 session error:", err);
    });
  }

  /**
   * Performs POST JSON and returns parsed response
   */
  postJSON<T = unknown>({ path, body }: PostOptions): Promise<T> {
    return new Promise((resolve, reject) => {
      // Verificar que la sesión esté activa
      if (this.client.closed || this.client.destroyed) {
        reject(new Error("HTTP/2 session is closed"));
        return;
      }

      const req = this.client.request({
        ":method": "POST",
        ":path": this.basePath + path,
        ...this.headers,
      });

      const chunks: Buffer[] = [];
      let statusCode = 0;

      // Timeout
      const timer = setTimeout(() => {
        try {
          req.close();
        } catch {
          // Ignorar errores al cerrar
        }
        reject(new Error("HTTP/2 request timeout"));
      }, this.timeoutMs);

      req.on("response", (headers) => {
        statusCode = Number(headers[":status"] || 0);
        // Continue reading body even on errors to provide context
      });

      req.on("data", (chunk) => {
        chunks.push(chunk as Buffer);
      });

      req.on("end", () => {
        clearTimeout(timer);
        const buf = Buffer.concat(chunks).toString("utf8");

        // If HTTP error, reject with context
        if (statusCode >= 400) {
          let errorMsg = `HTTP ${statusCode}`;
          try {
            const errBody = JSON.parse(buf);
            errorMsg = errBody.message || errBody.error || errorMsg;
          } catch {
            // If not JSON, use plain text
            errorMsg = buf || errorMsg;
          }
          reject(new Error(`HTTP error ${statusCode}: ${errorMsg}`));
          return;
        }

        // Successful parse
        try {
          resolve(JSON.parse(buf) as T);
        } catch {
          // If not valid JSON, return as string
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          resolve(buf as any);
        }
      });

      req.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      // Send body
      try {
        req.end(JSON.stringify(body ?? {}));
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  /**
   * Closes the HTTP/2 connection
   */
  close() {
    try {
      if (!this.client.closed && !this.client.destroyed) {
        this.client.close();
      }
    } catch {
      // Ignore errors when closing
    }
  }
}

/**
 * Transport pool by origin to reuse connections
 * This significantly reduces latency by avoiding repeated handshakes
 */
const transportPool = new Map<string, H2Transport>();

/**
 * Gets a transport from the pool or creates a new one
 */
export function getTransport(cfg: GuardConfig): H2Transport {
  const key = new URL(cfg.baseURL).origin;
  let transport = transportPool.get(key);

  if (!transport) {
    transport = new H2Transport(cfg);
    transportPool.set(key, transport);
  }

  return transport;
}

/**
 * Clears the transport pool (for tests only)
 */
export function __resetTransportPool() {
  for (const t of transportPool.values()) {
    t.close();
  }
  transportPool.clear();
}
