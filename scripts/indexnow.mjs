// Tells the IndexNow search engines (Bing, Yandex, Naver, Seznam; not Google) that the site's pages changed: once
// after each deploy (docs/releases/AGENTS.md). The urls are the live sitemap's; the key is public/<key>.txt, and
// the engines fetch it from the site to check the ping is the site's, so it must be deployed first.
// Usage: node scripts/indexnow.mjs [--dry] (--dry: shows the ping, doesn't send it)
import { readdirSync, readFileSync } from 'node:fs';
import { SITE } from '../src/links.ts';

const file = readdirSync('public').find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!file) throw new Error('no IndexNow key in public/ (<32 hex>.txt)');
const key = readFileSync(`public/${file}`, 'utf8').trim();
const keyLocation = `${SITE}/${file}`;
const live = await fetch(keyLocation).then((r) => (r.ok ? r.text() : ''));
if (live.trim() !== key) throw new Error(`${keyLocation} doesn't serve the key: deploy first`);
const sitemap = await fetch(`${SITE}/sitemap.xml`).then((r) => r.text());
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const ping = { host: new URL(SITE).host, key, keyLocation, urlList };
if (process.argv.includes('--dry')) {
  console.log(JSON.stringify(ping, null, 2));
} else {
  const res = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(ping) });
  // 200 and 202 are taken; anything else says why (403 the key, 422 the urls, 429 too often).
  console.log(`IndexNow: ${res.status} for ${urlList.length} urls${res.ok ? '' : `: ${await res.text()}`}`);
  if (!res.ok) process.exitCode = 1;
}
