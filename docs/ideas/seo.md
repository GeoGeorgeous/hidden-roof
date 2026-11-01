# Better SEO (TASK-287)

Search engines and AI crawlers barely see what the game is: Google indexes with a phone (it gets screen 10, a "bigger
screen" note built by JS, no h1), Bing and the AI bots read the raw `index.html` (a hidden `<main>`, no visible
text). Nothing here is approved yet: the owner is still thinking it over. This file holds where the discussion leans and
what is still open. The research behind it (sources,
crawler behavior, query clusters, FAQ drafts) is the owner's study "SEO для полноэкранной браузерной игры", not in
the repo; its facts are checked against the code before they go on a page.

## Approved for 1.6.1 (2026-11-01, TASK-291)

- **The page about the game** in place of screen 10: static in `index.html`, in the look of the Terms and Privacy
  pages, with the one h1, the definition, what you need, how to play, multiplayer, a FAQ and the links; no Copy link.
  In the game, the pause menu's About → Game opens it over the paused game, a circle growing from the item; its
  "Back to the game" button (and Esc) closes it, the circle shrinking back. The label "Game" is the owner's; Settings → Game
  became Settings → General beside it, and the settings' tabs took the menu's names (General, Audio). Where the game loads, `html.game` hides it before the first paint (the
  inline script, the dev server too); when the game fails to start it shows, saying why.
- **In search results:** the site name from `WebSite` (`@graph` with the game), the title and the description
  below; the game's structured data gets `GameApplication`, `browserRequirements` and the definition.
- **The painting of 1.7.0** (the Painting Rework) is on the page, in llms.txt and in the structured data now, said as
  fact: the owner's call, as the site takes weeks to be read and 1.7.0 comes soon. No controls list on the page (the
  owner took it out, 2026-11-02): the keys are in the FAQ answers. Also now: `numberOfPlayers` (1 to 40), `featureList`, the genre Painting,
  and a FAQ on a free online wall anyone can paint. Not "legal wall" (the owner's no).
- **The FAQ** ("Questions & answers") holds 28 questions, each phrased as players ask it (friends, painting at once,
  tools, caps, colors, drips, the level, how many levels, phone or tablet, requirements, controller, updates, release
  date), each answer starting with the direct answer: for search and assistants. Every answer is true of the game as it
  is, the 1.7.0 painting aside; keep them true with each release.
- **The Updates page** (`/updates.html`, 1.6.1): the release notes as plain HTML, written by the build with the parser
  the game's Updates popup uses, so it can't fall behind; one page with an anchor per version (not a page each: seven
  short pages are thin), in the Terms look, in the sitemap with the newest release's date.
- **The facts** under the hero: six cards (price, multiplayer, platform, access, technology, experience), the owner's
  design and words. The release dates and the author are in Latest updates (the last three releases as cards, then
  All updates), the footer, the FAQ and the structured data.
- **The words** on the page are the owner's (2026-11-02, through a temporary editor): only grammar and punctuation
  are fixed without asking. The cap names in Painting and the FAQ (needle, NY fats, soft, hard) are graffiti slang,
  not the game's caps (skinny, standard, fat, spray): kept, the owner's call.
- **Phones and small windows** get How to start playing (a computer, a keyboard, a mouse, 820×560) with Send the link
  to yourself; a window made big enough shows Play now. Hidden over the game, kept for crawlers.
- **llms.txt** opens with the definition; **sitemap** gets a `lastmod`, set at each release that changes the page.
- After the deploy: submit the sitemap in Search Console and ask for the page to be indexed again.

## Leaning for 1.7.2 (2026-11-01, not approved)

- **The landing:** a real landing at roof.hidden.haus, static markup in `index.html`, the same bytes for every client.
  Where the game starts fine it never shows, not even for a frame (no flash on load): before the first paint the inline
  script sets `html.game`, and CSS hides the landing. Without WebGL, or when the game fails to start (`failed()`),
  the player sees the landing instead of the game; so do phones, small windows, clients without JS and bots. Screen
  10 becomes this landing. Its header is a portal into the game, and the game has a way back out to the landing.
- **What ships in 1.7.2:** phases 1 to 3: the landing and its gating, the head (title, JSON-LD), sitemap, robots,
  IndexNow, and the extra pages. The outside presence is not in it.
- **The landing's design:** the owner designs it from a content spec (blocks in order, texts, images with sizes and
  alt, constraints). Until then everything that doesn't depend on it is built, and the landing stays plain and
  unstyled, never shipped as final.
- **The words:** the one definition, said the same everywhere (landing, FAQ, JSON-LD, llms.txt, README, portals):
  "Hidden Roof is a free multiplayer graffiti game in your browser — paint ink-drawn rooftops alone or with your friends."
  The h1 (1.6.1: the owner's change, the h1 and the lead said the same twice): the definition itself, shown as the
  name large and the rest of the sentence under it; seo.test checks it word for word. The title (og and twitter too): "Hidden
  Roof — free browser graffiti game".
- **The description** (meta, og, twitter and the manifest, 128 characters: Google cuts it near 120 on phones, 155
  on desktops, so the keywords come first): "Free online graffiti game in your browser. The city is ink, the color is
  yours: spray paint solo or in multiplayer with friends."
- **The site name** in results ("hidden.haus" today) comes from the `WebSite` in the structured data below: its
  `name` "Hidden Roof"; `og:site_name` alone doesn't set it.
- **Out to the landing from the game:** an item in the pause menu shows the landing over the paused game; its
  portal takes the player straight back (no reload: session and paint stay). One class (`html.game`) does it; bots
  never meet it (they see the static landing, or keep it in the DOM under `display:none`, reachable from the menu).
- **Structured data:** one `@graph`: `WebSite` (the site name in results), the author `Person`, and the
  `VideoGame`/`WebApplication` with `applicationCategory: GameApplication`, `browserRequirements: Requires WebGL2` and
  `dateModified`. No `aggregateRating` (no real ratings), no `FAQPage` (no rich result since 2026-05-07).
- **Sitemap, robots, IndexNow:** every page in the sitemap with `lastmod` from git at build time; robots stays as it is
  (all bots, AI ones too, allowed); an IndexNow key in `public/` and one ping after each release (a release step).
- **Extra pages in 1.7.2:** `/about` and `/how-to-play` only; `/press` and `/updates/<slug>` later.
- **How the pages are built:** Vite multi-page, the same build as the game; the header and footer are shared with
  the landing through partials a small build plugin puts in. No new dependency, no JS on the pages. No SvelteKit or
  router: it would take over the Vite build, and static pages need no router (Astro only once there are dozens).
- **Claims the FAQ makes:** free with no ads and no in-game purchases, and the Ko-fi named ("if you like it, you can
  buy the author a coffee on Ko-fi"). Private sessions with a caveat ("or a private one by its five-letter code, if
  you have one"): players can't make one in 1.6 (`SERVER.playerHost` is false). Every other claim is checked against
  the code before it goes on a page.
- **Not in the backlog:** the outside presence (itch.io, Reddit, Show HN, YouTube, listicles) and the monthly AI-prompt
  check are the owner's, outside the repo.

## Open

1. The pause menu item that opens the landing: its name.
2. The texts of `/about` and `/how-to-play` (drafts in the designer's bundle), after the landing's design.
3. Search Console and Bing Webmaster Tools: is the site verified in both (a baseline before any change)?
4. `/press` and `/updates/<slug>`: backlog items of their own?
5. Caddy: no 403 or 429 for crawlers, a real 404 for any unknown path (to check on the host).
