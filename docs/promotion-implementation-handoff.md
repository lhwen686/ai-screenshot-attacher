# Promotion Implementation Handoff

## Purpose

This document summarizes the promotion-readiness implementation performed on 2026-05-20 for AI Screenshot Attacher. It is written for a future LLM or coding agent that needs to understand what changed, what was validated, what remains manual, and how to roll back safely.

## Project Context

- Project name: `without paste picture`
- Product name: AI Screenshot Attacher
- Repository purpose: Manifest V3 Chrome / Edge extension that attaches the current clipboard screenshot to ChatGPT, Claude, Gemini, or Doubao.
- Core privacy model:
  - Does not auto-send AI messages.
  - Does not read chat history.
  - Does not save screenshot history.
  - Does not upload screenshots to an extension-author server.
  - Automatic mode is disabled by default.
- Important project constraint:
  - Do not launch, close, restart, or modify Chrome/browser extension state with command-line flags or scripts.
  - Do not use `--disable-extensions-except`, `--load-extension`, temporary profiles, or automation that can disable existing extensions.
  - Manual browser loading/testing must happen through the Chrome/Edge UI.

## Rollback Point Created Before Implementation

Rollback state was saved before promotion work began.

- Git tag: `backup/pre-promotion-0.1.0-20260520`
- Commit: `78966330a3866328f38bec83ad315d62b2d7bfac`
- Source archive: `C:\Users\柳皓文\OneDrive\Documents\ai-screenshot-attacher-backups\ai-screenshot-attacher-0.1.0-pre-promotion-20260520-7896633.zip`
- Restore note: `C:\Users\柳皓文\OneDrive\Documents\ai-screenshot-attacher-backups\ai-screenshot-attacher-0.1.0-pre-promotion-20260520-7896633.txt`

The source archive was created with `git archive` from tracked source files only. It excludes ignored local/build/browser-profile data such as `node_modules/`, `dist/`, `release/`, and `.chrome-extension-profile/`.

Do not run destructive rollback commands such as `git reset --hard` unless the user explicitly asks for that operation.

## Implementation Summary

The promotion-readiness plan was implemented across five areas:

1. Store distribution readiness.
2. Privacy and compliance documentation.
3. User onboarding and support UX.
4. Marketing/store visual assets.
5. Release and manual test documentation.

No target-site adapter business logic was intentionally changed.

## Store Distribution Readiness

`manifest.json` was updated for public distribution:

- Added `short_name`: `AI Attacher`.
- Replaced the description with a clearer store-oriented description.
- Added extension icons:
  - `icons/icon-16.png`
  - `icons/icon-32.png`
  - `icons/icon-48.png`
  - `icons/icon-128.png`
- Added `action.default_icon` with the same icon sizes.

The built release package was inspected:

- Release zip: `release/ai-screenshot-attacher-v0.1.0.zip`
- Confirmed it contains `icons/icon-128.png`.
- Confirmed it does not contain `store-assets/`.

## Privacy And Compliance Documentation

Added `PRIVACY.md`.

It documents:

- Single purpose: attach clipboard screenshots to selected supported AI pages.
- No automatic message sending.
- No screenshot history.
- No chat history reads.
- No analytics, telemetry, account identifiers, or browsing history collection.
- No extension-author server upload.
- Permission explanations for:
  - `clipboardRead`
  - `clipboardWrite`
  - `tabs`
  - `activeTab`
  - `scripting`
  - `storage`
  - `offscreen`
- Host permission boundaries for ChatGPT, Claude, Gemini, and Doubao.
- Automatic mode behavior.
- Contact/reporting route through GitHub.

Added `docs/chrome-web-store-listing.md`.

It provides Chrome Web Store dashboard source material:

- Product name and short name.
- Category recommendation.
- Short description.
- Detailed description.
- Privacy bullet points.
- Supported targets.
- Known limits.
- Asset list.
- Permission justification.
- Reviewer test notes.

## User Onboarding And Support UX

Updated popup UI:

- Added short privacy/control copy under the popup heading.
- Primary action now includes the currently selected default target name.
- Added footer links:
  - Settings.
  - Feedback.
  - Privacy.

Updated options UI:

- Clarified that automatic mode is off by default.
- Added a first-use panel:
  - Copy a screenshot to the clipboard.
  - Use popup or shortcut to attach.
  - Review attachment and prompt before sending.
- Added a privacy and permissions panel:
  - No chat history reads.
  - No screenshot history.
  - No automatic message sending.
  - Clipboard permissions are for image reads, manual Gemini/Doubao paste preparation, and optional failure write-back.
  - Site permissions are limited to supported AI sites.
- Added links:
  - Privacy policy.
  - Shortcut management.
  - Feedback issue form.

Shared constants were added in `src/shared/constants.ts`:

- `PROJECT_URL`
- `SUPPORT_URL`
- `PRIVACY_URL`
- `SHORTCUTS_HELP_URL`

