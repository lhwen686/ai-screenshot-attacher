// Captures the real popup and settings section for the promo video in store-assets/video.
// The PNGs go to store-assets/video/public/ui, and their sizes and regions to store-assets/video/src/ui-layers.json.
import { captureUi } from './ui-capture.js';

const LOCALES = ['en', 'zh_CN'];
// Three times the CSS size keeps the UI sharp when the video shows it enlarged.
const SCALE = 3;
// The settings page is captured 600px wide, just above its 560px narrow layout, so the video can enlarge it more.
const LAYERS = [
  { id: 'popup-before', page: 'popup', query: 'result=none&default=chatgpt' },
  { id: 'popup-after', page: 'popup', query: 'resultTarget=claude&default=chatgpt' },
  { id: 'settings-off', page: 'options', query: 'default=chatgpt&clip=.settings-section', frameWidth: 600 },
  { id: 'settings-on', page: 'options', query: 'auto=on&default=chatgpt&clip=.settings-section', frameWidth: 600 }
];

const statusLine = document.getElementById('status');

async function save(file, body) {
  const response = await fetch(`/__save-video?file=${encodeURIComponent(file)}`, { method: 'POST', body });
  if (!response.ok) {
    throw new Error(`${file}: ${await response.text()}`);
  }
}

const round = (value) => Math.round(value * 100) / 100;

async function main() {
  const manifest = {};
  for (const locale of LOCALES) {
    for (const layer of LAYERS) {
      const name = `${layer.id}-${locale}`;
      statusLine.textContent = `Capturing ${name}`;
      const shot = await captureUi(layer.page, locale, `${layer.query}&scale=${SCALE}`, layer.frameWidth);
      await save(`public/ui/${name}.png`, await (await fetch(shot.src)).blob());
      manifest[name] = {
        file: `ui/${name}.png`,
        width: shot.width,
        height: shot.height,
        regions: Object.fromEntries(
          Object.entries(shot.regions).map(([key, rect]) => [
            key,
            { x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) }
          ])
        )
      };
    }
  }
  await save('src/ui-layers.json', `${JSON.stringify(manifest, null, 2)}\n`);
  statusLine.textContent = `Saved ${Object.keys(manifest).length} layers`;
  window.captureResult = { ok: true, layers: Object.keys(manifest) };
}

main().catch((error) => {
  statusLine.textContent = `Error: ${error.message}`;
  window.captureResult = { ok: false, error: String(error?.stack ?? error) };
});
