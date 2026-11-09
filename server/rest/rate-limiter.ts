import { MOCK_SERVER, WEBSOCKET } from '@/features/telemetry';

interface Window {
  start: number;
  count: number;
}

/**
 * Fixed-window request counter per client. The client map is bounded: beyond
 * MAX_RATE_LIMIT_CLIENTS the least recently refreshed window is evicted (a Map keeps insertion
 * order), so spoofing many clients cannot grow memory without bound.
 */
export class RateLimiter {
  private readonly windows = new Map<string, Window>();
  private readonly limit: number;
  private readonly now: () => number;

  constructor({
    limit = MOCK_SERVER.MAX_REST_REQUESTS_PER_SECOND,
    now = () => Date.now(),
  }: { limit?: number; now?: () => number } = {}) {
    this.limit = limit;
    this.now = now;
  }

  /** Counts a request; returns the seconds to wait when the client is over the limit. */
  hit(client: string): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    const now = this.now();
    let window = this.windows.get(client);
    if (!window || now - window.start >= WEBSOCKET.RATE_WINDOW_MS) {
      this.windows.delete(client);
      window = { start: now, count: 0 };
      this.windows.set(client, window);
      if (this.windows.size > MOCK_SERVER.MAX_RATE_LIMIT_CLIENTS) {
        const oldest = this.windows.keys().next().value;
        if (oldest !== undefined) this.windows.delete(oldest);
      }
    }
    window.count += 1;
    if (window.count <= this.limit) return { allowed: true };
    const retryAfterMs = WEBSOCKET.RATE_WINDOW_MS - (now - window.start);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / WEBSOCKET.RATE_WINDOW_MS)),
    };
  }

  get trackedClients(): number {
    return this.windows.size;
  }
}
