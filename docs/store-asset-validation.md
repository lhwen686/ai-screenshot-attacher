# Store Asset Validation

The 0.2.0 store images were rebuilt on 2026-10-27 in English and Simplified Chinese. The screenshots show the real popup and settings page, rendered from the extension source with demo data, and list all five targets. How to regenerate them: `store-assets/source/README.md`.

| Location                                     | Contents                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `store-assets/chrome-web-store/icon-128.png` | Store icon, 128×128 (transparency allowed)                                                    |
| `store-assets/chrome-web-store/en/`          | Five 1280×800 screenshots, the 440×280 small promo tile, and the 1400×560 marquee, in English |
| `store-assets/chrome-web-store/zh_CN/`       | The same seven images in Simplified Chinese                                                   |
| `store-assets/edge/logo-300x300.png`         | Microsoft Edge Add-ons store logo, 300×300, derived from `source-gpt-image-2-icon.png`        |

Validation command:

```bash
node scripts/validate-store-assets.mjs
```

The validator checks each file's dimensions and that screenshots and promo tiles are 24-bit PNGs without an alpha channel, as the Chrome Web Store requires. Latest result, run on 2026-10-27: all 16 images OK.

Content review notes:

- The five screenshots cover the overview, the popup, automatic mode, keyboard shortcuts, and privacy boundaries.
- Interface text in the screenshots comes from the same `_locales` messages the extension ships, so each language matches what users see.
- No third-party AI company logos are included; target sites are named in text only, and the chat window is a generic mock.
- No image claims support for every AI site, automatic sending, or fully private uploads.
