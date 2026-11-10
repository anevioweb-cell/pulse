// App-level settings (preferences, bootstrap). Each value states why. Feature limits live in their
// features' config.ts.
import { MOCK_SERVER } from '@/features/telemetry';

export const PREFERENCES = {
  /** localStorage key of the app preference record (mode and Live URL). */
  STORAGE_KEY: 'pulse.preferences',
  /** Stored format version. A record with any other version is ignored (defaults are used). */
  SCHEMA_VERSION: 1,
  /**
   * Longest accepted Live URL, in characters: the mock server's own URL cap (2048), which no real
   * ws:// address comes close to. Longer input is refused before it is parsed.
   */
  MAX_URL_LENGTH: MOCK_SERVER.MAX_URL_LENGTH,
  /**
   * Largest stored record read back, in characters: a capped URL plus a few short keys. Anything
   * bigger was not written by this app and is ignored before JSON parsing.
   */
  MAX_RECORD_LENGTH: 2 * MOCK_SERVER.MAX_URL_LENGTH,
  /** Demo Mode needs no server, so a first visit always works. */
  DEFAULT_MODE: 'demo',
  /** The local mock server (`npm run server`), so Live Mode works out of the box in development. */
  DEFAULT_LIVE_URL: `ws://${MOCK_SERVER.DEFAULT_HOST}:${String(MOCK_SERVER.DEFAULT_PORT)}`,
} as const;

/** HTTP status codes the router uses for route errors. */
export const HTTP_STATUS = {
  /** An unknown path, or a route parameter that fails validation (an invalid device id). */
  NOT_FOUND: 404,
} as const;
