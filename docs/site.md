# The site and search

roof.hidden.haus is the game and, for everyone who can't play it there (phones, small windows, no WebGL2, crawlers,
no JavaScript), the page about the game: static markup in `index.html`, the same bytes for every client. Hosting and
what's served: `docs/deploy.md`; the release steps that touch the page: `docs/releases/AGENTS.md`.

## The page about the game

- Where the game loads, `html.game` (set by the inline script before the first paint) hides the page: no flash. When
  the game fails to start (`failed()` in `src/boot.ts`), the page shows, saying why in a note under the h1: what
  went wrong, what to do (WebGL2 off: hardware acceleration, most often), and Reload the page.
- In the game, the pause menu's About → Game opens it over the paused game through a portal; its button (Start the
  game on the title screen, Back to the game after) and Esc close it. Nothing reloads.
- Phones and small windows get How to start playing (a computer, a keyboard, a mouse, `RENDER.minViewport`) with Send
  the link to yourself; a window made big enough shows Play now. The game's window made too small shows a note and
  lets the mouse go. The section is hidden where the game can be played (over the game, and once Play now shows) but
  stays in the markup for crawlers.
- The words are the owner's: fix grammar and punctuation without asking, never the wording. The cap names in Painting
  and the FAQ (needle, NY fats, soft, hard) are graffiti slang, not the game's caps: kept, the owner's call.
- The painting of 1.7.0 is described as fact before it ships (the owner's call: a site takes weeks to be read). Every
  other claim is true of the game as it is: check it against the code before it goes on the page, and keep the FAQ
  true with each release. Not "legal wall" (the owner's no).
- The FAQ: each question phrased as players ask it, each answer starting with the direct answer. Questions sit in
  groups (Playing, Painting, Multiplayer, Performance, The game), each a `<details>` that opens in place: the answers
  stay in the markup for crawlers. A new question goes in its group.
- Order: the hero, the fact cards, About (the owner's text on what the game is, the owner's word to players
  under P.S.; its "legal walls" is the owner's own, saying the game isn't one), How to start playing, then the rest.
  How to play lists every tool with the server list's icon (`src/net/tool-icons.ts`), copied as markup;
  `scripts/seo.test.mjs` checks they match.
- The FAQ on a slow game says what the performance test says (`perfTip` in `src/perf-test.ts`, `fasterGpuHow` in
  `src/gpu-name.ts`): change one, change the other.

## Search

- **One definition**, word for word in the h1, the structured data and `llms.txt` (`scripts/seo.test.mjs`): "Hidden
  Roof is a free multiplayer graffiti game in your browser — paint ink-drawn rooftops alone or with your friends."
- **Title** (og and twitter too): "Hidden Roof — free browser graffiti game". **Description** (meta, og, twitter and
  the manifest): keywords first, within ~120 characters (Google cuts it there on phones).
- **Structured data:** one `@graph`: `WebSite` (its `name` is the site name in results; `og:site_name` alone doesn't
  set it) and the `VideoGame`. No `aggregateRating` (no real ratings), no `FAQPage` (no rich result since 2026-05-07).
- **Updates page** (`/updates.html`): written by the build from `docs/releases` with the game's own parser, so it
  can't fall behind; one page with an anchor per version (a page each would be thin).
- **Sitemap and dateModified:** written by the build (`vite.config.ts`, `src/sitemap.ts`): each page's `lastmod` is
  the day its source last changed in git, and `index.html`'s `dateModified` is its `lastmod`. Search engines trust
  them only while they're true, so never by hand. `scripts/csp.test.mjs` checks the built site.
- **IndexNow** (Bing, Yandex and others; not Google): the key is `public/<key>.txt`; `node scripts/indexnow.mjs` pings
  the live sitemap's pages once after each deploy (`--dry` shows the ping).
- **Crawlers:** `robots.txt` allows every bot, AI ones too. Caddy gives them 200 and a real 404 for unknown paths
  (checked 2026-11-02 for Googlebot, bingbot, GPTBot, ClaudeBot and PerplexityBot).
- Outside the repo, the owner's: Search Console and Bing Webmaster Tools, itch.io, Reddit and the other outside presence.
