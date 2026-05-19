import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    outDir: resolve(rootDir, 'dist'),
    emptyOutDir: false,
    lib: {
      entry: resolve(rootDir, 'src/background/serviceWorker.ts'),
      formats: ['es'],
      fileName: () => 'src/background/serviceWorker.js'
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
});
