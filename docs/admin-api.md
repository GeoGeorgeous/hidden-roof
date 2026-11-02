# The admin API (ADMIN_API 4)

The contract between the game server and the admin page (cctv, its own repo). This file is the reference: the code
(`server/admin/`) follows it, and cctv's own `docs/admin-api.md` covers only the page side. The host side (port,
key, Caddy) is in `docs/deploy.md` §6 and §9; why the data is as it is: the last section.

## Rules

- **Data, not views.** Counts, histograms and ids; the page makes medians, shares, labels and charts.
- **Units.** Times are ISO 8601 UTC strings, durations are seconds, sizes are bytes, rates are bits a second, pings are ms. A day is a UTC day, `YYYY-MM-DD`.
- **Histograms** are `{ "<bin>": count }`, each bin key in the histogram's unit (whole minutes, whole fps, seconds to a tenth, ms by 10, KB/s to two significant digits). Bins with nothing are left out. A histogram with an open last bin says so in `settings` (`lengthMinutesMost`: that bin counts everything from it up; likewise `fpsMost` for `fps` and `low1`, `secondsMost` for `load`, `join`, `back` and `stallLong`, `pingMost` for the pings). `down` and `up` have no open bin: their bins are two significant digits (37, 120, 12000), at most about 400.
- **People** are always counted `{ device, address }`, never merged: device is the game's random id (`localStorage`), address is the IP (IPv6 by its /64). Both are kept only as salted hashes, and a distinct count is distinct inside one answer, or one day, never added across them. The salt changes at the start of each month (UTC), so a period with a month's start in it may count a person twice by hash. The game also keeps on the device the day it first played and the day it last played, and the beacon sends them: the history's new players and its counts over any range of days (History, below) come from those, never from matching hashes.
- **Versions.** `GET /` says `api: 4`; cctv checks for an exact match. A field or route added keeps the version; one removed, renamed or with a new meaning bumps it. Each change reaches cctv as a diff of this file before it's merged.
- **Errors:** `400 { error }` a bad request, `401` no key, `403 { error: 'origin' }` a browser request from another origin, `404 { error }` a session, save, upload or route that isn't there, `405 { error: 'GET' }` the wrong method (the one it takes), `409 { error }` a restore or another disk task of that session under way, `413 { error }` a body over `SERVER.adminBody` bytes, `503 { error }` no memory for it, `500 { error }` a server failure.
- **Auth.** Every request carries `Authorization: Bearer <ADMIN_KEY>`; a request with an `Origin` header is refused unless it is `ADMIN_ORIGIN`.

## Kept for how long

