import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Path aliases (mirrored in tsconfig.app.json "paths")
const srcDir = (subdir: string) => fileURLToPath(new URL(`./src/${subdir}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@/app': srcDir('app'),
      '@/features': srcDir('features'),
      '@/shared': srcDir('shared'),
    },
  },
});
