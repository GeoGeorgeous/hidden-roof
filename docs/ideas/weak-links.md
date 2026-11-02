# The next playtest (BL-076)

What the first playtest showed, what the next must show and what to log. The network's capacity and the paint drift between clients are lasting limits: `docs/known-limits.md` (Multiplayer).

## BL-076 The next playtest

The first playtest's telemetry is on the `feat/playtest-telemetry` branch (tag `v1.2.0-playtest.2`), never merged (it conflicts in `knip.json`, `src/main.ts`, `src/net/multiplayer.ts`, `src/net/remotes.ts`, `src/style.css`). The next playtest's data comes from the beacon and the admin API (CCTV-267): before it, check which items of "What to log" below they cover. Setup, what to log and the numbers to beat are below.

## The first playtest and what the next must show

What the first big playtest (2026-10-12, build v1.2.0-playtest.2: 2.6 h, up to 7 players, protocol 4) showed, the numbers a second run must beat, and what to log. Its raw data (telemetry jsonl, server log, memory samples) holds names and hashed addresses and is not in the repo.

### Setup

- Separate networks for all players. Two on one home network, or three behind one VPN exit address, drop together and can't tell their network from the game's.
- 12-20 players, two or three weak laptops (Intel iGPU, 8 GB), some on Firefox and Safari; say who is on VPN.
- Host: a VPS (4 shared vCPU, 8 GB), Caddy in front, container `mem_limit` 3 GB, 2 cpus, HOST_MEMORY 2048, SNAPSHOT_MEMORY 2560 (the first playtest). Host-side knobs (`tcp_notsent_lowat`, BBR) change only with the owner's OK. Today's production: `docs/deploy.md` (`hostMemory` 1024).
- Every fix in the table below is in the game (since 1.6.0 also one frame per player per tick, PERF-264, and fewer states from a player standing still, PERF-265); compare with the numbers to beat.

### What to log (missing the first time)

- The display's refresh rate and the browser's power-saver state (two Macs' "30 fps" was the browser's 30 Hz cap on battery; the game used 6 CPU / 8 GPU ms).
- The server: each link's ping and `ws.bufferedAmount`. It read ~0 for every link, even dead ones: Caddy drains the local socket at once, so the queue sits in Caddy and the kernel (`tcp_wmem` up to 4 MB a socket, `tcp_notsent_lowat` unlimited; 4 MB is ~16 s at 2 Mbit/s). Set `tcp_notsent_lowat` on the host to make it show.
- Client reports during an outage, kept and sent after the rejoin (13 client-side `closed` events exist for 81 drops).
- A hidden tab's silence counted apart from a stall.
- The report printed `Infinity` for a percentile in the histogram's open top bucket (fixed on the telemetry branch: prints `>` the bucket's edge); re-check after any merge.
- Open question: would a stalled link have recovered had nobody killed it? (The game itself gives up after NET.serverSilence and reconnects, which starts the paint-file download.)

### Numbers to beat (first playtest)

| What | First playtest |
|---|---|
| Drops (code 1006) | 81 in 2.6 h; per link-hour 10.6 and 10.1 (home Wi-Fi pair), 8.8 and 5.4 (two of the VPN trio), 2.3, 1.6, 1.3, 0, 0 |
| Closes | 110: 81 x 1006, 21 x 1001 (tab closed), 8 x 1005 (the game's own); 112 links: 14 new players, 98 comings back, 0 takeovers |
| Clusters | 25 of 76 clusters (closes within 12 s) involve two or more players; three-player clusters at 17:50, 18:28, 18:32 |
| Drops within 30 s of a (re)join | 32 of 81; 12 links died before their welcome arrived |
| Bytes | every player received 0.5-1.2 GB, 94% paint ops (3.8% player state, 1.6% paint files); an op ~250 B (stamp 237, roll 297); a painting player median 140 ops/s (p90 700, p99 1760, max 1900) |
| Server out | p50 0.5 MB/s, p99 3.2 MB/s, max 4.5 MB/s; 7.3 GB out and 1.45 GB in |
| Drop risk by download rate (share of 5 s windows followed by a 1006 within 25 s), weak links / good links | <100 KB/s 1.5% / 0.4%; 100-200 4.8% / 0.9%; 200-300 9.9% / 1.4%; 300-500 18.9% / 1.1%; >500 27.9% / 4.1% |
| App ping | medians 64-134 ms; maxima 2-16 s on weak links |
| Join time (connect to in-session) | p50 3.9 s, p90 12.2 s, max 17.8 s for files of a few hundred KB (~70 KB/s) |
| Frames | 158 hitches over 100 ms (none over 275 ms); 94 were `paint + hud` laps of 100-1100 ms (median 230) with 170-470 uploads, 83 within 30 s of a welcome |
| Client memory | JS heap ~0.5 GB steady at 58% painted, 0.8-1.0 GB for some seconds on each join; GPU paint pages 49, 1041 MB |
| Server | CPU median 0.07 core, max 0.46 per 5 s; event loop p99 <= 5.3 ms; rss peak 542 MB; live 320-417 MB at 58% painted; paint files 84 served, <= 1.4 s each |
| Painted | 326 MB of 565 MB "if all painted" (58%); paint file 129 MB raw (23%), 3.3 MB packed; client ops 4.2 M stamps, 1.0 M rolls, 69 k drips |
| Spray of others | at most 849 particles, none lost, at most 4 sprayers at once |

Capacity as measured then: CPU is not the limit; one fully painted session ~0.6-0.7 GB, so 3 under HOST_MEMORY 2048. The network is: out grows with painters x listeners; 20 players with 4-5 painting would have been ~60 Mbit/s out and ~400 KB/s into every client (estimate, at 250 B an op).

### Checks after each fix (by hand, on real networks)

`npm run test:weak-link` plays most of these on one machine (docs/testing.md); the playtest checks them on real networks.

| Fix | How to see it worked |
|---|---|
| Heartbeat counts any client message; longer wait before reconnect (BL-004, done) | Two clients, one with its downlink throttled (DevTools "Slow 3G" or `tc`): no 1006 from the server while its `state` still arrives; the stall ends in a burst, not a drop. |
| Acked ops (BL-003, done) | Paint 10 s, cut the client's network for 15 s while painting, restore: all strokes are still there, on both clients and in the server's paint. |
| Packed ops (BL-024 step 1, done: 28 B a stamp); fewer ops a second (TASK-231) | Golden paint tests identical; bytes per op ~20-30 B; server out for the same painting <= 1/8 of the table above. |
| First upload spread (BL-025, done; BL-085, BL-083) | After a welcome, no frame over ~50 ms in `paint + hud`; heap does not jump. |
| `gc()` (BL-027: the server runs with `--expose-gc` and collects before refusing a session for memory) | Idle container memory falls to ~50 MiB a minute after the last session closes. In Node 24 the closed session's ~320 MB of dropped ArrayBuffers stay (rss 366 MB) until `gc()` (rss 47 MB); `liveMemory` counts them against HOST_MEMORY. |

### Lessons for reading the next data

- Players are labelled by device, never by name, and the raw data never goes in the repo.
- The label "DISCONNECTED" is only ever set by the server's `presence: dropped`; a player whose own link stalls sees NO SIGNAL for the others.
- The browser's 30 Hz power-saver and a page zoomed out to ~67% (buffer in CSS pixels, now capped by BL-026) both look like a slow game. Brave hides the GPU and may fake memory ("4 GB").
- 5 players came back as new after the old 60 s window; the host reloaded the page 14 times in 2.6 h.
