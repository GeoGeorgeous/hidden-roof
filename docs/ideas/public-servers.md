# Public servers (BL-047, TASK-189)

The public server: see also docs/deploy.md. Shipped: the server list, public and private join, HOST off, the queue, tools off (the backlog's Done). Left: the admin page (BL-047; its 1.6.0 data in `docs/ideas/admin-data.md`), the Terms' moderation section (TASK-189). The public server itself is the owner's step once 1.6.0 is deployed.

## Decisions for 1.6.0 (owner, 2026-10-25)

- **Two session types.** Private: as today, joined with its code; up to 4 players. Public: open to all, no code; up to 20 players.
- **Who creates them.** The admin only, public or private, by a server command (`docker compose exec roof node admin.mjs create public "Name"`) or the admin panel; both use the same internal admin API. Players' HOST stays in the code but is disabled for everyone in 1.6.0 (no auth: the game can't tell the admin from a player). Admin in the game (spectator, IDEA-195) is 1.6.1.
- **The server list** replaces HOST and JOIN and shows every session, public and private: type, name, players, ping, allowed tools. A private one asks for its code on click (the host and its players have it). Built from the designer's screens 15, 17, 17b, 20, 21, 22.
- **Empty sessions**: a private one closes when no one is left, as today; the admin may make one that stays (`--stay`, admin only). A public one always stays.
- **Session names**: up to 32 characters, set by whoever creates the session; no word filter.
- **Tools off per session** (BL-154), chosen only at creation: e.g. no sponge or roller; those items leave the map and can't be picked up or used.
- **Queue** (done): a full session, public or private, lets players wait for a free place, as in Minecraft; the server pushes the position (no polling), a dropped link keeps its place for SERVER.rejoinWindow (owner, 2026-10-25).
- **One public session in 1.6.0**: the roof at ULTRA (519 MB all painted).
- **Public paint is kept** (done: `docs/deploy.md` §6), the simplest version first: saved to the host's disk now and then (a config value, e.g. 30 min) and on shutdown, the last 3 saves kept, loaded at start, so a host outage loses at most one interval. Wiped only when the protocol, the surface table or the level changes, or on the admin's wipe (command or panel); a release that changes none of them keeps the paint.
- **Anti-cheat** (BL-147) waits for 1.6.1: no real players are expected before 1.7.0, and a bad wall is fixed by a wipe.
- **Admin panel** (BL-047): minimal, stats and session management (create, name, tools, wipe). Full stats from 1.6.0 (server counters, country, the client beacon); the privacy page and Terms are updated alongside.
- **cctv data** (owner, 2026-10-25): no outside analytics service (no Umami). The game server counts players and sessions; a small process of our own reads Caddy's log for page views (TASK-241). Unique players: a random device id in `localStorage` and a salted IP hash (a new salt every 30 days; the IP isn't kept), shown apart and merged, so a cleared storage or a new IP still counts one person. Daily rollups (counts only) are kept; raw log lines go after 60 days. Times in UTC: Stats' 24 h, 7 d and 30 d are the last hours, Main's "today" is since 00:00 UTC; people and countries count each person once over the period. A wipe keeps the last 3 saves (TASK-239). Kick shipped (TASK-243); restoring a save is CCTV-255, ban by IP comes later (IDEA-240).
- **cctv page** (owner, 2026-10-25): the designer's screens (Main, Stats › Players, Paint, Performance, Server, then Traffic; Sessions). Paint detail is picked when a session is made (ULTRA by default). A switch in its header picks the server, main or next (staging), so a release is checked end to end on next before it goes public; the two keep their data apart. Step 1 done: the shell and the sessions list on the real admin API.

## BL-047 Admin panel: players online, ban by IP

Status: in progress, priority Medium, size L. Ban by IP moved to IDEA-240.

See who is online and how the server does. The page lives in its own private repo (cctv), served apart from the game; it reads the server's admin API (`server/admin-api.ts`) through Caddy, which adds the key.

- Done: the admin API (version 2: sessions with their players, the machine, history, unique people and country, the event stream, kick, a session's paint downloaded, the wipe keeping saves aside), the game's beacon with its game events and who is on the site now, and web traffic from Caddy's log in its own container, `roof-traffic` (`GET /traffic`; TASK-243, TASK-244, TASK-241 are in the backlog's Done). The code (`server/admin-api.ts` and its header) and `docs/deploy.md` §6 describe them. The page (cctv, a private repo): sessions with create, wipe and close, a session's page, Main and Stats on mock data, a main / next switch.
- The API's data (owner, 2026-10-25): data, not views. Counts, not shares; codes and ids (iso2, color names, reasons, tools), not labels; objects keyed by them, so a new key needs no new API version and the page ignores keys it doesn't know; times ISO UTC, durations in seconds, sizes in bytes; no top-N cuts or sorting (caps that bound memory fold into Other); a quantile only where the raw data is big, its histogram beside it when small. The page builds every view itself.
- Staging live (2026-10-26, `docs/deploy.md` §9): `next.roof.hidden.haus` with `roof-next`, its traffic reader and GeoIP, and the page at `cctv.hidden.haus` behind tinyauth; the owner tested it in a browser. Left, host: prod, once it runs 1.6.0: Caddy's admin route for main (`docs/ideas/vps.md` item 1), the GeoIP base downloaded monthly (item 2), `roof`'s access log and traffic reader (item 3). Left, legal: the privacy page names what's counted (TASK-242).

## TASK-189 House rules before joining a public server

Status: the rules screen is in (the public join dialog: house rules, 18+, Terms and Privacy linked, recorded sessions; "Don't show again" per device; TASK-250 splits the name from the rules). Left: the Terms' moderation section, untagged until the core multiplayer is done (owner, 2026-10-27).

On the way into a public server, the house rules and one action to accept them (joining is the action): players are 18+; joining accepts the Terms and the Privacy Policy, linked; sessions may be recorded and published, nicknames included. Remembered per device in `localStorage` (strictly necessary: no consent needed). Why: playing alone binds no one to the Terms. The Terms get their moderation section with it (SECRET_legal.md).
