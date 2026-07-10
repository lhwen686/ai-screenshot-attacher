import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const distDir = resolve(projectRoot, 'dist');
const runtimeResources = ['src/offscreen/offscreen.html', 'src/content/attachRuntime.js'];
const errors = new Set();

const simulatedMissing = parseSimulatedMissing(process.argv.slice(2));
const { files, symlinks } = await collectFiles(distDir);
const visibleFiles = files.filter((file) => file !== simulatedMissing);
const fileSet = new Set(visibleFiles);

for (const symlink of symlinks) {
  errors.add(`${symlink}: symbolic links are not allowed`);
}

validatePackagePaths(visibleFiles);

if (!fileSet.has('manifest.json')) {
  errors.add('manifest.json: required file is missing');
} else {
  await validateManifestAndReferences();
  await validateBuiltResources();
}

if (errors.size > 0) {
  console.error(`Extension package validation failed (${errors.size} issue(s)):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Extension package validation passed: ${visibleFiles.length} files checked in ${distDir}`);
}

function parseSimulatedMissing(arguments_) {
  if (arguments_.length === 0) {
    return undefined;
  }

  if (arguments_.length !== 2 || arguments_[0] !== '--simulate-missing') {
    throw new Error('Usage: node scripts/validate-extension-package.mjs [--simulate-missing <package-path>]');
  }

  return normalizePackagePath(arguments_[1]);
}

async function collectFiles(directory, prefix = '') {
  const files = [];
  const symlinks = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const packagePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) {
      symlinks.push(packagePath);
    } else if (entry.isDirectory()) {
      const nested = await collectFiles(resolve(directory, entry.name), packagePath);
      files.push(...nested.files);
      symlinks.push(...nested.symlinks);
    } else if (entry.isFile()) {
      files.push(packagePath);
    }
  }

  return { files, symlinks };
}

function validatePackagePaths(packageFiles) {
  const lowerCasePaths = new Map();

  for (const packagePath of packageFiles) {
    try {
      if (normalizePackagePath(packagePath) !== packagePath) {
        errors.add(`${packagePath}: package path is not normalized`);
      }
    } catch (error) {
      errors.add(`${packagePath}: ${formatError(error)}`);
    }

    const lowerPath = packagePath.toLowerCase();
    const previous = lowerCasePaths.get(lowerPath);
    if (previous && previous !== packagePath) {
      errors.add(`${packagePath}: case-insensitive duplicate of ${previous}`);
    }
    lowerCasePaths.set(lowerPath, packagePath);

    const segments = lowerPath.split('/');
    if (segments.includes('node_modules') || segments.includes('store-assets')) {
      errors.add(`${packagePath}: forbidden directory`);
    }
    if (/\.(?:map|ts|tsx)$/i.test(packagePath)) {
      errors.add(`${packagePath}: forbidden build/source artifact`);
    }
  }
}

async function validateManifestAndReferences() {
  const distManifestText = await readPackageText('manifest.json');
  const sourceManifestText = await readFile(resolve(projectRoot, 'manifest.json'), 'utf8');
  const packageJson = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'));
  let manifest;

  try {
    manifest = JSON.parse(distManifestText);
  } catch (error) {
    errors.add(`manifest.json: invalid JSON (${formatError(error)})`);
    return;
  }

  if (distManifestText !== sourceManifestText) {
    errors.add('manifest.json: dist copy differs from the source manifest');
  }
  if (manifest.manifest_version !== 3) {
    errors.add(`manifest.json: expected manifest_version 3, received ${manifest.manifest_version}`);
  }
  if (manifest.version !== packageJson.version) {
    errors.add(`version mismatch: manifest=${manifest.version}, package=${packageJson.version}`);
  }
  if (!/^\d+$/.test(manifest.minimum_chrome_version ?? '') || Number(manifest.minimum_chrome_version) < 109) {
    errors.add('manifest.json: minimum_chrome_version must be at least 109');
  }

  const manifestReferences = [
    ...Object.values(manifest.icons ?? {}),
    ...Object.values(manifest.action?.default_icon ?? {}),
    manifest.action?.default_popup,
    manifest.options_page,
    manifest.background?.service_worker
  ].filter(Boolean);

  for (const reference of manifestReferences) {
    checkLocalReference('manifest.json', String(reference));
  }

  const serviceWorkerPath = manifest.background?.service_worker;
  const serviceWorkerSource =
    typeof serviceWorkerPath === 'string' && fileSet.has(serviceWorkerPath)
      ? await readPackageText(serviceWorkerPath)
      : '';

  for (const resource of runtimeResources) {
    if (!fileSet.has(resource)) {
      errors.add(`${resource}: required runtime resource is missing`);
    } else if (!serviceWorkerSource.includes(resource)) {
      errors.add(`${resource}: service worker no longer references this runtime resource`);
    }
  }
}

