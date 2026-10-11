// The release notes (docs/releases, format and rules in docs/releases/AGENTS.md):
// each parses, follows the rules a script can check, has its picture, and the
// version in package.json has its note.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { body, githubNotes, newestFirst, parseRelease } from '../src/release-notes.ts';

const dir = 'docs/releases';
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const MAX_PICTURE = 300 * 1024;
const MAX_TEXT = 1800; // fits a Discord message (2000) with its title and link

/** A WebP's canvas size, from its VP8X header (the extended format a browser writes). */
function webpSize(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('ascii', 0, 4) + b.toString('ascii', 8, 16), 'RIFFWEBPVP8X', `${file}: not an extended WebP`);
  return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3), b.length];
}

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
  const [w, h, size] = webpSize(`public/updates/${tag}.webp`);
  assert.ok(w === 1280 && h === 720 && size <= MAX_PICTURE, `public/updates/${tag}.webp: ${w}×${h}, ${size} bytes; want 1280×720, at most ${MAX_PICTURE}`);
  const github = githubNotes(tag, md, 'URL');
  assert.ok(github.startsWith(`# Hidden Roof ${tag.slice(1)}\n\n${text.trim().slice(0, 20)}`) && github.includes('src="URL"'), `${at}: renders for GitHub`);
  releases.push(r);
}
assert.ok(files.includes(`v${pkg.version}.md`), `package.json's version ${pkg.version} has its note`);
const sorted = [...releases].sort(newestFirst);
for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i - 1].date >= sorted[i].date, `${sorted[i - 1].tag} is dated on or after ${sorted[i].tag}`);
console.log(`release notes: ${files.length} ok`);
