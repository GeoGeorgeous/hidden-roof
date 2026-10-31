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
- The salt still changes every 30 days and its key is gone at once: a person can't be matched across a change. Figures that need the match (`newPlayers`, `returningPlayers`) are null for a period or a day with a change inside it, rather than wrong. No cohorts.
- The last 60 minutes are kept in memory (pages, players, bytes each way, turned away), so the page's minute lines don't depend on it being open; lost on restart.
- No medians from the server: play lengths come as a histogram by minute.
- An idle page (no input for `NET.beaconIdle` s) is told by the game's beat, so it's as fresh as the beat (a minute); a player's state in a session comes from their link, live.

