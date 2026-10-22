# Hints in play (BL-092, not started)

The controls screen is dropped: the key reference stays in Settings → Controls (`src/controls-tab.ts`). Instead, short hints appear in play when they're needed and go once the player has done the thing. This file is the model, the HUD layer map and the API sketch; nothing is decided until the owner agrees. The designer's brief: `docs/ideas/tutorial-design-brief.md`. Code comes after the design.

Facts checked on dev @ 7598b94 (2026-10-22). One hint system with the notifications of BL-140 (`docs/ideas/notifications.md`): a hint is that model's "one-time advice".

## What the player gets

- **First seconds:** how to move, run and jump. Gone after the player has really walked some distance, not after one key press.
- **A new tool** (marker, stepladder, roller, sponge): how to take it, use it, size it, its quirk (the stepladder turns). Gone after the first real use.
- **A new color, or more than one for the first time:** how to switch. Gone after the first switch.
- **Context:** by a ladder, how to climb; more below. Low pressure already has its own alert and stays as it is.
- **Priority:** new tool > context > basics. One hint on screen, two at most; a lower one waits, it isn't dropped.
- **Remembered** in the browser: a hint learnt is never shown again. Settings has "show hints again".
- **Rebound keys** show as bound: no "WASD" anywhere in the text.

## What exists (checked)

All confirmed unless marked. Line numbers as of 7598b94.

