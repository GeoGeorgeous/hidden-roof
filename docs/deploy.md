# Deploy and the VPS

Context for the agent that deploys and runs the game on the VPS. Read it before deploy or server work instead of re-auditing the VPS and the repo. It was written on 2026-10-08 from the code, `docs/multiplayer-audit.md` and a read-only recon of the VPS.

**Parts of this file go stale.** Sections marked *(changes)* follow the server work. Before relying on them, check the repo: `package.json` scripts, a server directory, a `Dockerfile`, the deploy workflow. When the repo or the VPS disagrees with this file, trust them and fix this file in the same commit as the change.

## 1. Status *(changes)*

- **Now:** `v1.0.0` is released (tag `v1.0.0` on `main`): the game and the multiplayer server (`server/`, `Dockerfile`), with `npm run check` passing. Nothing is deployed yet.
- **First deploy:** the static files first and check them (section 7), then the server and the `/ws` handle. The game loads and plays single player while the server is down.
- **Repo:** public, `https://github.com/GeoGeorgeous/hidden-roof.git`. Clone it over HTTPS: reading needs no key, so the host holds no GitHub credentials. Deploy releases only: a `vX.Y.Z` tag, checked out by tag, never a branch tip. Branches and releases: `AGENTS.md`, Releases.
- **Version:** the game shows its build's `git describe` in the pause menu (`src/version.ts`). Built without git (`node:24-slim` has none; `.dockerignore` drops `.git`), it shows `package.json`'s version, which matches the tag on a release commit.

## 2. The game (stable)

- three.js + TypeScript + Vite, with a small `vite.config.ts` (the version, the server bundle, the dev `/ws` proxy; `base: '/'`). It is purely static: no API, no env secrets, no external services or CDNs, and no WASM, Workers or SharedArrayBuffer, so no COOP/COEP headers.
- Everything is generated in code: no models, texture files or audio. The server only serves the JS/CSS bundle, two `woff2` fonts, `levels/*.json` and `favicon.svg`. The build is about 1 MB, of which the JS is ~860 KB (~250 KB gzipped).
- **Paths are absolute** (`/assets`, `/fonts`, `/favicon.svg`), so the game must be served from the root of its domain.
- `?level=name` fetches `/levels/name.json`. Without it the game opens `LEVELS.start`, and the player build ships only the levels in `LEVELS.release` (`src/config.ts`). A missing level must be a real 404. **No SPA fallback**: an `index.html` served in its place breaks JSON parsing.
- Settings are kept in `localStorage`, per origin. Changing the domain or the scheme resets them.

## 3. Builds *(changes)*

- `npm run build` → `dist/` is the player build, single player and multiplayer: **deploy this one.** It leaves out the dev tools (build mode, the F3 panel, `window.game`: `__DEV_TOOLS__` in `vite.config.ts`, false only in production mode).
- `npm run build:dev` → `dist-dev/` is the same with the dev tools. Never deploy it.
- `v1.0.0` predates this: there the player build is `npm run build:mp` → `dist-mp/`, and `npm run build` includes the dev tools. Check `package.json` of the tag you deploy.
- Building needs Node `^20.19 || >=22.12` (locally Node 24) and the devDependencies (`tsc`, `vite`): use `npm ci`, without `--omit=dev`. `dist/` and `dist-*/` are gitignored.

## 4. The host

The host's details (machine, other services, firewall, paths) are kept out of this public repo, in `SECRET_deploy.md` (gitignored; ask the owner). Never commit them here.

## 5. Layout (agreed)

- One origin, `roof.hidden.haus`: static files at `/`, the WebSocket at `/ws`. No CORS.
- **Static files via Caddy, the server apart** (decided 2026-10-08):
  - `<apps>/roof/repo`: a git clone of this repo. The server image is built from it.
  - `<apps>/roof/www`: the player build (`npm run build`, `dist/`), mounted into Caddy as `/srv/roof:ro`.
  - Why: a client-only deploy leaves the server image unchanged, so `roof` isn't recreated and live sessions survive. The game also loads while the server is down.
