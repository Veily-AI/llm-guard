/**
 * HTTP/1.1 transport with keep-alive for persistent connections
 *
 * Features:
 * - Persistent connection (reuse by origin)
 * - Configurable timeout
 * - Connection pool to avoid repeated handshakes
 * - Compatible with AWS App Runner and most cloud providers
 */

import https from "https";
import { URL } from "url";
import { GuardConfig } from "./types.js";

type PostOptions = {
  path: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
};

type GetOptions = {
  path: string;
};

export interface Transport {
  postJSON<T = unknown>(opts: PostOptions): Promise<T>;
  getJSON<T = unknown>(opts: GetOptions): Promise<T>;
  close(): void;
}

/**
 * HTTPS client with keep-alive (HTTP/1.1)
 */
export class HttpsTransport implements Transport {
  private agent: https.Agent;
  private baseURL: URL;
  private headers: Record<string, string>;
  private timeoutMs: number;

  constructor(cfg: GuardConfig & { baseURL: string }) {
    if (!cfg?.baseURL) {
      throw new Error("baseURL is required");
    }

    this.baseURL = new URL(cfg.baseURL);
    this.timeoutMs = cfg.timeoutMs ?? 2000;

    // Create agent with keep-alive for connection reuse
    this.agent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: this.timeoutMs,
    });

    // Base headers
    this.headers = {
      "Content-Type": "application/json",
      ...(cfg.apiKey ? { "x-api-key": cfg.apiKey } : {}),
      ...(cfg.headers ?? {}),
    };
  }

  /**
   * Performs GET JSON and returns parsed response
   */
  getJSON<T = unknown>({ path }: GetOptions): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseURL);

      const options: https.RequestOptions = {
        method: "GET",
        agent: this.agent,
        headers: this.headers,
        timeout: this.timeoutMs,
      };

      const req = https.request(url, options, (res) => {
        const chunks: Buffer[] = [];

        res.on("data", (chunk) => {
          chunks.push(chunk as Buffer);
        });

        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const statusCode = res.statusCode || 0;

          // Handle errors
          if (statusCode >= 400) {
            let errorMsg = `HTTP ${statusCode}`;
            try {
              const errBody = JSON.parse(body);
              errorMsg = errBody.message || errBody.error || errorMsg;
            } catch {
              errorMsg = body || errorMsg;
            }
            reject(new Error(`HTTP error ${statusCode}: ${errorMsg}`));
            return;
          }

          // Parse success response
          try {
            resolve(JSON.parse(body) as T);
          } catch {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            resolve(body as any);
          }
        });
      });

      req.on("error", (err) => {
        reject(err);
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error("HTTP request timeout"));
      });

      req.end();
    });
  }

  /**
   * Performs POST JSON and returns parsed response
   */
  postJSON<T = unknown>({ path, body }: PostOptions): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseURL);
      const bodyStr = JSON.stringify(body ?? {});

      const options: https.RequestOptions = {
        method: "POST",
        agent: this.agent,
        headers: {
          ...this.headers,
          "Content-Length": Buffer.byteLength(bodyStr),
        },
        timeout: this.timeoutMs,
      };

      const req = https.request(url, options, (res) => {
        const chunks: Buffer[] = [];

        res.on("data", (chunk) => {
          chunks.push(chunk as Buffer);
        });

        res.on("end", () => {
          const responseBody = Buffer.concat(chunks).toString("utf8");
          const statusCode = res.statusCode || 0;

          // Handle errors
          if (statusCode >= 400) {
            let errorMsg = `HTTP ${statusCode}`;
            try {
              const errBody = JSON.parse(responseBody);
              errorMsg = errBody.message || errBody.error || errorMsg;
            } catch {
              errorMsg = responseBody || errorMsg;
            }
            reject(new Error(`HTTP error ${statusCode}: ${errorMsg}`));
            return;
          }

          // Parse success response
          try {
            resolve(JSON.parse(responseBody) as T);
          } catch {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            resolve(responseBody as any);
          }
        });
      });

      req.on("error", (err) => {
        reject(err);
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error("HTTP request timeout"));
      });

      req.write(bodyStr);
      req.end();
    });
  }

  /**
   * Closes the HTTPS agent and destroys pooled connections
   */
  close() {
    this.agent.destroy();
  }
}

/**
 * Transport pool by origin to reuse connections
 * This reduces latency by avoiding repeated TLS handshakes
 */
const transportPool = new Map<string, HttpsTransport>();

/**
 * Gets a transport from the pool or creates a new one
 */
export function getTransport(cfg: GuardConfig & { baseURL: string }): HttpsTransport {
  const key = new URL(cfg.baseURL).origin;
  let transport = transportPool.get(key);

  if (!transport) {
    transport = new HttpsTransport(cfg);
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
