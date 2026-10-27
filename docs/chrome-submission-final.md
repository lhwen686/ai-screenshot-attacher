# Chrome Web Store Submission Packet

Status: 0.2.0 ready to submit; no open blockers.

## Before Submitting

- Signed-in acceptance is complete: the full Grok checklist, plus one attachment each on Gemini and ChatGPT (re-tested after the composer-scope fix), on 2026-10-27. See `docs/audit-2026-10-27.md`.
- 0.2.0 is merged into `main`, which publishes the public website and privacy policy from `main:/docs`.
- The remaining steps are at the top of `docs/chrome-web-store-listing.md`: the developer account, the verification commands, and the upload.

## Where Everything Is

| Item                                                              | Location                                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Text for every dashboard field, in English and Simplified Chinese | `docs/chrome-web-store-listing.md`                                             |
| Package                                                           | `release/ai-screenshot-attacher-v0.2.0.zip` (`npm run package`)                |
| Store icon                                                        | `store-assets/chrome-web-store/icon-128.png`                                   |
| Screenshots and promo tiles                                       | `store-assets/chrome-web-store/en/` and `store-assets/chrome-web-store/zh_CN/` |
| Permission audit with code references                             | `marketing/store-listing/permission-justifications.md`                         |
| Image sources and how to regenerate them                          | `store-assets/source/README.md`                                                |

## Package

- Version: `0.2.0`; minimum Chrome version 109.
- Localized name and summary come from `public/_locales/en` (default) and `public/_locales/zh_CN`, so the dashboard shows an English and a Simplified Chinese listing.
- Submission action: Do not submit from this packet automatically.

## Public URL Fields

- Home URL: `https://lhw686.me/ai-screenshot-attacher/`
- Privacy URL: `https://lhw686.me/ai-screenshot-attacher/privacy/`
- Support URL: `https://lhw686.me/ai-screenshot-attacher/support/`
- FAQ URL: `https://lhw686.me/ai-screenshot-attacher/faq/`

Reachability status as of 2026-10-27: all four URLs return `200` over HTTPS. GitHub Pages publishes `main:/docs`, and since the 0.2.0 merge the site lists all five targets.

Do not test by launching Chrome with extension command-line flags. Load the unpacked `dist/` folder manually through the browser extensions page if manual unpacked testing is needed.
