# Changes for the host (VPS)

What the repo needs from the host, collected for devops: each change outside this repo goes here when its repo part lands, and leaves once devops reports it done. The host itself: `docs/deploy.md`.

## Waiting

1. **Precompressed assets (BL-030).** Once the build writes `.br` and `.gz` next to each asset: in the game's Caddy block, `file_server { precompressed br gzip }` in place of plain `file_server`, and `encode` kept for anything without a file (`docs/deploy.md` §5). Check: `curl -sI -H 'Accept-Encoding: br' https://roof.hidden.haus/assets/<a js file>` answers `Content-Encoding: br`.
2. **Logs (docs/ideas/legal.md).** In every log on the host that holds IP addresses or nicknames (the game's and Caddy's container logs, and rsyslog's copies in `/var/log`), replace the IP addresses and nicknames after 14 days (removed outright, not hashed), and delete the logs after 60 days. Check: no IP or nickname in a line older than 14 days, no line older than 60.
