# Deploy and the VPS

Context for the agent that deploys and runs the game on the VPS: read it before deploy or server work instead of re-auditing the VPS and the repo. Sections marked *(changes)* follow the server work; when the repo or the VPS disagrees with this file, trust them and fix this file in the same commit.

## 1. Status *(changes)*

- **Now:** `v1.5.0` is deployed, game and server (2026-10-23; protocol 7), the log in `LOG_DIR` (section 6). The server runs with `node --expose-gc`, the Dockerfile's CMD, so no compose `command:` may override it.
- **Next release:** `v1.6.0` (protocol 8). Before a release `next` is deployed to staging, `next.roof.hidden.haus` (section 9), and tested there end to end first. For every release, check its changes for a new protocol or surface table: if there is one, deploy the server and the game together (section 6, then the static files); live sessions end, and tabs still open on the old version are told to reload. Then section 7.
- **Repo:** public, `https://github.com/GeoGeorgeous/hidden-roof.git`, cloned over HTTPS (the host holds no GitHub credentials). Deploy releases only: a `vX.Y.Z` tag, never a branch tip. Branches and releases: `AGENTS.md`.
- **Version:** the pause menu shows the build's `git describe` (`src/version.ts`); built without git (the image has none), `package.json`'s version, which matches the tag on a release commit.

## 2. The game (stable)

- three.js + TypeScript + Vite. Purely static: no API, no env secrets, no external services or CDNs, no WASM, Workers or SharedArrayBuffer (so no COOP/COEP headers). Everything is generated in code: no models, textures or audio files.
- What's served: the JS/CSS bundle, the fonts (`fonts/*.woff2`), the levels (`levels/*.json`), the release pictures (`updates/*.webp`), the licenses (`licenses/*.txt`), `favicon.svg`, the Terms and Privacy pages, and the files crawlers read (`robots.txt`, `sitemap.xml`, `llms.txt`, `site.webmanifest`).
- **Paths are absolute** (`/assets`, `/fonts`), so the game is served from the root of its domain.
- `?level=name` fetches `/levels/name.json`; the player build ships only `LEVELS.release` (`src/config.ts`). A missing level must be a real 404: **no SPA fallback** (an `index.html` in its place breaks JSON parsing).
- Settings live in `localStorage`, per origin: changing the domain or the scheme resets them.

## 3. Builds *(changes)*

- `npm run build` → `dist/`, the player build: **deploy this one.** It leaves out the dev tools (`__DEV_TOOLS__` in `vite.config.ts`).
- `npm run build:dev` → `dist-dev/`, with the dev tools. Never deploy it.
- Building needs Node `^20.19 || >=22.12` and the devDependencies: `npm ci`, without `--omit=dev`.
- **Precompressed files:** the build writes a `.br` and a `.gz` next to each text file of `dist/` over 1 KB that gets smaller (`PRECOMPRESS` in `src/config.ts`): the main bundle is ~950 KB raw, ~280 KB gz, ~230 KB br. Caddy serves them (section 5).

## 4. The host

Its details (machine, other services, firewall, paths, logs) are kept out of this public repo, in `SECRET_deploy.md` (gitignored; ask the owner). Never commit them here. Other projects share the host: change nothing of theirs without the owner's OK.

## 5. Layout (agreed)

