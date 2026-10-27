// Renders every promo video and cover into out/. Run with `npm run render`; see README.md.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VIDEOS = [
  ['promo-zh-CN', 'promo-zh-CN-1920x1080.mp4'],
  ['promo-en', 'promo-en-1920x1080.mp4'],
  ['short-zh-CN', 'short-zh-CN-1080x1920.mp4'],
  ['short-en', 'short-en-1080x1920.mp4']
];

const STILLS = [
  ['thumbnail-youtube-en', 'thumbnail-youtube-en-1280x720.jpg'],
  ['thumbnail-youtube-zh-CN', 'thumbnail-youtube-zh-CN-1280x720.jpg'],
  ['cover-bilibili-4x3-zh-CN', 'cover-bilibili-zh-CN-1200x900.jpg'],
  ['cover-bilibili-16x9-zh-CN', 'cover-bilibili-zh-CN-1920x1080.jpg'],
  ['cover-vertical-zh-CN', 'cover-vertical-zh-CN-1080x1920.jpg'],
  ['cover-vertical-en', 'cover-vertical-en-1080x1920.jpg']
];

const only = process.argv.slice(2);
const wanted = (id) => only.length === 0 || only.includes(id);
const cli = fileURLToPath(new URL('node_modules/@remotion/cli/remotion-cli.js', import.meta.url));
const remotion = (args) => execFileSync(process.execPath, [cli, ...args], { stdio: 'inherit' });

for (const [id, file] of STILLS.filter(([id]) => wanted(id))) {
  // JPEG keeps the YouTube thumbnail well under its 2 MB limit.
  remotion(['still', id, `out/covers/${file}`, '--image-format=jpeg', '--jpeg-quality=92']);
}

for (const [id, file] of VIDEOS.filter(([id]) => wanted(id))) {
  // A silent audio track, because some upload pages warn about videos without one.
  remotion(['render', id, `out/${file}`, '--codec=h264', '--crf=16', '--x264-preset=slow', '--enforce-audio-track']);
}
