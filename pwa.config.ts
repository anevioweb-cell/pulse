// Service worker and web app manifest (vite-plugin-pwa, ADR 0020). Kept out of vite.config.ts so
// tests can import the exact options they assert.
import type { VitePWAOptions } from 'vite-plugin-pwa';

/**
 * Manifest and theme-color values. They must equal the design tokens (tokens.css); a test parses
 * tokens.css and fails if they drift.
 */
export const PWA_COLORS = {
  /**
   * --neutral-50, --color-surface in light: browser chrome and splash screen match the page.
   * The manifest has no media queries, so it uses the light value; index.html adds a dark
   * `theme-color` for `prefers-color-scheme: dark`.
   */
  surfaceLight: '#f6f7f8',
  /** --neutral-975, --color-surface in dark (index.html theme-color only). */
  surfaceDark: '#111418',
} as const;

/** Requests the worker must never answer from a cache: API paths (navigation fallback denylist). */
export const NAVIGATION_DENYLIST = [/^\/api(\/|$)/];

/**
 * Build-time switches:
 * - VITE_SW_DEV=1: also build and register the worker under `vite` (dev), to debug it. Off by
 *   default. VITE_-prefixed so the app's registration code sees the same switch.
 * - PULSE_SW_KILL=1: ship a self-destroying worker that unregisters itself and deletes its caches
 *   (the kill switch, docs/security.md). Off by default.
 */
export function pwaOptions(env: Record<string, string | undefined>): Partial<VitePWAOptions> {
  return {
    strategies: 'generateSW',
    // Never activate a new worker on its own: the user decides (UpdateAvailableBanner).
    registerType: 'prompt',
    // Registration is done by src/app/pwa/register.ts, not by an injected script.
    injectRegister: false,
    selfDestroying: env.PULSE_SW_KILL === '1',
    devOptions: { enabled: env.VITE_SW_DEV === '1' },
    // Everything comes from globPatterns below; letting the plugin add assets again duplicates them.
    includeManifestIcons: false,
    manifest: {
      id: '/',
      name: 'Pulse: IoT telemetry dashboard',
      short_name: 'Pulse',
      description: 'Real-time telemetry from ESP32 sensors, with a demo mode that works offline.',
      lang: 'en',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: PWA_COLORS.surfaceLight,
      background_color: PWA_COLORS.surfaceLight,
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        {
          src: '/icons/icon-maskable-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    workbox: {
      // The app shell: hashed bundles, index.html, fonts, theme-init.js, icons, favicon.
      globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
      // Never precache source maps (none are built today; this keeps it true if that changes).
      globIgnores: ['**/*.map', 'stats.html'],
      // Workbox's runtime is inlined: one same-origin file, no importScripts at all.
      inlineWorkboxRuntime: true,
      // Offline navigations get the cached shell, except API paths.
      navigateFallback: 'index.html',
      navigateFallbackDenylist: NAVIGATION_DENYLIST,
      // No runtime caching: REST, WebSocket and cross-origin traffic never touch a cache here.
      runtimeCaching: [],
      // Old precaches are deleted when a new worker activates.
      cleanupOutdatedCaches: true,
      skipWaiting: false,
      clientsClaim: false,
      sourcemap: false,
    },
  };
}
