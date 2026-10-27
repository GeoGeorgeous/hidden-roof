# Weak links and the next playtest (BL-024, BL-076)

Network load of paint ops and the next playtest.

## BL-024 Paint ops are 94% of the downstream bytes, ~250 B each

JSON stamps with full-precision floats and the surface key, uncompressed; a painting player makes a median 140 ops/s (p99 ~1800), and the server repeats each to the 5–6 others. Total out of the server: p50 0.5 MB/s, p99 3.2 MB/s, max 4.5 MB/s for 7 players, 7.3 GB in 2.6 h. Players on weak links (home Wi-Fi, VPN, hotspot) died more the more they received: 1.5% of 5 s windows were followed by a drop within 25 s below 100 KB/s, 28% above 500 KB/s; players on good links barely moved (0.4% to 4%). Do, in this order: (1) a binary op (quantized u/v/radius, a small integer for the surface key), every client applying the quantized values so texels still match, ~20 B; (2) merge a frame's stamps that land on the same texels; (3) when a link's ping grows past ~1 s, send it only the newest `state` per player and wait with ops. Read the header comment of `src/net/protocol.ts` first (why nothing is compressed) and `src/op-wire.ts`. Effort M–L.

Step (1) done (2026-10-14, `PROTOCOL` 6): ops travel packed (`src/op-wire.ts`): a surface as its place among the session's sorted surface keys, every number as u16 (i16 for a roll's axis); 23 B a stamp, 31 a roll, 21 a run, plus 8 a batch. The painter paints with the rounded numbers too (`painting.ts`, `paint-drips.ts`), so the loopback, saves and the server still match the browser to the bit; the golden hashes changed once (the strokes look the same, drip runs land differently). Measured (`npm run test:weak-link` `bytes`): 185 → 28 B down per stamp, so a painter's ops at the stand's rate (~4.5 KB/s) now fit the `slow` link (8 KB/s). Left: (2) and (3), only if the next playtest (BL-076) still shows weak links falling behind; (2) must paint what the merged op paints, or texels drift apart.

Measured (2026-10-27, `npm run study:load`, `server/load-study.ts`): bots join one public session (the roof at ULTRA, `PUBLIC_PLAYERS` past the limit) from addresses of their own, each sending its state 20 times a second; a share paint, a batch of stamps with each state. On a 6-core desktop, bots and server on one machine, no Caddy or TLS; 20 s a run. CPU is the server process (one thread: 100% is its limit).

| Players | Typical: 25% painting, 140 stamps/s each | Heavy: 50% painting, 700 stamps/s each (the playtest's p90) |
|---|---|---|
| 20 | CPU 19%, ping p99 3 ms; 37 KB/s down a player (19 state, 18 ops), 473 frames/s; server out 0.7 MB/s | CPU 29%, ping p99 3 ms; 174 KB/s down (155 ops), 570 frames/s; out 3.4 MB/s |
| 40 | CPU 44%, ping p99 6 ms; 77 KB/s, 975 frames/s; out 3.0 MB/s | CPU 66%, ping p99 5 ms; 358 KB/s, 1168 frames/s; out 14 MB/s |
| 60 | CPU 100%, ping p99 65 ms; 117 KB/s, 1473 frames/s; out 6.8 MB/s | CPU 100%, ping p50 2.9 s, p99 10 s: falling behind; out 23 MB/s |
| 80 | CPU 100%, ping p50 3 s, p99 12 s: falling behind | CPU 100%, ping p50 4.4 s, p99 17 s |

- **The bottleneck is the server's one thread, by frames:** every state and every ops batch goes to each other player as a frame of its own, so frames out grow with the square of the players (60 players: ~88,000 frames/s). Bytes grow the same way, but the CPU follows the frames: typical 60 (6.8 MB/s) is at 100% while heavy 40 (14 MB/s) is at 66%. Production is 4 shared vCPU (slower per core than this desktop) with Caddy's TLS for every frame on top, so expect the limit sooner there.
- **Players' links:** a state frame is 53 B for a 25 B snapshot (a 4 B length and a ~24 B JSON header). With heavy painting a player at 20 receives ~170 KB/s, the band where the first playtest's weak links dropped (100–200 KB/s: 4.8% of windows followed by a drop); typical painting is ~40 KB/s.
- **Paint doesn't grow the stream:** the ops bytes follow the painting, not the paint already there. A joiner's paint file does grow with the paint (3.3 MB at 58% in the first playtest: ~50 s at 70 KB/s, seconds on a good link); not measured here.
- **Answer:** 20 players work as is, with room; 40 work on the server, but heavy painting sends 360 KB/s to every player; 60 is the server's limit; 80 doesn't work as is. Past 40, the fix is one frame per player per tick (every state and ops batch of that tick in it: frames grow with the players, not their square, and the header goes once), a protocol change. Shedding on slow links (step 3) is what keeps weak links in at 20 with heavy painting.
- **Decided (owner, 2026-10-27), for 1.6.0:** one frame per player per tick with a binary header (PERF-264) and no state from a player standing still but two a second (PERF-265). Not taken: merging stamps, shedding on slow links (it could make play on weak links less smooth), a lower rate for far players (the maps are small). The next playtest's network data comes from the beacon (CCTV-267).

After PERF-264 (2026-10-27, the same runs): one relay frame per player per turn of the event loop.

| Players | Typical | Heavy |
|---|---|---|
| 20 | CPU 21%, ping p99 3 ms; 35 KB/s down a player, 311 frames/s | CPU 32%, ping p99 3 ms; 171 KB/s, 312 frames/s |
| 40 | | CPU 51%, ping p99 11 ms; 342 KB/s |
| 60 | CPU 51%, ping p99 8 ms; 99 KB/s, 482 frames/s | CPU 80%, ping p99 7 ms; 521 KB/s |
| 80 | CPU 55%, ping p99 13 ms; 127 KB/s, 359 frames/s | CPU 90%, ping p99 10 ms; 692 KB/s |

The frame's head (`{"type":"relay"}`, 20 B) costs ~6 KB/s a player at 20; a state is 34 B in it (was 53). At 80 with heavy painting the server is near its core again, now by the bytes: what is left past that is the players' own downlinks (~700 KB/s each).

Found (2026-10-18, T1.13): in a live session the players' paint and the server's save were not identical: ~100 of ~6,000 painted texels apart after every tool on one wall (Chromium, Firefox and WebKit alike; identical with drips off). A run's paint per row depended on the frame times of the client running it; now it depends on the row (`paint-drips.ts`, golden hashes changed once): ~50–80 texels apart. The rest is order: a run trickles in real time, so it meets the next strokes (and the sponge) at another moment on each client. Bit-exact would need a run painted whole when it starts (no trickle). Decided (owner, 2026-10-18): runs keep flowing down slowly; the drift stays. A fix would have to keep the flow on screen (e.g. the run whole in the shared paint, animated only in what's drawn).

