# Testing

How a change is verified (AGENTS.md, Verify), what each test covers, and how they stay reliable on the WSL dev machine (6 cores, often several agents testing at once). Times measured 2026-10-10, with other agents running.

## The checks

| Command | What | Time |
|---|---|---|
| `npm run check:quick` | Type check (game and server), the player build (`npm run build`, what's deployed), `npm test`, knip. After every change. | ~5 s |
| `npm run check` | `check:quick`, then every test below, golden paint last. Before saying a change is done, and before a merge. Stops at the first failure. | ~2 min |
| `npm run shots` | The real game on the real GPU (below). For every visual change. | ~15 s |

## The tests (all in `npm run check`)

| Command | What | Time |
|---|---|---|
| `npm test` | Paint save files (round trip; broken, older, newer, oversized ones refused) and protocol messages, in Node. | <1 s |
| `npm run smoke` | The level players get loads and plays a few frames with F3 open. Fails on page errors and console errors (shader errors among them). | ~10 s |
| `npm run test:game` | Game behavior, one line per check (`scripts/game.test.mjs`): the menu's SAVE / LOAD PAINT, saves through level edits, spray at LOAD, sponge memory, prop ids, paint pages and their draw calls, stairs, city overrides and detail, tool sizes, ladders, session rules, the avatar, the ghost (a remote player over a pretend network), F3 rows and tooltips, hotbar readback, sign sizes, hints (fonts, edges, new lines, undo, X) and level paint (P saves it, a fresh game loads it, FRESH LEVEL hosts it). Its pages don't draw; each check starts with the same seeded paint randomness, on fixed steps (`steps`), and stops after 30 s instead of hanging. | ~30 s |
| `npm run test:server` | The server against games speaking the protocol: HOST and JOIN, what's turned away, relaying, SAVE, reconnects, limits per address. Then level paint, in Node: it fits the level it was made on and not once a painted prop is gone; every level with paint is marked so and its paint still fits it. | ~8 s |
| `node scripts/multiplayer.test.mjs` | Two players in two pages: HOST and JOIN from the menu, paint and the stepladder reaching the other, a reload, a reconnect, LEAVE, a server restart, the server down. `npm run test:mp` builds the server first. | ~25 s |
| `npm run test:csp` | The game under the site's Content Security Policy (`vite.config.ts`). | ~6 s |
| `npm run golden` | Paint at every PAINT DETAIL against `scripts/golden-paint.json`, op replay, saves, the server's paint (`docs/golden-paint.md`). | 25–55 s |

Tools, not tests: `npm run shots:avatar` (every avatar pose and a contact sheet in `shots/avatar/`, on the real GPU), `npm run bench:save` (save size and SAVE / LOAD time; run `npm run golden` first), `npm run audit` (knip and duplicated code, advisory).

## Seeing the real game

`npm run shots` opens Chromium in a window (off screen) drawn by the GPU through WSLg's D3D12 (the NVIDIA; `GPU=Intel` for the weak iGPU), at 1280×720 on the level players get (`LEVEL=demo`: another). It plays at the spawn once the lamp light is baked and writes `shots/00-spawn.png`. `STEPS` adds views: `STEPS='[{"js": "game.player.yaw += 2", "wait": 800, "shot": "turned"}]'` (`js` runs in the page, where `game` is the game). It prints the GPU and the HUD's fps, draw calls, triangles and texture memory, and fails on console errors. Without a display it falls back to SwiftShader at 640×360, and says so.

The headless tests always draw with SwiftShader, on the CPU: a frame at 1280×720 takes seconds, and its cost is vertex-bound where a GPU's is per pixel. Their pictures and timings say little about what players see.

## How the tests stay reliable

- **Deterministic.** Game logic in a test runs on fixed steps (`window.game.fixedStep`: a dt and a script per frame), never on the wall clock. Randomness is seeded (`seedPaintRandom`, before every game check too; the ghost's `link.random`). Waits are for a state (`gameReady`, `waitForFunction`), never fixed sleeps. A check that can pass for the wrong reason shows it can fail (the ghost's bad-link check also plays unsmoothed, which must fail).
- **Side by side.** Each run starts its own Vite server (the next free port from 5180) and game servers on free ports (`freePort`), so agents in other worktrees can test at the same time. Sharing the CPU only slows a run (pages get 2 min to load).
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

What's left for the tests is in `docs/backlog.md` (Tests, Check by hand).