- One origin, `roof.hidden.haus`: static files at `/`, the WebSocket at `/ws`. No CORS.
- **Static files via Caddy, the server apart:** `<apps>/roof/repo` is a git clone the server image is built from; `<apps>/roof/www` holds the player build, mounted into Caddy as `/srv/roof:ro`. A client-only deploy leaves `roof` running, so live sessions survive, and the game loads while the server is down.
- Never serve the static files from Caddy's data directory (certificates) or the clone's `dist*/`.
- **Build the client off the host** (no Node on it), e.g. in a throwaway `node:24-slim` container, then update in place: `rsync -a --delete-delay --delay-updates dist/ <apps>/roof/www/`. Never swap the directory with `mv`: the bind mount keeps the old inode.
- Caddy site block (the site-level `header` block is the host's security headers). Both cache `header` lines have matchers: an unmatched one would run last and overwrite the `/assets` one.

```
roof.hidden.haus {
	header {
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
		Strict-Transport-Security "max-age=31536000"
		-Server
	}
	handle /ws {
		reverse_proxy roof:3000 {
			stream_close_delay 30m
		}
	}
	handle {
		root * /srv/roof
		encode zstd gzip
		@assets path /assets/*
		@rest not path /assets/*
		header @assets Cache-Control "public, max-age=31536000, immutable"
		header @rest Cache-Control "no-cache"
		# The hash of index.html's inline script is read per request from the build's csp-hash.txt, so a deploy
		# needs no reload. No file or an empty one: inline scripts stay blocked and the game loads without the preload.
		header Content-Security-Policy "default-src 'self'; script-src 'self' {file./srv/roof/csp-hash.txt}; img-src 'self' data: blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
		file_server {
			precompressed br gzip
		}
	}
}
```

- `encode` stays for anything without a precompressed file. `stream_close_delay` keeps live games through a Caddy reload.
- The CSP is `csp` in `vite.config.ts`, tested by `npm run test:csp`: change both together. Its `script-src` hash is the build's `csp-hash.txt` (one line, `'sha256-…'`), shipped by rsync with `index.html` and read by Caddy per request (Caddy 2.11+). Missing, empty or stale, it only blocks that script and the game loads a round trip later; missing, Caddy also logs an error on every request.

## 6. The multiplayer server *(changes)*

Design and limits: `docs/known-limits.md` (Multiplayer). Code: `server/`, messages in `src/net/protocol.ts`.

- One Node 24 process with `ws`. `npm run build:server` → `dist-server/server/main.js` (the game server) and `traffic.js` (the traffic reader below), each one file with everything (plain Node can't resolve `src/`'s extensionless imports). `PORT` overrides 3000. **Environment** the server reads (compose `environment:`, nothing else): `PORT` (3000), `ADMIN_PORT` (3001), `ADMIN_KEY`, `ADMIN_ORIGIN`, `DATA_DIR`, `LOG_DIR`, `GEOIP_DB`, `LEVELS_DIR` (the image sets it to `levels`), `HOST_MEMORY` and `SNAPSHOT_MEMORY` (MB), `KEEP_EVERY` (s, 1800: the paint save interval), `REGION` (DE), `PLAYER_HOST`, and for tests `REJOIN_WINDOW`, `HELLO_TIMEOUT` and `HEARTBEAT`. Locally, `npm run server` builds and starts it; `npm run dev` proxies `/ws` to it.
- **Image:** the repo's `Dockerfile`: `npm ci` + `npm run build:server`, then `node:24-slim` with only `main.js`, `traffic.js`, `levels/` (the admin's sessions are made of these files) and `admin.mjs` (the admin command), as user `node`, with `LEVELS_DIR=levels` set.
- **Compose service:** **no `ports:`** (Caddy reaches it by name; published ports bypass the firewall). The host hardens it further (`memswap_limit`, `cpus`, `pids_limit`, `read_only` with a `/tmp` tmpfs, `cap_drop: [ALL]`, `no-new-privileges`): keep those.

