# Better SEO (TASK-287)

Search engines and AI crawlers barely see what the game is: Google indexes with a phone (it gets screen 10, a "bigger
screen" note built by JS, no h1), Bing and the AI bots read the raw `index.html` (a hidden `<main>`, no visible
text). This file holds only the owner's approved decisions and what is still open. The research behind it (sources,
crawler behavior, query clusters, FAQ drafts) is the owner's study "SEO для полноэкранной браузерной игры", not in
the repo; its facts are checked against the code before they go on a page.

## Approved (2026-11-01)

- **The landing:** a real landing at roof.hidden.haus, static markup in `index.html`, the same bytes for every client.
  Where the game starts fine it never shows, not even for a frame (no flash on load): before the first paint the inline
  script sets `html.game`, and CSS hides the landing. Without WebGL, or when the game fails to start (`failed()`),
  the player sees the landing instead of the game; so do phones, small windows, clients without JS and bots. Screen
  10 becomes this landing. Its header is a portal into the game, and the game has a way back out to the landing.
- **What ships in 1.6.1:** phases 1 to 3: the landing and its gating, the head (title, JSON-LD), sitemap, robots,
  IndexNow, and the extra pages. The outside presence is not in it.
- **The landing's design:** the owner designs it from a content spec (blocks in order, texts, images with sizes and
  alt, constraints). Until then everything that doesn't depend on it is built, and the landing stays plain and
  unstyled, never shipped as final.
- **The words:** the one definition, said the same everywhere (landing, FAQ, JSON-LD, llms.txt, README, portals):
  "Hidden Roof is a free multiplayer graffiti game in your browser — paint ink-drawn rooftops alone or with friends."
  The h1: "Hidden Roof — a free multiplayer graffiti game in your browser". The title (og and twitter too): "Hidden
  Roof — free browser graffiti game".
- **Out to the landing from the game:** an item in the pause menu shows the landing over the paused game; its
  portal takes the player straight back (no reload: session and paint stay). One class (`html.game`) does it; bots
  never meet it (they see the static landing, or keep it in the DOM under `display:none`, reachable from the menu).
- **Structured data:** one `@graph`: `WebSite` (the site name in results), the author `Person`, and the
  `VideoGame`/`WebApplication` with `applicationCategory: GameApplication`, `browserRequirements: Requires WebGL2` and
  `dateModified`. No `aggregateRating` (no real ratings), no `FAQPage` (no rich result since 2026-05-07).
- **Sitemap, robots, IndexNow:** every page in the sitemap with `lastmod` from git at build time; robots stays as it is
  (all bots, AI ones too, allowed); an IndexNow key in `public/` and one ping after each release (a release step).
- **Extra pages in 1.6.1:** `/about` and `/how-to-play` only; `/press` and `/updates/<slug>` later.
- **How the pages are built:** Vite multi-page, the same build as the game; the header and footer are shared with
  the landing through partials a small build plugin puts in. No new dependency, no JS on the pages. No SvelteKit or
  router: it would take over the Vite build, and static pages need no router (Astro only once there are dozens).
- **Claims the FAQ makes:** free with no ads and no in-game purchases, and the Ko-fi named ("if you like it, you can
  buy the author a coffee on Ko-fi"). Private sessions with a caveat ("or a private one by its five-letter code, if
  you have one"): players can't make one in 1.6 (`SERVER.playerHost` is false). Every other claim is checked against
  the code before it goes on a page.
- **Not in the backlog:** the outside presence (itch.io, Reddit, Show HN, YouTube, listicles) and the monthly AI-prompt
  check are the owner's, outside the repo.

## Open (to confirm)

None.
