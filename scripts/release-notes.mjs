// Prints a release's GitHub notes from docs/releases/<tag>.md, its picture
// linked from the repo at that tag (or at `ref`, for a release whose tag
// predates its picture); a patch without one has none. Process: docs/releases/AGENTS.md.
// Usage: node scripts/release-notes.mjs v1.2.0 [ref] > notes.md
import fs from 'node:fs';
import { REPO, githubNotes } from '../src/release-notes.ts';

const [tag, ref = tag] = process.argv.slice(2);
if (!/^v\d+\.\d+\.\d+$/.test(tag ?? '')) throw new Error('usage: node scripts/release-notes.mjs vX.Y.Z [ref]');
const md = fs.readFileSync(`docs/releases/${tag}.md`, 'utf8');
const picture = fs.existsSync(`public/updates/${tag}.webp`) ? `https://raw.githubusercontent.com/${REPO}/${ref}/public/updates/${tag}.webp` : undefined;
process.stdout.write(githubNotes(md, picture));
