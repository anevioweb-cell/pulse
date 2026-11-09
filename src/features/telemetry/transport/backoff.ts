import { WEBSOCKET } from '../config';

/** Each failed attempt doubles the delay ceiling. */
const GROWTH_FACTOR = 2;

export interface BackoffOptions {
  baseMs?: number;
  capMs?: number;
}

/**
 * Exponential backoff with full jitter (AWS Architecture Blog, "Exponential Backoff And Jitter"):
 * delay = random() * min(cap, base * 2^attempt). Full jitter spreads reconnecting clients apart
 * after a server restart instead of having them retry in lockstep.
 *
 * @param attempt 0 for the first retry.
 * @param random  A source in [0, 1), injectable for tests.
 */
export function backoffDelay(
  attempt: number,
  random: () => number,
  { baseMs = WEBSOCKET.RECONNECT_BASE_MS, capMs = WEBSOCKET.RECONNECT_CAP_MS }: BackoffOptions = {},
): number {
  const ceiling = Math.min(capMs, baseMs * GROWTH_FACTOR ** attempt);
  return Math.floor(random() * ceiling);
}
