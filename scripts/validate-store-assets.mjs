import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Screenshots and promo tiles must be 24-bit PNG (or JPEG) without alpha; the store icon may keep transparency.
const LOCALES = ['en', 'zh_CN'];
const localizedAssets = [
  ['screenshot-1-overview-1280x800.png', 1280, 800],
  ['screenshot-2-popup-1280x800.png', 1280, 800],
  ['screenshot-3-auto-mode-1280x800.png', 1280, 800],
  ['screenshot-4-shortcuts-1280x800.png', 1280, 800],
  ['screenshot-5-privacy-1280x800.png', 1280, 800],
  ['small-promo-440x280.png', 440, 280],
  ['marquee-promo-1400x560.png', 1400, 560]
];
const expectedAssets = [
  ['store-assets/chrome-web-store/icon-128.png', 128, 128, { alphaAllowed: true }],
  ['store-assets/edge/logo-300x300.png', 300, 300, { alphaAllowed: true }],
  ...LOCALES.flatMap((locale) =>
    localizedAssets.map(([file, width, height]) => [
      `store-assets/chrome-web-store/${locale}/${file}`,
      width,
      height,
      {}
    ])
  )
];

const COLOR_TYPES = { 0: 'grayscale', 2: 'RGB', 3: 'indexed', 4: 'grayscale+alpha', 6: 'RGBA' };

function readPngHeader(filePath) {
  const buffer = readFileSync(filePath);
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') {
    throw new Error(`${filePath} is not a PNG file`);
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType: buffer[25]
  };
}

let hasFailure = false;

for (const [assetPath, expectedWidth, expectedHeight, { alphaAllowed = false }] of expectedAssets) {
  let header;
  try {
    header = readPngHeader(resolve(assetPath));
  } catch (error) {
    hasFailure = true;
    console.log(`FAIL ${assetPath} ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }

  const sizeOk = header.width === expectedWidth && header.height === expectedHeight;
  const colorOk = alphaAllowed || (header.colorType === 2 && header.bitDepth === 8);
  if (!sizeOk || !colorOk) {
    hasFailure = true;
  }

  const color = `${header.bitDepth}-bit ${COLOR_TYPES[header.colorType] ?? `type ${header.colorType}`}`;
  console.log(
    `${sizeOk && colorOk ? 'OK' : 'FAIL'} ${assetPath} ${header.width}x${header.height} ${color}` +
      ` expected ${expectedWidth}x${expectedHeight}${alphaAllowed ? '' : ' 8-bit RGB'}`
  );
}

if (hasFailure) {
  process.exitCode = 1;
}