- Never put the static files in `Caddy's data directory` (certificates) or serve them from the clone's `dist*/`, where a local build would overwrite prod.
- Update the static files in place: `rsync -a --delete-delay --delay-updates dist/ <apps>/roof/www/`. Never swap the directory with `mv`, because the bind mount keeps the old inode.
- **Build the client off the host** (there's no Node on it): in GitHub Actions (then rsync the output) or in a throwaway `node:24-slim` container. Planned flow: push to `main` → Actions builds → deploy over SSH with the repo's own deploy key.
- **The server is started by hand** (not automated, by choice): in `<apps>/roof/repo`, `git pull`, then `docker compose up -d --build roof` from `<apps>`.
- **Client and server versions can differ** after deploys at different times. The client sends a protocol version and its surface-table hash when it connects; on a mismatch the server rejects it and the client asks for a page reload (`docs/multiplayer-audit.md`, section 4, Versions). When a deploy bumps the protocol, restart `roof` and deploy the client together: live sessions end, and old tabs are told to reload.
- Caddy site block. Two `header` lines with and without a matcher would let the unmatched one run last and overwrite the `/assets` header, so both get matchers:

```
roof.hidden.haus {
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
		header Content-Security-Policy "default-src 'self'; img-src 'self' data: blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
		file_server
	}
}
```

Add the `/ws` handle only once the server exists. The CSP is `CSP` in `vite.config.ts`, tested by `npm run test:csp` (part of `npm run check`): change both together. The `header` line without a matcher is safe here: it sets another header than the matched pair.

## 6. The multiplayer server *(changes)*

The design is in `docs/multiplayer-audit.md` (sections 0, 4, 5, 6.4, 7, 8). The code: `server/` (`main.ts`, `session.ts`), messages in `src/net/protocol.ts`.

- One Node.js process (Node 24) with the `ws` library, TypeScript that shares modules with the client.
- **Bundled:** `npm run build:server` → `dist-server/server/main.js`, one file with everything in it (`vite.config.ts`: `ssr.noExternal`). `src/` uses extensionless imports, which plain Node can't resolve, hence the bundle. `PORT` overrides 3000. Locally, `npm run server` builds and starts it, and `npm run dev` proxies `/ws` to it.
- **Image:** the repo's `Dockerfile`, two stages: `npm ci` + `npm run build:server`, then `node:24-slim` with only `main.js`, as user `node`. No `node_modules` at runtime.
- **Compose service** in `the host's compose file`. **No `ports:`**: Caddy reaches it by name on the compose network, and published ports would bypass the firewall.

```yaml
  roof:
    build: ./roof/repo
    restart: unless-stopped
    mem_limit: 3g
    environment:
      # Live data (JS heap + paint) past which no new session starts / no paint file is made (MB); keep both under mem_limit.
      HOST_MEMORY: "2048"
      SNAPSHOT_MEMORY: "2560"
    logging:
      driver: json-file
      options: { max-size: 10m, max-file: "3" }
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
```

- **Deploy it by hand** (not automated, by choice), from the same commit as the client: `git pull` in `<apps>/roof/repo`, then `docker compose up -d --build roof` from `<apps>`. Then add the `/ws` handle to the Caddy block (section 5) and reload Caddy, the first time.
- `/healthz` answers `ok, <n> sessions` (for Docker). A plain GET at `/ws` answers `roof server · protocol <n>`: a game that can't open its WebSocket asks there to tell "server down" (Caddy's 502) from "socket blocked" and from another version, so the `/ws` handle must pass plain requests too (it does).
- **The log** (`docker compose logs -t roof`): one line per event, the session's code first (`-----` before there is one): server start; host (IP, level, detail, paint memory, session count); a player in (`new`, `back` with their token, or `takeover` by name from a new tab; for the last two, the link it replaces or when their last one closed and how long it was open; whether the paint file was shared) or turned away (the reason); a paint file made (MB of paint, MB packed, seconds, how many wait in line) and, when it's dropped, how many it served if more than one; dropped (WebSocket close code); out (left, or didn't come back in 60 s); session closed (how long it ran, MB of paint, players, how many came in new, back or by takeover); every 5 minutes while sessions are live, memory (live, RSS), sessions, players; bad message; server error (with the stack). IPs come from Caddy's `X-Forwarded-For`.
- **Close codes:** a turned-away socket closes with 4001–4008 (`closeCode` in `src/net/protocol.ts`: version, no-session, ended, full, bad-save, bad-level, busy, replaced); 1008 a bad message, 1011 a server error.
- Players report problems with COPY NETWORK LOG (menu): their side of it, with close codes, timings and what `/ws` answered.
- **State in RAM only:** no database, no disk, no accounts. **Restarting `roof` ends every live session** (accepted); the games then say the session has ended. Caddy reloads don't, thanks to `stream_close_delay`.
- Single instance: no sticky sessions, no shared store.
- Sessions:
  - Up to 20 players (`SERVER.maxPlayers` in `src/config.ts`), usually one session at a time.
  - Binary frames: player state 20 times a second, paint ops as JSON (~9 KB/s up while painting nonstop), a ping every 2 s. No socket compression: full-precision numbers barely shrink, and deflating every op once per player took more than a core with 20 painting. Measured (2026-10-10, roof level, 20 players all spraying nonstop, every one sending state at 20 Hz): the server at ~20% of a core, ~280 MB RSS, ping 5 ms (p99 12 ms); each player downloads ~170 KB/s, so the server sends ~3.4 MB/s (27 Mbit/s). 19 joining one session at the same moment were all in within ~25 ms (no paint); with paint, one paint file serves them all, and each still downloads it (~28 MB for 170 MB of paint at ULTRA).
  - The host picks PAINT DETAIL (LOW to ULTRA) and it's locked for the session; the server keeps the paint at that detail.
  - Players give a name on HOST and JOIN.
  - A dropped player has 60 s to reconnect (the game retries on its own, and a reload goes back in), then their ladder goes. A session with no one left closes.
- **Paint files** (a welcome's paint, SAVE in a session) are made one at a time for the whole process, deflated as the paint is read (no full copy: about +80 MB for 170 MB of paint at ULTRA, where 1.1.0 took +650 MB), and sent in 256 KB parts, so a slow link still hears from the server. Who joins, comes back or presses SAVE while one is waiting or being made, or up to 15 s after, gets the same file (a joiner also gets the paint ops made since). HOST from a save sends no paint back (the host has it) and that save is the first paint file for joiners. Past `SNAPSHOT_MEMORY` (default 1280 MB of live data) no new file is made: a join is turned away as busy, a SAVE says the server is busy.
- Sizes: a save uploaded on HOST is one message of up to ~30 MB; `maxPayload` is 64 MiB. Paint is `Uint8Array`, outside the V8 heap, so no `--max-old-space-size`. The server's own all-painted estimate (its log line on HOST): the demo level 15 MB at LOW, 47 MEDIUM, 99 HIGH, 171 ULTRA; the roof level (the one players get, 1340 props to the demo's 344) 46 MB, 148, 302, 519. Faces pressed against another prop take no paint (src/level/cover.ts), which more than halved these. A session costs ~15–25 MB before any paint (the level's geometry); past 1 GB of live data (JS heap and paint buffers, `SERVER.hostMemory` or `HOST_MEMORY`; not RSS, which stays up after sessions end) the server takes no new sessions ("the server is full"). A stopped or restarted process gives all of it back.
- **Two endpoints, one handle:** HOST connects to `/ws?host`, which takes messages up to `maxPayload` (64 MiB, a save); everything else to `/ws`, up to `maxMessage` (1 MiB). Caddy's `handle /ws` matches both (it matches the path only). A bigger message closes that link with 1009.
- **Limits per address** (Caddy's `X-Forwarded-For`; `SERVER` in `src/config.ts`): 24 open links (a whole session behind one router), of them 2 HOST links (and 8 HOST links in all), 2 hosted sessions, and a link must send HOST or JOIN within 20 s. Past a limit the game says TOO MANY CONNECTIONS FROM YOUR NETWORK (close code 4009, `too-many` in the log). So one address holds at most 2 × 64 MiB + 22 × 1 MiB in flight, and all of them together 8 × 64 MiB in HOST links.
- Hardened against bad input: a message it can't handle closes that player's link, never the process; a paint file whose header claims more paint than the level can hold is refused before anything is allocated; a level is checked prop by prop (at most 5000).

## 7. After a deploy

- `curl -I https://roof.hidden.haus/` → 200, `cache-control: no-cache`.
- `curl -I` on a file under `/assets/` → `immutable`. With `-H 'Accept-Encoding: gzip'` → `content-encoding` is set.
- `curl -I https://roof.hidden.haus/levels/nope.json` → 404, not `index.html`.
- In a browser: no 404s, `roof.json` and both fonts load, the console is clean, the game starts.
- `scripts/smoke.mjs <url>` uses `window.game` and F3, so it only works against the dev server or `npm run build:dev` output, not the player build.
- Once `/ws` exists: `docker compose ps roof` is healthy, and in two browser windows HOST shows a code that JOIN accepts.