Tests were updated:

- Popup test now covers the default-target button label and feedback link.
- Options test now covers privacy, shortcut, and feedback links.

## Marketing And Store Assets

Created extension package icons:

- `public/icons/icon-16.png`
- `public/icons/icon-32.png`
- `public/icons/icon-48.png`
- `public/icons/icon-128.png`

Created Chrome Web Store assets:

- `store-assets/chrome-web-store/icon-128.png`
- `store-assets/chrome-web-store/small-promo-440x280.png`
- `store-assets/chrome-web-store/screenshot-workflow-1280x800.png`
- `store-assets/chrome-web-store/screenshot-settings-1280x800.png`
- `store-assets/chrome-web-store/screenshot-privacy-1280x800.png`

Source visual files retained for traceability:

- `store-assets/chrome-web-store/source-gpt-image-2-workflow.png`
- `store-assets/chrome-web-store/source-gpt-image-2-icon.png`

Important note about image generation:

- The user requested image2 for image generation.
- The local imagegen CLI `gpt-image-2` path requires `OPENAI_API_KEY`.
- `OPENAI_API_KEY` was not configured in the environment, so the final visual bases were generated through the available built-in image generation path and then copied into the workspace.
- Local post-processing was used only for resizing, cropping, and text/layout composition.

Validated asset dimensions:

- `public/icons/icon-16.png`: 16x16
- `public/icons/icon-32.png`: 32x32
- `public/icons/icon-48.png`: 48x48
- `public/icons/icon-128.png`: 128x128
- `small-promo-440x280.png`: 440x280
- Each store screenshot: 1280x800

## Documentation Updates

Updated `README.md`:

- Added a workflow image.
- Added a target-user section.
- Linked `PRIVACY.md`.
- Linked release checklist, Chrome Web Store listing notes, and manual test matrix.
- Added FAQ:
  - Whether the extension sends messages automatically.
  - Whether screenshots are saved.
  - Why clipboard permissions are needed.
  - Where to report broken AI-site adapters.

Updated `docs/manual-test-matrix.md`:

- Added public-promotion checklist references.
- Added manual checks for popup feedback/privacy links and options onboarding/privacy/support explanations.

Added `docs/release-checklist.md`:

- Pre-release command checklist.
- Manual browser validation checklist.
- Chrome Web Store submission checklist.
- Rollback metadata.

Added `docs/pre-promotion-backup.md`:

- Backup tag.
- Commit.
- Source archive.
- Restore note.
- Clarification that backup excludes ignored local/build/browser-profile data.

Updated `CHANGELOG.md`:

- Added an Unreleased entry for promotion-readiness assets, Chrome Web Store listing notes, privacy policy, release checklist, and onboarding/support links.

## Validation Performed

Commands run successfully:

```powershell
npm run verify
npm run package
npm audit --omit=dev
```

`npm run verify` included:

- TypeScript typecheck.
- ESLint with max warnings set to zero.
- Prettier check.
- Vitest test run.
- Production build.

Latest successful test result:

- Test files: 6 passed.
- Tests: 20 passed.

`npm run package` generated:

- `release/ai-screenshot-attacher-v0.1.0.zip`

Zip inspection confirmed:

- Icons are included in the extension package.
- `store-assets/` is not included in the extension package.

`npm audit --omit=dev` result:

- 0 production vulnerabilities found.

## Manual Work Still Required

Manual browser testing remains incomplete because project constraints prohibit automated Chrome/extension manipulation.

A human should manually:

1. Load `dist/` from `chrome://extensions` or `edge://extensions`.
2. Run the scenarios in `docs/manual-test-matrix.md`.
3. Confirm manual attach on:
   - ChatGPT
   - Claude
   - Gemini
   - Doubao
4. Confirm automatic mode behavior.
5. Confirm failure fallback keeps screenshots available for manual paste.
6. Confirm no AI message is sent automatically.
7. Confirm popup and options links behave as expected in a real browser.

Do not start Chrome with command-line extension flags for this validation.

## Current Expected Git State

The promotion implementation leaves uncommitted changes in the working tree. Expected changed or added areas include:

- `manifest.json`
- `README.md`
- `CHANGELOG.md`
- `PRIVACY.md`
- `docs/`
- `public/icons/`
- `store-assets/chrome-web-store/`
- `src/popup/`
- `src/options/`
- `src/shared/constants.ts`
- `tests/popup/`
- `tests/options/`

If a future agent continues from this state, it should not revert these changes unless the user explicitly requests rollback or a different implementation direction.

## Suggested Next Steps

1. Perform the manual browser matrix.
2. Review store screenshots and listing copy for tone and brand fit.
3. Stage and commit the promotion-readiness changes if the user wants to preserve them in Git.
4. Push the backup tag and promotion commit if publishing through GitHub.
5. Upload `release/ai-screenshot-attacher-v0.1.0.zip` to the Chrome Web Store dashboard with listing text and assets from the new docs.
