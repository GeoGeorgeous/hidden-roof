# Changes for the host (VPS)

What the repo needs from the host, collected for devops: each change outside this repo goes here when its repo part lands, and leaves once devops reports it done. The host itself: `docs/deploy.md`.

## Waiting

1. **Precompressed assets (BL-030).** Once the build writes `.br` and `.gz` next to each asset: in the game's Caddy block, `file_server { precompressed br gzip }` in place of plain `file_server`, and `encode` kept for anything without a file (`docs/deploy.md` §5). Check: `curl -sI -H 'Accept-Encoding: br' https://roof.hidden.haus/assets/<a js file>` answers `Content-Encoding: br`.
2. **Logs, for the privacy page (TASK-178).** Tell the owner whether the game's Caddy block keeps access logs, and how long those and the game server's Docker log (one line per join and leave, with the IP address, nickname and session code) are kept. Until then `public/privacy.html` says it generically: rotated, kept as long as the host's setup keeps them.
