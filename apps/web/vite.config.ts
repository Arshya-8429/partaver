import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const appRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: appRoot,
  publicDir: resolve(appRoot, 'public'),
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8787', '/health': 'http://127.0.0.1:8787' },
  },
  preview: {
    host: '127.0.0.1',
    proxy: { '/api': 'http://127.0.0.1:8787', '/health': 'http://127.0.0.1:8787' },
  },
  build: {
    outDir: resolve(appRoot, 'dist'),
    emptyOutDir: true,
    manifest: true,
    sourcemap: false,
  },
});
