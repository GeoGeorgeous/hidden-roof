# The game on itch.io and CrazyGames (TASK-201)

Researched 2026-11-02. The game stays on roof.hidden.haus; the portals show it in an iframe, no build uploaded.

## itch.io

- Free to publish; the revenue share (10% by default) applies only to sales and donations, and can be set to 0%.
- **A link-only page is never indexed** in browse or search (an admin: "we don't index placeholder pages or pages
  that are just links to somewhere else"; the quality guidelines discourage pages without files). It stays reachable
  by its URL.
- **The way in:** an HTML project whose uploaded `index.html` is an iframe of roof.hidden.haus (a moderator's own
  suggestion): "playable in browser", indexed, in the HTML5 browse.
- Our build can't be uploaded as it is: its paths are absolute (`docs/deploy.md`), which itch's HTML hosting breaks.
- Every outside link on an itch page is `rel="nofollow noopener"` (checked on 25 pages): no link weight for the site,
  only the page's own ranking and the players it sends.
- The Generative AI Disclosure field is required (code counts); "yes" tags the page AI Generated. The owner's answer.
- Drafts and restricted pages are never in browse: the page can be made and tested before it goes public.

## CrazyGames

- A game on its own domain is iframed as a regular submission. Basic Launch needs no SDK; it has no ads and no
  revenue. Full Launch needs the SDK and its ads. No exclusivity. Multiplayer is encouraged; QA checks PEGI-12.
- Poki is not an option for now: 7 years of web exclusivity, and its developer portal is a closed beta.

## CSP

- `frame-ancestors 'none'` blocks every embed. It is in two places, changed together: `csp` in `vite.config.ts`
  (`npm run test:csp`) and Caddy's header on the host (`docs/deploy.md`, a host change for devops).
- It lists every ancestor of the frame: itch's top page and its upload frame (`https://itch.io`,
  `https://*.itch.zone`), and CrazyGames' domains (check which ones before writing them in).

## Checked inside both portals

- Pointer lock and fullscreen through two nested iframes (the wrapper's iframe needs `allow="fullscreen"`).
- The embed is big enough that the game doesn't ask for a bigger window (`html.needs-room`, `src/boot.ts`).
- Settings live in `localStorage` per origin, and an embedded game's storage is partitioned by the top site: players
  on itch keep their own settings.
- The WebSocket to the server works from inside the frame.

## When

- Ready as drafts before 1.7.0, public with it or just after (`@1.7.1`), with the Reddit and Show HN posts the same
  day. The server's limit under a spike is measured first (`npm run study:load`, `docs/known-limits.md`).
