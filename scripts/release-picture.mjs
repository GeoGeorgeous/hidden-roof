// A release's picture from a screenshot: cropped to 16:9, scaled to 1280x720 and
// saved as public/updates/<tag>.webp at the best quality within 250 KB, encoded
// by Chromium (no image tools needed). Process: docs/releases/AGENTS.md.
// Usage: node scripts/release-picture.mjs shot.png v1.2.0
import fs from 'node:fs';
import { openTestBrowser } from './test-browser.mjs';

const [src, tag] = process.argv.slice(2);
if (!src || !/^v\d+\.\d+\.\d+$/.test(tag ?? '')) throw new Error('usage: node scripts/release-picture.mjs <png|jpg|webp> vX.Y.Z');
const type = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[src.split('.').pop().toLowerCase()];
const dataUrl = `data:${type};base64,${fs.readFileSync(src).toString('base64')}`;

const MAX = 250 * 1024;
const t = await openTestBrowser('about:blank', { level: null });
const page = await t.browser.newPage();
const { webp, quality, width, height } = await page.evaluate(
  async ({ dataUrl, MAX }) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const canvas = Object.assign(document.createElement('canvas'), { width: 1280, height: 720 });
    const scale = Math.max(1280 / img.width, 720 / img.height);
    const w = 1280 / scale;
    const h = 720 / scale;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (img.width - w) / 2, (img.height - h) / 2, w, h, 0, 0, 1280, 720);
    let quality = 0.9;
    let webp = canvas.toDataURL('image/webp', quality);
    while (webp.length * 0.75 > MAX && quality > 0.4) webp = canvas.toDataURL('image/webp', (quality -= 0.05));
    return { webp, quality, width: img.width, height: img.height };
  },
  { dataUrl, MAX },
);
await t.close();
const out = `public/updates/${tag}.webp`;
fs.writeFileSync(out, Buffer.from(webp.split(',')[1], 'base64'));
console.log(`${out}: from ${width}×${height}, quality ${quality.toFixed(2)}, ${Math.round(fs.statSync(out).size / 1024)} KB`);
