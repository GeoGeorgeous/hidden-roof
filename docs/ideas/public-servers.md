# Public servers (BL-043, BL-047, TASK-189)

The public server: see also docs/deploy.md. Shipped: the server list, public and private join, HOST off, the queue, tools off (the backlog's Done). Left: the deploy (BL-043), the admin page (BL-047), the Terms' moderation section (TASK-189).

## Decisions for 1.6.0 (owner, 2026-10-25)

- **Two session types.** Private: as today, joined with its code; up to 4 players. Public: open to all, no code; up to 20 players.
- **Who creates them.** The admin only, public or private, by a server command (`docker exec roof node admin.js create public "Name"`) or the admin panel; both use the same internal admin API. Players' HOST stays in the code but is disabled for everyone in 1.6.0 (no auth: the game can't tell the admin from a player). Admin in the game (spectator, IDEA-195) is 1.6.1.
- **The server list** replaces HOST and JOIN and shows every session, public and private: type, name, players, ping, allowed tools. A private one asks for its code on click (the host and its players have it). Built from the designer's screens 15, 17, 17b, 20, 21, 22.
- **Empty sessions**: a private one closes when no one is left, as today; the admin may make one that stays (`--stay`, admin only). A public one always stays.
- **Session names**: up to 32 characters, set by whoever creates the session; no word filter.
- **Tools off per session** (BL-154), chosen only at creation: e.g. no sponge or roller; those items leave the map and can't be picked up or used.
- **Queue** (done): a full session, public or private, lets players wait for a free place, as in Minecraft; the server pushes the position (no polling), a dropped link keeps its place for SERVER.rejoinWindow (owner, 2026-10-25).
- **One public session in 1.6.0**: the roof at ULTRA (519 MB all painted).
- **Public paint is kept** (done: `docs/deploy.md` §6), the simplest version first: saved to the host's disk now and then (a config value, e.g. 30 min) and on shutdown, the last 3 saves kept, loaded at start, so a host outage loses at most one interval. Wiped only when the protocol, the surface table or the level changes, or on the admin's wipe (command or panel); a release that changes none of them keeps the paint.
- **Anti-cheat** (BL-147) waits for 1.6.1: no real players are expected before 1.7.0, and a bad wall is fixed by a wipe.
- **Admin panel** (BL-047): minimal, stats and session management (create, name, tools, wipe). Full stats from 1.6.0 (server counters, country, the client beacon); the privacy page and Terms are updated alongside.
- **cctv data** (owner, 2026-10-25): no outside analytics service (no Umami). The game server counts players and sessions; a small process of our own reads Caddy's log for page views (TASK-241). Unique players: a random device id in `localStorage` and a salted IP hash (a new salt every 30 days; the IP isn't kept), shown apart and merged, so a cleared storage or a new IP still counts one person. Daily rollups (counts only) are kept; raw log lines go after 60 days. Times in UTC: Stats' 24 h, 7 d and 30 d are the last hours, Main's "today" is since 00:00 UTC; people and countries count each person once over the period. A wipe keeps the last 3 saves (TASK-239). Kick, ban by IP and restore a save come later (IDEA-240).
- **cctv page** (owner, 2026-10-25): the designer's screens (Main, Stats › Players, Paint, Performance, Server, then Traffic; Sessions). Paint detail is picked when a session is made (ULTRA by default). A switch in its header picks the server, main or next (staging), so a release is checked end to end on next before it goes public; the two keep their data apart. Step 1 done: the shell and the sessions list on the real admin API.

## BL-043 One public server, running 24/7

See `docs/deploy.md`. Server side done (2026-10-25): the admin API and command (`server/admin-api.ts`, `server/admin.mjs`), sessions the admin makes (public or private, a name, tools; they stay when empty), public ones kept in `DATA_DIR` with their paint (`server/kept.ts`), private sessions up to 4. Left: the deploy (`docs/ideas/vps.md` item 2). The tools a session allows are stored, listed and applied: a tool that's off has no pickups, can't be held (the slot stays an empty circle) and its ops and stepladders are dropped by the server (BL-154).

## BL-047 Admin panel: players online, ban by IP

Status: in progress, priority Medium, size L. Ban by IP moved to IDEA-240.

See who is online and how the server does. The page lives in its own private repo (cctv), served apart from the game; it reads the server's admin API (`server/admin-api.ts`) through Caddy, which adds the key.

- Done: admin API 2 (feat/admin-api-v2): the game's version and the server's clock; the machine (CPU, RAM, the server's memory against its limit, disk, paint saves, upload); per session its players (address, ping, time in, seconds left on a held seat), today's paint by tool and its top color, today's peak, its median ping and slow links, when it went empty, its saves; the event stream (`GET /events`, SSE: joins, leaves, drops, turned away, sessions made, closed and wiped, failed saves, and a status every second while a page is open); history (`GET /history`: today since 00:00 UTC, or the last 24 h, 7 d or 30 d: plays, play length, play time with others, joins by UTC hour, turned away by reason, paint by tool and color, the peak), counted by UTC hour, kept on disk, and the most players ever; unique people (merged, by device, by address, distinct over the period) and their countries, and each player's country (a local GeoIP base); the game's beacon (`POST /ws?e`, solo too, no id: page loads, browser, OS, GPU, fps and 1% low, load and join times, errors) in /history's `client`. The page: sessions with create, wipe and close, a session's page, Main and Stats on mock data, a main / next switch.
- Left, server: kick and save now + download from cctv (TASK-243), game events in the beacon (TASK-244), web traffic from Caddy's log (TASK-241, own links with `?ref=`).
- Left, host: the page deployed, Caddy's two admin routes (main and next, a key each), `roof-next` with its own data and key (`docs/ideas/vps.md` item 1), the GeoIP base downloaded monthly (`docs/ideas/vps.md` item 3). Left, legal: the privacy page names what's counted (TASK-242).

## TASK-189 House rules before joining a public server

Status: the rules screen is in (the public join dialog: house rules, 18+, Terms and Privacy linked, recorded sessions; "Don't show again" per device). Left: the Terms' moderation section.

On the way into a public server, the house rules and one action to accept them (joining is the action): players are 18+; joining accepts the Terms and the Privacy Policy, linked; sessions may be recorded and published, nicknames included. Remembered per device in `localStorage` (strictly necessary: no consent needed). Why: playing alone binds no one to the Terms. The Terms get their moderation section with it (SECRET_legal.md).