- **The HUD is DOM over the canvas.** `.hud` is one `position: fixed` root (`src/style.css:10`), built in `src/hud.ts:47-60`: vignette, corners, REC, clock, perf, cap tag, color tag, PSI gauge, LOW PRESSURE alert. Hud also builds and owns `PauseMenu` (`src/hud.ts:85`), mounted inside `.hud`.
- **Crosshair:** its own element, inserted *before* `.hud` (`src/hud.ts:61-67`) so the menu covers it; `mix-blend-mode: difference` (`src/style.css:67-82`).
- **Hotbar and toast:** `src/inventory/hotbar.ts:33-37` appends both to the end of `body`. `toast()` (`:46-50`) has one slot: a new message overwrites the old; it upper-cases everything. Expiry by `performance.now()` in `update()` (`:76-79`), so it runs with the frame loop. Toast sits at `bottom: 30%`, centered, ink text with no backing (`src/style.css:1793-1804`).
- **Toast callers:** stepladder blocked (`src/main.ts:109`), pickup collected `+ NAME` (`:113-116`), already have it (`:117`), screenshot saved (`:324`), player joined/left (`src/net/net-menu.ts:143`), F3 unlock all (`src/dev/devtools.ts:125`). A "+ MARKER" and a "Bob joined" in the same 2.2 s: the first is lost.
- **Pause status line:** `PauseMenu.notice()` (`src/pause-menu.ts:171`), `NOTICE_SECONDS = 3` inline (`:26`), expiry by `performance.now()` (`:242`). Reconnecting and session messages go there (`src/net/net-menu.ts:94, 139-149`): only visible with the menu open.
- **Pickup tags:** `src/pickups/labels.ts`, appended inside `.hud` (`:79`), placed every frame, sight checks at `PICKUP.label.sightRate` so they don't give hidden pickups away. They already say NEW TOOL / NEW CAP while the pickup would give something (`:104-109`).
- **Nameplates:** `src/net/nameplates.ts`, inside `.hud` (`:17`), white on a dark box (`src/style.css:161-170`): the one HUD text readable over any paint.
- **Wiring in main.ts:** `pickups.onCollect(label)` (`:113`), `tools.onCapChange` (`:190`), `tools.onColorChange` (`:191`), `tools.ladder.onBlocked` (`:109`). Correction: `onColorChange` also fires when switching *tools* (`src/tools/tools.ts:149`, `switched ||`), so it can't stand for "changed color". `onCollect` gets the label text, not the item kind (`src/pickups/pickups.ts:207`).
- **Input:** `BINDINGS` (`src/config.ts:541-571`): forward/back/left/right, jump (also climbs), crouch (also holds you on a ladder), sprint (also a double tap of forward), use (also places the stepladder), shake, next/prev (color; turns the stepladder), sizeUp/sizeDown (cap on the can, width on marker/roller/sponge), slot1-5, screenshot, pick. `label(action)` (`src/input.ts:70`) gives the first binding in capitals, `—` if unbound; `keyName` follows the keyboard layout once `getLayoutMap` resolves (`:56-67`, async, Chromium only), so a text built at load can be stale: build hint text at display time. `justPressed()`, `held()`, `step()` as described.
- **Play state:** `src/play-state.ts`: `paused` (pointer not locked), `frozen` (paused in single player), `panel` (F3), `building`. No DOM, tested in Node. It has no "tab hidden": a hidden tab simply runs no frames.
- **Storage:** `src/stored.ts` `stored()` / `store()`, safe when unavailable. Keys in use: `roofhiddenhaus.settings`, `.name`, `.session`, `.debug.open`, `.debug.tab`.
- **Inventory:** `reset()` (`src/inventory/inventory.ts:46`) gives the starting kit on every level open (`src/level/open-level.ts:39`); a session restores what the server kept (`src/net/multiplayer.ts:277`). So "got a tool" happens every session: without stored flags every hint repeats. A pickup gives the tool but does not put it in hand (`src/pickups/pickups.ts:198-208`): the tool hint starts with "press [2]".
- **Ladders:** `level.ladders` (`src/level/level.ts:29`), each a climb volume and a facing (`src/player.ts:8-12`); `Player.findLadder` (`:304`) already tests the player's box against them and `player.onLadder` says climbing. A "near a ladder" zone is that volume grown by a radius: no hand-placed zones.
- **Walked distance:** `player.stride` (`src/player.ts:35, 191`), ground distance, already used for footsteps (`src/main.ts:248`).
- **Not in the brief, found:** build mode can paint control hints onto walls (the LEVEL category's Hint entry, `src/build/paint-editor.ts`, text like `<k>RMB</k> Shake your can`, commit df9b287), shipped as `public/levels/<name>.rhhpaint`. No level ships one today (`public/levels` has only `demo.json`, `roof.json`). Painted keys can't follow rebinding: see the questions.

## Weak spots (checked)

- **No single message channel** (confirmed): about 9 mechanisms (BL-140 F4.1). Hints as a tenth would fight toast for the same screen space and the same seconds.
- **Layer order is implicit** (confirmed): only 6 explicit z-index values in all CSS (map below); everything else is DOM insertion order.
- **The tool-hand cluster is laid out by hand** (confirmed): `COLOR_TAG_OFFSET = 22`, `GAUGE_OFFSET = -22`, `ALERT_OFFSET = -44` (`src/hud.ts:12-15`), three timers (`capTagUntil`, `colorTagUntil`, `gaugeUntil`, `:28-37`), each element translated on its own (`:129-162`). A hint can't join it without a fourth offset. It should become one positioned stack (flex column) that follows the tool: same look, no offsets.
- **Frame-bound timers** (confirmed, BL-140 F4.2/F4.3): toast and notice compare `performance.now()`; under the full pause sheet toasts are `display: none` (`src/style.css:1735-1737`) while their clock runs; a hidden tab runs no frames, so they expire on the first frame back. The cap/color tags do the same (minor).
- **Hud does too much** (confirmed): frame, crosshair, tool cluster, perf, vignette and the owner of the pause menu, 209 lines. Hints don't go in it.
- **Readability** (confirmed by screenshots): toast, tags, REC and clock are 11 px ink monospace with no backing (`src/boot.css:42-45`). Over the lit white wall the red LOW PRESSURE alert almost disappears (`docs/img/tutorial/1280x720-low-pressure.jpg`); REC and the clock are lost in brick hatching (all shots). On dark paint ink text is invisible.
- **Scale** (confirmed): everything is px. At **820×560** the LOW PRESSURE alert runs off the right edge ("…TO SH", `docs/img/tutorial/min-820x560-busy-hud.jpg`): the tool cluster starts right of center and only grows rightward. At **3840×2160 with DPR 1** the HUD is a sliver: 11 px text on a 2160 px screen, hotbar 30 px (`docs/img/tutorial/4k-3840x2160-busy-hud.jpg`). (A 4K laptop at DPR 1.5-2 is fine: it's 1920-2560 CSS px.) Ultrawide 3440×1440 is fine: corners far out, tool cluster near center.
- **Multiplayer** (confirmed, worse than expected): in play nothing says reconnecting at all (BL-140 F4.4); "X joined" uses the toast slot and would overwrite or be overwritten by a hint if hints used it.

## HUD layers

### Today (bottom to top, as the browser paints them)

`position: fixed` makes every root its own stacking context, so `.hud` paints as one block: nothing outside it can go between its children.

| # | Layer | Element | Why it's there |
|---|---|---|---|
| 0 | game | `canvas` | first child of body (`src/main.ts:64`) |
| 1 | crosshair | `.crosshair` | inserted before `.hud` |
| 2 | HUD block | `.hud`: vignette → corners, REC, clock, perf → cap/color tags, PSI, alert → **pause menu** `.overlay` → **pickup tags** → **nameplates** | DOM order inside `.hud` (pickups are built after Hud, nameplates with the network) |
| 3 | hotbar, toast | `.hotbar`, `.toast` | appended to body after `.hud` |
| 4 | debug panel | `.debug-panel` | z-index 10 (`src/dev/dev.css:236`) |
| 5 | profiling line | `.profiling` | z-index 30 (`src/dev/dev.css:499`) |
| 6 | loading screen | `.loading` | z-index 100 (`src/boot.css:65`) |
| 7 | frame failed | `.frame-failed` | z-index 200 (`src/style.css:1810`) |

Also local: `.overlay .back` z-index 1 inside the menu; `.small-body` z-index 1 inside screen 10.

### Where it's already wrong

1. **Pickup tags and nameplates are above the pause menu.** Hidden by `body.paused` under the full sheet, but with F3 open the menu is compact (`src/style.css:657`, `body.paused` off): tags and names draw over the menu's buttons.
2. **Hotbar and toast are above the pause menu** for the same reason: in the compact menu they sit over its darkened bottom, where the menu's buttons are.
3. **World tags are above the body-cam frame and the vignette.** Harmless today (they rarely meet), but the opposite of the intended order.
4. **The crosshair is under the vignette.** It inverts the canvas, then the vignette darkens over it. Harmless while the vignette's middle is clear (VIGNETTE.start), wrong if F3 moves it.
5. **The loading screen (100) is above the debug panel (10)** but the frame-failed card (200) is above both: right, but by chance.

### Proposed (bottom to top)

The owner's list, with these changes: the crosshair moves above the world tags (so a label in the middle of the screen never hides your aim; it inverts what's under it, labels included); statuses and blocking errors split (a status lives in play, an error stops it); the loading screen gets its place; screen 10 is outside (it replaces the game).

| Token | Layer | Holds |
|---|---|---|
| `--z-world` | 10 | pickup tags, nameplates, future world-anchored hints (by a ladder) |
| `--z-frame` | 20 | vignette, corners, REC, clock, perf |
| `--z-aim` | 30 | crosshair (difference blend over everything under it) |
| `--z-tool` | 40 | tool-hand stack: alert, PSI, cap, color |
| `--z-hint` | 50 | hints |
| `--z-event` | 60 | event toasts, status chip (reconnecting) |
| `--z-hotbar` | 70 | hotbar: never covered |
| `--z-menu` | 80 | pause menu, its pages and popups |
| `--z-panel` | 90 | F3 panel, profiling line, build mode's picker and help |
| `--z-loading` | 100 | loading screen |
| `--z-error` | 110 | blocking errors (frame failed, BL-140's) |

To make tokens work each layer must be its own root under `body` (a `.hud` that holds layers 10-40 and the menu can't interleave with body-level layers). So: `.hud` keeps its job as the play HUD but becomes several fixed roots (`.layer-world`, `.layer-frame`, …), or the menu moves out of `.hud` and `.hud` takes one z. The tokens live on `:root` in `src/boot.css` next to the colors. Full sheet up: layers 10-70 hidden (as now); compact F3 menu: they stay, under the menu.

### Screen zones (reference 1280×720; the designer sets the sizes)

- **Top corners:** the body-cam frame. No messages.
- **Top center** (under the frame line, where frame-failed is today, 48 px): status chip (reconnecting, session ended) and blocking errors.
- **Center:** crosshair and aim area, a circle of about 15% of the window height: nothing, ever.
- **Right of center, lower half:** the tool-hand stack follows the tool in hand (about x 860, y 450-520 at 1280×720). No hints there. It must grow so it stays on screen (fails at 820×560 today).
- **Bottom center:** hotbar (bottom 22 px); event toasts stack up above it (today one toast at 30% from the bottom).
- **Lower left third** (left of the hotbar, above the perf lines when they're on): **hints.** Empty in every screenshot, away from the right hand, the crosshair and the hotbar; close enough to the hotbar to point at a slot.
- **World:** a context hint may instead hang on its object (the ladder), placed like a pickup tag. A design choice.

A hint never covers what it teaches: a slot hint points at the slot, a tool hint stays clear of the tool stack, the ladder hint is beside the ladder.

## Model

Three parts, each with one job:

1. **The game reports facts.** It doesn't know hints exist: "walked 0.4 m", "got the marker", "used the roller for 0.6 m", "cycled the color", "near a ladder". A few call sites in main.ts, tools, pickups, the stepladder.
2. **The tutorial decides** (`src/tutorial/`, no DOM, Node-testable with a fake clock): which hints are wanted now, which are learnt, what's stored. It hands wanted hints to the message layer as keyed advice.
3. **The message layer shows** (BL-140's `src/notify.ts` logic plus one DOM module for play): arbitration across kinds, at most N shown, deferral, the states, the layer and zone, key caps.

### Time

The tutorial's clock advances by the frame's `dt` only while play is visible: `input.locked && !play.panel && !play.building && document.visibilityState === 'visible'`. A hidden tab runs no frames anyway; `dt` is already capped (`src/main.ts:234`), so a return doesn't jump. Paused in a session the world goes on, but the hints' time stops: nothing "passes" behind the menu.

### Facts

```ts
// What the game tells the tutorial: things that happened (events) and how things are (a snapshot per frame).
type Fact =
  | { type: 'moved'; meters: number }             // ground distance this frame (player.stride delta)
  | { type: 'sprinted'; seconds: number }
  | { type: 'jumped' }
  | { type: 'got'; item: Tool | `color:${PaintColor}` | `cap:${CapId}` } // a pickup, not a session restore
  | { type: 'used'; tool: Tool; amount: number }  // m drawn/rolled/scrubbed, s sprayed on a surface, 1 = stepladder placed
  | { type: 'colorCycled' } | { type: 'colorPicked' } | { type: 'capCycled' } | { type: 'sized'; tool: Tool }
  | { type: 'climbed'; meters: number }
  | { type: 'screenshot' };

interface Snapshot {
  tool: Tool | null;         // in hand
  colors: number; caps: number;
  nearLadder: boolean;       // within TUTORIAL.ladderRadius of a level ladder's volume, not on it
  onLadder: boolean;
  aimOtherColor: boolean;    // a colored tool in hand, aiming at owned paint of another color (throttled probe)
}
```

New hooks needed (small): `onCollect` passes the kind; `tools` reports color cycle/pick, cap cycle, size steps and use amounts (not via `onColorChange`); the stepladder reports a placement; the eyedropper's probe at `TUTORIAL.aimRate` Hz, not every frame.

### A hint as data

```ts
interface HintDef {
  id: string;                         // stored when learnt: 'move', 'tool.marker'
  rank: 'tool' | 'context' | 'basic'; // new tool > context > basic
  lines: string[];                    // '{use} spray · {shake} shake': {action} becomes its key cap at display time
  show: Cond;                         // when it's wanted
  done: Cond;                         // when it's learnt
  steps?: { lines: string[]; until: Cond }[]; // e.g. "[2] take the marker" until it's in hand
  anchor?: 'hints' | 'world:ladder';  // the hints zone unless said
  after?: string[];                   // shown only once these are learnt
}

// A fixed vocabulary; data combines it, so a new hint is a new entry, not new code.
type Cond =
  | { got: string }                                  // a 'got' fact for this item, ever
  | { has: 'colors' | 'caps'; atLeast: number }
  | { holding: Tool }
  | { near: 'ladder' } | { aim: 'otherColor' }
  | { total: Fact['type']; tool?: Tool; atLeast: number | keyof typeof TUTORIAL } // summed while the hint is wanted
  | { event: Fact['type'] }
  | { playedFor: number | keyof typeof TUTORIAL }    // visible seconds
  | { all: Cond[] } | { any: Cond[] };
```

Rules:

- Wanted = `show` true, not learnt, `after` learnt. A hint learnt before it was ever shown (the player already knew) is stored silently.
- Context hints are wanted only while their condition holds (near the ladder); they leave without being learnt when it stops, and come back next time.
- A hint shown at least `TUTORIAL.minShown` s before it can leave as done, so it doesn't flash.
- Stored under one key, `roofhiddenhaus.tutorial`: `{"v":1,"done":["move","tool.marker"]}`. No storage: an in-memory set, hints come back next load, no errors. "Show hints again" (Settings → Gameplay, an action row like Performance test) clears it.

### Interface with the message layer

```ts
// notify.ts (BL-140 F4.9), the part BL-092 needs:
notify.set({ key: 'hint:move', kind: 'advice', rank, lines, anchor }); // keyed: shown while set, as space allows
notify.clear('hint:move', 'done');  // 'done' plays the done state; 'gone' just leaves (walked away from the ladder)
notify.update(dt, visible);         // the one clock
notify.shown(): Note[];             // what the DOM module draws this frame
```

The tutorial sets every wanted hint; notify picks what shows: kinds by priority (error > status > event > advice), within advice by rank then age, `TUTORIAL.maxShown` (1, 2 at most). A waiting hint stays set, so nothing is lost. Key caps are resolved when drawn (`label()`), so rebinding or the keyboard layout arriving changes the text live.

### Draft hints

Thresholds are `TUTORIAL` config with F3 descriptions; values are first guesses.

| id | rank | Text (keys as bound by default) | Shows | Learnt |
|---|---|---|---|---|
| `move` | basic | `[W][A][S][D]` move · `[SHIFT]` run · `[SPACE]` jump | `playedFor` 1.5 s | `total moved` ≥ `moveMeters` (8 m) |
| `spray` | basic | `[LMB]` spray · `[RMB]` shake | after `move`, can in hand | `total used can` ≥ 0.5 s on a surface |
| `tool.marker` | tool | step `[2]` take the marker, then `[LMB]` draw · `[Q]` `[E]` nib | `got marker` | `total used marker` ≥ 0.5 m |
| `tool.ladder` | tool | step `[3]` take the stepladder, then `[LMB]` put it down · `[WHEEL]` turn it | `got ladder` | `used ladder` (placed) |
| `tool.roller` | tool | step `[4]`, then `[LMB]` roll · `[Q]` `[E]` width | `got roller` | `total used roller` ≥ 1 m |
| `tool.sponge` | tool | step `[5]`, then `[LMB]` scrub paint off · `[Q]` `[E]` size | `got sponge` | `total used sponge` ≥ 0.5 m |
| `cap` | tool | `[Q]` `[E]` change the cap | `has caps ≥ 2`, can in hand | `capCycled` |
| `color` | tool | `[WHEEL]` change color | `has colors ≥ 2`, a colored tool in hand | `colorCycled` or `colorPicked` |
| `ladder.climb` | context | walk into it or hold `[SPACE]` to climb · `[CTRL]` hold on | `near ladder` | `total climbed` ≥ 1.5 m |
| `pick` | context | `[MMB]` take this color | `aim otherColor`, after `color` | `colorPicked` |
| `screenshot` | basic | `[K]` save a screenshot | `playedFor` 120 s, after `spray` | `screenshot` |

Other context candidates, not in the first set: crouching where a gap needs it (no data in the level yet), sprint for a player who never ran after N minutes, the stepladder when the player stands under a wall top out of reach (needs a reach probe). Low pressure stays the tool stack's alert: it's a state, not advice.

`move` uses four actions: `{forward}{left}{back}{right}` shows `[W][A][S][D]`, or `[↑][←][↓][→]` if those are first. On AZERTY it's `[Z][Q][S][D]` once the layout map arrives.

## Order against BL-140 (section 7)

**Recommendation: (a), cut to what BL-092 needs.** Take from BL-140: the model (F4.1) and `src/notify.ts` (F4.9) with two kinds working, **event** and **advice**; statuses and blocking errors stay typed but unimplemented until BL-140 @1.9.0. Move the existing toast callers to the event kind one to one (they share the screen with hints anyway); `PauseMenu.notice` stays as it is for now.

| | (a) cut model + notify | (b) a hint layer alone |
|---|---|---|
| Size | notify.ts ~150 lines + Node test; play DOM module ~120; tutorial ~150 + hint data ~80; layer tokens and the tool stack in CSS. Callers: 6 toast sites. | tutorial ~150 + data ~80; its own DOM ~120. |
| Gets for free | F4.2/F4.3 for toasts (the same visible clock); F4.7 readability designed once; one priority rule. | — |
| Risks | Behavior of toasts changes slightly (a queue instead of overwrite): that's the bug fix, needs a test. The designer must deliver toasts too (one brief). | — |
| Later | BL-140 adds statuses, errors and surfaces to an existing core. | Two queues and two priority rules; hints and toasts collide in the same seconds and zones ("X joined" over a hint); the pause/hidden fix done twice; the designer designs the box twice; then a rewrite onto notify. |

What breaks with (b): toast and hint can't know of each other, so "max two on screen" and "a lower one waits" can't hold across them; whichever came last wins. Fixing that is building notify anyway.

Option (c) considered: hints in the tool stack only, no new layer. Rejected: the stack is anchored to the tool, hints about moving or the hotbar have no tool, and the stack's offsets are the weakest code here.

Separately and first, small: layer tokens (`--z-*`) and the tool stack as one flex container. The stack alone is a cleanup with identical looks; the tokens change what's on top, on purpose. The tokens fix the compact-menu overlaps; the stack can also flip left when it would leave the screen (the 820 px clipping, question 10).

## Open questions for the owner

1. (a) as cut above, with toasts moved onto the event kind in 1.5.0?
2. One designer brief for hints and BL-140's notifications (proposed), or hints only?
3. At most 1 hint, or 2?
4. A Settings switch to turn hints off, besides "show hints again"? Where: Gameplay?
5. When a tool is picked up: the toast "+ MARKER", the NEW TOOL tag and the hint all three, or does the hint replace the toast?
6. Hints in a multiplayer session too? (Proposed yes, they're personal; under a status chip, never over it.)
7. Painted wall hints (build mode's Hint entry): decoration only, never key names? Their keys can't follow rebinding.
8. Thresholds: 8 m to learn moving, 0.5 s / 0.5 m for a first use: right feel?
9. Language and casing: English only; HUD capitals or the menu's sentence case (F4.7)? Katakana under the text as on the pickup tags?
10. The 4K at DPR 1 sliver and the 820 px clipping: fix with the HUD's scale (a `--hud-scale` from the window, or a Settings value) in BL-092, or file separately?
11. Separately filed? The compact-menu overlaps (tags, hotbar, toast over the F3 menu) and the LOW PRESSURE clipping at 820 px.

## Screenshots

`docs/img/tutorial/` (taken with a variant of `npm run shots`, real GPU, roof level, 2026-10-22): listed in the brief.
