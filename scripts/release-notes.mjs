// Prints a release's GitHub notes from docs/releases/<tag>.md, its picture
// linked from the repo at that tag (or at `ref`, for a release whose tag
// predates its picture). Process: docs/releases/AGENTS.md.
// Usage: node scripts/release-notes.mjs v1.2.0 [ref] > notes.md
import fs from 'node:fs';
import { githubNotes } from '../src/release-notes.ts';

const [tag, ref = tag] = process.argv.slice(2);
if (!/^v\d+\.\d+\.\d+$/.test(tag ?? '')) throw new Error('usage: node scripts/release-notes.mjs vX.Y.Z [ref]');
const md = fs.readFileSync(`docs/releases/${tag}.md`, 'utf8');
process.stdout.write(githubNotes(md,`https://raw.githubusercontent.com/GeoGeorgeous/hidden-roof/${ref}/public/updates/${tag}.webp`));
