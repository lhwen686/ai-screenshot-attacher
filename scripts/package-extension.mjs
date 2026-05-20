import { ZipArchive } from 'archiver';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const distDir = join(rootDir, 'dist');
const releaseDir = join(rootDir, 'release');
const packageJsonPath = join(rootDir, 'package.json');
const manifestPath = join(rootDir, 'manifest.json');

const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

if (packageJson.version !== manifest.version) {
  throw new Error(`Version mismatch: package.json=${packageJson.version}, manifest.json=${manifest.version}`);
}

if (!existsSync(distDir)) {
  throw new Error('Missing dist/. Run npm run build before npm run package.');
}

await mkdir(releaseDir, { recursive: true });

const zipPath = join(releaseDir, `${packageJson.name}-v${packageJson.version}.zip`);
const output = createWriteStream(zipPath);
const archive = new ZipArchive({ zlib: { level: 9 } });

const done = new Promise((resolveDone, rejectDone) => {
  output.on('close', resolveDone);
  output.on('error', rejectDone);
  archive.on('error', rejectDone);
});

archive.pipe(output);
archive.directory(distDir, false);
await archive.finalize();
await done;

console.log(`Created ${basename(zipPath)} (${archive.pointer()} bytes)`);