```yaml
  roof:
    build: ./roof/repo
    restart: unless-stopped
    mem_limit: 3g
    environment:
      # Live data (JS heap + paint) past which no new session starts / no paint file is made (MB); keep both under mem_limit.
      HOST_MEMORY: "2048"
      SNAPSHOT_MEMORY: "2560"
      # The log's files, one a day: IP addresses and nicknames removed after 14 days, files deleted after 60 (the privacy page promises it).
      LOG_DIR: /logs
      # Public sessions and their paint saves (server/kept.ts).
      DATA_DIR: /data
      # The one origin the admin page's browser requests may come from (its address, no path). Without it every POST
      # from the page (create, wipe, close, kick) is answered 403 'origin', while the GETs still work. Needed on
      # every server the page reaches, `roof` too once the page does.
      ADMIN_ORIGIN: https://cctv.hidden.haus
      # The admin API's key (section 6, Admin): a long random string, kept on the host only.
      ADMIN_KEY: ${ROOF_ADMIN_KEY}
      # The players' country for the admin page (server/geoip.ts): DB-IP Lite Country, downloaded monthly by the host; read again when it changes. Without it, no country.
      GEOIP_DB: /geoip/dbip-country-lite.mmdb
      # The country code the server list shows for this server (default DE, SERVER.region).
      REGION: DE
      # Not set in 1.6.0: only the admin makes sessions. "1" lets players HOST their own private ones.
      # PLAYER_HOST: "1"
    volumes:
      # Writable by the image's user `node` (uid 1000), also under read_only.
      - ./roof/logs/server:/logs
      - ./roof/data:/data
      - ./roof/geoip:/geoip:ro
    # Time to save the public sessions' paint on `docker compose stop` / a redeploy.
    stop_grace_period: 60s
    logging:
      driver: json-file
      options: { max-size: 10m, max-file: "3" }
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
```

