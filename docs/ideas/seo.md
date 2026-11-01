# Better SEO (TASK-287)

Search engines and AI crawlers barely see what the game is: Google indexes with a phone (it gets screen 10, a "bigger
screen" note built by JS, no h1), Bing and the AI bots read the raw `index.html` (a hidden `<main>`, no visible
text). This file holds only the owner's approved decisions and what is still open. The research behind it (sources,
crawler behavior, query clusters, FAQ drafts) is the owner's study "SEO для полноэкранной браузерной игры", not in
the repo; its facts are checked against the code before they go on a page.

## Approved

<!-- None yet. Each decision moves here from Open once the owner confirms it, with the date. -->

## Open (to confirm)

1. **The landing:** a real landing as static markup in `index.html`, the same bytes for every client. Before the
   first paint the inline script sets `html.game` where the game will load, and CSS hides the landing there: the
   desktop starts the game at once, as now. Phones, browsers without WebGL, clients without JS and bots see the
   landing. Screen 10 becomes that landing (`small-screen.ts` only wires its buttons). Alternatives: keep screen 10
   and only unhide the text; a separate `/play` path.
2. **What ships in 1.6.1:** the landing and the head (phases 1 and 2: `html.game`, one h1, `failed()` shows the
   landing, title and JSON-LD, sitemap, robots, IndexNow); the extra pages and the outside work as items of their own.
3. **The landing's design:** the owner designs it from a content spec; until then a plain, unstyled landing that
   isn't shipped as final.
4. **The words:** the one definition used everywhere, the h1 and the title (the study's candidates: "Hidden Roof is a
   free multiplayer graffiti game in your browser — paint ink-drawn rooftops alone or with friends."; h1 "Hidden Roof
   — a free multiplayer graffiti game in your browser"; title "Hidden Roof — free browser graffiti game").
5. **About in the menu:** an About item in the pause menu's about column opens the same landing over the game.
6. **Structured data:** one `@graph` with `WebSite`, the author `Person`, and the `VideoGame`/`WebApplication` with
   `applicationCategory: GameApplication`, `browserRequirements` and `dateModified`; no `aggregateRating` (no real
   ratings), no `FAQPage` (no rich result since 2026-05-07).
7. **Sitemap, robots, IndexNow:** `lastmod` from git at build time; robots as it is (all bots allowed, `/levels/` and
   `/licenses/` disallowed); an IndexNow key and a post-deploy ping.
8. **Extra pages** (`/about`, `/how-to-play`, `/press`, `/updates/<slug>`): when, and built how (static HTML in
   `public/` like `terms.html`, or Vite multi-page).
9. **Claims the FAQ makes:** "no ads, no in-game purchases" (there is a Ko-fi link); "a private session with its
   five-letter code for you and up to three friends" (players can't make one in 1.6: `SERVER.playerHost` is false).
10. **Outside presence** (itch.io, Reddit, Show HN, YouTube, listicles) and the monthly AI-prompt check: backlog items
    of their own, the owner's work.
