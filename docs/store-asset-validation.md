# Store Asset Validation

0.2.0 content status: `marquee-promo-1400x560.png` is the only asset that names the supported targets. On 2026-10-27 its "Supported targets" chips were redrawn to list ChatGPT, Claude, Gemini, Doubao, and Grok. The other images name no target list: the shortcuts screenshot shows only the default shortcuts (default target, ChatGPT, Claude, Gemini), which 0.2.0 keeps, and the workflow images use generic icons. If Grok fails live acceptance, restore the four-chip marquee from git history before submitting.

How the marquee chips were redrawn, for the next target change:

- Background: `source-gpt-image-2-workflow.png` scaled to 1400 px wide, cropped from y=159, then blended 50% toward white. This reproduces the original chip area to within one color level.
- Chips: 124×46 px white pills with a 2 px `#CBD5E1` border and Segoe UI Bold 16 px `#1F2937` labels; rows start at y=177.5 and y=269.5, columns at x=759.5 with 16 px gaps.
- Only the box from (752, 168) to (1240, 324) changed; the title, arrow, card, and edges keep their original pixels.

Validation command:

```bash
node scripts/validate-store-assets.mjs
```

Latest dimension validation result, run on 2026-10-27:

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
