# Prompt for the devops agent: deploy the playtest build

Paste the section below to the devops agent once `chore/v1.2.0-playtest` is done (`npm run check` passed) and its tag `v1.2.0-playtest` is pushed.

---

You're deploying a **temporary** playtest build of Hidden Roof to the live host for a few days, then rolling it back. Read `docs/deploy.md` (on the `v1.2.0-playtest` tag) and `SECRET_deploy.md` (ask the owner) first: they say where everything is and how a normal deploy goes. Then `docs/playtest.md` on the same tag: what this build does and why.

**What it is:** `v1.2.0` plus telemetry: clients send performance reports, the server writes them as JSON lines to the directory in the `PLAYTEST_LOG` environment variable. Protocol is still 4. Live now: `v1.2.0` (server and static files).

**Hard rules**

- Deploy the tag `v1.2.0-playtest`, never a branch tip. Don't merge, push to or change `main`, `next` or `dev`; don't run `npm version`; don't create a GitHub release; don't run `scripts/release-discord.mjs` or post anywhere.
- Keep every change to the host reversible and write each one down: you'll undo them all at rollback.
- The telemetry files hold player names and hashed IPs: never put them in the repo or anywhere public.
- Ask the owner before you stop the server: restarting `roof` ends every live session.

**Before**

1. Record the current state for rollback: the commit checked out in `<apps>/roof/repo` (`git describe --tags`), the `roof` image ID, a copy of `<apps>/roof/www` (e.g. `cp -a www www-v1.2.0`) and of the compose file.
2. `docker compose logs --since 30m roof`: no sessions live (or the owner says go).

**Deploy (server first, then the static files)**

The 1.2.0 server closes a link that sends a message type it doesn't know, so the playtest server goes up before the playtest client.

1. In `<apps>/roof/repo`: `git fetch --depth 1 origin tag v1.2.0-playtest && git checkout v1.2.0-playtest`.
2. Telemetry directory: create `<apps>/roof/playtest`, writable by the container's user (check it in the image: `node:24-slim` runs as `node`, uid 1000, if the Dockerfile says so; otherwise root).
3. Compose, for `roof` only, as a temporary override file (`docker-compose.playtest.yml`, or the edit recorded so you can undo it):
   - `environment: PLAYTEST_LOG: /data/playtest`
   - `volumes: - ./roof/playtest:/data/playtest`
4. `docker compose up -d --build roof` (with the override). Wait for `docker compose ps roof` to be healthy.
5. Build the client off the host, from the same tag (`deploy.md` §5: a throwaway `node:24-slim` container, `npm ci && npm run build`), and rsync `dist/` to `<apps>/roof/www` as in §5 (`--delete-delay --delay-updates`, never `mv`).

**Check**

1. `docs/deploy.md` §7, all of it. `/ws` answers `roof server · protocol 4`.
2. The pause menu shows `v1.2.0-playtest`.
3. Two browser windows: HOST in one, JOIN in the other, play for 30 s. A `playtest-YYYY-MM-DD.jsonl` appears in `<apps>/roof/playtest` and grows: `client` lines from both players, `session` and `process` lines every 5 s. Check one line of each kind parses (`tail -n 1 … | jq .`).
4. The server log (`docker compose logs roof`) shows no `bad message` lines.
5. Disk: free space on the volume, and the file's growth rate (expect ~10 MB an hour at 8 players). Tell the owner if the disk can't hold a week of that.

**While it runs (a few days)**

- Once a day: the files grow, the server is healthy, no `bad message` or `server error` lines, disk OK. Report it to the owner in two lines.

**Collect**

When the owner says the playtest is over: `tar czf playtest-<dates>.tar.gz` the directory, copy it off the host to the owner (outside any repo), and check its size and that it opens.

**Roll back (to v1.2.0)**

1. Ask the owner; no sessions live.
2. Server: in `<apps>/roof/repo`, `git fetch --depth 1 origin tag v1.2.0 && git checkout v1.2.0`; remove the compose override (or undo the edit); `docker compose up -d --build roof`; healthy.
3. Static files: rsync the saved `www-v1.2.0` (or a fresh `v1.2.0` build) into `<apps>/roof/www` the same way.
4. `deploy.md` §7 again; the pause menu shows `v1.2.0`.
5. Playtest tabs still open: they send telemetry only when the server's welcome asks for it, so on 1.2.0 they behave as 1.2.0.
6. Once the owner has the data: delete `<apps>/roof/playtest` and `www-v1.2.0`. Tell the owner, who deletes the branch and the tag on GitHub.

**Or on to v1.3.0** if it's released by then: do the rollback's step 2's compose part (remove the override), then the normal 1.3.0 deploy from `docs/deploy.md` on the `v1.3.0` tag (server and client together, as its §1 says), then step 6.

**End with:** what you did (each host change and its undo), what you checked and saw, and anything odd, with the log lines.
