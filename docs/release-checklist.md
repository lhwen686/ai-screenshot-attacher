# Release Checklist

Run this checklist before publishing a public build or Chrome Web Store submission.

## Pre-Release

- Confirm the working tree contains only intended release changes.
- Run `npm run verify`.
- Run `npm audit --audit-level=high`.
- Run `npm run package`.
- Confirm `npm run package` reports a passing extension-package validation before creating the ZIP.
- Run `node scripts/validate-store-assets.mjs`.
- Run `node scripts/validate-public-site.mjs`.
- Confirm `release/ai-screenshot-attacher-v<version>.zip` exists.
- Review `PRIVACY.md` and `docs/chrome-web-store-listing.md` for permission accuracy.
- Confirm `manifest.json` and `package.json` versions match.

## Manual Browser Validation

Load `dist/` manually from `chrome://extensions` or `edge://extensions`. Do not launch, close, restart, or modify Chrome/browser extension state with command-line flags or scripts.

Validate the scenarios in `docs/manual-test-matrix.md`:

- Manual attach to ChatGPT, Claude, Gemini, Doubao, and Grok.
- Popup quick buttons and default target action.
- Text-only clipboard failure message.
- Automatic mode disabled by default.
- Automatic mode attaches only to already open supported pages.
- Failure fallback keeps the screenshot available for manual paste.
- The extension never sends an AI message automatically.
- Complete signed-in Grok acceptance and record the result in the audit; unit tests alone do not clear this requirement.

## Chrome Web Store Submission

- Upload the zip from `release/`.
- Use listing text from `docs/chrome-web-store-listing.md`.
- Upload assets from `store-assets/chrome-web-store/`.
- Confirm the marquee's "Supported targets" chips match the shipped targets (five in 0.2.0); the other store images name no target list.
- Confirm store asset dimensions match `docs/store-asset-validation.md`.
- Confirm the HTTPS public page URLs in `docs/public-site-validation.md` return `200`. GitHub Pages publishes `main:/docs`, so merge the release branch before submitting.
- Use `PRIVACY.md` as the privacy-policy source.
- Explain the narrow host permissions and clipboard permissions in the dashboard.

## Rollback

The pre-promotion backup was created before this work:

- Tag: `backup/pre-promotion-0.1.0-20260520`
- Commit: `78966330a3866328f38bec83ad315d62b2d7bfac`
- Source archive: `C:\Users\柳皓文\OneDrive\Documents\ai-screenshot-attacher-backups\ai-screenshot-attacher-0.1.0-pre-promotion-20260520-7896633.zip`
- Restore note: `C:\Users\柳皓文\OneDrive\Documents\ai-screenshot-attacher-backups\ai-screenshot-attacher-0.1.0-pre-promotion-20260520-7896633.txt`

Only run destructive rollback commands after explicit confirmation.
