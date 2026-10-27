# Admin data for 1.6.0 (CCTV-253 to CCTV-260)

What the admin page (cctv) gets from the server next, after the owner's list of 2026-10-27. The page's own items (CCTV-252, CCTV-257) need nothing here. The API's rules stay as in `docs/ideas/public-servers.md` (data, not views; times ISO UTC, durations in seconds, sizes in bytes). ADMIN_API stays 2 for additions; a field removed, renamed or with a new meaning bumps it (cctv checks for an exact match). Each change goes to cctv as a diff before it's merged.

## Decisions (owner, 2026-10-27)

- Events are kept on disk, bounded so they can never fill it; the page shows 50 a page.
- Stats per session belong to its paint: a wipe resets them (the server's history keeps counting); a restored save brings its own back.
- Saves: 5 kept by age for public sessions; private ones are never kept, their paint downloads as it is now.
- A new session starts empty or from an uploaded save.
- The beacon carries ids: a page id (each page load) and the device id (`src/stored.ts`), for counts that are right. A well-known way: as an analytics client id and a page view id.
- People in one model (CCTV-260); the owner reviews it live.
- Each figure on the page says how fresh it is, and the tooltip says where it comes from.

## CCTV-253 Events on disk, in pages

- Each event gets an `id`, `<ms>-<n>` (the ms time and a counter), in the stream's `recent` and `event` too; ids compare as numbers (ms, then n), never as strings. `before` takes any id, even one no longer on disk, and is exclusive.
- With DATA_DIR, each is appended as a JSON line to `events/<YYYY-MM-DD>.jsonl` (UTC day). Files older than `SERVER.eventDays` (30) go at start and once a day. A day's file stops at `SERVER.eventDayBytes`; past it events are counted, not written, and the count is written as one event when the day ends: `{ type: 'events-dropped', code: null, name: null, player: null, detail: { count, day } }`.
- `GET /events/page?before=<id>&limit=<n>` (n up to `SERVER.eventPage` 50, the default): the events before `id` (none: the newest), newest first, and `next`, the id to ask with for the page after, or null. Without DATA_DIR, from the ones in memory.
- The stream (`GET /events`) is unchanged: the recent ones at once (at least a page: `SERVER.adminEvents` >= `SERVER.eventPage`), then live ones.
- cctv: 50 a page with prev and next; page 1 is the stream's (deduped by id), page 2 asks `before` the oldest shown; prev is a stack of the `before`s used.

## CCTV-258 On the site: pages, not heartbeats

- Bug: the server counts the minute's beacons of the last 90 s, so a page counts twice for half of each minute (2 players showed as up to 5).
- Each page load makes a random `page` id (`crypto.randomUUID()`, in memory only), sent in every beacon. The server keeps each page's last beat and when (bounded as the per-address limit is), and `site` counts pages by their last beat in the window.

## CCTV-259 How fresh each figure is

- `GET /` gains `sources: { status, beacon, history, traffic, geoip }`, each `{ every: s, at: ISO | null }` (null: never, e.g. traffic without DATA_DIR, geoip without a base):  `status` (the stream's, every second), `beacon` (each page's minute), `history` (when its hour is written), `traffic` (when the web log was last read), `geoip` (the base's date).
- The server sends no words. cctv: a badge per figure (live, beacon with the next one due, hourly, daily) and a tooltip on where it comes from: the game server's own counts, the game page's beacon, the web server's log, the GeoIP base.

## CCTV-260 People in one model

| Figure | Unique by | Source |
|---|---|---|
| Visitors | address and browser, salted | web log (`roof-traffic`), bots left out |
| Views | none: page loads | web log |
| Players | device id (by address behind a switch) | beacon's first message and JOIN |
| In sessions | device id (by address behind a switch) | JOIN |
| Now | page id | beacon (menu, solo, session, hidden) and the sessions' players |

- The beacon's first message carries the device id; the server keeps it as JOIN's is (`server/people.ts`: a salted hash, 30 days), with what it was: a page that reached the level or a JOIN.
- `/history` gains `players: { device, address }` (a page that reached the level, or a JOIN) and `inSessions: { device, address }` (a JOIN), each one once over the period (24 h, 7 d, 30 d). `playerCountries`: players by device, each by their last country (the old `countries`, by merged people, goes with the bump to 3). "merged" goes (a household on one address counted as one).
- Visitors count once over the period too: the web log's hashes are kept with a 30-day salt, as people's are, instead of one day. The traffic reader keeps hourly buckets (views, bots, and each hour's visitor hashes), so its periods are the history's: `/traffic?period=today|24h|7d|30d` (rolling hours, as `/history`) answers `period`, `from` and `to` (as `/history` does) and the period's `views`, `bots`, `visitors` and `steps`, each visitor once over it (owner, 2026-10-27). `/traffic?days=N` stays for the day bars, as it is.
- Compatibility: the new fields come beside the old at ADMIN_API 2; once cctv reads only the new ones, one change removes `people.merged`, `byDevice`, `byIp`, `countries` and the like and bumps it to 3, deployed with that cctv.
- Main: the funnel Visitors > Views > Players > In sessions for today, and Now beside it; Stats: the same per period. The tile that mixed the beacon's count and the sessions' players goes.
