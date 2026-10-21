# Changes for the host (VPS)

What the repo needs from the host, collected for devops: each change outside this repo goes here when its repo part lands, and leaves once devops reports it done. The host itself: `docs/deploy.md`.

## Waiting

1. **Precompressed assets (BL-030).** Once the build writes `.br` and `.gz` next to each asset: in the game's Caddy block, `file_server { precompressed br gzip }` in place of plain `file_server`, and `encode` kept for anything without a file (`docs/deploy.md` §5). Check: `curl -sI -H 'Accept-Encoding: br' https://roof.hidden.haus/assets/<a js file>` answers `Content-Encoding: br`.
2. **The game's log files (docs/ideas/legal.md), with the next release.** The server writes its log to files and cleans them itself once `LOG_DIR` is set (`docs/deploy.md` §6): create `<apps>/roof/logs/server` writable by uid 1000, add `LOG_DIR: /logs` and the volume to the `roof` service (and `roof-next`), and move the saved game logs (`<apps>/roof/logs/*.log`, not `mem.log`) into it, so they're cleaned the same way. Before recreating the container, save `docker logs -t roof` there too (recreating deletes the json log). Caddy's logs stay as they are: Caddy is shared with other sites.
3. **Network: BBR and tcp_notsent_lowat (owner's OK, 2026-10-21; docs/ideas/weak-links.md).** Host-wide sysctl drop-in: `net.core.default_qdisc = fq`, `net.ipv4.tcp_congestion_control = bbr`, `net.ipv4.tcp_notsent_lowat = 131072`. Check: `sysctl net.ipv4.tcp_congestion_control` says bbr, `tc qdisc show` shows fq on the public interface, the sites answer as before. Undo: delete the file, `sysctl --system`.
