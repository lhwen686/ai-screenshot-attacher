import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const expectedAssets = [
  ['store-assets/chrome-web-store/icon-128.png', 128, 128],
  ['store-assets/chrome-web-store/small-promo-440x280.png', 440, 280],
  ['store-assets/chrome-web-store/marquee-promo-1400x560.png', 1400, 560],
  ['store-assets/chrome-web-store/screenshot-workflow-1280x800.png', 1280, 800],
  ['store-assets/chrome-web-store/screenshot-settings-1280x800.png', 1280, 800],
  ['store-assets/chrome-web-store/screenshot-privacy-1280x800.png', 1280, 800],
  ['store-assets/chrome-web-store/screenshot-shortcuts-1280x800.png', 1280, 800],
  ['store-assets/chrome-web-store/screenshot-fallback-1280x800.png', 1280, 800]
];

function readPngDimensions(filePath) {
  const buffer = readFileSync(filePath);
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') {
    throw new Error(`${filePath} is not a PNG file`);
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

let hasFailure = false;

for (const [assetPath, expectedWidth, expectedHeight] of expectedAssets) {
  const absolutePath = resolve(assetPath);
  const { width, height } = readPngDimensions(absolutePath);
  const ok = width === expectedWidth && height === expectedHeight;

  if (!ok) {
    hasFailure = true;
  }

  const status = ok ? 'OK' : 'FAIL';
  console.log(`${status} ${assetPath} ${width}x${height} expected ${expectedWidth}x${expectedHeight}`);
}

if (hasFailure) {
  process.exitCode = 1;
}
