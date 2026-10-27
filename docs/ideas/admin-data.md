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

## CCTV-254 Stats per session

- A session counts, since its paint began (made, wiped or restored): stamps by tool, colors, painters (distinct nicknames that painted), player-seconds, joins, most players at once and when. Counted where the history counts them (`server/counts.ts`), never in a pass of its own.
- `stats: { since, began: 'made'|'wiped'|'restored', restoredAt?, stamps: { can, marker, roller, sponge }, colors: { <name>: n }, painters, playSeconds, joins, peak: { players, at } | null }`, in `GET /sessions` and in the stream's status sessions. After a restore, `since` is the restored paint's own start and `restoredAt` the restore's time. `today` stays.
- Kept sessions: each save has its stats beside it (`<code>-<ms>.json`, painters as names), loaded with it at start or on a restore. A wipe zeroes them.
- The history (`/history`) is unchanged: it counts every session, wipes or not.

## CCTV-255 Saves: kept by age, downloaded, restored

- Each save listed as `{ at, bytes, wiped?, stats: { stamps, painters } }` (stamps: all tools but the sponge).
- Retention, after each save: the newest, and the newest at least 6 h, 1 day, 3 days and 7 days old (`SERVER.keepAges`, replaces `keepFiles`); the rest go. A save that fills two slots is kept once, so there may be fewer than 5.
- A wipe keeps the session's saves aside as wiped, as now (the last wipe's only); they are listed and can be restored.
- `GET /sessions/CODE/saves/<ms>`: that save's paint file, named as `/paint`'s (Content-Disposition). `GET /sessions/CODE/paint` stays: a fresh paint file of any session, private ones too.
- `POST /sessions/CODE/restore` with `{ "save": <ms> }` or `{ "upload": "<id>" }` (CCTV-256): the session's paint and stats become that save's. Its players reconnect onto it, with the loading screen; a save is made of the paint before, so a restore can be undone: the answer is `{ undo: <ms> }`, that save. In the disk work's line (`kept.ts`), so it never meets a save half written; 409 `{ error }` while one is under way. Event `restored`, detail `{ from: 'save'|'upload', save?, upload?, undo }`.
- If the game needs a new message for it, PROTOCOL goes up, and a deploy then wipes the kept paint (as any protocol change does): say so before merging.

## CCTV-256 A new session from a save

- `POST /uploads` with the raw paint file (up to `SERVER.uploadBytes`, the ULTRA roof fully painted fits): checked as a save is loaded (`server/paint-check.ts`: level, protocol, surface table, detail); kept in `DATA_DIR/uploads` for `SERVER.uploadMinutes`. Sent as application/octet-stream. The answer: `{ upload, level, detail, bytes, expires }`, or 400 `{ error }`.
- `POST /sessions` takes `"upload": "<id>"` as well: made on that level at that detail, with its paint. Without it, empty as now; an unknown or expired upload is 404 `{ error }`.
- Caddy's request size limit for `/api/*` must let the file through (`docs/ideas/vps.md`).

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
- `/history` gains `players: { device, address }` (a page that reached the level, or a JOIN) and `inSessions: { device, address }` (a JOIN), each one once over the period (24 h, 7 d, 30 d). `countries` becomes players by device, each by their last country. "merged" goes (a household on one address counted as one).
- Visitors count once over the period too: the web log's hashes are kept with a 30-day salt, as people's are, instead of one day. `/traffic?days=N` gains a top-level `visitors` (unique over the N days) and its `steps` count visitors once over them too.
- Compatibility: the new fields come beside the old at ADMIN_API 2; once cctv reads only the new ones, one change removes `people.merged`, `byDevice`, `byIp` and the like and bumps it to 3, deployed with that cctv.
- Main: the funnel Visitors > Views > Players > In sessions for today, and Now beside it; Stats: the same per period. The tile that mixed the beacon's count and the sessions' players goes.
