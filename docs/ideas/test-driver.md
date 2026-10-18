# A test driver, and game.test.mjs split by area (BL-132, BL-134)

Decided 2026-10-18 (architecture run on the test seam). For 1.4.0. Tests and tooling only.

## Problem

`scripts/game.test.mjs` is 2318 lines with 78 checks. The fixed-frame `steps()` helper is written four times (game.test.mjs `pageSteps`, golden-paint.mjs, csp.test.mjs, avatar-shots.mjs). Tests write Input's private sets: `input.down` as the held set, `input.pressed.add('Space')`, `lmb`, `rmb`, `wheelSteps` (game.test.mjs, golden-paint.mjs, csp.test.mjs).

## Design

A driver for what tests do, not for what they look at. Tests act in three ways:

1. Step fixed frames: one `steps(each)` and `frames(n)` page script in `scripts/test-browser.mjs` beside `noDrawing`, used by all four scripts.
2. Start play: stays `Input.setLocked`.
3. Press keys, buttons and the wheel: Input gets one entry for what the browser reports, `key(code, down, repeat, mods)`, `button(n, down)` and `wheel(steps)`, which its own listeners call too. Tests press through it, so `down`, `pressed`, `lmb`, `rmb` and `wheelSteps` stop being written from outside, and a test's key goes through `onMenuKey`, typing and Ctrl combos like a real one.

What tests look at (paint surfaces, the level's props, the player, net status) stays on `window.game`: that is the behavior under test, and a narrow read API would only rename it.

Split game.test.mjs by area into `scripts/game/` (menu and settings, input, paint pages and saves, levels and hints, tools and ladders, session, ghost and avatar, debug panel), each under ~400 lines, with the harness (openPage, check, the files popups) in one module; one runner, one browser, `ONLY` across all of them, `npm run test:game` unchanged.

## Done when

Every check passes as before, with the same names; one commit for the driver, one for the split; `npm run check`.
