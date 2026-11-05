# Deploy and the VPS

Context for the agent that deploys and runs the game on the VPS: read it before deploy or server work instead of re-auditing the VPS and the repo. Sections marked *(changes)* follow the server work; when the repo or the VPS disagrees with this file, trust them and fix this file in the same commit.

## 1. Status *(changes)*

- **Now:** `v1.6.2` is deployed, game and server (2026-11-04; protocol 11, admin API 4), with `DATA_DIR`, the admin key, no session open, GeoIP, `roof-traffic` and the admin page's `/api/main` (sections 6 and 9), the log in `LOG_DIR`. The server runs with `node --expose-gc`, the Dockerfile's CMD, so no compose `command:` may override it.
- **Staging:** `v1.6.2` at `3caa7cc` since 2026-11-04 (protocol 11, admin API 4), public session HFUYW; the next deploy there is `next`. The admin page (cctv) is built for both servers, `main` and `next`.
- **Next release:** `v1.7.0`. Before a release `next` is deployed to staging, `next.roof.hidden.haus` (section 9), and tested there end to end first. For every release, check its changes for a new protocol or surface table: if there is one, deploy the server and the game together (section 6, then the static files); live sessions end, and tabs still open on the old version are told to reload. Then section 7.
- **Repo:** public, `https://github.com/GeoGeorgeous/hidden-roof.git`, cloned over HTTPS (the host holds no GitHub credentials). Deploy releases only: a `vX.Y.Z` tag, never a branch tip. Branches and releases: `AGENTS.md`.
- **Version:** the pause menu shows the build's `git describe` (`src/version.ts`); built without git (the image has none), `package.json`'s version, which matches the tag on a release commit.
- **Waiting for devops:** with the first deploy of `v1.7.0`'s code to staging, and again with its deploy to production, once on each, the statistics start over (the owner's decision, TASK-342). Stop that game server, then in its `DATA_DIR` empty `stats/` and `events/` and delete `bans.json`, which lifts every ban, and empty its `LOG_DIR`. Keep `traffic/`, `sessions.json` and the saves; `roof-traffic` needs no stop. Start the new version: the server makes new `salt.json` and `bans.json` itself. Report it done to the owner.
  What the repo needs from the host goes here when its repo part lands, and leaves once devops reports it done.

## 2. The game (stable)

- three.js + TypeScript + Vite. Purely static: no API, no env secrets, no external services or CDNs, no WASM, Workers or SharedArrayBuffer (so no COOP/COEP headers). Everything is generated in code, no models or textures; the only audio files are the recordings of the city and the weather (`docs/sound.md`).
- What's served: the JS/CSS bundle with the recorded sounds (`/assets/*.ogg`), the fonts (`fonts/*.woff2`), the levels (`levels/*.json`), the release pictures (`updates/*.webp`), the licenses (`licenses/*.txt`), `favicon.svg`, the Terms, Privacy and Updates pages (`updates.html`, written by the build from the release notes), and the files crawlers read (`robots.txt`, `sitemap.xml` written by the build, `llms.txt`, `site.webmanifest`, the IndexNow key `<key>.txt`: `docs/site.md`).
- **Paths are absolute** (`/assets`, `/fonts`), so the game is served from the root of its domain.
- `?level=name` fetches `/levels/name.json`; the player build ships only `LEVELS.release` (`src/config.ts`). A missing level must be a real 404: **no SPA fallback** (an `index.html` in its place breaks JSON parsing).
- Settings live in `localStorage`, per origin: changing the domain or the scheme resets them.

## 3. Builds *(changes)*

- `npm run build` → `dist/`, the player build: **deploy this one.** It leaves out the dev tools (`__DEV_TOOLS__` in `vite.config.ts`).
- `npm run build:dev` → `dist-dev/`, with the dev tools. Never deploy it.
- Building needs Node `^20.19 || >=22.12` and the devDependencies: `npm ci`, without `--omit=dev`.
- **Build from a full git clone** (not `--depth 1`, git in the build container): the sitemap's `lastmod` and the page's `dateModified` are each page's last change in git (`docs/site.md`), so a shallow clone gives every page the tag's day; the version shown is `git describe`.
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

Design and limits: `docs/known-limits.md` (Multiplayer). Code: `server/`, messages in `src/net/protocol.ts`. The admin API, its data and what is kept for how long: `docs/admin-api.md`.

