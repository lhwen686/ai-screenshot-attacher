# Store image sources

The Chrome Web Store images in `../chrome-web-store/en/` and `../chrome-web-store/zh_CN/` are rendered from these files. The screenshots show the real popup and settings page, built from `src/` and the `_locales` messages with demo data, so they stay accurate when the interface or its translations change.

## Regenerate

1. Start the render server with `npm run store-assets`. It listens on `http://localhost:5179`.
2. Open `http://localhost:5179/store-assets/source/render.html?save=1` in a normal browser tab and wait until the page says "Saved 14 images". Open the page yourself; do not start a browser with command-line flags (see `AGENTS.md`).
   - Preview one image without saving: `render.html?asset=popup&locale=zh_CN`
   - Save one image: `render.html?save=1&asset=popup&locale=en`
   - Asset ids: `overview`, `popup`, `auto`, `shortcuts`, `privacy`, `small-promo`, `marquee`.
3. Run `node scripts/validate-store-assets.mjs`.

The promo videos in `../video/` use captures of the same UI. To refresh them, open `http://localhost:5179/store-assets/source/video-layers.html` on the same server and wait for "Saved 8 layers", then render the videos as described in `../video/README.md`.

## Files

- `render.html`, `render.js`, `render.css`: the layout and English/Chinese copy of each image.
- `ui.html`, `chrome-stub.js`: render the real popup or settings page with demo data and a stand-in for the extension APIs. `ui-capture.js` loads `ui.html` in a hidden frame and returns its capture.
- `video-layers.html`, `video-layers.js`: capture the popup and settings section at three times their size for the promo videos.
- `no-paint.js`: lets captures finish in a tab that is not on screen.
- `vite.config.mjs`: the render server. Its `/__save` endpoint writes 24-bit RGB PNGs without an alpha channel, which the store requires for screenshots and promo tiles; `/__save-video` writes the video's UI captures and their layout data.

The store icon (`../chrome-web-store/icon-128.png`) is a copy of `public/icons/icon-128.png`; `source-gpt-image-2-icon.png` is its original artwork.