- **Deploy by hand** (by choice), from the same tag as the client: `git fetch --depth 1 origin tag vX.Y.Z && git checkout vX.Y.Z` in `<apps>/roof/repo` (a shallow clone on a detached tag: `git pull` does nothing), then `docker compose up -d --build roof` from `<apps>`. **Restarting `roof` ends every live session**; the games say so.
- **Versions:** the client sends its protocol and surface-table hash; on a mismatch the server turns it away and the client asks for a reload.
- `/healthz` answers `ok, <n> sessions` (Docker). A plain GET at `/ws` answers `roof server · protocol <n>`: a game that can't open its socket asks there, to tell a server that's down (Caddy's 502) from a blocked socket or another version.
- **The beacon** (`server/beacon.ts`, `src/beacon.ts`): every game, solo too, posts `POST /ws?e` (Caddy's `handle /ws` passes it, the CSP's `'self'` allows it) once a minute, even with nothing to say (what the page is doing: menu, solo, in a session or hidden; the admin's `site`, who is on the site now), and when an error happens: its GPU, load time and chosen settings once, frame rates, join times, error messages, and the minute's game events (funnel steps, tutorial steps, pickups, jumps, falls, stepladders, screenshots, Discord clicks, setting changes, seconds playing, idle and in menus). No name; each page load makes a random page id (`crypto.randomUUID()`, in memory only) that every beacon of that page carries, and a last beacon with `bye` goes when the page is left (`pagehide`); the browser and OS come from the User-Agent; only hourly counts are kept (`stats/`), the page ids not at all. Up to 4 KB a beacon (413 past it) and 120 a minute from one address (`SERVER.beaconsPerIp`, 429 past it: a school or an office is one address). "Who is on the site" counts each page once, by its last beat in the last 90 s (`SERVER.beaconSiteSeconds`), at once gone when its goodbye comes; up to `SERVER.beaconPages` pages are kept; a game without a page id counts each beat as a page.
- **The server list** (`server/lobby-http.ts`), plain HTTP on the same `/ws` (Caddy already passes it with its query), no WebSocket, never cached: `GET /ws?list` answers `{ region, sessions }`, every live session (public and private, the admin's and players') with `kind`, `name`, `limit`, `tools` and its players' names, public ones first, then the fullest; only a public session carries its `code`. `GET /ws?code=ABCDE` answers that one session (any kind, with its code) or `404 {}`, also for a code that isn't 5 letters of the code alphabet. Lookups by code are limited per address (`SERVER.lookupsPerIp`, 30 a minute, then `429 {}`) so codes can't be tried one after another; the list is not limited. `REGION` sets the country code in the list. A plain GET at `/ws` is unchanged.
- **The log:** with `LOG_DIR`, one file a day (`YYYY-MM-DD.log`, UTC), capped at `SERVER.logDayBytes` (20 MB: past it the day's lines are dropped after one "log full" line, as docker's rotation no longer applies to it); without it, stdout. One line per event, the session's code first (`-----` before there is one): start, host (IP, level, detail, paint memory), a player in (new, back or takeover, with IP) or turned away (why), paint files, drops (close code), out (left, or not back in 3 minutes), session closed, memory every 5 minutes while sessions are live, bad messages, errors with stacks. Lines a stranger can make at will (bad messages, links turned away or silent) are limited per address (`SERVER.noisyPerIp` a minute, then one "held back" line), so they can't fill the day's file. A `LOG_DIR` that can't be made is reported once and the log stays on stdout. IPs come from Caddy's `X-Forwarded-For`; nicknames are JSON strings. The server cleans every `*.log` in `LOG_DIR` at start and hourly (`server/log-files.ts`, in chunks of `SERVER.logChunkBytes` between which the relay runs; a `YYYY-MM-DD.log` is judged by its name and read only while its day is due, a file that fails is logged and skipped; an undated one is read again only if it changed or a day has passed): past 14 days a line keeps its time, code and player number but loses IP addresses and nicknames, past 60 it goes. Logs saved before (`docker logs -t`) can be moved there to be cleaned the same way.
- **Close codes:** 4001–4011 (`closeCode` in `src/net/protocol.ts`: version, no-session, ended, full, bad-save, bad-level, busy, replaced, too-many, no-host, kicked), 1008 a bad message, 1009 too big, 1011 a server error, 1012 the admin's wipe dropping the players so they reconnect to the clean wall. A kicked player's reconnect with its old token is answered `kicked` for `SERVER.rejoinWindow`; a new join (no token) gets in at once: a kick is not a ban. Players report their side with COPY NETWORK LOG (menu).
- **State in RAM**, but the kept paint above: no database, no accounts. Single instance.
- **Sessions:** public ones up to 20 players, private ones up to 4 (`SERVER.players`); each session has its own limit (a private one made for `SERVER.privateMin` (2) to 4, the admin's with `--players`, a player's in HOST), shown in the list and the welcome. HOST is answered `no-host` (4010) unless `PLAYER_HOST=1` (`SERVER.playerHost`): off in 1.6.0. Player state 20 times a second, paint ops packed (`src/op-wire.ts`, ~23 B a stamp), a ping every second (`SERVER.ping`); no socket compression. The host picks PAINT DETAIL, locked for the session. A dropped player has 3 minutes to come back (`SERVER.rejoinWindow`), then their stepladder goes; a private session closes when no one is left; a public one, or a private one the admin made with `--stay`, stays until the admin closes it (a private one of the admin's without it also closes if no one comes in 10 minutes, `SERVER.adminWait`).
- **The line** (`server/queue.ts`): a JOIN that finds a session full waits instead of being turned away: the server answers `queued` (its `position`, 1 = next, and a `token`) and sends it again whenever the position changes; the welcome follows once a place is free. First come, first served: when a player is removed (left, or not back in `SERVER.rejoinWindow`) the first entry whose link is open comes in exactly as a JOIN would (the log says "admitted from the line", then the usual "in from ..."). At most `SERVER.queueMax` (20) entries per session, held ones included; one more is answered `full` (4004) as before. A waiting link is ignored but for `leave` (out of the line, the link closes 1000) and `ping` (answered `pong`); the server pings it like a player. A waiting link that closes keeps its entry, held, for `SERVER.rejoinWindow`: a JOIN with `queue` set to its token (same code) takes it back at the same place; the line goes past a held entry when a place frees, and its position counts it until it goes. After the window, or for a token the line does not know, a JOIN is a normal one (it may wait again at the back). A session that ends (admin close, or closing with no one left) answers every waiting link `ended`. Log lines about the line (waits, leaves, held, back, expired) are rate-limited per address like other lines a stranger can make; admitting is always logged. A wipe does not touch the line.
- **Admin** (`server/admin-api.ts`): with `ADMIN_KEY` set, a JSON API on port 3001 (`ADMIN_PORT`), never published; every request carries `Authorization: Bearer <ADMIN_KEY>`, and one with an `Origin` header only from `ADMIN_ORIGIN` (the admin page's origin, e.g. `https://cctv.hidden.haus`; `http://localhost:5173` for its dev server on a local `ADMIN_KEY=… ADMIN_ORIGIN=… npm run server`; the server reads only its environment, no `.env` file). Its routes are listed at the top of `server/admin-api.ts`; `GET /machine` reads CPU, RAM, disk and the paint saves of the machine it runs on. The command in the container asks it: `docker compose exec roof node admin.mjs list`, `create public|private "Name" [--level roof] [--detail ultra] [--tools can,marker,ladder,roller,sponge] [--stay] [--players 3]`, `wipe CODE`, `close CODE`. A public one keeps its code, name and tools through restarts. Errors: `400 {error}` for a bad request, `403 'origin'` for a browser request from another origin, `413 {error}` for a body over `SERVER.adminBody` bytes, `500 {error}` for a server failure. `GET /` carries `slowPing` (ms, the threshold behind each session's `ping.slow`); each session's `today` carries `colors` (paint by color code) beside `topColor`. Every event has an `id` (`<ms>-<n>`); with `DATA_DIR` each is appended to `events/<UTC day>.jsonl` (30 days, `SERVER.eventDays`; a day's file stops at `SERVER.eventDayBytes`, 5 MB, so 150 MB at most, and the events it had no room for come as one `events-dropped` event of the next day), and `GET /events/page?before=ID&limit=N` answers older ones, newest first, with `next`.
- **Kept paint** (`server/kept.ts`): with `DATA_DIR`, every public session the admin made is listed in `sessions.json` and its paint saved there every 30 minutes when it changed (`SERVER.keepEvery`) and at shutdown, as `<code>-<ms>.rhhpaint`, the newest 3 kept; the admin's wipe renames the newest 3 to `<code>-<ms>.wiped.rhhpaint`, which are never loaded nor rotated away. At start each is made again under its code from its newest save that loads, so a crash or a host outage loses at most the last interval. A new protocol, surface table or level wipes it; a release that changes none keeps the paint. Private sessions live in memory only. The disk work (a save, a wipe, a close, `sessions.json`) goes one task at a time, in order; a failed save is logged and tried again at the next one, and shutdown waits for a save under way. At start, leftover `.tmp` saves are deleted; a `sessions.json` that does not parse is kept aside as `sessions.json.<ms>.bad` (the paint files stay; the sessions are made again by the admin); an unreadable level file (too many open files, a wrong `LEVELS_DIR`) leaves its session and saves for the next start, and only an absent or invalid level forgets them. The admin's history is there too, in `stats/`: a file a day (its hours for 30 days, then only its total, kept forever) and `peak.json`, written once a minute when it changed and at shutdown. Unique people (`server/people.ts`): each play's device id (the game's, from `localStorage`) and address (IPv6 by its /64), only as hashes salted with `stats/salt.json` (a new salt every 30 days, never logged or sent), and its country, a file a day (`people-<day>.json`), deleted after `SERVER.historyDays` (30). People are counted distinct within one salt period, so the 30-day count can count a returning person twice across a salt change. Only the owner may read these files.
- **Traffic** (`server/traffic*.ts`): its own container, `roof-traffic`, from the same image (`node traffic.js`), never inside the game. Every minute (`SERVER.trafficEvery`) it reads the new lines of Caddy's JSON access log (`CADDY_LOG`) from where it stopped, and counts per UTC day: page views (HTML, bots apart; a returning visitor's page answered 304 counts as a view too), distinct visitors (a salted hash of address and browser, an IPv6 address by its /64, a new salt every day), bots, pages, sources (the first of `?ref=`, `utm_source`, the referring site, else direct), `utm_campaign`, countries (`GEOIP_DB`), and visitors per step (a page, the game's script, a beacon, a multiplayer link). Only requests to `TRAFFIC_HOSTS` count. Days go to `DATA_DIR/traffic/<day>.json`, kept forever; `traffic/state.json` holds where it stopped and, only while the day lasts, its salt and hashes (owner only): the first pass after the day is over drops them, so a day's file keeps counts only. A visitor is pseudonymous for that day (a hash that whoever holds the salt could match to an address), not anonymous; the privacy page says so (TASK-242). The game's admin API answers them at `GET /traffic?days=N`. A rolled log is read to its end from the old file beside it, then the new one from its start.

```yaml
  roof-traffic:
    build: ./roof/repo
    command: ["node", "traffic.js"]
    restart: unless-stopped
    environment:
      CADDY_LOG: /caddy-logs/access.log
      DATA_DIR: /data
      TRAFFIC_HOSTS: roof.hidden.haus
      GEOIP_DB: /geoip/dbip-country-lite.mmdb
    volumes:
      # The directory, not the file, so a rolled log shows up (and its rest is read from the old file).
      - ./caddy/logs/access:/caddy-logs:ro
      - ./roof/data:/data
      - ./roof/geoip:/geoip:ro
```

And in Caddy's site block, its access log as JSON to that directory (its own, readable by uid 1000; Caddy's own log, beside it, holds addresses and stays closed). It rolls every day and keeps 13 rolled days, so no line is older than 14 days, as the privacy page promises. **One log block and one traffic service per game site, each service writing into its own server's `DATA_DIR`** (staging: section 9): a reader that writes into another server's directory fills that server's Traffic tab, and the tab of the server it should have served stays empty.