## BL-076 The next playtest

Telemetry is kept on the `feat/playtest-telemetry` branch (tag `v1.2.0-playtest.2`), not in releases; merging it into a newer base conflicts in `knip.json`, `src/main.ts`, `src/net/multiplayer.ts`, `src/net/remotes.ts`, `src/style.css`. Lessons: two or more players on one home network can't tell their network from the game's, so ask for separate networks; have 12–20 players and a weak laptop (Intel iGPU, 8 GB) in it; log the display's refresh rate and the browser's power-saver state (two players' "low fps" was the browser's 30 Hz cap on battery, not the game); have the server log each link's ping and `bufferedAmount` (the roof server sees a ~0 queue because Caddy drains it at once: set `tcp_notsent_lowat` on the host to see it); fix the report's `Infinity` (a percentile in the histogram's open top bucket), count a hidden tab's silence apart from a real stall, and keep a client's reports during an outage and send them after the rejoin (13 client-side closes were recorded for 81 drops). Run it a second time with the binary ops (BL-024), to compare, with the list and the numbers to beat below.

## The first playtest and what the next must show

What the first big playtest (2026-10-12, build v1.2.0-playtest.2: 2.6 h, up to 7 players, protocol 4) showed, the numbers a second run must beat, and what to log. Its raw data (telemetry jsonl, server log, memory samples) holds names and hashed addresses and is not in the repo. The telemetry is on the branch `feat/playtest-telemetry` (tag `v1.2.0-playtest.2`); merging it into a newer base conflicts in knip.json, src/main.ts, src/net/multiplayer.ts, src/net/remotes.ts, src/style.css.

### Setup

- Separate networks for all players. Two on one home network, or three behind one VPN exit address, drop together and can't tell their network from the game's.
- 12-20 players, two or three weak laptops (Intel iGPU, 8 GB), some on Firefox and Safari; say who is on VPN.
- Host: a VPS (4 shared vCPU, 8 GB), Caddy in front, container `mem_limit` 3 GB, 2 cpus, HOST_MEMORY 2048, SNAPSHOT_MEMORY 2560 (the first playtest). Host-side knobs (`tcp_notsent_lowat`, BBR) change only with the owner's OK.
- Run it with the fixes in (heartbeat BL-004, acked ops BL-003, packed ops BL-024 step 1) and compare with the table below.

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
| Packed ops (BL-024 step 1, done: 28 B a stamp); merged ops (step 2, not started) | Golden paint tests identical; bytes per op ~20-30 B; server out for the same painting <= 1/8 of the table above. |
| Shed on high ping (BL-024 step 3, not started) | With the link throttled, ping stays under ~1 s and the others' players still move (newest `state` only). |
| First upload spread (BL-025, done; BL-085, BL-083) | After a welcome, no frame over ~50 ms in `paint + hud`; heap does not jump. |
| `gc()` on close (BL-027, needs the owner) | Idle container memory falls to ~50 MiB a minute after the last session closes. In Node 24 the closed session's ~320 MB of dropped ArrayBuffers stay (rss 366 MB) until `gc()` (rss 47 MB); `liveMemory` counts them against HOST_MEMORY. |

### Lessons for reading the next data

- Players are labelled by device, never by name, and the raw data never goes in the repo.
- The label "DISCONNECTED" is only ever set by the server's `presence: dropped`; a player whose own link stalls sees NO SIGNAL for the others.
- The browser's 30 Hz power-saver and a page zoomed out to ~67% (buffer in CSS pixels, now capped by BL-026) both look like a slow game. Brave hides the GPU and may fake memory ("4 GB").
- 5 players came back as new after the old 60 s window; the host reloaded the page 14 times in 2.6 h.
