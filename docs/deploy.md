# Deploy and the VPS

Context for the agent that deploys and runs the game on the VPS: read it before deploy or server work instead of re-auditing the VPS and the repo. Sections marked *(changes)* follow the server work; when the repo or the VPS disagrees with this file, trust them and fix this file in the same commit.

## 1. Status *(changes)*

- **Now:** `v1.5.0` is deployed, game and server (2026-10-23; protocol 7), the log in `LOG_DIR` (section 6). The server runs with `node --expose-gc`, the Dockerfile's CMD, so no compose `command:` may override it.
- **Next release:** `v1.6.0`, not soon. For every release, check its changes for a new protocol or surface table: if there is one, deploy the server and the game together (section 6, then the static files); live sessions end, and tabs still open on the old version are told to reload. Then section 7.
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

- One Node 24 process with `ws`. `npm run build:server` → `dist-server/server/main.js`, one file with everything (plain Node can't resolve `src/`'s extensionless imports). `PORT` overrides 3000. Locally, `npm run server` builds and starts it; `npm run dev` proxies `/ws` to it.
- **Image:** the repo's `Dockerfile`: `npm ci` + `npm run build:server`, then `node:24-slim` with only `main.js`, as user `node`.
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
    volumes:
      # Writable by the image's user `node` (uid 1000), also under read_only.
      - ./roof/logs/server:/logs
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
- **The log:** with `LOG_DIR`, one file a day (`YYYY-MM-DD.log`, UTC), capped at `SERVER.logDayBytes` (20 MB: past it the day's lines are dropped after one "log full" line, as docker's rotation no longer applies to it); without it, stdout. One line per event, the session's code first (`-----` before there is one): start, host (IP, level, detail, paint memory), a player in (new, back or takeover, with IP) or turned away (why), paint files, drops (close code), out (left, or not back in 3 minutes), session closed, memory every 5 minutes while sessions are live, bad messages, errors with stacks. Lines a stranger can make at will (bad messages, links turned away or silent) are limited per address (`SERVER.noisyPerIp` a minute, then one "held back" line), so they can't fill the day's file. A `LOG_DIR` that can't be made is reported once and the log stays on stdout. IPs come from Caddy's `X-Forwarded-For`; nicknames are JSON strings. The server cleans every `*.log` in `LOG_DIR` at start and hourly (`server/log-files.ts`, in chunks of `SERVER.logChunkBytes` between which the relay runs; a `YYYY-MM-DD.log` is judged by its name and read only while its day is due, a file that fails is logged and skipped; an undated one is read again only if it changed or a day has passed): past 14 days a line keeps its time, code and player number but loses IP addresses and nicknames, past 60 it goes. Logs saved before (`docker logs -t`) can be moved there to be cleaned the same way.
- **Close codes:** 4001–4009 (`closeCode` in `src/net/protocol.ts`: version, no-session, ended, full, bad-save, bad-level, busy, replaced, too-many), 1008 a bad message, 1009 too big, 1011 a server error. Players report their side with COPY NETWORK LOG (menu).
- **State in RAM only:** no database, no accounts. Single instance.
- **Sessions:** up to 20 players (`SERVER.maxPlayers`). Player state 20 times a second, paint ops packed (`src/op-wire.ts`, ~23 B a stamp), a ping every second (`SERVER.ping`); no socket compression. The host picks PAINT DETAIL, locked for the session. A dropped player has 3 minutes to come back (`SERVER.rejoinWindow`), then their stepladder goes; a session with no one left closes.
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
