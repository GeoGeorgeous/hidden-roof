// Test of the page's search and sharing text in Node: the descriptions agree, the url is one everywhere,
// the structured data parses and names the site, the project and social links of src/links.ts, the one definition is word for word everywhere, and index.html keeps its one
// bare <script> (the CSP allows one, vite.config.ts).
// Usage: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('index.html');
const links = Object.fromEntries([...read('src/links.ts').matchAll(/export const (\w+) = '([^']+)'/g)].map((m) => [m[1], m[2]]));
const SOCIAL = ['REPO', 'DISCORD', 'YOUTUBE', 'INSTAGRAM', 'TIKTOK'];
for (const name of ['AUTHOR', ...SOCIAL]) assert.ok(links[name], `src/links.ts: no ${name}`);

// Tags outside the comments.
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
assert.equal(`${links.SITE}/`, url, 'src/links.ts: SITE is the canonical address');
assert.equal(tag(/<meta property="og:url" content="([^"]+)"/), url);
assert.equal(read('public/sitemap.xml').match(/<loc>([^<]+)<\/loc>/)?.[1], url);
assert.equal(read('public/robots.txt').match(/^Sitemap: (\S+)/m)?.[1], new URL('sitemap.xml', url).href);

// The site (its name in search results: WebSite's, not og:site_name's) and the game, in one graph.
const graph = JSON.parse(tag(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/))['@graph'];
const node = (type) => graph.find((n) => [n['@type']].flat().includes(type));
const site = node('WebSite');
assert.equal(site.url, url);
assert.equal(site.name, tag(/<meta property="og:site_name" content="([^"]+)"/));
const ld = node('VideoGame');
assert.equal(ld.url, url);
assert.equal(ld.author.url, links.AUTHOR);
assert.deepEqual(ld.sameAs, SOCIAL.map((name) => links[name]));
// The page about the game is what a phone, Google's phone crawler and every crawler without JavaScript read: the
// page's one h1 is its title, and it says the one definition of the game, word for word as the structured data and
// llms.txt do. Nothing in it is hidden by markup (only html.game hides it, where the game loads).
const about = live.match(/<main class="about">[\s\S]*?<\/main>/)?.[0];
assert.ok(about, 'index.html: no <main class="about">');
assert.equal(live.match(/<h1[\s>]/g)?.length, 1, 'index.html: one h1');
assert.match(about, /<h1>[^<]+<\/h1>/);
assert.ok(!/<main[^>]*\shidden/.test(live), 'index.html: the page about the game is not hidden');
const definition = ld.description;
assert.match(definition, /^Hidden Roof is /);
assert.ok(about.includes(definition), 'index.html: the page about the game says the definition');
assert.ok(read('public/llms.txt').includes(`> ${definition}`), 'public/llms.txt: the definition as its summary');

assert.equal(html.replace(/<!--[\s\S]*?-->/g, '').match(/<script>/g)?.length, 1, 'index.html: one bare <script>');

// Every project link in the page about the game and in llms.txt is one of links.ts's, and each of them is there.
const project = [links.AUTHOR, ...SOCIAL.map((name) => links[name])];
const mine = (text) => text.match(/https?:\/\/(?:github\.com\/GeoGeorgeous|discord\.gg|(?:www\.)?(?:youtube|instagram|tiktok)\.com)[^\s"')<]*/g) ?? [];
for (const [file, text] of [['index.html <main class="about">', about], ['public/llms.txt', read('public/llms.txt')]]) {
  const found = mine(text);
  assert.deepEqual([...new Set(found)].sort(), [...project].sort(), `${file}: the project links`);
}
console.log('seo: ok (descriptions, url, structured data, the page about the game, the definition and project links agree)');
