import { RETRY } from './config';
import { isApiError } from './errors';

/**
 * Retry decision for TanStack Query: only ApiErrors that are retryable (network, timeout, 5xx,
 * 429), at most RETRY.MAX_RETRIES times. 4xx and validation errors fail immediately.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < RETRY.MAX_RETRIES && isApiError(error) && error.retryable;
}

const GROWTH_FACTOR = 2;

/** Exponential backoff: BASE * 2^attempt, capped at MAX_DELAY_MS. */
export function retryDelay(attemptIndex: number): number {
  return Math.min(RETRY.MAX_DELAY_MS, RETRY.BASE_DELAY_MS * GROWTH_FACTOR ** attemptIndex);
}