| What | Where | Kept |
|---|---|---|
| Hours (plays, play time, paint, beacons, bytes) | `stats/<day>.json` | `historyDays` (91), then each day's total, forever |
| People's hashes | `stats/people-<day>.json` | `historyDays` (91) |
| Salt of people's hashes | `stats/salt.json` | a new one at each month's start (UTC); the old key is gone at once. A file that can't be read is logged and kept aside as `salt.json.bad` |
| People by day (counts only) | `stats/audience-<YYYY>.json` | forever |
| Traffic months (visitors, counts only) | `traffic/months.json` | forever |
| Traffic days | `traffic/<day>.json` | forever (counts only) |
| Traffic hours with visitors' hashes (and each one's country) | `traffic/hours-<day>.json` | `historyDays` (91) |
| Bans (hashes of the address and device, nickname, reason, end) and their key | `bans.json` | until each ends or is lifted; the key never changes (a ban outlasts the month's salt). A file that can't be read is logged and kept aside as `bans.json.bad`, and no one is banned |
| Events | `events/<day>.jsonl` | `eventDays` (30), each day's file up to `eventDayBytes` (5 MB) |
| The last 60 minutes | memory | lost on restart |
| Who's on the site | memory | each page by its last beat, `beaconSiteSeconds` (90 s) |

A person seen before and after a salt change can't be matched: distinct counts by hash over a period with a month's start
in it may count them twice, and `seenDays` counts from the month's start. The History routes' counts don't match hashes and have no such limit.

## Routes

### Server

`GET /`

```
{ api: 4, version, protocol, started, now,
  sessions, players,                       // live now
  peak: { players, at } | null,            // the most players at once, ever
  limits: { public: 40, private: { min: 2, max: 4 }, name: 32,
            ban: { days: [1, 7, 14, 30, 182, null], reasonBytes: 100, reasons: [text] },   // null: for good
            adminPass: { seconds: 60 } },          // POST /sessions/CODE/admin-pass is there; a pass lives this long
  settings: { slowPing, saveEvery, saveAges: [s], eventDays, eventDayBytes, historyDays, saltEvery: 'month',
              pageIdle, playerIdle, lengthMinutesMost, fpsMost, secondsMost, pingMost },
  sources: { status, beacon, history, traffic, geoip } }   // each { every: s, at: ISO | null }
```

`settings`: `slowPing` (ms) is what a session's `ping.slow` counts past; `saveEvery` (s) how often a public session's
changed paint is saved; `saveAges` (s) the ages a save is kept for beside the newest; `pageIdle` (s) no input for
that long and a page counts as idle in `pages.by`; `playerIdle` (s) the same for a player's `state` in a session (what
the other players see); `lengthMinutesMost` the open last bin of `lengthMinutes`, `fpsMost`, `secondsMost` and `pingMost` those of the beacon's histograms (`/stats/client`). `sources`: how often each source
comes and when the last one did: the stream's status, the game's beacon, the history's write, the traffic reader's
last pass, the GeoIP base's build.

`GET /machine`: read when asked.

```
{ cpu: { percent, vcpus, load1 }, ram: { used, total }, memory: { live, limit },
  disk: { used, total }, saves: { bytes, last: ISO | null },
  upBits, downBits,                        // server → players and players → server, averaged since the last ask
  today: { upBytes, downBytes } }          // since 00:00 UTC, from the history's hours
```

`memory.limit` is `HOST_MEMORY`'s (no new session past it), in bytes.

`GET /logs` → `{ days: [{ day, bytes }], keepDays, redactDays }`, newest first. `GET /logs/DAY` that day's log file as
it is (text; addresses and nicknames for `redactDays`); `?session=CODE` only that session's lines.

### Live

`GET /events`: a server-sent event stream. First `recent` (the last `SERVER.adminEvents` events, oldest first) and a
`status`; then each `event` as it happens and a `status` every `SERVER.adminStatus` s.

```
status: { now, players, pages, sessions: [session, without its saves] }
pages:  { menu, solo, session, hidden,      // each open page once, by its last beat (the game's, once a minute)
          by: { playing, idle, menu, hidden } each { session, alone } }
```

`menu`: the page hasn't pressed Play; `solo`: in a level alone (paused too); `session`: in a session or reconnecting
to one; `hidden`: the tab is hidden. `by` splits the same pages by what they do: `playing`, `idle` (no input for
`pageIdle` s), `menu` (the main menu or paused), `hidden`, each in a session or alone. An older game's page with no
`doing` counts as `playing` unless its beat is `menu` or `hidden`. A hidden page's beat doesn't say where it is: in `by.hidden` it stays where its last beat put it (alone if it never said). As fresh as the beacon: up to 90 s.

`GET /live/minutes`: the last 60 minutes, oldest first, a snapshot at the end of each (fewer after a restart).

```
[{ at, pages, players, upBits, downBits, turnedAway: { reason: n } }]
```

`pages` as in `status`; `players` seated in sessions, dropped ones holding a seat included (as `status`); `upBits` and `downBits` the minute's average; `turnedAway` that
minute's, by reason (the close codes' names: `full`, `seats`, `rate`, `version`, ...).

### Events

