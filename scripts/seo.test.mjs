// Test of the page's search and sharing text in Node: the descriptions agree, the url is one everywhere,
// the structured data parses and names the site, the project and social links of src/links.ts, the one definition is word for word everywhere, and index.html keeps its one
// bare <script> (the CSP allows one, vite.config.ts).
// Usage: npm test
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

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
const about = live.match(/<div class="about">[\s\S]*?(?=<script type="module")/)?.[0];
assert.ok(about, 'index.html: no <div class="about">');
assert.match(about, /<main>[\s\S]*<h1>/, 'index.html: the h1 in the page about the game\'s <main>');
assert.equal(live.match(/<h1[\s>]/g)?.length, 1, 'index.html: one h1');
const h1 = about.match(/<h1>([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, '');
assert.ok(h1, 'index.html: no h1 in the page about the game');
assert.ok(!/<main[^>]*\shidden/.test(live), 'index.html: the page about the game is not hidden');
// Fresh as the last release: its version and day lead Latest updates (docs/releases/AGENTS.md). The structured data's
// dateModified and the sitemap's lastmod the build sets (vite.config.ts; scripts/csp.test.mjs checks the built site).
const releases = readdirSync(new URL('../docs/releases', import.meta.url)).filter((f) => /^v\d+\.\d+\.\d+\.md$/.test(f));
const newest = releases.map((f) => f.slice(1, -3).split('.').map(Number)).sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2])[0];
const released = read(`docs/releases/v${newest.join('.')}.md`).match(/^date: (\S+)/m)[1];
const short = newest[2] ? newest.join('.') : newest.slice(0, 2).join('.');
assert.match(about, new RegExp(`<ul class="updates">\\s*<li><time datetime="${released}">[^<]+</time> <strong><a href="/updates.html#v${newest.join('\\.')}">Hidden Roof ${short.replace(/\./g, '\\.')}</a></strong>`), `index.html: Latest updates starts with ${short} of ${released}`);
const definition = ld.description;
assert.match(definition, /^Hidden Roof is /);
assert.equal(h1, definition, 'index.html: the h1 is the definition');
assert.ok(read('public/llms.txt').includes(`> ${definition}`), 'public/llms.txt: the definition as its summary');

assert.equal(html.replace(/<!--[\s\S]*?-->/g, '').match(/<script>/g)?.length, 1, 'index.html: one bare <script>');

// Every project link in the page about the game and in llms.txt is one of links.ts's, and each of them is there.
const project = [links.AUTHOR, ...SOCIAL.map((name) => links[name])];
const mine = (text) => text.match(/https?:\/\/(?:github\.com\/GeoGeorgeous|discord\.gg|(?:www\.)?(?:youtube|instagram|tiktok)\.com)[^\s"')<]*/g) ?? [];
for (const [file, text] of [['index.html <div class="about">', about], ['public/llms.txt', read('public/llms.txt')]]) {
  const found = mine(text);
  assert.deepEqual([...new Set(found)].sort(), [...project].sort(), `${file}: the project links`);
}
// The tools' icons in Painting & Tools are the server list's (src/net/tool-icons.ts), shape for shape.
const shapes = read('src/net/tool-icons.ts').match(/const SHAPES[^{]*\{([\s\S]*?)\n\};/)?.[1];
assert.ok(shapes, 'src/net/tool-icons.ts: no SHAPES');
for (const [, tool, shape] of shapes.matchAll(/(\w+): '([^']+)'/g)) assert.ok(about.includes(`data-tool="${tool}">${shape}</svg>`), `index.html: the ${tool} icon is src/net/tool-icons.ts's`);

console.log('seo: ok (descriptions, url, structured data, the page about the game, the definition, project links and tool icons agree)');
