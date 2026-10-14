# Playtest of 2026-10-12: multiplayer findings

What the main playtest of `v1.2.0-playtest.2` showed, kept for fixing multiplayer bugs and for finding causes. The fixes themselves are in `docs/backlog.md` (items say "playtest of 2026-10-12"). The raw data (telemetry jsonl, server log, memory samples) holds player names and hashed addresses: it is **not in the repo** and never goes there. Players are labelled here by device, not by name.

Build under test: `v1.2.0` plus the playtest telemetry (branch `feat/playtest-telemetry`, kept for the next playtest, tag `v1.2.0-playtest.2`; server and client together). Protocol 4. Host: a VPS (4 shared vCPU, 8 GB), Caddy in front, `roof` container (`mem_limit` 3 GB, 2 cpus, `HOST_MEMORY` 2048, `SNAPSHOT_MEMORY` 2560).

## The short version

- The game and the server held: 2.6 h, up to 7 players, no client error, no dropped report, nobody turned away, server CPU near idle.
- Players on weak links dropped again and again (81 drops, code 1006), in waves of 2–3 players. Players on good links hardly dropped.
- Three game faults sit on top of the weak networks: it sends too much (paint ops are 94% of the downstream bytes), the server's 10 s heartbeat kills links that are only stalled downstream, and a rejoin throws away the strokes made since the stall began.
- The "low fps" of two Macs was the browser's 30 Hz power-saver cap, not the game. One Intel iGPU really was too slow.

## The data and what it can't tell

