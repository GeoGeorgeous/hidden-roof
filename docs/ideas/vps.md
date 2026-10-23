# Changes for the host (VPS)

What the repo needs from the host, for devops: an item goes here when its repo part lands and leaves once devops reports it done. The host itself: `docs/deploy.md`.

## Waiting

1. **Staging `roof-next`: the log files and protocol 7.** `roof` has had them since v1.5.0 (2026-10-23); `roof-next` is still on protocol 6 without `LOG_DIR`. Give it `LOG_DIR: /logs` and a directory of its own (not `roof`'s: both would write the same day's file), writable by uid 1000, when it is next deployed (`docs/deploy.md` §6). Check: a new `YYYY-MM-DD.log` after a join.
