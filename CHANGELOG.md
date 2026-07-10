# Changelog

All notable project changes should be recorded here.

## Unreleased

- None.

## 0.1.0 - 2026-07-10

- Added engineering tooling for linting, formatting, testing, CI, and release packaging.
- Added Vitest coverage for settings, adapter registry, DOM helpers, command handling, and UI smoke flows.
- Added contribution, security, architecture, manual test, and GitHub workflow documentation.
- Added promotion-readiness assets, Chrome Web Store listing notes, privacy policy, release checklist, asset validation, and clearer onboarding/support links.
- Added static public website pages for store submission: home, privacy, support, and FAQ.
- Fixed offscreen monitor lifecycle races, stale clipboard delivery, navigation-aware tab selection, per-tab attachment concurrency, and storage-failure recovery.
- Added confirmed/rejected/unknown attachment outcomes so adapters stop after an unconfirmed mutation instead of creating duplicate attachments.
- Automatic Gemini and Doubao flows now use the captured screenshot payload rather than later clipboard contents.
- Serialized system-clipboard preparation across tabs, coalesced overlapping same-image work, and prevented extension writes from retriggering automatic mode.
- Scoped attachment-success detection to the composer region and declared Chromium 109 as the minimum supported engine version.
- Added service-worker routing coverage and graceful rejection handling across background messages, lifecycle refreshes, popup requests, and automatic-image delivery acknowledgements.
- Scoped the Doubao and isolated Gemini success detectors so unrelated page activity cannot produce a false attachment confirmation.
- Added a pre-archive extension-package validator for manifest, HTML/CSS/ESM, runtime-resource, forbidden-artifact, version, and JavaScript syntax checks.
- Initial Manifest V3 MVP for attaching clipboard screenshots to ChatGPT, Claude, Gemini, and Doubao.
- Added popup, options page, service worker orchestration, offscreen clipboard document, and adapter-based content runtime.
