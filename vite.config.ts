import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type PluginOption } from 'vite';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = resolve(rootDir, 'dist');

function copyManifest(): PluginOption {
  return {
    name: 'copy-extension-manifest',
    closeBundle() {
      mkdirSync(outDir, { recursive: true });
      copyFileSync(resolve(rootDir, 'manifest.json'), resolve(outDir, 'manifest.json'));
    }
  };
}

export default defineConfig({
  plugins: [react(), copyManifest()],
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(rootDir, 'src/popup/popup.html'),
        options: resolve(rootDir, 'src/options/options.html'),
        offscreen: resolve(rootDir, 'src/offscreen/offscreen.html')
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
});
