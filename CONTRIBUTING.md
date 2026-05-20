# Contributing

AI Screenshot Attacher is a Manifest V3 browser extension. Keep changes small, testable, and scoped to the affected target or workflow.

## Development

1. Use Node 24 or newer.
2. Install dependencies with `npm ci`.
3. Run `npm run verify` before opening a pull request.

`npm run verify` runs type checking, linting, Prettier checks, Vitest, and the production build.

## Adapter Changes

Target AI sites change their DOM frequently. When changing an adapter:

- Prefer resilient selectors over fixed generated class names.
- Preserve the privacy model: no chat history reads, no message auto-send, and no screenshot history.
- Keep fallback behavior intact so the image remains available for manual paste when automatic attach fails.
- Update `docs/manual-test-matrix.md` if the manual flow changes.

## Release Packaging

Run `npm run package` to build `dist/` and create `release/ai-screenshot-attacher-v<version>.zip`.

The package script fails if `package.json` and `manifest.json` versions differ.

## Browser Safety

Do not use command-line flags or automation to start, close, restart, or modify Chrome/browser extension state. Load unpacked builds manually from the browser UI.
