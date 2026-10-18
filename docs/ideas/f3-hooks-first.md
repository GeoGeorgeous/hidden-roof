# F3: the hooks first, then the sections (BL-133)

Decided 2026-10-18 (architecture run on the composition root). Dev-only; no behavior change.

## Problem

The debug panel is a field initializer in `src/dev/devtools.ts`, built before the constructor sets the hooks. So `src/debug/tuning.ts` keeps 33 placeholder hooks, `src/debug/hooks.ts` wraps them, and `scripts/hooks.test.mjs` tests the wrapping: all only because of build order.

## Design

DevTools builds build mode, the figure, the ghost and the profiler, then `new DebugPanel(hooks)`; `allSections(h)` (`src/debug/sections.ts`) hands `h` to each `*Sections(h)`. tuning.ts keeps the 33 as a `Hooks` interface (their comments move onto it); the placeholder bodies, `hooks.ts` and `scripts/hooks.test.mjs` go; `live` keeps only `stats` and `player`. One hook is read outside a row: `parentOf`'s `atmosNight` (getValue, setValue, isChanged): it becomes a getter DevTools passes to the panel, not a module slot. The F3 paths test passes no-op hooks. Update `src/debug/AGENTS.md` where it describes the placeholders.

## Done when

`npm test` (F3 paths), the debug panel's game checks, check:quick.
