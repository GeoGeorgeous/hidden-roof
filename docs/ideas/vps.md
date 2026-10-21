# Changes for the host (VPS)

What the repo needs from the host, collected for devops: each change outside this repo goes here when its repo part lands, and leaves once devops reports it done. The host itself: `docs/deploy.md`.

## Waiting

1. **The game's log files (docs/ideas/legal.md), with the next release.** The server writes its log to files and cleans them itself once `LOG_DIR` is set (`docs/deploy.md` §6): create `<apps>/roof/logs/server` writable by uid 1000, add `LOG_DIR: /logs` and the volume to the `roof` service (and `roof-next`), and move the saved game logs (`<apps>/roof/logs/*.log`, not `mem.log`) into it, so they're cleaned the same way. Before recreating the container, save `docker logs -t roof` there too (recreating deletes the json log). Caddy's logs stay as they are: Caddy is shared with other sites.
