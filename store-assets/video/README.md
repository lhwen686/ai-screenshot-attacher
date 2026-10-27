# Promo videos

Remotion project for the AI Screenshot Attacher promo videos and their covers, in English and Simplified Chinese. The popup and settings page in the videos are captures of the real extension UI; the chat window is a generic mock without any AI company's branding, like the store images. There is no voiceover or music. Upload titles, descriptions, and tags are in [`docs/video-upload-kit.md`](../../docs/video-upload-kit.md).

| Composition                                 | Output (`out/`)                       | Use                                             |
| ------------------------------------------- | ------------------------------------- | ----------------------------------------------- |
| `promo-zh-CN`, `promo-en`                   | `promo-<locale>-1920x1080.mp4`, ~55 s | Bilibili, YouTube, Chrome Web Store promo video |
| `short-zh-CN`, `short-en`                   | `short-<locale>-1080x1920.mp4`, ~40 s | Bilibili vertical, YouTube Shorts               |
| `thumbnail-youtube-en`, `-zh-CN`            | `covers/thumbnail-youtube-*.jpg`      | YouTube thumbnail (1280×720, JPEG under 2 MB)   |
| `cover-bilibili-4x3-zh-CN`, `-16x9-zh-CN`   | `covers/cover-bilibili-zh-CN-*.jpg`   | Bilibili cover; content stays inside a 4:3 crop |
| `cover-vertical-zh-CN`, `cover-vertical-en` | `covers/cover-vertical-*.jpg`         | Vertical cover; content stays inside a 3:4 crop |

## Setup

This folder has its own dependencies, separate from the extension's.

```bash
npm install
```

Rendering uses Remotion's own headless Chromium (`chrome-headless-shell`, stored in `node_modules/.remotion`). It is a separate program with a temporary profile and does not touch an installed Chrome or its extensions. The first render downloads it; behind a proxy set in `HTTPS_PROXY`, run `NODE_USE_ENV_PROXY=1 npx remotion browser ensure` once.

`package.json` overrides Remotion's `zod` 4.5.4 with 4.6.7 to fix a security advisory, so the CLI prints a version-mismatch warning. Renders are unaffected.

## Preview and render

```bash
npm run dev
```

```bash
npm run render
```

`npm run render` writes every video and cover to `out/` (ignored by Git), H.264 at CRF 16 with a silent audio track. Pass composition ids to render only some, for example `npm run render -- promo-en thumbnail-youtube-en`.

## When the extension UI changes

The UI captures in `public/ui/` and their layout data in `src/ui-layers.json` come from `store-assets/source/video-layers.html`. Start the store-image server from the repository root with `npm run store-assets`, open `http://localhost:5179/store-assets/source/video-layers.html`, and wait for "Saved 8 layers". Then render again.

Interface text (the page notice, button labels, site names) comes from `public/_locales`; the rest of the copy is in `src/copy.ts`.