- One Node 24 process with `ws`. `npm run build:server` → `dist-server/server/main.js` (the game server) and `traffic.js` (the traffic reader below), each one file with everything. **Environment** (compose `environment:`, nothing else): `PORT` (3000), `ADMIN_PORT` (3001), `ADMIN_KEY`, `ADMIN_ORIGIN`, `DATA_DIR`, `LOG_DIR`, `GEOIP_DB`, `LEVELS_DIR` (the image sets `levels`), `HOST_MEMORY` and `SNAPSHOT_MEMORY` (MB), `KEEP_EVERY` (s, 1800), `UPLOAD_BYTES` (128 MB), `REGION` (DE), `PLAYER_HOST`, and for tests `REJOIN_WINDOW`, `HELLO_TIMEOUT`, `HEARTBEAT`. Locally, `npm run server` builds and starts it; `npm run dev` proxies `/ws` to it.
- **Image:** the repo's `Dockerfile`: `npm ci` + `npm run build:server`, then `node:24-slim` with only `main.js`, `traffic.js`, `levels/` and `admin.mjs` (the admin command), as user `node`.
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
      # Public sessions, their paint saves, the admin's history and events.
      DATA_DIR: /data
      # The one origin the admin page's browser requests may come from (no path). Without it every POST from the page
      # (create, wipe, close, kick, restore) is answered 403 'origin', while the GETs still work.
      ADMIN_ORIGIN: https://cctv.hidden.haus
      # The admin API's key: a long random string, kept on the host only.
      ADMIN_KEY: ${ROOF_ADMIN_KEY}
      # The players' country (DB-IP Lite Country, downloaded monthly by the host; read again when it changes). Without it, no country.
      GEOIP_DB: /geoip/dbip-country-lite.mmdb
      # The country code the server list shows for this server.
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

- **Deploy by hand** (by choice), from the same tag as the client: `git fetch --depth 1 origin tag vX.Y.Z && git checkout vX.Y.Z` in `<apps>/roof/repo` (a shallow clone on a detached tag: `git pull` does nothing), then `docker compose up -d --build roof` from `<apps>`. **Restarting `roof` ends every live session**; the games say so. The public sessions come back with their paint.
- **Versions:** the client sends its protocol and surface-table hash; on a mismatch the server turns it away and the client asks for a reload.
- `/healthz` answers `ok, <n> sessions` (Docker). A plain GET at `/ws` answers `roof server · protocol <n>`. Also on `/ws`, plain HTTP that Caddy's `handle /ws` already passes: `GET /ws?list` (the server list), `GET /ws?code=ABCDE` (one session, `SERVER.lookupsPerIp` a minute per address) and `POST /ws?e` (the game's beacon, once a minute and on `pagehide`; up to 4 KB, `SERVER.beaconsPerIp` a minute per address).
- **Sessions:** public up to 40 players, private up to 4 (`SERVER.players`). HOST is answered `no-host` (4010) unless `PLAYER_HOST=1`: off in 1.6.0. A dropped player has 3 minutes to come back (`SERVER.rejoinWindow`), one whose tab closed or reloaded (1001) 30 s (`SERVER.closedHold`); by token, or by nickname from the same device or network. A private session closes when no one is left; a public one, or a private one made with `--stay`, stays until the admin closes it. A full session puts players in line (`SERVER.queueMax`, 20), a dropped place held like a seat. Load: 80 players at ~55% of a core (`npm run study:load`).
- **The log:** with `LOG_DIR`, one file a UTC day (`YYYY-MM-DD.log`, capped at `SERVER.logDayBytes`, 20 MB); without it, stdout. One line per event, the session's code first: hosts, players in, turned away and out (with IP from Caddy's `X-Forwarded-For`), drops and holds, paint files, memory every 5 minutes, bad messages, errors with stacks (an uncaught one is logged and the process goes on). Lines a stranger can make are limited per address (`SERVER.noisyPerIp`). At start and hourly the server cleans every `*.log` there: past 14 days a line loses IPs and nicknames, past 60 it goes. Older `docker logs -t` output moved there is cleaned the same way.
- **Close codes:** 4001–4014 (`closeCode` in `src/net/protocol.ts`), 1008 a bad message or a link over its budget (`SERVER.linkRate`), 1009 too big, 1011 a server error, 1012 the admin's wipe or restore (the players reconnect). A kick is not a ban: a new join gets in at once. Players report their side with COPY NETWORK LOG (menu).
- **Admin** (`server/admin/`): with `ADMIN_KEY`, a JSON API on port 3001, never published; every request carries `Authorization: Bearer <ADMIN_KEY>`, and one with an `Origin` only from `ADMIN_ORIGIN`. The server reads only its environment, no `.env`. The command in the container: `docker compose exec roof node admin.mjs list`, `create public|private "Name" [--level roof] [--detail ultra] [--tools can,marker,ladder,roller,sponge] [--stay] [--players 3]`, `wipe CODE`, `close CODE` (section 8).
- **`DATA_DIR`** (only the owner may read it): `sessions.json` and each public session's saves, `<code>-<ms>.rhhpaint` with its stats beside, every 30 minutes when the paint changed and at shutdown, up to 5 kept by age (`SERVER.keepAges`). At start each is made again from its newest save that loads; a new protocol, surface table or level wipes it. A wipe sets the saves aside as `.wiped.*` (never loaded), a restore saves first (the undo). `uploads/` holds the admin's uploaded paint files for 60 minutes; `stats/`, `events/` and `traffic/` the admin's data (`docs/admin-api.md`). Leftover `.tmp` files are deleted at start; a `sessions.json` or `stats/salt.json` that can't be read is logged and kept aside as `*.bad`. Private sessions live in memory only.
- **GeoIP:** DB-IP's free country base (CC BY 4.0, about 8 MB), read again within an hour of a change, no restart. `<apps>/roof/geoip-update.sh` downloads this month's `dbip-country-lite-YYYY-MM.mmdb.gz` to a temporary name in `<apps>/roof/geoip/`, checks its size and metadata, then renames it to `dbip-country-lite.mmdb` (the server never reads half a file); the owner's crontab runs it the 3rd of each month at 06:17 host time (`17 6 3 * *`), its log in `<apps>/roof/logs/geoip.log`. One folder serves `roof`, `roof-traffic` and `roof-next`, mounted read-only.
- **Traffic:** its own container, `roof-traffic`, from the same image (`node traffic.js`), never inside the game. Every minute it reads the new lines of Caddy's JSON access log (`CADDY_LOG`), counts only requests to `TRAFFIC_HOSTS`, and writes into `DATA_DIR/traffic/` (visitors as salted hashes, a new salt each month). What each page load showed reaches it as a request for the build's `mark.txt` (`docs/admin-api.md`, `boot`): a plain static file, nothing to set on the host. It shares `DATA_DIR` and its owner with the game server, which answers the admin's traffic routes. A rolled log is read to its end, then the new one.

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