- `playtest-2026-10-12.jsonl`: 14 751 lines up to 19:41 UTC (the session ran on until 20:50, with two players after 19:34). Kinds: `window` (a client's 5 s report), `hitch`, `mouse`, `mark` (F9), `process` and `session` (server, every 5 s), `link`, `event`.
- `roof-server-2026-10-12.log` (server log, with raw addresses) and a once-a-minute sampler of the container's memory and CPU.
- A client reports only while its link is live. **Nothing from a client is recorded during an outage**, which is when we most want it: 13 client-side `closed` events exist for 81 drops.
- The server sees `ws.bufferedAmount` ≈ 0 on every link, even ones that died: Caddy drains the local socket at once, so the queue to a slow client sits in Caddy and the kernel.
- Not in the data: the display's refresh rate, the browser's power-saver state, the final 70 minutes, the closing of the session (20:50) and the memory after it.
- Two players on one home network, and three on one VPN exit address, are not independent.

## Players (device, network)

| Device | Browser | Network | Time in session |
|---|---|---|---|
| Win, RTX A2000 Laptop, 60 Hz | Chrome 154 | home Wi-Fi, no VPN | 2 h 40 (host) |
| MacBook M1 Pro, 120 Hz | Chrome 152 | same home Wi-Fi; from 17:36 phone hotspot (4 address changes) | 2 h 29 |
| MacBook M1, 60 Hz | Chrome 149 | no VPN | 2 h 33 |
| Win, RTX 3080 Ti, 120 Hz, 3840×2160 buffer on a 2560×1440 screen | Edge 155 | VPN (exit shared with two others) | 2 h 24 |
| Mac M5, 120 Hz | Yandex | VPN (shared exit) | 2 h 15 |
| Mac M5 Pro, 120 Hz | Edge 155 | VPN (shared exit) | 1 h 8 |
| Win, 10 cores, "4 GB", GPU hidden by Brave | Brave | VPN | 1 h 19 |
| Win, RTX 4060 Laptop | Yandex | VPN | 26 min |
| Win, Intel Iris Xe | Chrome 154 | VPN | 6 min |

Players in the session at once: 7 for 32 min (18:24–18:57), 6 for 102 min. All Chromium; no Firefox, Safari, Linux or phone.

## How much got painted

At 19:41 the server held 326 MB of paint of 565 MB "if all painted" (58%). That counts the atlases of every surface touched, not covered pixels: the paint file was 129 MB raw of 565 (about 23%) and 3.3 MB packed. Ops made by clients: 4.2 M stamps, 1.0 M rolls, 69 k drips.

## Client performance

- 6 of 9 devices held 60 or 120 fps (their refresh) for the whole session; GPU 3–7 ms, CPU 3–6 ms.
- **The 30 fps windows of the two Macs (323 and 222 windows) all had a 30 Hz `requestAnimationFrame` cadence:** the browser's cap on battery (unplugged), with the game at 6 CPU / 8 GPU ms. Not a game fault. The "4 GB / Brave" device can't be judged (Brave hides the GPU and may fake memory).
- **The Iris Xe took 23 ms of GPU a frame** (1536×695 buffer, 30 fps) and the player left after 6 min. The only real hardware limit seen.
- 158 hitches (over 100 ms, none over 275 ms). **94 are `paint + hud` laps of 100–1100 ms (median 230) with 170–470 uploads and 28–195 MB in one frame; 83 of them came within 30 s after a welcome:** a join or rejoin uploads every paint page in one frame.
- JS heap: ~0.5 GB steady at 58% painted (the CPU copy of the paint, ~320 MB, counts in it); on each join it jumps to 0.8–1.0 GB for some seconds. Heap limit 4 GB.
- GPU paint pages: 49 pages, 1041 MB (the same as the backlog's "Paint pages at ULTRA"). All painted would be more (estimate 1.5–2 GB, not measured).
- A 4K buffer on a 1440p screen is wasted work. The cause is a page zoomed out to ~67% (the buffer is in CSS pixels); fixed by BL-026.
- Other players' particles: at most 849, none lost; at most 4 sprayers at once.

## Network

### Drops

110 closes: 81 × 1006, 21 × 1001 (tab closed or reloaded), 8 × 1005 (the game's own close). 112 links: 14 new players, 98 comings back, 0 takeovers.

Drops (1006) per link-hour: 10.6 and 10.1 (the home Wi-Fi pair), 8.8 and 5.4 (two of the VPN trio), 2.3, 1.6, 1.3, then 0 and 0. 51 of 81 fell in 17:00–18:00; 3 after 19:00. 25 of the 76 clusters (closes within 12 s) involve two or more players, among them three-player clusters at 17:50, 18:28 and 18:32 (the VPN trio and the host).

### What was found

1. **Every player received about the same bytes** (0.5–1.2 GB each), 94% of them paint ops (3.8% player state, 1.6% paint files). An op is a JSON stamp of ~250 B (stamp 237, roll 297); a painting player makes a median 140 ops/s (p90 700, p99 1760, max 1900). Server out: p50 0.5 MB/s, p99 3.2 MB/s, max 4.5 MB/s.
2. **Weak-link players died in proportion to what they received.** Share of 5 s windows followed by a 1006 within 25 s, by the link's download rate:

   | download | weak links (home Wi-Fi, VPN trio) | good links |
   |---|---|---|
   | under 100 KB/s | 1.5% | 0.4% |
   | 100–200 | 4.8% | 0.9% |
   | 200–300 | 9.9% | 1.4% |
   | 300–500 | 18.9% | 1.1% |
   | over 500 | 27.9% | 4.1% |

   Their upload rate showed no trend.
3. **The kill is the server's heartbeat.** 79 of 81 1006s end on a multiple of 10 s after the socket opened (`server/main.ts`: a ws ping every 10 s, `terminate()` when no pong came since the last). In 62 of 69 drops with reports, the client's last report reached the server less than 10 s before the kill (median 3 s): the uplink worked; the server's ping sat in the downlink queue behind ops. App pings of 11–16 s were measured; the clients' own silence counters were 40–69 s at worst.
4. **A rejoin makes the next drop likelier.** 32 of 81 drops came within 30 s of a (re)join, 12 links died before their welcome arrived. A welcome carries the paint file (0.3 MB at 17:12, 3.4 MB at 19:35), over the path that just failed. Join time (connect to in-session): p50 3.9 s, p90 12.2 s, max 17.8 s, for files of a few hundred KB (≈70 KB/s).
5. **The players' networks decided who dropped,** and the home pair shows it: the host's Wi-Fi had a pause over 300 ms in 50% of its 5 s windows before 17:37 (both on it), 35% until 18:30 and 13% after, once the other had moved to a phone hotspot. Their own drops went from 18 before 17:37 to 6 in the next two hours (the host's from 18 to 8). Weaker evidence: they were back on the home network for a minute (18:49:26–18:50:29) and dropped at its end.
6. **The three VPN players share an exit address;** their drops coincide (18:31–18:33), and one of them switched exit at 17:16.
7. Ping (app level) medians 64–134 ms (players to the server); maxima 2–16 s on the weak links.

### What it doesn't show

- Where the queue sits: Caddy, the host's kernel send buffer (`tcp_wmem` up to 4 MB per socket, `tcp_notsent_lowat` unlimited), the provider or the VPN all give the same picture. A 4 MB buffer is ~16 s at 2 Mbit/s, which matches.
- Whether a stalled link would have recovered by itself had nobody killed it. The game itself closes after 6 s of silence from the server (`lastHeard`, `SERVER.ping * 3`) and reconnects, which starts the paint-file download.

### Rollbacks of painting

Confirmed in the code (`Multiplayer.welcome`, `src/net/multiplayer.ts`): a welcome replaces the player's paint with the server's file ("what we painted while the link was down is gone with it") and empties `ops`, `opTimes` and `paint.log`. Ops sent into a stalled socket are never acknowledged and never resent. Lost work = silence until the game gives up (≥6 s) + the retry wait + the rejoin (median 4 s) = 3–20 s of strokes.

### "DISCONNECTED" next to everyone (open)

The label is only shown for a presence `dropped` that the **server** sent (`server/session.ts`, `broadcast` in `dropped`); a player whose own link stalls sees `NO SIGNAL` for the others instead. The data doesn't explain why the host saw all others as DISCONNECTED. Candidates: the others really were being dropped at the same moments (the 17:16–17:34 clusters); or a welcome after a rejoin lists others as `dropped`; or a burst of queued `presence` messages after a stall. To find: replay a two-client session with one client's downlink stalled and look at `presence` and `players[].state` in what the other client receives.

## Server

- CPU: median 0.07 core, max 0.46 core per 5 s (2 allowed); sampler max 18% of one core per minute. Event loop p99 ≤ 5.3 ms; max 100–116 ms now and then, none at the drop clusters (68–93 ms there); one 1088 ms block at HOST (level build).
- Memory: rss peak 542 MB, container peak 560 MiB; live (heap + arrayBuffers) 320–417 MB at 58% painted.
- Out 7.3 GB, in 1.45 GB by the per-link counters up to 19:41 (devops' figure for the same period: 6.78 and 1.35 GB; not explained).
- Paint files: 84 served, up to 129 MB raw / 3.3 MB packed, ≤ 1.4 s each, never anyone waiting.
- Headroom: CPU is not the limit. One fully painted session is about 0.6–0.7 GB, so 3 fit under `HOST_MEMORY` (2048) and 4 in the container. The network is the limit: out ∝ painters × listeners. With today's ops, 20 players with 4–5 painting would be ~60 Mbit/s out and ~400 KB/s into every client (estimate), worse than what already killed weak links. With ops ~10× smaller, 20 players is plausible.
- **A closed session's paint stays in memory until a GC.** In Node 24, 320 MB of dropped `ArrayBuffer`s stay (rss 366 MB) while idle; `gc()` frees them (rss 47 MB). So ~500 MiB after a close is garbage, not a leak. `liveMemory` counts it against `HOST_MEMORY`.

## Odd things in the data

- 5 players came in as new after the 60 s rejoin window ran out (one player three times, another once): their stepladder and carried items were lost. The host reloaded the page 14 times in 2.6 h.
- Link and byte counts differ from the devops notes by 1 link and 7% of traffic.
- The report prints `Infinity` for a percentile that falls in the histogram's open top bucket.
- The stall and silence counters also count a peer whose tab is hidden.
- 15 of the 16 F9 marks are at 17:12–17:43, in the worst drops.
- The Brave device reports GPU "Brave" and 4 GB.

## Checks after each fix

The scenarios in `npm run test:weak-link` play most of these back on one machine (`docs/testing.md`); the next playtest checks them on real networks.

| Fix (backlog) | How to see it worked |
|---|---|
| Heartbeat counts any client message; longer wait before reconnect | Two clients, one with its downlink throttled (DevTools "Slow 3G" or `tc`): no 1006 from the server while its `state` still arrives; the stall ends in a burst, not a drop. |
| Acked ops | Paint 10 s, cut the client's network for 15 s while painting, restore: all strokes are still there, on both clients and in the server's paint. |
| Binary, merged ops | Golden paint tests identical; bytes per op ~20 B in the next playtest; server out for the same painting ≤ 1/8. |
| Shed on high ping | With the link throttled, ping stays under ~1 s and the others' players still move (newest `state` only). |
| First upload spread (BL-025, done) | After a welcome, no frame over ~50 ms in `paint + hud`. The heap spike is BL-083. |
| `gc()` on close | Idle container memory falls to ~50 MiB a minute after the last session closes. |

## The next playtest

Separate networks for all players; 12–20 players with two or three weak laptops and Firefox/Safari; say who is on VPN. Log the display's refresh rate and the power-saver state; have the server log each link's ping and `bufferedAmount` (set `tcp_notsent_lowat` on the host so the queue shows); keep client reports during an outage and send them after the rejoin; fix `Infinity`; count a hidden peer apart. Run it once more after the heartbeat, ack and op-size fixes and compare with the table above. Host-side knobs (`tcp_notsent_lowat`, BBR) change only with the owner's OK.
