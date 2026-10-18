# Testing

How a change is verified (AGENTS.md, Verify), what each test covers, and how they stay reliable on the WSL dev machine (6 cores, often several agents testing at once). Times measured 2026-10-14 on a quiet machine (one check at a time; a second one beside it slows both).

## The checks

| Command | What | Time |
|---|---|---|
| `npm run check:quick` | Type check (game and server), the player build (`npm run build`, what's deployed), `npm test`, knip. After every change. | ~5 s |
| `npm run check` | `check:quick`, then every test below, golden paint last. Before saying a change is done, and before a merge. Stops at the first failure, then prints each step's time (`scripts/check.mjs`). | ~4–5 min |
| `npm run shots` | The real game on the real GPU (below). For every visual change. | ~15 s |

## The tests (all in `npm run check`)

| Command | What | Time |
|---|---|---|
| `npm test` | The GPU's short name per browser and OS, the performance test (what it measures over a fake timer, the 1% low and live numbers, the tiers, each tip from stand-in timings and settings), paint save files (round trip; broken, older, newer, oversized ones refused), paint mip levels (each from the one above, a changed rect alone as the whole level), protocol messages and the op batches a game keeps until the server has them, the link to the server (hello, upload, keepalive, giving up, parts; a fake socket and clock), the play state (when the game stops; Esc and Enter playing, paused, on a page, with F3 open), and the release notes (format, style rules, pictures; `docs/releases/AGENTS.md`), in Node. | <1 s |
| `npm run smoke` | The level players get loads and plays a few frames with F3 open. Fails on page errors and console errors (shader errors among them), and when turning on volumetrics or rain compiles a shader (they're compiled as the level loads). | ~8 s |
| `npm run test:boot` | The loading screen says why when the game can't start: WebGL turned off (`--disable-3d-apis`), and a file of the game that doesn't load (`src/boot.ts`). | ~2 s |
| `npm run test:game` | Game behavior, one line per check (`scripts/game.test.mjs`; `ONLY=<word>` runs only the checks whose name matches, for work in progress; a few checks build on the one before (upload popup takes the file save popup saved), so match those too): the ESC menu (Esc back through its pages, the style switcher, settings reset and on-resume, credits' licenses, the updates notes, pictures and dates, the save and upload popups, COPY NETWORK LOG with no clipboard), saves through level edits, spray at LOAD, sponge memory, prop ids, paint pages and their draw calls, paint after a lost and restored WebGL context, stairs, city overrides and detail, tool sizes, ladders (one per player; climbed to the top, stood on and jumped from), session rules, the avatar (and its bone texture going with a player who leaves), the ghost (a remote player over a pretend network; what they did lands in order across a hidden tab), F3 rows and tooltips, the GPU row, the performance test's popup (its row first with Run on the values below, live numbers, Stop and Esc, the results, Enter, Dismiss), descriptions clear of their controls on every Settings tab, UNLOCK ALL, hotbar readback, sign sizes, hints (fonts, edges, new lines, undo, X) and level paint (P saves it, a fresh game loads it, FRESH LEVEL hosts it). Its pages don't draw; each check starts with the same seeded paint randomness, on fixed steps (`steps`), and stops after 30 s instead of hanging. | ~140 s |
| `npm run test:server` | The server against games speaking the protocol: HOST and JOIN, what's turned away, relaying, SAVE, reconnects, limits per address; on a server of its own, the heartbeat (a game that sends stays without answering pings, a silent one is dropped). In the process (`server/world-test.ts`): the lobby with fake links (limits per address, unknown and ended codes, bad messages, silent links), a paint file that fails (the next join gets a new one), paint at its surfaces' own detail, replayed ops painted and never logged. Then level paint, in Node: it fits the level it was made on and not once a painted prop is gone; every level with paint is marked so and its paint still fits it. | ~8 s |
| `node scripts/multiplayer.test.mjs` | Two players in two pages: HOST and JOIN from the menu, the host's PAINT DETAIL in the joiner's settings, SAVE of the session's paint, paint and the stepladder reaching the other, a reload, paint while hidden (no frames), a reconnect, LEAVE, a server restart, the server down. `npm run test:mp` builds the server first. | ~35 s |
| `npm run test:csp` | The game under the site's Content Security Policy (`vite.config.ts`). | ~6 s |
| `npm run golden` | Paint at every PAINT DETAIL against `scripts/golden-paint.json`, op replay, saves, the server's paint (`docs/golden-paint.md`). | 45–55 s |

`npm run test:weak-link` (~8 min, ~1 min a scenario, `SCENARIO=slow,stall` picks some; never in `check`): multiplayer on weak networks, the playtest of 2026-10-12 played back. Each player has its own page server and link proxy (`scripts/net-lab.mjs`, `scripts/link-proxy.mjs`: each direction at its own rate and delay, through reconnects too), so a weak network stays with its player. Scenarios: `slow` (a slow link for a minute while another paints), `stall` (dead both ways for 15 s), `cut` (a link that dies with a stroke on its way), `latency` (1.5 s each way), `slow-join` (back in over a slow link while another paints: the paint file comes down the same weak path), `three-players` (one weak, one good), `past-rejoin-window` (gone longer than `REJOIN_WINDOW`), `bytes` (what a painter's ops cost the others: ~28 B a stamp). Each prints the server's drops and joins, what every player showed for the others, and its facts; it fails when something that works breaks, and lists known bugs as `open:` with their backlog item. When a fix lands, its `open:` line becomes a check.

Tools, not tests: `npm run bench` (below), `npm run shots:avatar` (every avatar pose and a contact sheet in `shots/avatar/`, on the real GPU), `npm run bench:save` (save size and SAVE / LOAD time; run `npm run golden` first), `npm run bench:join` (a join into a painted roof, on the real GPU: download, load, shown, and the joiner's heap; `LEVEL`, `DETAIL`, `SHARES`, `RATE`), `npm run audit` (knip and duplicated code, advisory).

## Seeing the real game

`npm run shots` opens Chromium in a window (off screen) drawn by the GPU through WSLg's D3D12 (the NVIDIA; `GPU=Intel` for the weak iGPU), at 1280×720 on the level players get (`LEVEL=demo`: another). It plays at the spawn once the lamp light is baked and writes `shots/00-spawn.png`. `STEPS` adds views: `STEPS='[{"js": "game.player.yaw += 2", "wait": 800, "shot": "turned"}]'` (`js` runs in the page, where `game` is the game). It prints the GPU and the HUD's fps, draw calls, triangles and texture memory, and fails on console errors. Without a display it falls back to SwiftShader at 640×360, and says so.

## Measuring frame cost: `npm run bench`

The Settings performance test (`src/perf-test.ts`) on the real GPU, to compare builds: before and after a render or level change, or one GPU against another. Never in `npm run check`, CI or another script, and never against a player's result. It builds the game with the dev tools (`npm run build:dev`, bundled as players get it, so the load is the game's and not the dev server compiling modules) and serves it, then opens the level players get in a headed window at the screen's size with a fresh profile (the game's defaults), waits for the lamp light, measures the display's refresh rate, then clicks Settings → Graphics → Performance test → Run three times. Each run is the camera's flight around the level (the same path every run) for 9.5 s after a 0.5 s warm-up: frame intervals (average and 1% low fps), CPU time before the draw calls (a GPU that falls behind stalls the draw calls), GPU time from the timer queries, draw calls. The JSON has the median of each p50/p95/p99 over the runs, fps and 1% low, the tip players would read, the load (seconds, its frames' fps, the longest frame), the GPU, OS, CPU cores, build and settings; it's printed and written to `.cache/bench/<git describe>-<gpu>.json` (not committed). `npm run bench -- a.json b.json` prints both side by side with the change in % (no threshold).

ANGLE's native backend per OS: D3D11 on Windows, Metal on macOS, OpenGL on Linux; on WSL that's WSLg's D3D12 (`GPU=Intel` for the iGPU). The window is off screen; Chrome's throttling of covered windows is turned off (untried on Windows and macOS so far). A software GPU (SwiftShader, llvmpipe) stops it: `no real GPU: <name>`.

The headless tests always draw with SwiftShader, on the CPU: a frame at 1280×720 takes seconds, and its cost is vertex-bound where a GPU's is per pixel. Their pictures and timings say little about what players see.

## How the tests stay reliable

- **Deterministic.** Game logic in a test runs on fixed steps (`window.game.fixedStep`: a dt and a script per frame), never on the wall clock. Randomness is seeded (`seedPaintRandom`, before every game check too; the ghost's `link.random`). Waits are for a state (`gameReady`, `waitForFunction`), never fixed sleeps. A check that can pass for the wrong reason shows it can fail (the ghost's bad-link check also plays unsmoothed, which must fail).
- **Apart.** Each run starts its own Vite server (the next free port from 5180), with its dependency cache in its worktree (`.cache/vite-test`, never the linked `node_modules`), and game servers on free ports (`freePort`). Pages get 2 min to load, a reload too (`openTestBrowser` sets it, Playwright's own is 30 s).
- **One at a time.** On one machine, browser test runs go one after another. Two SwiftShader runs at once starve each other: on 2026-10-18 a game check got no frame for 30 s, a page never loaded, and a third pair froze WSL (audit F8.20).
- **No real lock.** Checks start play with `Input.setLocked`; the browser's pointer lock and fullscreen do nothing (`noBrowserLock`). A check's Enter or click runs as a user gesture: a real resume took the lock, lost it ~40 ms later, and that late event unlocked the next checks, under load only (audit F8.21).
- **Not drawing.** Pages that need no picture stub `renderer.render`: SwiftShader drawing is most of a browser test's time.
- **No setup.** Chromium's system libraries missing here come from `~/.local/pwlibs`: `apt-get download libnspr4 libnss3 libasound2t64`, then `dpkg -x` each into it (or `npx playwright install-deps chromium`, with sudo).

## Fixed 2026-10-10

| Problem | Effect | Fix |
|---|---|---|
| The ghost checks ran on the wall clock with random network hiccups; the bad-link one measured speed per frame with dt floored at 1/120 s | At the test's ~3000 fps it was blind to correction glides and failed on random 3–5 cm pops: 1 run in 12 idle, most runs under load (fewer fps, so it saw the glides) | The ghost runs on game time with a seeded network; both checks play frame by frame at 60 fps; same numbers every run |
| Game test pages drew a few SwiftShader frames before rendering was stubbed | Slower, and closing the browser waited for them | `noDrawing` from the first frame, shared with the multiplayer and CSP tests |
| The game tests sprayed with unseeded randomness | The sponge check failed 1 run in 20: stray specks landed outside the sponge's reach | Paint randomness seeded before every check |
| Fixed ports (3996, 3997, 3999) | Two agents testing at once: the server test exited 13 ("unsettled top-level await"); the multiplayer and CSP tests ran against the other agent's server | Free ports |
| The multiplayer reconnect step faked silence by setting `lastHeard` | A's next snapshot could count as heard before B's next frame: B never reconnected (15 s timeout) | B's link drops what comes in |
| Vite's /ws proxy errors during the multiplayer test | Stack traces that read as failures | Not printed |
| The smoke test's screenshot; avatar shots in SwiftShader | 20 s of the smoke test; avatar shots timed out under load | `npm run shots` on the real GPU |
| `check` left out the player build and golden paint | A broken deploy build or broken paint passed `check` | Both in `check` |

## Open

What's left for the tests is in `docs/backlog.md` (items of type `test`).
