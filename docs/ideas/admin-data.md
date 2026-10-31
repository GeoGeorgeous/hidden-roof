# Admin data for 1.6.0 (CCTV-253 to CCTV-260)

Why the admin page (cctv) gets what it gets from the server. The API itself, its rules and what is kept for how long: `docs/admin-api.md`, the one contract (ADMIN_API 4 since CCTV-278); the host side: `docs/deploy.md` §6 and §9.

The 1.6.0 items (CCTV-253 to CCTV-260) are in the backlog's Done; ADMIN_API 4 regrouped them after the page's redesign (CCTV-278).

## Decisions (owner, 2026-10-27)

- Events are kept on disk, bounded so they can never fill it; the page shows 50 a page.
- Stats per session belong to its paint: a wipe resets them (the server's history keeps counting); a restored save brings its own back.
- Saves: 5 kept by age for public sessions; private ones are never kept, their paint downloads as it is now.
- A new session starts empty or from an uploaded save.
- The beacon carries ids: a page id (each page load) and the device id (`src/stored.ts`), for counts that are right. A well-known way: as an analytics client id and a page view id.
- People in one model (CCTV-260); the owner reviews it live.
- Each figure on the page says how fresh it is, and the tooltip says where it comes from.

## Decisions (owner and cctv, 2026-10-31)

- ADMIN_API 4 breaks once instead of adding to 3: prod has no admin API yet and staging only runs it, and the page's redesign replaced its mock data anyway. The routes are grouped by what they describe (server, live, events, stats by group, sessions), each `/stats/*` with one period contract (`from`, `to`, `days`, `before`). After it the rule is as before: additions keep the version, the rest bumps it.
- The history, people's hashes and traffic's hourly hashes are kept 91 days (`SERVER.historyDays`, was 30), so a 30-day period has one to compare with.
- The salt changes at each month's start (UTC) and its key is gone at once: a person can't be matched across a change by hash, and a month counts each visitor once.
- History forever, without longer salts (owner, "days on the device", over a yearly salt): the game keeps the day it first played and the last day it played beside its device id, and the beacon sends them. Each day keeps, as counts only, how many devices came how many days after their first play and after their play before; from those, players over any range (each once), new and returning, and retention by first-play day, for good. New and returning are never null now. Older games' devices are unknown, never new. The usual way: a client's install date (as game analytics keep first_open).
- Kept forever as counts: each day's play, paint and people, and the site's months (visitors each once a month).
- A clean slate (owner): the stats start with 1.6.0 on 2026-11-01; whatever staging counted before is deleted, and a traffic reader with no state counts only from its first day.
- The last 60 minutes are kept in memory (pages, players, bytes each way, turned away), so the page's minute lines don't depend on it being open; lost on restart.
- Visitors by country over a period: each visitor's hash keeps the country of their first view in an hour (owner), so a period counts each visitor once by country.
- No medians from the server: play lengths come as a histogram by minute.
- An idle page (no input for `NET.beaconIdle` s) is told by the game's beat, so it's as fresh as the beat (a minute); a player's state in a session comes from their link, live.

