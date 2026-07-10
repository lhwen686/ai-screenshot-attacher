# Store Asset Validation

Validation command:

```bash
node scripts/validate-store-assets.mjs
```

Latest result, run on 2026-07-10:

```text
OK store-assets/chrome-web-store/icon-128.png 128x128 expected 128x128
OK store-assets/chrome-web-store/small-promo-440x280.png 440x280 expected 440x280
OK store-assets/chrome-web-store/marquee-promo-1400x560.png 1400x560 expected 1400x560
OK store-assets/chrome-web-store/screenshot-workflow-1280x800.png 1280x800 expected 1280x800
OK store-assets/chrome-web-store/screenshot-settings-1280x800.png 1280x800 expected 1280x800
OK store-assets/chrome-web-store/screenshot-privacy-1280x800.png 1280x800 expected 1280x800
OK store-assets/chrome-web-store/screenshot-shortcuts-1280x800.png 1280x800 expected 1280x800
OK store-assets/chrome-web-store/screenshot-fallback-1280x800.png 1280x800 expected 1280x800
```

Content review notes:

- Screenshots describe supported workflows only: manual attach, settings, privacy boundaries, shortcuts, and fallback/manual paste.
- Text is short and readable at the target sizes.
- No third-party AI company logos are included.
- No asset claims support for every AI site or fully private uploads.