```
log {
  output file /var/log/caddy/access/access.log {
    roll_interval 24h
    roll_keep_for 13d
    mode 0644
  }
  format json
}
```

- **Paint files** (a joiner's paint, SAVE) are made one at a time for the whole process, deflated as read, sent in 32 KB parts; whoever joins or saves within 15 s of one gets the same file. Past `SNAPSHOT_MEMORY` of live data no new file is made (busy).
- **Memory:** paint is `Uint8Array`, outside the V8 heap (no `--max-old-space-size`). The roof level all painted is 46 MB at LOW, 148 MEDIUM, 302 HIGH, 519 ULTRA; a session is ~15–25 MB before paint. Past `HOST_MEMORY` of live data (heap and paint, after a GC; not RSS) no new session starts ("the server is full").
- **Limits:** a HOST link (`/ws?host`) takes messages up to 64 MiB (a save), any other up to 1 MiB; Caddy's `handle /ws` matches both. Per address (`X-Forwarded-For`): 24 open links, 2 HOST links (8 in all), 2 hosted sessions; a link must send HOST or JOIN within 20 s. Past a limit: TOO MANY CONNECTIONS FROM YOUR NETWORK (4009).
- A message it can't handle closes that link, never the process; paint files and levels are checked before anything is allocated.

## 7. After a deploy

- `curl -I https://roof.hidden.haus/` → 200, `cache-control: no-cache`.
- `curl -I` on a file under `/assets/` → `immutable`; with `-H 'Accept-Encoding: br'` → `content-encoding: br`.
- `curl -I https://roof.hidden.haus/levels/nope.json` → 404, not `index.html`.
- `curl -sI https://roof.hidden.haus/ | grep -o "script-src[^;]*"` shows the hash in `<apps>/roof/www/csp-hash.txt`; the browser console shows no CSP error.
- `curl https://roof.hidden.haus/ws` → `roof server · protocol <n>`, the `PROTOCOL` of the game deployed.
- `docker compose ps roof` is healthy; in two browser windows, HOST shows a code that JOIN accepts; a new file appears in `LOG_DIR`.
- In a browser: no 404s, the level and fonts load, the console is clean, the game starts at the spawn. (`scripts/smoke.mjs` needs `window.game`, so it works only against the dev server or `build:dev`.)
- With `DATA_DIR`: the log shows each kept public session again (`made by the admin`, then `paint from <file>`, or `paint wiped: a new protocol` when the release changed it, which is expected); `node admin.mjs list` shows it.

## 8. Sessions: what the owner may ask for

Everything runs from `<apps>`, with the admin command in the running `roof` container (section 6, Admin). It needs `ADMIN_KEY` set on the service (`docs/ideas/vps.md`); without it the command answers `401: no key` or can't connect. Report back the line the command prints: it holds the code players join with.

| The owner asks | Run |
|---|---|
| What's running | `docker compose exec roof node admin.mjs list` (each line ends with `queue: n`, the players waiting for a place in a full session) |
| A public session "Name" | `docker compose exec roof node admin.mjs create public "Name"` (roof, ULTRA, every tool; up to 20 players; stays when empty; kept with its paint through restarts) |
| A private session "Name" | `docker compose exec roof node admin.mjs create private "Name"` (up to 4 players, or fewer with `--players 2` to `--players 4`; in memory only; closes when its players have gone, or if no one comes in 10 minutes). Add `--stay` if the owner wants it to stay when empty. Send the owner its code. |
| Fewer players | add `--players 2`, `3` or `4` to a private session (a public one always takes 20); fixed at creation |
| Some tools off | add `--tools can,marker,ladder` (the tools it allows, of `can,marker,ladder,roller,sponge`); fixed at creation |
| Another detail or level | add `--detail high` (low, medium, high or ultra), `--level roof` |
| A clean wall | `docker compose exec roof node admin.mjs wipe CODE`: its paint goes; its newest 3 saves stay aside as `CODE-<ms>.wiped.rhhpaint`, never loaded (a restart starts from the clean wall; a close deletes them); players are reconnected to the clean wall at once |
| Stop a session | `docker compose exec roof node admin.mjs close CODE`: its players are told it has ended; a public one is no longer kept |
| Back to an older save | `docker compose stop roof`, move the newer `CODE-<ms>.rhhpaint` files out of `<apps>/roof/data` (the newest 3 are kept, `<ms>` is when it was saved), `docker compose start roof`: it loads the newest one left |

- A name is 1 to 32 characters, in quotes. The command never changes a live session: to change its name or tools, close it and create a new one (new code).
- A restart or redeploy of `roof` saves the public sessions' paint first (`stop_grace_period`) and makes them again; private sessions end.
- Errors print as `<status>: <why>`: `400` a bad name, kind, tool, level or player limit; `404` no such code; `503` the server is full (`HOST_MEMORY`).
- **On staging** the same commands run in its container: `docker compose exec roof-next node admin.mjs list`, `create ...`, `wipe CODE`, `close CODE` (section 9). It has its own sessions, codes and key.

## 9. Staging and the admin page

`next.roof.hidden.haus` serves the `next` branch before a release, so the release is tested end to end there. Staging is a second copy of section 5 and 6 under its own names: its own server, data, key and traffic reader. Never share a `DATA_DIR`, a key or a log with `roof`: two servers writing the same saves break them.

- **The game:** a normal `npm ci && npm run build` of `next`, off the host as in section 5, rsynced into the directory the `roof-next-web` Caddy container serves. The site block is section 5's with `/ws` proxied to `roof-next:3000`, behind tinyauth (the host's forward_auth login), plus its own access log block (below).
- **The server, `roof-next`:** the image built from `next`, section 6's service with its own values:

