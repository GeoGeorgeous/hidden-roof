# Public servers (BL-043, BL-046, BL-047, TASK-189)

The public server: see also docs/deploy.md. Shipped: the server list, public and private join, HOST off (the backlog's Done). Left: the deploy (BL-043), the queue (BL-046), the admin page (BL-047), the Terms' moderation section (TASK-189).

## Decisions for 1.6.0 (owner, 2026-10-25)

- **Two session types.** Private: as today, joined with its code; up to 4 players. Public: open to all, no code; up to 20 players.
- **Who creates them.** The admin only, public or private, by a server command (`docker exec roof node admin.js create public "Name"`) or the admin panel; both use the same internal admin API. Players' HOST stays in the code but is disabled for everyone in 1.6.0 (no auth: the game can't tell the admin from a player). Admin in the game (spectator, IDEA-195) is 1.6.1.
- **The server list** replaces HOST and JOIN and shows every session, public and private: type, name, players, ping, allowed tools. A private one asks for its code on click (the host and its players have it). Built from the designer's screens 15, 17, 17b, 21, 22; the queue (20) is next.
- **Empty sessions**: a private one closes when no one is left, as today; the admin may make one that stays (`--stay`, admin only). A public one always stays.
- **Session names**: up to 32 characters, set by whoever creates the session; no word filter.
- **Tools off per session** (BL-154), chosen only at creation: e.g. no sponge or roller; those items leave the map and can't be picked up or used.
- **Queue** (BL-046): a full session, public or private, lets players wait for a free place, as in Minecraft.
- **One public session in 1.6.0**: the roof at ULTRA (519 MB all painted).
- **Public paint is kept** (done: `docs/deploy.md` §6), the simplest version first: saved to the host's disk now and then (a config value, e.g. 30 min) and on shutdown, the last 3 saves kept, loaded at start, so a host outage loses at most one interval. Wiped only when the protocol, the surface table or the level changes, or on the admin's wipe (command or panel); a release that changes none of them keeps the paint.
- **Anti-cheat** (BL-147) waits for 1.6.1: no real players are expected before 1.7.0, and a bad wall is fixed by a wipe.
- **Admin panel** (BL-047): minimal, stats and session management (create, name, tools, wipe). Full stats from 1.6.0 (server counters, country, the client beacon); the privacy page and Terms are updated alongside.

## BL-043 One public server, running 24/7

See `docs/deploy.md`. Server side done (2026-10-25): the admin API and command (`server/admin-api.ts`, `server/admin.mjs`), sessions the admin makes (public or private, a name, tools; they stay when empty), public ones kept in `DATA_DIR` with their paint (`server/kept.ts`), private sessions up to 4. Left: the deploy (`docs/ideas/vps.md` item 2). The tools a session allows are stored and listed, not yet applied in the game (BL-154).

## BL-046 A queue to enter the server

Blocked by: BL-043; Status: Blocked, priority Medium, size M

(no body in the backlog)

## BL-047 Admin panel: players online, ban by IP

Blocked by: BL-043; Status: Blocked, priority Medium, size L

See who is online; block by IP forever or for a time.

## TASK-189 House rules before joining a public server

Status: the rules screen is in (the public join dialog: house rules, 18+, Terms and Privacy linked, recorded sessions; "Don't show again" per device). Left: the Terms' moderation section.

On the way into a public server, the house rules and one action to accept them (joining is the action): players are 18+; joining accepts the Terms and the Privacy Policy, linked; sessions may be recorded and published, nicknames included. Remembered per device in `localStorage` (strictly necessary: no consent needed). Why: playing alone binds no one to the Terms. The Terms get their moderation section with it (SECRET_legal.md).
