# Deploy and the VPS

Context for the agent that deploys and runs the game on the VPS. Read it before deploy or server work instead of re-auditing the VPS and the repo. It was written on 2026-10-08 from the code, `docs/multiplayer-audit.md` and a read-only recon of the VPS.

**Parts of this file go stale.** Sections marked *(changes)* follow the server work. Before relying on them, check the repo: `package.json` scripts, a server directory, a `Dockerfile`, the deploy workflow. When the repo or the VPS disagrees with this file, trust them and fix this file in the same commit as the change.

## 1. Status *(changes)*

- **Now:** single player only, as static files. The multiplayer server is being written on `feat/multiplayer` (phase 4 in `docs/multiplayer-audit.md`, section 7). There it runs and is tested (`npm run test:server`, `npm run test:mp`), with a `Dockerfile`. Until it reaches `main`, `main` has no server.
- **Order:** deploy single player first, then add the multiplayer server.
- **Repo:** a GitHub repo is being created on 2026-10-08. Deploys come from `main`. Branch flow: topic branches → `dev` → `next` → `main`.

## 2. The game (stable)

- three.js + TypeScript + Vite, with no `vite.config` (defaults, `base: '/'`). It is purely static: no API, no env secrets, no external services or CDNs, and no WASM, Workers or SharedArrayBuffer, so no COOP/COEP headers.
- Everything is generated in code: no models, texture files or audio. The server only serves the JS/CSS bundle, two `woff2` fonts, `levels/*.json` and `favicon.svg`. The build is about 1 MB, of which the JS is ~830 KB (~230 KB gzipped).
- **Paths are absolute** (`/assets`, `/fonts`, `/favicon.svg`), so the game must be served from the root of its domain.
- `?level=name` fetches `/levels/name.json`. A missing level must be a real 404. **No SPA fallback**: an `index.html` served in its place breaks JSON parsing.
- Settings are kept in `localStorage`, per origin. Changing the domain or the scheme resets them.

## 3. Builds *(changes)*

- `npm run build` → `dist/` **includes the dev tools**: build mode (B), the F3 panel and `window.game`. Don't deploy it.
- `npm run build:mp` → `dist-mp/` is the same game without the dev tools (`VITE_MP=1` from `.env.multiplayer`; in `src/main.ts`, it only skips the dev tools import and the F3 defaults). **Deploy this one, single player included.**
- Planned: rework the build scripts so the production build without the dev tools isn't tied to the multiplayer name. Check `package.json` for the current script and output directory.
- Building needs Node `^20.19 || >=22.12` (locally Node 24) and the devDependencies (`tsc`, `vite`): use `npm ci`, without `--omit=dev`. `dist*/` are gitignored.

## 4. The host

The host's details (machine, other services, firewall, paths) are kept out of this public repo, in `SECRET_deploy.md` (gitignored; ask the owner). Never commit them here.

## 5. Layout (agreed)

- One origin, `roof.hidden.haus`: static files at `/`, the WebSocket at `/ws`. No CORS.
- **Static files via Caddy, the server apart** (decided 2026-10-08):
  - `<apps>/roof/repo`: a git clone of this repo. The server image is built from it.
  - `<apps>/roof/www`: the `build:mp` output, mounted into Caddy as `/srv/roof:ro`.
  - Why: a client-only deploy leaves the server image unchanged, so `roof` isn't recreated and live sessions survive. The game also loads while the server is down.
- Never put the static files in `Caddy's data directory` (certificates) or serve them from the clone's `dist*/`, where a local build would overwrite prod.
- Update the static files in place: `rsync -a --delete-delay --delay-updates dist-mp/ <apps>/roof/www/`. Never swap the directory with `mv`, because the bind mount keeps the old inode.
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
		file_server
	}
}
```

Add the `/ws` handle only once the server exists. Add a CSP (`default-src 'self'`) only after testing the game with it in a browser.

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
    mem_limit: 1536m
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
- `/healthz` answers `ok, <n> sessions`. The log has a line per session hosted (its detail and paint memory), player joined, and session closed.
- **State in RAM only:** no database, no disk, no accounts. **Restarting `roof` ends every live session** (accepted); the games then say the session has ended. Caddy reloads don't, thanks to `stream_close_delay`.
- Single instance: no sticky sessions, no shared store.
- Sessions:
  - 2 players (`SERVER.maxPlayers` in `src/config.ts`), usually one session at a time.
  - Binary frames: player state 20 times a second, paint ops as compressed JSON (~6.5 KB/s while painting nonstop), a ping every 2 s.
  - The host picks PAINT DETAIL (LOW to ULTRA) and it's locked for the session; the server keeps the paint at that detail.
  - Players give a name on HOST and JOIN.
  - A dropped player has 60 s to reconnect (the game retries on its own, and a reload goes back in), then their ladder goes. A session with no one left closes.
- Sizes: a save uploaded on HOST and the join snapshot are single messages of up to ~30 MB; `maxPayload` is 64 MiB. Paint is `Uint8Array`, outside the V8 heap, so no `--max-old-space-size`. Measured in Node for the demo level fully painted: 28 MB at LOW, 104 MEDIUM, 230 HIGH, 405 ULTRA.

## 7. After a deploy

- `curl -I https://roof.hidden.haus/` → 200, `cache-control: no-cache`.
- `curl -I` on a file under `/assets/` → `immutable`. With `-H 'Accept-Encoding: gzip'` → `content-encoding` is set.
- `curl -I https://roof.hidden.haus/levels/nope.json` → 404, not `index.html`.
- In a browser: no 404s, `demo.json` and both fonts load, the console is clean, the game starts.
- `scripts/smoke.mjs <url>` uses `window.game` and F3, so it only works against `npm run build` output, not the production build.
- Once `/ws` exists: `docker compose ps roof` is healthy, and in two browser windows HOST shows a code that JOIN accepts.
