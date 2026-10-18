# Server operations

Host and deploy chores (outside the game code).

## BL-027 A closed session's paint stays in the server's memory until a GC

Node 24: 320 MB of dropped `ArrayBuffer`s stay (rss 366 MB) while idle, and `gc()` frees them (rss 47 MB). The host's container showed ~500 MB with no session. `liveMemory` (`server/log.ts`: heap + arrayBuffers) counts that garbage against `HOST_MEMORY`, so a new session could be turned away as busy until the next GC. Do: run `node --expose-gc` and call `gc()` when a session closes, or sum the open sessions' `memory.now` instead.

Triage notes (2026-10-14): needs the host: `--expose-gc` changes how the server is started (Dockerfile, `docs/deploy.md`); or the other way, summing the open sessions' memory, needs a decision.

## BL-030 Precompressed assets

Caddy compresses every response on the fly (zstd at its default level comes out 1.5% bigger than gzip for the game's JS: 911 KB → ~270 KB). Brotli 11, made at build time, would be ~20% smaller and cost no CPU per request. Do: Vite emits `.br` and `.gz` next to each asset, and Caddy serves them (`file_server { precompressed br gzip }`, `docs/deploy.md` §5, on the host).

Triage notes (2026-10-14): needs the host: Caddy's `precompressed` is set on the VPS, outside this repo.

## BL-077 Deploy from GitHub Actions

Push to `main` → Actions builds → deploy over SSH with the repo's own deploy key (`docs/deploy.md`, section 5).