async function validateBuiltResources() {
  for (const packagePath of visibleFiles) {
    if (!/\.(?:html|css|js)$/i.test(packagePath)) {
      continue;
    }

    const source = await readPackageText(packagePath);
    if (/sourceMappingURL=/i.test(source)) {
      errors.add(`${packagePath}: source map reference is forbidden`);
    }

    if (packagePath.endsWith('.html')) {
      validateHtml(packagePath, source);
    } else if (packagePath.endsWith('.css')) {
      validateCss(packagePath, source);
    } else {
      validateJavaScript(packagePath, source);
    }
  }
}

function validateHtml(packagePath, source) {
  for (const match of source.matchAll(/<(script|link)\b[^>]*?\b(?:src|href)\s*=\s*(["'])(.*?)\2/gi)) {
    const [, tagName, , reference] = match;
    const resolved = resolveReference(packagePath, reference);
    if (resolved.external) {
      errors.add(`${packagePath}: external ${tagName.toLowerCase()} resource is forbidden (${reference})`);
    } else {
      checkResolvedReference(packagePath, resolved.path);
    }
  }

  for (const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/i.test(match[1]) && match[2].trim()) {
      errors.add(`${packagePath}: inline JavaScript is forbidden`);
    }
  }
}

function validateCss(packagePath, source) {
  const references = [
    ...source.matchAll(/url\(\s*(?:["']([^"']+)["']|([^)'"\s]+))\s*\)/gi),
    ...source.matchAll(/@import\s+["']([^"']+)["']/gi)
  ].map((match) => match[1] ?? match[2]);

  for (const reference of references) {
    const resolved = resolveReference(packagePath, reference);
    if (!resolved.external) {
      checkResolvedReference(packagePath, resolved.path);
    } else if (!reference.startsWith('data:')) {
      errors.add(`${packagePath}: external CSS resource is forbidden (${reference})`);
    }
  }
}

function validateJavaScript(packagePath, source) {
  const inputType = packagePath === 'src/content/attachRuntime.js' ? 'commonjs' : 'module';
  const syntax = spawnSync(process.execPath, ['--check', `--input-type=${inputType}`], {
    input: source,
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024
  });
  if (syntax.status !== 0 || syntax.error) {
    errors.add(`${packagePath}: JavaScript syntax check failed (${formatError(syntax.error ?? syntax.stderr)})`);
  }

  const references = [
    ...source.matchAll(/\b(?:import|export)\s*(?:[^"'`;]*?\bfrom\s*)?["']([^"']+)["']/g),
    ...source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)
  ].map((match) => match[1]);

  for (const reference of references) {
    const resolved = resolveReference(packagePath, reference);
    if (resolved.external) {
      errors.add(`${packagePath}: external module import is forbidden (${reference})`);
    } else {
      checkResolvedReference(packagePath, resolved.path);
    }
  }
}

function checkLocalReference(originPath, reference) {
  const packagePath = normalizePackagePath(reference);
  checkResolvedReference(originPath, packagePath);
}

function checkResolvedReference(originPath, packagePath) {
  if (!fileSet.has(packagePath)) {
    errors.add(`${originPath}: missing resource ${packagePath}`);
  }
}

function resolveReference(originPath, reference) {
  const trimmed = reference.trim();
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(trimmed)) {
    return { external: true };
  }

  const withoutSuffix = trimmed.split(/[?#]/, 1)[0];
  const decoded = decodeURIComponent(withoutSuffix);
  const joined = decoded.startsWith('/') ? decoded.slice(1) : posix.join(posix.dirname(originPath), decoded);
  return { external: false, path: normalizePackagePath(joined) };
}

function normalizePackagePath(value) {
  if (!value || value.includes('\\') || value.includes('\0') || /^[a-z]:/i.test(value)) {
    throw new Error(`unsafe package path: ${value}`);
  }

  const normalized = posix.normalize(value.replace(/^\.\//, ''));
  if (normalized === '..' || normalized.startsWith('../') || normalized.startsWith('/')) {
    throw new Error(`package path escapes root: ${value}`);
  }
  return normalized;
}

function readPackageText(packagePath) {
  return readFile(resolve(distDir, ...packagePath.split('/')), 'utf8');
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error).trim().split('\n')[0];
}
