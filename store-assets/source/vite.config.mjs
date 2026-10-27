// Dev server for rendering the Chrome Web Store images. See README.md in this folder.
import react from '@vitejs/plugin-react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { defineConfig } from 'vite';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const outputRoot = resolve(repoRoot, 'store-assets/chrome-web-store');

// The store wants 24-bit PNGs without an alpha channel, so the page posts raw RGBA pixels and this encodes RGB.
function encodeRgbPng(width, height, rgba) {
  const rowLength = width * 3 + 1;
  const rows = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      const alpha = rgba[source + 3] / 255;
      const target = y * rowLength + 1 + x * 3;
      for (let channel = 0; channel < 3; channel += 1) {
        rows[target + channel] = Math.round(rgba[source + channel] * alpha + 255 * (1 - alpha));
      }
    }
  }

  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolor, no alpha
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function saveRenderedAssets() {
  return {
    name: 'save-rendered-store-assets',
    configureServer(server) {
      server.middlewares.use('/__save', (request, response) => {
        const url = new URL(request.url ?? '', 'http://localhost');
        const file = url.searchParams.get('file') ?? '';
        const width = Number(url.searchParams.get('width'));
        const height = Number(url.searchParams.get('height'));
        const target = resolve(outputRoot, file);
        if (
          request.method !== 'POST' ||
          !file.endsWith('.png') ||
          relative(outputRoot, target).startsWith('..') ||
          !Number.isInteger(width) ||
          !Number.isInteger(height)
        ) {
          response.statusCode = 400;
          response.end('bad request');
          return;
        }

        const chunks = [];
        request.on('data', (data) => chunks.push(data));
        request.on('end', () => {
          const rgba = Buffer.concat(chunks);
          if (rgba.length !== width * height * 4) {
            response.statusCode = 400;
            response.end(`expected ${width * height * 4} bytes, received ${rgba.length}`);
            return;
          }
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, encodeRgbPng(width, height, rgba));
          response.end('saved');
        });
      });
    }
  };
}

export default defineConfig({
  root: repoRoot,
  plugins: [react(), saveRenderedAssets()],
  server: { port: 5179, strictPort: true }
});
