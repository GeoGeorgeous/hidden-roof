# Deploy and the VPS

Context for the agent that deploys and runs the game on the VPS. Read it before deploy or server work instead of re-auditing the VPS and the repo. It was written on 2026-10-08 from the code, `docs/multiplayer-audit.md` and a read-only recon of the VPS.

**Parts of this file go stale.** Sections marked *(changes)* follow the server work. Before relying on them, check the repo: `package.json` scripts, a server directory, a `Dockerfile`, the deploy workflow. When the repo or the VPS disagrees with this file, trust them and fix this file in the same commit as the change.

## 1. Status *(changes)*

- **Now:** single player only, as static files. The multiplayer server isn't written yet (phase 4 in `docs/multiplayer-audit.md`, section 7). There's no Dockerfile, no server code and no `ws` dependency.
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
- `?session` turns on an offline multiplayer test mode in every build. It's harmless.

## 4. The host

The host's details (machine, other services, firewall, paths) are kept out of this public repo, in `SECRET_deploy.md` (gitignored; ask the owner). Never commit them here.

## 5. Layout (agreed)

- One origin, `roof.hidden.haus`: static files at `/`, the WebSocket at `/ws`. No CORS.
- Static files go in **`<apps>/roof-www`**, mounted into Caddy as `/srv/roof:ro`. Never put them in `Caddy's data directory` (certificates) or in a repo clone's `dist*/`, where a local build would overwrite prod.
- Update the static files in place: `rsync -a --delete-delay --delay-updates dist-mp/ <apps>/roof-www/`. Never swap the directory with `mv`, because the bind mount keeps the old inode.
- **Build off the host:** in GitHub Actions (then rsync the output) or in a throwaway `node:24-slim` container. Planned flow: push to `main` → Actions builds → deploy over SSH with the repo's own deploy key.
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

## 6. The multiplayer server *(planned; changes as it's built)*

The design is in `docs/multiplayer-audit.md` (sections 0, 4, 5, 6.4, 7, 8).

- One Node.js process (Node 24) with the `ws` library. TypeScript that shares modules with the client. Not Deno, Bun or Go.
- **Bundled** (`vite build --ssr` or esbuild) in a two-stage Dockerfile: `src/` uses extensionless imports, which plain Node can't resolve.
- Compose service `roof` on the compose network, listening on 3000. **No `ports:`**: Caddy reaches it by name, and published ports would bypass the firewall.
  - `restart: unless-stopped`, `mem_limit: 1536m`.
  - Logging: json-file with `max-size: 10m` and `max-file: "3"`.
  - Healthcheck on `/healthz` (the server must implement it). The slim image has no curl: `node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"`.
- **State in RAM only:** no database, no disk, no accounts. **Restarting `roof` ends every live session** (accepted). Caddy reloads don't, thanks to `stream_close_delay`.
- Single instance: no sticky sessions, no shared store.
- Sessions:
  - 2 players, usually one session at a time.
  - Binary frames at 20 Hz, a ping every 2 s, ~7 KB/s per painter.
  - The host picks PAINT DETAIL and it's locked for the session.
  - Players give a name on HOST and JOIN.
  - A dropped player has 60 s to reconnect, then their ladder goes. A session with no one left closes.
- Sizes: a save uploaded on HOST and the join snapshot are single messages of up to ~30 MB. Set `ws` `maxPayload` explicitly (the default is 100 MiB). Paint is `Uint8Array`, so it sits outside the V8 heap and needs no `--max-old-space-size`. The worst case is ~372 MB per fully painted session at the highest detail (simulated).
- The client must reconnect on its own: a Caddy restart or a player's network drop still closes the socket.

## 7. After a deploy

- `curl -I https://roof.hidden.haus/` → 200, `cache-control: no-cache`.
- `curl -I` on a file under `/assets/` → `immutable`. With `-H 'Accept-Encoding: gzip'` → `content-encoding` is set.
- `curl -I https://roof.hidden.haus/levels/nope.json` → 404, not `index.html`.
- In a browser: no 404s, `demo.json` and both fonts load, the console is clean, the game starts.
- `scripts/smoke.mjs <url>` uses `window.game` and F3, so it only works against `npm run build` output, not the production build.
- Once `/ws` exists: the WebSocket upgrades (101), and `docker compose ps roof` is healthy.
