# Server operations

Host and deploy chores (outside the game code).

## BL-030 Precompressed assets

Caddy compresses every response on the fly (zstd at its default level comes out 1.5% bigger than gzip for the game's JS: 911 KB → ~270 KB). Brotli 11, made at build time, would be ~20% smaller and cost no CPU per request. Do: Vite emits `.br` and `.gz` next to each asset, and Caddy serves them (`file_server { precompressed br gzip }`, `docs/deploy.md` §5, on the host).

Triage notes (2026-10-14): needs the host: Caddy's `precompressed` is set on the VPS, outside this repo.

## BL-077 Deploy from GitHub Actions

Push to `main` → Actions builds → deploy over SSH with the repo's own deploy key (`docs/deploy.md`, section 5).