`GET /events/page?before=ID&since=ID|ISO&type=T&limit=N`: older events, newest first: `{ events, next }`.
`before`: only events before that id (none: from the newest; it may be an id no longer kept). `since`: only events
after that id or time (a time as ISO with `T`, ending in `Z`). `type` (repeatable): only those types. `limit`: 1 to `SERVER.eventPage` (50), the default.
`next`: the id to ask `before` for the next page, or null at the end (or at `since`).

An event: `{ id: '<ms>-<n>', at, type, code | null, name | null, player | null, detail }`. Ids sort as numbers, ms
then n. Types and their `detail`:

| type | detail |
|---|---|
| `joined` | `how`: new, back or takeover; `waited` (s) if it came from the line |
| `left` | `why`; `played` (s) |
| `dropped` | `held` (s it has to come back) |
| `turned-away` | `reason`; for `version`, `client` and `server` (protocols) |
| `session-made` | `kind`, `limit`, `stays`, `upload` if made from one |
| `session-closed` | `why`, `kind`, `stays`, `admin`, `started` (ISO), `saves` (how many were deleted with it) |
| `wiped` | none |
| `wiped-at-start` | `cause` |
| `save-failed` | `why` |
| `restored` | `from`: save or upload; `save` (ms) or `upload` (id); `undo` (ms) |
| `events-dropped` | `count`, `day`: events a full day's file had no room for |

### Stats

Every `/stats/*` route but the History ones (below) takes `?period=today|24h|7d|30d` and answers:

```
{ period, from, to, ...figures, days?: [{ day, ...day figures }], before: { from, to, ...figures } | null }
```

