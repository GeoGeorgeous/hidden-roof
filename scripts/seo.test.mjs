// Test of the page's search and sharing text in Node: the descriptions agree, the url is one everywhere,
// the structured data parses and names the project links of src/links.ts, and index.html keeps its one
// bare <script> (the CSP allows one, vite.config.ts).
// Usage: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('index.html');
const links = Object.fromEntries([...read('src/links.ts').matchAll(/export const (\w+) = '([^']+)'/g)].map((m) => [m[1], m[2]]));
assert.deepEqual(Object.keys(links).sort(), ['AUTHOR', 'DISCORD', 'REPO'], 'src/links.ts: REPO, AUTHOR and DISCORD');

// Tags outside the comments (the og:image ones wait for the designer's picture).
const live = html.replace(/<!--[\s\S]*?-->/g, '');
const tag = (re) => {
  const m = live.match(re);
  assert.ok(m, `index.html: no ${re}`);
  return m[1];
};
const description = tag(/<meta name="description" content="([^"]+)"/);
assert.equal(tag(/<meta property="og:description" content="([^"]+)"/), description);
assert.equal(tag(/<meta name="twitter:description" content="([^"]+)"/), description);
assert.equal(JSON.parse(read('public/site.webmanifest')).description, description);
const title = tag(/<title>([^<]+)<\/title>/);
assert.equal(tag(/<meta property="og:title" content="([^"]+)"/), title);
assert.equal(tag(/<meta name="twitter:title" content="([^"]+)"/), title);

const url = tag(/<link rel="canonical" href="([^"]+)"/);
assert.equal(tag(/<meta property="og:url" content="([^"]+)"/), url);
assert.equal(read('public/sitemap.xml').match(/<loc>([^<]+)<\/loc>/)?.[1], url);
assert.equal(read('public/robots.txt').match(/^Sitemap: (\S+)/m)?.[1], new URL('sitemap.xml', url).href);

const ld = JSON.parse(tag(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/));
assert.equal(ld.url, url);
assert.equal(ld.author.url, links.AUTHOR);
assert.deepEqual(ld.sameAs, [links.REPO, links.DISCORD]);

assert.equal(html.replace(/<!--[\s\S]*?-->/g, '').match(/<script>/g)?.length, 1, 'index.html: one bare <script>');

// Every project link in the hidden page and in llms.txt is one of links.ts's.
const project = Object.values(links);
const mine = (text) => text.match(/https?:\/\/(?:github\.com\/GeoGeorgeous|discord\.gg)[^\s"')<]*/g) ?? [];
for (const [file, text] of [['index.html <main>', html.match(/<main[\s\S]*?<\/main>/)[0]], ['public/llms.txt', read('public/llms.txt')]]) {
  const found = mine(text);
  assert.deepEqual([...new Set(found)].sort(), [...project].sort(), `${file}: the project links`);
}
console.log('seo: ok (descriptions, url, structured data and project links agree)');
