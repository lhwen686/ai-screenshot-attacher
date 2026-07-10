import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const pages = [
  ['docs/index.html', 'AI Screenshot Attacher', '截图'],
  ['docs/privacy/index.html', 'Privacy policy', '隐私'],
  ['docs/support/index.html', 'GitHub Issues', '支持'],
  ['docs/faq/index.html', 'Why are clipboard permissions needed?', '为什么需要剪贴板权限']
];

let hasFailure = false;

for (const [pagePath, englishText, chineseText] of pages) {
  const absolutePath = resolve(pagePath);
  const html = readFileSync(absolutePath, 'utf8');
  const scriptBlocks = html.match(/<script\b[\s\S]*?<\/script>/gi) ?? [];
  const scriptSources = html.match(/<script\b[^>]*\bsrc=/gi) ?? [];
  const localLinks = [...html.matchAll(/\b(?:href|src)="([^"]+)"/gi)]
    .map((match) => match[1])
    .filter((href) => !/^(?:https?:|mailto:|#)/i.test(href));
  const linksOk = localLinks.every((href) => {
    let targetPath = resolve(dirname(absolutePath), href);
    if (href.endsWith('/') || !/\.[a-z0-9]+$/i.test(targetPath)) {
      targetPath = resolve(targetPath, 'index.html');
    }

    return existsSync(targetPath);
  });
  const analyticsPattern = /google-analytics|gtag|plausible|posthog|segment|analytics\.js/i;
  const checks = [
    ['english', html.includes(englishText)],
    ['simplified-chinese', html.includes(chineseText)],
    ['local-links', linksOk],
    ['no-scripts', scriptBlocks.length === 0 && scriptSources.length === 0],
    [
      'no-analytics',
      !analyticsPattern.test(scriptBlocks.join('\n')) && !analyticsPattern.test(scriptSources.join('\n'))
    ]
  ];

  for (const [label, ok] of checks) {
    if (!ok) {
      hasFailure = true;
    }

    console.log(`${ok ? 'OK' : 'FAIL'} ${pagePath} ${label}`);
  }
}

if (hasFailure) {
  process.exitCode = 1;
}
