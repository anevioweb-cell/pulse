// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod/mini';

import { PWA_COLORS } from '../../pwa.config';

// Runs the real production build into a temporary folder and checks what the service worker and
// the manifest would ship (ADR 0020).

const BUILD_TIMEOUT_MS = 60_000;
const root = join(import.meta.dirname, '..', '..');
let outDir = '';
const nodeEnv = process.env.NODE_ENV;
let worker = '';

/** Reads a file this test produced (its temporary build) or a repository file. */
const readText = (path: string) => readFileSync(path, 'utf8'); // eslint-disable-line security/detect-non-literal-fs-filename -- paths under the repo or this test's temp dir
const read = (file: string) => readText(join(outDir, file));

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), 'pulse-pwa-'));
  process.env.NODE_ENV = 'production'; // Workbox picks its production (minified) build from this
  await build({
    root,
    configFile: join(root, 'vite.config.ts'),
    // Vitest sets NODE_ENV=test; build exactly what `npm run build` ships.
    mode: 'production',
    logLevel: 'silent',
    build: { outDir, emptyOutDir: true },
  });
  worker = read('sw.js');
}, BUILD_TIMEOUT_MS);

afterAll(() => {
  process.env.NODE_ENV = nodeEnv;
  rmSync(outDir, { recursive: true, force: true });
});

const precached = () =>
  [...worker.matchAll(/\{\s*"?url"?:\s*"([^"]+)",\s*"?revision"?:/g)].map(
    (match) => match[1] ?? '',
  );

describe('precache manifest', () => {
  it('contains the app shell', () => {
    const urls = precached();
    expect(urls).toEqual(
      expect.arrayContaining([
        'index.html',
        'theme-init.js',
        'favicon.svg',
        'manifest.webmanifest',
      ]),
    );
    expect(urls.some((url) => /^assets\/index-[\w-]+\.js$/.test(url))).toBe(true);
    expect(urls.some((url) => /^assets\/index-[\w-]+\.css$/.test(url))).toBe(true);
    expect(urls.filter((url) => url.endsWith('.woff2'))).toHaveLength(3);
    expect(urls.filter((url) => url.startsWith('icons/'))).toHaveLength(4);
  });

  it('never contains API paths, WebSocket URLs, other origins, source maps or duplicates', () => {
    const urls = precached();
    expect(urls.filter((url) => /^\/?api\b|^wss?:|^https?:|\/\/|\.map$/.test(url))).toEqual([]);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe('service worker behavior', () => {
  it('waits for the user: skipWaiting only on the SKIP_WAITING message, no clients.claim', () => {
    expect(worker.match(/skipWaiting\(\)/g)).toHaveLength(1);
    expect(worker).toContain('"SKIP_WAITING"===t.data.type&&self.skipWaiting()');
    expect(worker).not.toContain('clients.claim');
  });

  it('is one same-origin file: no importScripts', () => {
    expect(worker).not.toContain('importScripts');
  });

  it('caches nothing at runtime and falls back to the shell for navigations except /api', () => {
    expect(worker).not.toMatch(
      /registerRoute\([^)]*(StaleWhileRevalidate|CacheFirst|NetworkFirst)/,
    );
    // The argument is a minified name that changes with the bundle.
    expect(worker).toMatch(/createHandlerBoundToURL\([\w$]+\)/);
    expect(worker).toContain('denylist:[/^\\/api(\\/|$)/]');
  });

  it('deletes outdated precaches on activate', () => {
    expect(worker).toMatch(/addEventListener\("activate".*-precache-.*caches\.delete/s);
  });
});

const manifestSchema = z.object({
  name: z.string(),
  short_name: z.string(),
  description: z.string(),
  start_url: z.literal('/'),
  scope: z.literal('/'),
  display: z.literal('standalone'),
  theme_color: z.string(),
  background_color: z.string(),
  icons: z.array(
    z.object({
      src: z.string(),
      sizes: z.string(),
      type: z.string(),
      purpose: z.optional(z.string()),
    }),
  ),
});

describe('web app manifest', () => {
  it('meets the install criteria: name, start_url, standalone, 192 and 512 icons, a maskable icon', () => {
    const manifest = manifestSchema.parse(JSON.parse(read('manifest.webmanifest')));
    expect(manifest.short_name).toBe('Pulse');
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) {
      expect(() => readText(join(outDir, icon.src))).not.toThrow();
    }
  });

  it('uses the design tokens for its colors and theme-color metas', () => {
    const tokens = readText(join(root, 'src/shared/styles/tokens.css'));
    expect(/--neutral-50:\s*(#[0-9a-f]{6})/i.exec(tokens)?.[1]).toBe(PWA_COLORS.surfaceLight);
    expect(/--neutral-975:\s*(#[0-9a-f]{6})/i.exec(tokens)?.[1]).toBe(PWA_COLORS.surfaceDark);
    expect(tokens).toMatch(/--color-surface:\s*var\(--neutral-50\)/);
    expect(tokens).toMatch(/--color-surface:\s*var\(--neutral-975\)/);

    const manifest = manifestSchema.parse(JSON.parse(read('manifest.webmanifest')));
    expect([manifest.theme_color, manifest.background_color]).toEqual([
      PWA_COLORS.surfaceLight,
      PWA_COLORS.surfaceLight,
    ]);
    const html = read('index.html');
    expect(html).toContain(
      `<meta name="theme-color" content="${PWA_COLORS.surfaceLight}" media="(prefers-color-scheme: light)" />`,
    );
    expect(html).toContain(
      `<meta name="theme-color" content="${PWA_COLORS.surfaceDark}" media="(prefers-color-scheme: dark)" />`,
    );
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest">');
  });
});
