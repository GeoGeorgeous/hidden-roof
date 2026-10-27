# Releases

## Releasing

- Before a release (merging or promoting `next` into `main`), ask the owner to choose patch, minor, major, or no release. Show what changed since the last tag using `git log --oneline $(git describe --tags --abbrev=0)..next`. Never choose the version bump yourself.
- Release only from a clean `next` with the full `npm run check` passing. Run `npm version <bump>` (bumps, commits, tags `vX.Y.Z`), push with `git push origin next:main --follow-tags` (fast-forward only, never a PR or merge commit), then merge `next` back into `dev` and push. The full steps, with the notes: "Prepare a release" below.
- Write release notes in the repository before `npm version`, never manually on GitHub.
- The game displays its build's `git describe` (`src/version.ts`), so `dev` and `next` do not need version bumps.

## Release notes

One file per release, `docs/releases/vX.Y.Z.md`, is the one source of its notes:

- **The game** bundles them (`src/release-notes.ts`, `src/updates-page.ts`): ESC → About → Updates, newest first, each with its date and its picture, `public/updates/vX.Y.Z.webp` (the CSP takes images from the game's own site only). A minor or major release always has a picture; a patch (`vX.Y.Z`, Z above 0) may have none, and then it shows nowhere: not in the game, on GitHub or on Discord (the build lists the pictures there are, `__PICTURES__` in `vite.config.ts`).
- **GitHub**: `node scripts/release-notes.mjs vX.Y.Z` prints the release's notes, with the picture linked from the repo at the tag; the title, `Hidden Roof X.Y.Z`, is the release's own (`--title`), never repeated in the notes. Never write them on GitHub by hand.
- **Discord**: `node scripts/release-discord.mjs vX.Y.Z` posts the picture, then the note with its date and a link to the GitHub release, through the webhook in `DISCORD_WEBHOOK` (the gitignored `.env.local`; never commit or print it). A note longer than one message (2000 characters) goes in several, split between sections (a heading and its list stay together). The picture is the first message, on its own, so it tops the note as on GitHub (Discord shows attachments below a message's text); it is read before anything is posted, so an unreadable picture fails before any message; a patch without one posts only the note. `--dry` prints the picture's size and the messages instead.

`npm test` checks every note (`scripts/release-notes.test.mjs`).

## Format

```markdown
---
date: 2026-10-09
---
one or two sentences: what this release is about.

- **heading**
  - what changed and what you do with it

- **heading**
  - **term**: what it is
  - plain line
```

- `date`: the day it's released (the owner's local date). The only field: the version is the file name, the title and the picture follow from it.
- No `#` headings and no HTML: the title and the picture are added where the note is shown.
- Links are markdown, `[text](url)`, in the intro, a heading's sentence or a list line (not in a heading or a `**term**`). The game's own pages are root-relative: `[Terms](/terms.html)`, `[Privacy](/privacy.html)`; other sites are absolute and only `https://ko-fi.com/`, `https://github.com/GeoGeorgeous/` and `https://discord.gg/` (`LINK_SITES`, `src/release-notes.ts`): `[Ko-fi](https://ko-fi.com/D0Q7296HCP)`. Never write the game's own address (`SITE`, `src/links.ts`) in a note. The text is a word or two, never a bare URL.
  - **In the game** a link is an anchor in a new tab (the paint stays); a root-relative one stays on the game's site. A target outside the rule shows its text only.
  - **On GitHub** a root-relative target becomes `https://roof.hidden.haus/...`.
  - **On Discord** the same, and every target is wrapped in `<...>` so no preview card opens.

## Style

From `v1.0.0.md`, the model to follow:

- English, all lowercase except keys and names the game spells out (RMB, W, Minecraft). Second person, a player's words.
- Intro: one or two sentences. It promises only what the items say.
- Items: a heading of 1–3 lowercase words, then a list, also for a single line: `**term**: what it is` or plain lines, without a final period or comma. Older notes have sentences under the heading; the test still takes them (each ends with a period), but new notes use lists.
- Order: the biggest new thing first, then the world and tools, then performance, fixes last. At most about 8 items; the text stays under 3000 characters.
- Only what a player sees or feels. Leave out F3, build mode, tests, refactors, file names and config keys; keep changed defaults a player notices. No line for a protocol bump (`src/net/protocol.ts`), such as "players on an older version can't join".

The test checks the format, the lowercase headings, the periods, the length, the picture (1280×720 WebP, ≤ 300 KB; required unless a patch) and that `package.json`'s version has a note. Tone and choices are for review.

## Drafts

`docs/releases/drafts/vX.Y.Z.md` gathers the next release's notes as work lands. It has no length limit, in characters, items or lines: put in everything a player could notice, from the commits (`git log`), the backlog's `## Done` section. The owner trims it. Format and style still apply; the limits apply only once it moves to `docs/releases/vX.Y.Z.md`.

## "What's in next?"

Nothing is written: from `last=$(git describe --tags --abbrev=0 origin/next)`, read `git log --first-parent --merges $last..origin/next` (one summary per topic) and, for detail, `git log --no-merges --format='%s%n%b' $last..origin/next`. Show the draft notes in chat, in this format and style, and below them what you left out and why.

## "Prepare a release"

1. On a clean, up-to-date `next`, list the lines in the backlog's `## Done` section (`docs/backlog.md`): they are what shipped since the last release, and the source for the draft. Write the draft as above. In one message, show: the draft, what was left out, the screenshot to take ("show X and Y": the release's headline, in the game as players see it; for a patch, ask whether it gets one at all), and the bump question from Releasing above (never pick it).
2. With the owner's bump and screenshot (none for a patch the owner says gets none): `node scripts/release-picture.mjs <shot> vX.Y.Z` (crops to 16:9, 1280×720 WebP within 250 KB), write `docs/releases/vX.Y.Z.md` with today's date (from `docs/releases/drafts/vX.Y.Z.md` if one was drafted earlier: a draft has no picture yet, so it stays out of the game and the test, and moves here), apply their edits. Empty the backlog's `## Done` section in the same commit. Commit all on `next` (`docs: release notes vX.Y.Z`): `npm version` needs a clean tree. Run `npm run check` (10-minute timeout). Show the text as GitHub will render it (`node scripts/release-notes.mjs vX.Y.Z`) and send the picture, if there is one.
3. On the owner's go, the release (Releasing above): `npm version <bump>`, `git push origin next:main --follow-tags`, then `node scripts/release-notes.mjs vX.Y.Z > <scratchpad>/notes.md` and `gh release create vX.Y.Z --verify-tag --title "Hidden Roof X.Y.Z" --notes-file <scratchpad>/notes.md`, then `node scripts/release-discord.mjs vX.Y.Z`, then merge `next` into `dev` and push. Deploying stays with the owner (`docs/deploy.md`).

`v1.0.0` and `v1.1.0` predate their pictures in the repo: their GitHub notes link the pictures at `159a365` (`node scripts/release-notes.mjs v1.0.0 159a365`).