```yaml
  roof-next:
    build: ./roof-next/repo
    mem_limit: 2g   # staging shares the host
    environment:
      HOST_MEMORY: "1200"
      SNAPSHOT_MEMORY: "1500"
      LOG_DIR: /logs
      DATA_DIR: /data
      ADMIN_KEY: ${ROOF_NEXT_ADMIN_KEY}   # in <apps>/.env, mode 600; never roof's key
      ADMIN_ORIGIN: https://cctv.hidden.haus
      GEOIP_DB: /geoip/dbip-country-lite.mmdb
    volumes:
      - ./roof-next/logs:/logs   # its own directory, never roof's
      - ./roof-next/data:/data
      - ./roof/geoip:/geoip:ro   # shared with roof, read-only
    stop_grace_period: 60s
```

  (the host's hardening lines of section 6 apply too). **Memory:** the host has 7.6 GB, shared with other projects, so `roof-next` sets `HOST_MEMORY`, `SNAPSHOT_MEMORY` and `mem_limit` low on purpose. One public ULTRA session is ~519 MB painted, a PAINT DETAIL lower is much less: make test sessions at a lower detail unless ULTRA is what is being tested.
- **Its traffic reader, `roof-next-traffic`:** section 6's `roof-traffic` with the `roof-next` image, `command: ["node", "traffic.js"]`, `CADDY_LOG=/caddy-logs/next-access.log`, `DATA_DIR=/data` mounted from `roof-next`'s data (`./roof-next/data`, so the Traffic tab of `roof-next` fills), `TRAFFIC_HOSTS=next.roof.hidden.haus`, `GEOIP_DB`, and `<apps>/caddy/logs/access` mounted read-only.
- **Its log block**, in the `next.roof.hidden.haus` site block, next to (never instead of) the one of `roof.hidden.haus`:

```
log {
  output file /var/log/caddy/access/next-access.log {
    roll_interval 24h
    roll_keep_for 13d
    mode 0644
  }
  format json
}
```

- **The admin page, `cctv.hidden.haus`:** behind tinyauth in front of everything, and it never holds a key: Caddy adds it.

```
cctv.hidden.haus {
  import tinyauth
  handle_path /api/next/* {
    reverse_proxy roof-next:3001 {
      header_up Authorization "Bearer {env.ROOF_NEXT_ADMIN_KEY}"
    }
  }
  handle {
    reverse_proxy cctv-web:8080
  }
}
```

  Caddy needs `ROOF_NEXT_ADMIN_KEY` in its own environment (from `<apps>/.env`), so it is **recreated** (`docker compose up -d caddy`), not reloaded, when the key is first added or changes. There is no `/api/main` yet: production 1.5.0 has no admin API. Once prod runs 1.6.0, add `/api/main/*` to `roof:3001` with `roof`'s key and `main` to `CCTV_SERVERS`.
- **`cctv-web`:** a small Caddy container like `roof-next-web`, on `:8080` (with `cap_drop: [ALL]` a port under 1024 needs `NET_BIND_SERVICE`), serving cctv's `dist/`: `/assets/*` with `Cache-Control: public, max-age=31536000, immutable`, `/` with `no-cache`, and the CSP `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`.
- **Building cctv:** on the host, from a read-only deploy-key clone (`<apps>/cctv/repo`), in a throwaway `node:24-slim` container: `npm ci && CCTV_SERVERS=next npm run build`, then `dist/` is what `cctv-web` serves. cctv is a private repo; its own `docs/deploy.md` has the details.

**After a deploy (staging):**

- `https://next.roof.hidden.haus` loads (behind tinyauth).
- `https://cctv.hidden.haus` shows the `next` server as "Up" once signed in. Without tinyauth's cookie, a browser (its User-Agent says Chrome, Gecko, AppleWebKit, Opera or Edge) is redirected (302) to `auth.hidden.haus/login` and back after signing in; anything else (curl) gets `401` JSON with an `x-tinyauth-location` header. The page's own fetches carry the browser's User-Agent too, so an expired sign-in shows to cctv as a redirect it doesn't follow (`redirect: 'manual'`): a reload goes through the login.
- Creating a public session from cctv works. It is a POST, so this proves `ADMIN_ORIGIN` is right (wrong or missing: 403 `origin`, while the page still lists sessions).
- A page view of `next.roof.hidden.haus` makes `<apps>/roof-next/data/traffic/<today>.json` appear within a minute, and the Traffic tab shows it.
- `docker compose logs roof-next` (or its `LOG_DIR`) says `GeoIP base`, not `not read`.
