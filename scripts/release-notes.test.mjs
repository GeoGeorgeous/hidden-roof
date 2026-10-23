// The release notes (docs/releases, format and rules in docs/releases/AGENTS.md):
// each parses, follows the rules a script can check, has its picture, and the
// version in package.json has its note.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SITE } from '../src/links.ts';
import { body, discordNotes, githubNotes, linkable, newestFirst, parseRelease, splitLinks } from '../src/release-notes.ts';

const dir = 'docs/releases';
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const MAX_PICTURE = 300 * 1024;
const MAX_TEXT = 3000; // Discord gets it in more than one message (release-notes.ts)

/** A WebP's canvas size, from its VP8X header (the extended format a browser writes). */
function webpSize(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('ascii', 0, 4) + b.toString('ascii', 8, 16), 'RIFFWEBPVP8X', `${file}: not an extended WebP`);
  return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3), b.length];
}

// Links: [text](url), a page of the game root-relative, other sites on the allow-list (LINK_SITES).
const fixture = `---
date: 2026-10-09
---
see [Terms](/terms.html) and [Privacy](/privacy.html).

- **support**
  - **ko-fi**: [Ko-fi](https://ko-fi.com/D0Q7296HCP) keeps it going
  - read the [Terms](/terms.html)
`;
const github = githubNotes(fixture, 'URL');
assert.ok(!github.includes('](/') && github.includes('](https://roof.hidden.haus/terms.html)'), 'GitHub: root-relative links made absolute');
const discord = discordNotes('v9.9.9', fixture).join('');
assert.ok(!discord.includes('](/') && !/\]\((?!<)/.test(discord), 'Discord: every link target absolute and wrapped in <>');
assert.ok(discord.includes('[Privacy](<https://roof.hidden.haus/privacy.html>)') && discord.includes('[Ko-fi](<https://ko-fi.com/D0Q7296HCP>)'), 'Discord: the links');
assert.deepEqual(splitLinks('see [Terms](/terms.html) now'), ['see ', { text: 'Terms', href: '/terms.html' }, ' now']);
assert.deepEqual(splitLinks('[x](https://evil.example/a) and [y](//evil.example) and [z](javascript:alert(1))'), ['x', ' and ', 'y', ' and ', 'z', ')'], 'other targets stay text');
assert.ok(linkable('/terms.html') && linkable('https://ko-fi.com/D0Q7296HCP') && !linkable('https://roof.hidden.haus/terms.html') && !linkable('//evil.example') && !linkable('https://ko-fi.com.evil.example'));

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'AGENTS.md');
const releases = [];
for (const file of files) {
  const tag = file.slice(0, -3);
  const md = fs.readFileSync(`${dir}/${file}`, 'utf8');
  const at = `${dir}/${file}`;
  assert.match(tag, /^v\d+\.\d+\.\d+$/, `${at}: named after its tag`);
  const r = parseRelease(tag, md);
  assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/, `${at}: a frontmatter date, YYYY-MM-DD`);
  assert.ok(!Number.isNaN(Date.parse(r.date)), `${at}: a real date`);
  const text = body(md);
  assert.ok(!/<|^#/m.test(text), `${at}: no HTML and no # headings (the title and picture are added where shown)`);
  assert.ok(text.length <= MAX_TEXT, `${at}: ${text.length} characters, at most ${MAX_TEXT}`);
  assert.ok(r.intro, `${at}: an intro`);
  assert.ok(r.items.length, `${at}: at least one item`);
  for (const s of [r.intro, ...r.items.map((it) => it.text).filter(Boolean)]) assert.match(s, /[.!?]$/, `${at}: "${s}" ends its sentence`);
  for (const it of r.items) {
    assert.ok(it.title === it.title.toLowerCase() && it.title.split(' ').length <= 3, `${at}: "${it.title}" is lowercase, 1-3 words`);
    for (const [term, desc] of it.list) assert.ok(!/[.,;:]$/.test(desc), `${at}: list line "${term || desc}" ends without punctuation`);
  }
  for (const m of text.matchAll(/\[([^\]]*)\]\(([^)]*)\)/g)) {
    assert.ok(m[1].trim(), `${at}: link ${m[0]} has text`);
    assert.ok(linkable(m[2]), `${at}: link ${m[0]} leads to a page of the game (/terms.html) or an allowed site, not ${SITE}`);
  }
  const [w, h, size] = webpSize(`public/updates/${tag}.webp`);
  assert.ok(w === 1280 && h === 720 && size <= MAX_PICTURE, `public/updates/${tag}.webp: ${w}×${h}, ${size} bytes; want 1280×720, at most ${MAX_PICTURE}`);
  const github = githubNotes(md, 'URL');
  assert.ok(github.startsWith(text.trim().slice(0, 20)) && github.includes('src="URL"'), `${at}: renders for GitHub`);
  assert.ok(discordNotes(tag, md).every((m) => m.length <= 2000), `${at}: each Discord message fits 2000 characters`);
  releases.push(r);
}
assert.ok(files.includes(`v${pkg.version}.md`), `package.json's version ${pkg.version} has its note`);
const sorted = [...releases].sort(newestFirst);
for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i - 1].date >= sorted[i].date, `${sorted[i - 1].tag} is dated on or after ${sorted[i].tag}`);
console.log(`release notes: ${files.length} ok`);
