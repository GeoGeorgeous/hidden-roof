# Release notes

One file per release, `docs/releases/vX.Y.Z.md`, is the one source of its notes:

- **The game** bundles them (`src/release-notes.ts`, `src/updates-page.ts`): ESC → About → Updates, newest first, each with its date and its picture, `public/updates/vX.Y.Z.webp` (the CSP takes images from the game's own site only).
- **GitHub**: `node scripts/release-notes.mjs vX.Y.Z` prints the release's notes, with a `# Hidden Roof X.Y.Z` title and the picture linked from the repo at the tag. Never write them on GitHub by hand.
- **Discord** (later): the same text fits one message (2000 characters); the picture goes in an embed.

`npm test` checks every note (`scripts/release-notes.test.mjs`).

## Format

```markdown
---
date: 2026-10-09
---
one or two sentences: what this release is about.

- **heading**
  what changed and what you do with it. one to three sentences.

- **heading**
  a sentence, then a list.
  - **term**: what it is
  - plain line
```

- `date`: the day it's released (the owner's local date). The only field: the version is the file name, the title and the picture follow from it.
- No `#` headings and no HTML: the title and the picture are added where the note is shown.

## Style

From `v1.0.0.md`, the model to follow:

- English, all lowercase except keys and names the game spells out (RMB, W, Minecraft). Second person, a player's words.
- Intro: one or two sentences. It promises only what the items say.
- Items: a heading of 1–3 lowercase words, then 1–3 sentences, each ending with a period. Lists: `**term**: what it is` or plain lines, without a final period or comma.
- Order: the biggest new thing first, then the world and tools, then performance, fixes last. At most about 8 items; the text stays under 1800 characters.
- Only what a player sees or feels. Leave out F3, build mode, tests, refactors, file names and config keys; keep changed defaults a player notices. A protocol bump (`src/net/protocol.ts`) gets a line: players on an older version can't join.

The test checks the format, the lowercase headings, the periods, the length, the picture (1280×720 WebP, ≤ 300 KB) and that `package.json`'s version has a note. Tone and choices are for review.

## "What's in next?"

Nothing is written: from `last=$(git describe --tags --abbrev=0 origin/next)`, read `git log --first-parent --merges $last..origin/next` (one summary per topic) and, for detail, `git log --no-merges --format='%s%n%b' $last..origin/next`. Show the draft notes in chat, in this format and style, and below them what you left out and why.

## "Prepare a release"

1. On a clean, up-to-date `next`, write the draft as above. In one message, show: the draft, what was left out, the screenshot to take ("show X and Y": the release's headline, in the game as players see it), and the bump question from `AGENTS.md` → Releases (never pick it).
2. With the owner's bump and screenshot: `node scripts/release-picture.mjs <shot> vX.Y.Z` (crops to 16:9, 1280×720 WebP within 250 KB), write `docs/releases/vX.Y.Z.md` with today's date, apply their edits. Commit both on `next` (`docs: release notes vX.Y.Z`): `npm version` needs a clean tree. Run `npm run check` (10-minute timeout). Show the text as GitHub will render it (`node scripts/release-notes.mjs vX.Y.Z`) and send the picture.
3. On the owner's go, the release (`AGENTS.md` → Releases): `npm version <bump>`, `git push origin next:main --follow-tags`, then `node scripts/release-notes.mjs vX.Y.Z > <scratchpad>/notes.md` and `gh release create vX.Y.Z --verify-tag --title "Hidden Roof X.Y.Z" --notes-file <scratchpad>/notes.md`, then merge `next` into `dev` and push. Deploying stays with the owner (`docs/deploy.md`).

`v1.0.0` and `v1.1.0` predate their pictures in the repo: their GitHub notes link the pictures at `159a365` (`node scripts/release-notes.mjs v1.0.0 159a365`).
