# Server operations

Host and deploy chores (outside the game code).

## BL-030 Precompressed assets

Caddy compresses every response on the fly (zstd at its default level comes out 1.5% bigger than gzip for the game's JS: 911 KB → ~270 KB). Brotli 11, made at build time, would be ~20% smaller and cost no CPU per request. Do: Vite emits `.br` and `.gz` next to each asset, and Caddy serves them (`file_server { precompressed br gzip }`, `docs/deploy.md` §5, on the host).

The host's part, Caddy's `precompressed`, is listed for devops in `docs/ideas/vps.md`; the repo's part (the build writes the files, with Node's zlib, no new dependency) can land first.

## BL-077 Deploy from GitHub Actions

Push to `main` → Actions builds → deploy over SSH with the repo's own deploy key (`docs/deploy.md`, section 5).
