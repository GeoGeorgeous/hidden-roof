# Changes for the host (VPS)

What the repo needs from the host, collected for devops: each change outside this repo goes here when its repo part lands, and leaves once devops reports it done. The host itself: `docs/deploy.md`.

## Waiting

1. **Precompressed assets (BL-030).** Once the build writes `.br` and `.gz` next to each asset: in the game's Caddy block, `file_server { precompressed br gzip }` in place of plain `file_server`, and `encode` kept for anything without a file (`docs/deploy.md` §5). Check: `curl -sI -H 'Accept-Encoding: br' https://roof.hidden.haus/assets/<a js file>` answers `Content-Encoding: br`.
2. **Logs and disks, for the privacy page (TASK-186).** `public/privacy.html` now promises that every log holding IP addresses or nicknames is deleted after 14 days: the game server's Docker log (one line per join, return, leave and drop, with IP, nickname and session code) and Caddy's own log (no access log is configured; its error lines can hold an IP). Today both are rotated by size or not at all (`docs/deploy.md` §6: 3 × 10 MB for the game; no global rotation), so a quiet week keeps them for months. Make it time-based for both containers, e.g. the `journald` log driver with `MaxRetentionSec=14day`, or a daily job that drops older lines, without restarting other services unannounced. Check: no line older than 14 days in `docker logs roof` or `docker logs caddy`. Also answer, for the page: is the server's disk encrypted (LUKS or similar)? The page makes no claim until devops says yes.
