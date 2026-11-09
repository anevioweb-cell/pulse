import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import { pwaOptions } from './pwa.config.ts';

// Path aliases (mirrored in tsconfig.app.json "paths")
const srcDir = (subdir: string) => fileURLToPath(new URL(`./src/${subdir}`, import.meta.url));

const ANALYZE_MODE = 'analyze';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA(pwaOptions(process.env)),
    mode === ANALYZE_MODE &&
      visualizer({ filename: 'dist/stats.html', gzipSize: true, brotliSize: true }),
  ],
  resolve: {
    alias: {
      '@/app': srcDir('app'),
      '@/features': srcDir('features'),
      '@/shared': srcDir('shared'),
    },
  },
}));