And in Caddy's site block, its access log as JSON to that directory (its own, readable by uid 1000; Caddy's own log, beside it, holds addresses and stays closed). It rolls every day and keeps 13 rolled days, so no line is older than 14 days, as the privacy page promises. **One log block and one traffic service per game site, each writing into its own server's `DATA_DIR`** (staging: section 9), or the wrong server's Traffic tab fills.

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

- **Memory:** paint is `Uint8Array`, outside the V8 heap (no `--max-old-space-size`). The roof all painted is 46 MB at LOW, 148 MEDIUM, 302 HIGH, 519 ULTRA; a session is ~15–25 MB before paint. Past `HOST_MEMORY` of live data no new session starts ("the server is full"); past `SNAPSHOT_MEMORY` no paint file is made for a joiner (busy). Paint files are made one at a time and shared by whoever joins within 15 s.
- **Limits:** a HOST link takes messages up to 64 MiB, any other up to 1 MiB, and once in a session `SERVER.linkRate` a second (past it: 1008). Per address: 24 open links, 2 HOST links, 2 hosted sessions; HOST or JOIN within 20 s (past a limit: 4009). A public session gives one address 4 seats and 4 places in line (`seats`, 4013) and 10 JOINs a minute (`rate`, 4014; a reconnect doesn't count). A message it can't handle closes that link, never the process.

## 7. After a deploy

- `curl -I https://roof.hidden.haus/` → 200, `cache-control: no-cache`.
- `curl -I` on a file under `/assets/` → `immutable`; with `-H 'Accept-Encoding: br'` → `content-encoding: br`.
- `curl -I https://roof.hidden.haus/levels/nope.json` → 404, not `index.html`; with `-A Googlebot` (or GPTBot) on `/` → 200, not 403 or 429.
- `node scripts/indexnow.mjs` → `IndexNow: 200` (or 202): the sitemap's pages to Bing and the other IndexNow engines.
- `curl -sI https://roof.hidden.haus/ | grep -o "script-src[^;]*"` shows the hash in `<apps>/roof/www/csp-hash.txt`; the browser console shows no CSP error.
- `curl https://roof.hidden.haus/ws` → `roof server · protocol <n>`, the `PROTOCOL` of the game deployed.
- `docker compose ps roof` is healthy; in two browser windows, HOST shows a code that JOIN accepts; a new file appears in `LOG_DIR`.
- In a browser: no 404s, the level and fonts load, the console is clean, the game starts at the spawn. (`scripts/smoke.mjs` needs `window.game`, so it works only against the dev server or `build:dev`.)
- With `DATA_DIR`: the log shows each kept public session again (`made by the admin`, then `paint from <file>`, or `paint wiped: a new protocol` when the release changed it, which is expected); `node admin.mjs list` shows it.

## 8. Sessions: what the owner may ask for

Everything runs from `<apps>`, with the admin command in the running `roof` container (section 6, Admin). It needs `ADMIN_KEY` set on the service (section 6, Admin); without it the command answers `401: no key` or can't connect. Report back the line the command prints: it holds the code players join with.

| The owner asks | Run |
|---|---|
| What's running | `docker compose exec roof node admin.mjs list` (each line ends with `queue: n`, the players waiting for a place in a full session) |
| A public session "Name" | `docker compose exec roof node admin.mjs create public "Name"` (roof, ULTRA, every tool; up to 40 players; stays when empty; kept with its paint through restarts) |
| A private session "Name" | `docker compose exec roof node admin.mjs create private "Name"` (up to 4 players, or fewer with `--players 2` to `--players 4`; in memory only; closes when its players have gone, or if no one comes in 10 minutes). Add `--stay` if the owner wants it to stay when empty. Send the owner its code. |
| Fewer players | add `--players 2`, `3` or `4` to a private session (a public one always takes 40); fixed at creation |
| Some tools off | add `--tools can,marker,ladder` (the tools it allows, of `can,marker,ladder,roller,sponge`); fixed at creation |
| Another detail or level | add `--detail high` (low, medium, high or ultra), `--level roof` |
| A clean wall | `docker compose exec roof node admin.mjs wipe CODE`: its paint goes, its saves are set aside as `CODE-<ms>.wiped.*` (never loaded), and its players reconnect to the clean wall at once |
| Stop a session | `docker compose exec roof node admin.mjs close CODE`: its players are told the admin ended it; a public one is no longer kept |
| Back to an older save | the admin page: the session's saves, Restore (`POST /sessions/CODE/restore`, `docs/admin-api.md`); it saves the paint now first (the undo), and the players reconnect to the restored paint |

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
    request_body {
      max_size 128MB
    }
    reverse_proxy roof-next:3001 {
      header_up Authorization "Bearer {env.ROOF_NEXT_ADMIN_KEY}"
    }
  }
  handle {
    reverse_proxy cctv-web:8080
  }
}
```

  `request_body` lets a paint file through (the admin's uploads, `SERVER.uploadBytes`, 128 MB); a lower limit refuses it with 413 before the server sees it.

  Caddy needs `ROOF_NEXT_ADMIN_KEY` in its own environment (from `<apps>/.env`), so it is **recreated** (`docker compose up -d caddy`), not reloaded, when the key is first added or changes. `/api/main/*` is the same block to `roof:3001` with `roof`'s own key (`ROOF_ADMIN_KEY`, in `<apps>/.env`), since 1.6.0.
- **`cctv-web`:** a small Caddy container like `roof-next-web`, on `:8080` (with `cap_drop: [ALL]` a port under 1024 needs `NET_BIND_SERVICE`), serving cctv's `dist/`: `/assets/*` with `Cache-Control: public, max-age=31536000, immutable`, `/` with `no-cache`, and the CSP `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`.
- **Building cctv:** on the host, from a read-only deploy-key clone (`<apps>/cctv/repo`), in a throwaway `node:24-slim` container: `npm ci && CCTV_SERVERS=main,next npm run build` (both servers on the page), then `dist/` is what `cctv-web` serves. cctv is a private repo; its own `docs/deploy.md` has the details.

**After a deploy (staging):**

- `https://next.roof.hidden.haus` loads (behind tinyauth).
- `https://cctv.hidden.haus` shows the `next` server as "Up" once signed in. Without tinyauth's cookie, a browser (its User-Agent says Chrome, Gecko, AppleWebKit, Opera or Edge) is redirected (302) to `auth.hidden.haus/login` and back after signing in; anything else (curl) gets `401` JSON with an `x-tinyauth-location` header. The page's own fetches carry the browser's User-Agent too, so an expired sign-in shows to cctv as a redirect it doesn't follow (`redirect: 'manual'`): a reload goes through the login.
- Creating a public session from cctv works. It is a POST, so this proves `ADMIN_ORIGIN` is right (wrong or missing: 403 `origin`, while the page still lists sessions).
- A page view of `next.roof.hidden.haus` makes `<apps>/roof-next/data/traffic/<today>.json` appear within a minute, and the Traffic tab shows it.
- `docker compose logs roof-next` (or its `LOG_DIR`) says `GeoIP base`, not `not read`.