`today` is since 00:00 UTC; `24h`, `7d` and `30d` are the last 24, 168 and 720 hours, this one included. `from` is
the period's start, or when the counts begin if later. The counts are by the hour: `before` is the period just before
(for `today`, yesterday from 00:00 through the same hour as now), `null` if nothing is kept that far back. `days`:
each UTC day the period touches, oldest first, cut to the period (the first may be partial; days before the counts begin are there, as zeros). `before` carries the
same figures but no `days` and no `hours` (`/stats/client`'s too: the same histograms for the period before).

`GET /stats/play`

```
plays,                                   // new players in sessions (JOINs that weren't back)
lengthMinutes: { "<min>": plays },       // plays that ended, by whole minutes; the last bin is lengthMinutesMost and up
playSeconds, withOthers,                 // player-seconds in sessions, and those with someone else in the session
joinsByWeekHour: number[7][24],          // plays by weekday (Monday first) and hour, UTC
onlineByWeekHour: number[7][24],         // mean players in sessions in that weekday-hour (play seconds / its seconds in the period), to 3 decimals
weekdays: number[7],                     // how many of each weekday the period touches
turnedAway: { reason: n },
peak: { players, at } | null
days: [{ day, plays, playSeconds }]
```

Solo play isn't seen by the server: everything here is sessions. For solo, see `/stats/client` (beacons).

`GET /stats/people`

```
players: { device, address },            // joined a session or reached the level (the beacon's first message)
inSessions: { device, address },         // joined a session
newPlayers, returningPlayers,            // by device: first played in the period (by the day it says), or before it
unknownPlayers,                          // by device: didn't say its first day (a game from before it kept one); new + returning + unknown = players.device
countries: { CC: players },              // players by device, each by their last known country
networks: { shared, devicesOnShared, devicesPerNetwork: { "1", "2-4", "5+" } }   // by address; shared: more than one device
days: [{ day, players, inSessions, newPlayers, returningPlayers, unknownPlayers }]
```

A device's first day is the one its game keeps (`localStorage`, beside the device id), so new players are new for good, not
since a salt: a device that played the period's first day before the period began counts returning (the day is the unit). A device that
doesn't say (a game from before this, or one that only joined from an older game) is unknown, in neither. An IPv4 address is
a whole address: phones behind a carrier's NAT show as shared networks.

`GET /stats/paint`

```
stamps: { can, marker, roller, sponge },  // sponge: paint cleaned
paintSeconds: { can, marker, roller, sponge },   // seconds painting, to a tenth
colors: { colorCode: ops },
days: [{ day, stamps, paintSeconds }]
```

`paintSeconds` is time paint landed, measured from the ops' own times: one player's ops with one tool at most
`SERVER.paintGap` (0.5 s) apart are one run, and the run's span counts; a longer gap starts another. Spraying into
the air or out of reach, or holding a still marker, counts nothing. Hours from before it read as 0.

`GET /stats/client`: the game's beacons (solo and in sessions). No `days`.

```
n, nGpu,                                  // page loads that reached the level, and those that named their GPU
fps, low1, load, join,                    // histograms: whole fps (open last bin: fpsMost), seconds to a tenth (secondsMost)
browsers, os, gpus: { name: n },          // up to SERVER.beaconKinds names, then Other
errors: { count, plays, byMessage },
events: { steps: { play, ready, sprayed, joined }, tutorial, counts, seconds: { playing, idle, menu }, settings, pickups },
net: { minutes, ping50, ping95, pingMax, drops, back, stalls, stallLong, down, up }
```

`events.counts` by code; the pause menu's links count as `discord`, `github`, `youtube`, `instagram`, `tiktok`, `kofi`.
A pickup counts as `pickup.<code>` once a page load (found again after a restart, not again). `events.pickups` lists every
pickup code in the game, the starting kit's left out: tools (`marker`), then caps (`cap.fat`), then colors (`color.red`).

`GET /stats/traffic`: the site's traffic from Caddy's log (the traffic reader). Each visitor once over the period.

```
views, bots, visitors,
steps: { view, script, beacon, socket },  // visitors who got that far
visitorCountries: { CC: visitors },       // each visitor once, by the country of their first view in the period
hours: [{ at, views, visitors }]          // today and 24h only: each hour, oldest first, visitors distinct within it
```

`GET /stats/traffic/days`: the site's days (History: `?from=&to=`, or `?n=N` the last N days), oldest first, a day with no counts left out:

```
{ from, to, days: [{ day, views, visitors, bots, pages, sources, campaigns, countries, visitorCountries, steps, botKinds, botPages }] }
```

`countries` is views by country, `visitorCountries` visitors (each once a day, by their first view's); `botKinds`
bot page loads by the bot's name, `botPages` by path. Names past `SERVER.trafficKinds` count as Other.

### History

Kept forever, as counts only, by UTC day or month: the audience over any range, retention, the site's months.

- `?from=YYYY-MM-DD&to=YYYY-MM-DD` on `*/days`: both days included, `to` today by default, `from` 29 days before `to`;
  at most `SERVER.statsDaysMost` (366) days, `from` after `to` or a bad date is a 400. Oldest first, today's row live,
  a day with no counts left out. `/stats/traffic/days` also still takes `?n=N` (the last N days).
- `?from=YYYY-MM&to=YYYY-MM` on `*/months`: the same, by month (this month by default, `from` 11 months before; at most 120).

`GET /stats/play/days`, `GET /stats/paint/days`: the history's days (their hours for `historyDays`, then their totals).

```
{ from, to, days: [{ day, plays, playSeconds, withOthers, lengthMinutes, turnedAway, peak }] }   // play
{ from, to, days: [{ day, stamps, paintSeconds, colors }] }                                       // paint
```

`GET /stats/people/days`: players by device over the range, and each day's players.

```
{ from, to,
  players, newPlayers, returningPlayers, unknownPlayers,   // devices over the whole range, each once (below); new + returning + unknown = players
  unmatched,                               // of unknownPlayers, device-days that said nothing at all: each may count once a day
  days: [{ day,
    players: { device, address }, inSessions: { device, address },   // distinct within the day, by hash
    newPlayers, returningPlayers, unknownPlayers,   // by device: first played that day (ages["0"]), before it, didn't say
    countries: { CC: players },            // by device, each by their last known country that day
    ages: { "<days>": devices },           // devices that said their first day: days since it
    gaps: { "<days>": devices }, gapsNone, // those devices: days since their play before; none before
    unknownGaps: { "<days>": devices }, unknownGapsNone,   // the same for devices that didn't say their first day
    unmatched }] }                         // devices that said no days at all (an older game, a join alone)
```

How the counts work. The game keeps on the device (`localStorage`, beside the device id) the UTC day it first played
and the last day it played, and the beacon's first message sends the first and the one before today (a game from before
this keeps no first day: it sends none, and is never new). A player of a day is a device that reached the level or joined,
once a day by its hash; each day keeps how many came how many days after their first play (`ages`) and after their play
before (`gaps`). So, with no hash matched across days:

- a device counts over the range on the one day of it that its play before is older than the range's start: on day d,
  the `gaps` past d − `from`, and `gapsNone` (likewise `unknownGaps` and `unknownGapsNone` for `unknownPlayers`), plus
  `unmatched` on every day (it can't be told apart);
- `newPlayers` is the sum of `ages["0"]`; `returningPlayers` is the devices that said their first day, less it;
- retention: of the devices whose first day is X (`ages["0"]` of X), those that played N days later are `ages["N"]` of day X+N.

Retention by first-play week is the page's, from these days: a cohort's devices are `ages["0"]` over its days, and
those back on day N are `ages["N"]` N days after each. A day up to today missing from `days` had no players (every count 0);
the days after today aren't there yet. `ages` and `gaps` are by device only.

A cleared site or a private window is a new device, as it is for the device id. The days come from the game: a game that
lies about them changes counts, never anything else.

`GET /stats/traffic/months`: the site's visitors by month (the traffic reader writes each month's when it ends; this month, and
months whose hours are still kept, come from the hours).

```
{ from, to, months: [{ month, views, bots, visitors, visitorCountries, steps, exact }] }
```

`visitors` is each visitor once in the month; `exact` is false for a month whose salt changed inside it (before the salt
began at months' starts), where a visitor may count twice.

### Sessions

`GET /sessions` → every live session:

```
{ code, kind, name, admin, stays, tools, level, levelPickups, detail, limit, queue, started, paintMB, emptySince | null,
  players: [{ id, name, here, ip | null, country | null, ping | null, joined, held | null, state, since, seenDays | null }],
  stats: { since, began, restoredAt?, stamps, paintSeconds, colors, painters, players, pickups, playSeconds, joins, peak },
  ping: { median | null, slow },
  saves: [{ at, bytes, wiped, undo, stats | null }] }
```

A player's `state`: `here`, `away` (the game is hidden), `menu` (paused), `idle` (nothing pressed for `playerIdle`
s), `lagging`, or `dropped` (gone; `held` s left to come back); `since` when it last changed. `seenDays`: the days
this device has played in a session, since the salt began; `null` without a device. `stats`: the session's counts
since its paint began (made, wiped or restored): `paintSeconds` as in `GET /stats/paint`; `players` the nicknames that
were in it; `pickups: { code: players }` the nicknames that found each (the starting kit and what one carried back in
don't count). `levelPickups`: the codes of the session level's pickups, in its order, each once. A save from before
paint seconds, players and pickups were kept has them as 0 and `{}`. A save's `stats` has the same shape as the session's (null if none
was kept with it); `undo`: the save a restore made first.

`POST /sessions` `{ kind, name, level?, detail?, tools?, stay?, limit?, upload? }` → the new session. `name` up to
`limits.name` characters; `level` roof by default, `detail` ultra; `tools` some of can, marker, ladder, roller, sponge
(all by default); `stay`: a private one stays when empty (a public one always does; one that doesn't closes once its
players have gone, or when no one came in `SERVER.adminWait` s: an admin looking in first doesn't close it); `limit`: its most players, from
`limits.private.min` up to `limits.private.max` for a private one or `limits.public` for a public one (that most if
none); `upload`: an id from `POST /uploads`, made on its level at its detail with its paint (a level or detail named
too must be its own; an unknown or expired one is 404).
`POST /sessions/CODE/wipe`, `POST /sessions/CODE/close`, `POST /sessions/CODE/players/ID/kick` → `{ ok: true }`.
`POST /sessions/CODE/restore` `{ save: MS } | { upload: ID }` → `{ undo: MS }`.
`POST /sessions/CODE/admin-pass` (no body) → `{ pass, expires }`: a one-time pass into that session for Join as admin
(`server/admins.ts`), good once, for `limits.adminPass.seconds` (`expires` ISO), in the server's memory only. Open
`<game address>/#join=CODE&admin=PASS`: both after `#`, so no access log or Referer has them, and the game wipes them
from the address bar. Admins are in no listing, status, count or event; a wipe, a restore or a close ends their admin
mode (closed with `closed`), and getting back in takes a new pass.
`GET /sessions/CODE/paint`: its paint as a paint file made now. `GET /sessions/CODE/saves/MS`: a kept save.
`POST /uploads` (a paint file as the body) → `{ upload, level, detail, bytes, expires }`.

### Bans

A ban keeps a player out of every session, by their address (an IPv6 one by its /64) and their game's device id:
anyone from either is turned away (`banned`) at HOST and JOIN, and the server list shows them their ban and no
sessions. Made, everyone of that address or device leaves every session and line at once, told the reason and the end:
a player in a session as a `left` event (`why`: banned by the admin), a place in line as a `turned-away` (`banned`),
counted as a refused JOIN.

`GET /bans` → the bans in force, newest first: `[{ id, name, reason, made, until | null }]` (`name`: the nickname
then; `until` null: for good). No address or device: the server keeps only their hashes.
`POST /bans` `{ code, player, days, reason }` → the ban: `player` the id of one of session `code`'s players (a dropped
one too); `days` one of `limits.ban.days`; `reason` 1 to `limits.ban.reasonBytes` bytes, one of `limits.ban.reasons` or
the admin's own (the player reads it). An unknown session or player is 404.
`POST /bans/ID` `{ days?, reason? }` → the ban changed: `days` counted from `made`, only sooner (a later end is 400).
`POST /bans/ID/lift` → `{ ok: true }`. An unknown or ended ban is 404.
A ban, a change or a lift is in force once `bans.json` has it, one at a time: a `500` changed nothing.

## Why it is so (the owner's decisions, 2026-10-25 to 2026-11-01)

- **No outside analytics service.** The game server counts players and sessions, the client beacon reports how the game runs, and a small process of our own reads Caddy's log for page views (`roof-traffic`).
- **Unique people** by a random device id (`localStorage`) and a salted address hash, shown apart, so a cleared storage or a new address still counts once. The salt changes each month and its key goes at once: no one is matched across months by hash. Long-range counts (new, returning, retention) come from the days the device keeps (first and last play, the usual install date of game analytics), never from hashes.
- **History and people kept 91 days** (`SERVER.historyDays`), so a 30-day period has one to compare with; each day's counts forever. The stats started clean with 1.6.0 on 2026-11-01.
- **Events on disk, bounded** so they can never fill it; the page shows 50 a page. The last 60 minutes stay in memory, so the minute lines don't depend on the page being open.
- **A session's stats belong to its paint:** a wipe resets them (the history keeps counting), a restored save brings its own. Saves: 5 kept by age for public sessions; a private one's paint only downloads.
- **Abuse limits** per address (an IPv6 one by its /64): rate limits, the people quota, new people from pages an hour (`SERVER.peoplePagesPerIp`); the beacon's histograms have a top bin and `down`/`up` two significant digits, so an hour holds a bounded number of keys.
- **No medians from the server:** play lengths come as a histogram by minute. Each figure on the page says how fresh it is and where it comes from.
- **ADMIN_API 4 broke once** instead of adding to 3 (prod had no admin API yet, the page's redesign replaced its mock data); since then, additions keep the version.
- **Bans** have a key of their own that never rotates, so a ban outlasts the month's salt; an ended or lifted ban is deleted at once (no history).
