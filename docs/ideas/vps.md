# Changes for the host (VPS)

What the repo needs from the host, for devops: an item goes here when its repo part lands and leaves once devops reports it done. The host itself: `docs/deploy.md`.

## Waiting

1. **Log files, with the next release.** When deploying it: create `<apps>/roof/logs/server` writable by uid 1000; give `roof` (and later `roof-next`) `LOG_DIR: /logs` and that volume (`docs/deploy.md` §6); before recreating the container, save `docker logs -t roof` there, and move the saved game logs (`<apps>/roof/logs/*.log`, not `mem.log`) in, so the server cleans them too. Check: a new `YYYY-MM-DD.log` after a join.
