# Public Site Validation

The public website pages are static files under the repository `docs/` folder. Since 2026-10-27, GitHub Pages publishes them from `main:/docs`, so the hosted pages show whatever is on `main`.

Public URLs for store submission:

- Home: `https://lhw686.me/ai-screenshot-attacher/`
- Privacy: `https://lhw686.me/ai-screenshot-attacher/privacy/`
- Support: `https://lhw686.me/ai-screenshot-attacher/support/`
- FAQ: `https://lhw686.me/ai-screenshot-attacher/faq/`

The account's user site (`lhwen686.github.io`) uses the custom domain `lhw686.me`, so GitHub serves this project's pages under it. The `https://lhwen686.github.io/ai-screenshot-attacher/...` addresses still work, but they redirect to plain `http://lhw686.me/...` because the user site does not enforce HTTPS. Use the HTTPS addresses above in store dashboards.

Validation command:

```bash
node scripts/validate-public-site.mjs
```

Latest local validation result, run on 2026-10-27:

```text
OK docs/index.html english
OK docs/index.html simplified-chinese
OK docs/index.html local-links
OK docs/index.html no-scripts
OK docs/index.html no-analytics
OK docs/privacy/index.html english
OK docs/privacy/index.html simplified-chinese
OK docs/privacy/index.html local-links
OK docs/privacy/index.html no-scripts
OK docs/privacy/index.html no-analytics
OK docs/support/index.html english
OK docs/support/index.html simplified-chinese
OK docs/support/index.html local-links
OK docs/support/index.html no-scripts
OK docs/support/index.html no-analytics
OK docs/faq/index.html english
OK docs/faq/index.html simplified-chinese
OK docs/faq/index.html local-links
OK docs/faq/index.html no-scripts
OK docs/faq/index.html no-analytics
```

No analytics scripts are included. If analytics are added later, they must be opt-in and disclosed on the privacy page.

## Hosted URL Check

Earlier on 2026-10-27 all four public URLs returned `404` because GitHub Pages had never been enabled for the repository. Pages was then enabled with source `main:/docs`, and the first build finished successfully. Requests made after that build returned:

| Address                                                                     | Result                                                        |
| --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| The four HTTPS addresses above, plus `assets/site.css`                      | `200`, no redirect                                            |
| `https://lhwen686.github.io/ai-screenshot-attacher/` and its three subpages | `301` to `http://lhw686.me/ai-screenshot-attacher/...`, `200` |

Until the 0.2.0 branch is merged, the hosted pages show the `main` text, which lists four targets.

The extension's privacy button opens `https://github.com/lhwen686/ai-screenshot-attacher/blob/main/PRIVACY.md`. That link does not depend on the personal domain, so it stays even though the website is now published.
