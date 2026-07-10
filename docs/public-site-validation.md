# Public Site Validation

The public website pages are static files intended for GitHub Pages publishing from the repository `docs/` folder.

Public URLs for store submission:

- Home: `https://lhwen686.github.io/ai-screenshot-attacher/`
- Privacy: `https://lhwen686.github.io/ai-screenshot-attacher/privacy/`
- Support: `https://lhwen686.github.io/ai-screenshot-attacher/support/`
- FAQ: `https://lhwen686.github.io/ai-screenshot-attacher/faq/`

Validation command:

```bash
node scripts/validate-public-site.mjs
```

Latest local validation result, run on 2026-07-10:

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
