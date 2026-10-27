# Microsoft Edge Add-ons Submission Packet

Status: 0.2.0 ready to submit; no open blockers.

## Before Submitting

- Signed-in acceptance is complete: the full Grok checklist, plus one attachment each on Gemini and ChatGPT (re-tested after the composer-scope fix), on 2026-10-27. See `docs/audit-2026-10-27.md`.
- 0.2.0 is merged into `main`, which publishes the public website and privacy policy from `main:/docs`.

## Package

- Package path: `release/ai-screenshot-attacher-v0.2.0.zip`, the same ZIP as the Chrome Web Store.
- Version: `0.2.0`; minimum engine: Chromium 109-compatible Microsoft Edge.
- The package has English (default) and Simplified Chinese messages, so Partner Center offers a listing for each language.
- Submission action: Do not submit from this packet automatically.

## Store Listing

Use the descriptions from `docs/chrome-web-store-listing.md` (English listing and 简体中文商店信息) for the matching Edge languages.

| Field                          | Value                                                                   |
| ------------------------------ | ----------------------------------------------------------------------- |
| Extension Store logo (300×300) | `store-assets/edge/logo-300x300.png`                                    |
| Small promotional tile         | `store-assets/chrome-web-store/<locale>/small-promo-440x280.png`        |
| Large promotional tile         | `store-assets/chrome-web-store/<locale>/marquee-promo-1400x560.png`     |
| Screenshots (1280×800)         | `store-assets/chrome-web-store/<locale>/screenshot-1` to `screenshot-5` |
| Search terms (English)         | screenshot, clipboard, ChatGPT, Claude, Gemini, AI chat, paste image    |
| Search terms (Chinese)         | 截图, 剪贴板, ChatGPT, 豆包, AI 对话, 粘贴图片, Gemini                  |
| Category                       | Productivity                                                            |

`<locale>` is `en` or `zh_CN`.

## Properties

- Privacy policy URL: `https://lhw686.me/ai-screenshot-attacher/privacy/`
- Website URL: `https://lhw686.me/ai-screenshot-attacher/`
- Support contact: `https://lhw686.me/ai-screenshot-attacher/support/`

Reachability status as of 2026-10-27: all four public URLs return `200` over HTTPS. GitHub Pages publishes `main:/docs`, and since the 0.2.0 merge the site lists all five targets.

## Notes for Certification

Use the test instructions and permission justifications from `docs/chrome-web-store-listing.md`; Edge certification reviews the same behavior.

Do not test by launching a browser with extension command-line flags. Load the unpacked `dist/` folder manually through the browser extensions page if manual unpacked testing is needed.
