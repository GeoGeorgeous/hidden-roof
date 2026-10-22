# One notification system (audit M4, not started)

From the audit of 2026-10-17 (module M4, skipped for 1.4.0). Nothing here is decided yet: the first step is settling the model (F4.1) before the designer starts. ★ marks the audit's recommended approach.

BL-140 is in 1.5.0 now (the owner moved it from 1.9.0). The texts of every message are in one catalogue, `src/messages.ts`; where each shows and the connection statuses: `docs/ideas/messages.md`.

## What exists

- No central module: about 9 mechanisms reach the player (Hotbar.toast, HUD tags and PSI, the pause status line, the live line, the multiplayer page status, nameplate notes, loading lines, popups, settings marks) plus 3 dev-only, each with its own element, timer and CSS.
- Two durations are in config (HUD.toastTime, HUD.tagTime); four are inline. Three "Copy → Copied" flashes use their own setTimeout.
- The ESC menu's design handoff did not cover notifications; it kept the monospace HUD as is, screens 01–09 must stay pixel-identical, and it added non-paint colors (a green dot, #e0675e).
- Proposed model: kinds (event toast, keyed status, blocking error; contextual hints stay outside) shown by whatever surface is current (loading, title, play, ESC menu, page, hidden tab).

## Findings (line numbers as of dev 23f7835)

- **F4.1 The model** (decision). Kinds: event (queued toast, 2–6 s, timer runs only while visible), status (keyed, as long as true), blocking error (until dismissed), contextual hint (stays outside: PSI, tags, nameplates). Priority error > status > multiplayer > personal > advice; at most 1 status and 3 toasts; coalescing within ~4 s; one queue across surfaces; "While you were away" after a hidden tab. Approaches: (1) this model ★ · (2) simpler: one toast queue + statuses, no coalescing.
- **F4.2 Messages are lost while a menu is open** (bug). Toasts are display:none under the pause sheet but their timer keeps running; the status line is hidden while a page is open. A "Bob joined" that arrives while you are in Settings is never seen. `src/style.css:1285-1287`; `src/inventory/hotbar.ts:75`; `src/pause-menu.ts:220`.
- **F4.3 Messages are lost while the tab is hidden** (bug). Timers compare performance.now() in the frame loop, which a hidden tab doesn't run; the socket keeps delivering, so events expire on the first frame back. `src/inventory/hotbar.ts:75`; `src/pause-menu.ts`.
- **F4.4 Nothing in play says "reconnecting" or "session ended"** (bug). Reconnecting shows only frozen nameplates (and a perf line most players have off). "The session has ended" is a 3 s notice in the hidden menu; the game quietly drops to single player while the player keeps painting. `src/net/net-menu.ts:144-150`; `src/net/diagnostics.ts:79`. Approaches: (1) a HUD status line (keyed) ★ · (2) pause into the menu with the message.
- **F4.5 onProgress(null) wipes any notice** (bug). onProgress(null) calls notice('', 0), clearing notices it didn't set. `src/net/net-menu.ts`; `src/pause-menu.ts`. Fix with keyed statuses.
- **F4.6 No accessibility for messages** (bug). No aria-live or role anywhere in src. One polite role="status" and one role="alert" region, created at boot; announce phases, not every percent; respect reduced motion (the PSI blink too).
- **F4.7 Toasts are hard to read; casing differs** (ux, for the designer). The toast is ink text with no backing, unreadable over dark paint (nameplates already use an inverted box). Toasts force caps, player names included; the menu uses sentence case. `src/inventory/hotbar.ts:45-49`; `src/style.css:1343`. Related: BL-072.
- **F4.8 Inline durations** (refactor). NOTICE_SECONDS and three "Copied" flashes are inline numbers. `src/pause-menu.ts:24`; `src/net/session-line.ts:58`; `src/small-screen.ts:43`; `src/debug/panel.ts:263`.
- **F4.9 A notify module, callers moved one to one** (refactor). `src/notify.ts`, logic only, the clock passed in, testable in Node: notify(note), clear(key), setSurface(surface), update(now, visible). A HUD toast stack replaces Hotbar.toast; PauseMenu.notice becomes the menu's display. Behavior identical.
- **F4.10 The designer brief** (docs). Types and states (toast, status chip, blocking error, one-time advice), places (HUD, title and pause incl. 09, pages, MP page, loading, F3 compact; minimum viewport to 4K) and nine questions for the designer.
- **F4.11 New events** (later). Away / dropped / back (a Remotes.onPresence hook), WebGL context lost, online/offline, refused pointer lock or fullscreen or clipboard, "updated to vX". `src/net/remotes.ts:66`; `src/main.ts:88`.
- **F4.12 Battery notices** (decision, later). navigator.getBattery works in Chromium only, needs HTTPS since Chrome 103 (no LAN http testing); Firefox removed it, Safari never had it. Its useful signal is "unplugged" (Energy Saver's 30 Hz cap). Approaches: (1) an optional Chromium-only extra ★ · (2) no.
- **F5.12 A failure doesn't say whether the player was in a session** (decided 2026-10-18). `NetStatus` `failed` looks the same after a failed JOIN and after a session that ended mid-play ('broken', 'version', a diagnose reason can be either; only 'ended' is always mid-session). In play it should be a blocking error ("you're playing alone now; your paint is kept", F4.4); while joining, the MULTIPLAYER page's line as today. Decision: NetStatus stays the interface between the network and what the player sees; `failed` carries the session's code when the player was in one, and net-menu's onStatus is the one adapter into the notify module. Do it with the notify work, not before.

## Order (audit plan)

BL-092 (1.5.0, `docs/ideas/tutorial.md`) takes a cut of steps 1 and 2 first: the model and `src/notify.ts` with all four kinds in play (hint, chip, toast, dialogue), the toasts moved onto events. Surfaces other than play and the rest stay here. One designer brief covers both (`docs/ideas/tutorial-design-brief.md`). The look of all four components (hint, chip, toast, dialogue) is decided and all four are built in BL-092: `docs/ideas/tutorial.md`, In-game UI.


1. Settle the model and write the designer brief (F4.1, F4.7, F4.10, F4.12). Questions: kinds and surfaces the right cut? A blocking error in play: pause into the menu or a HUD line? Battery notices? A badge in the tab title while hidden? Coalescing window and maximum age?
2. The notify module, callers moved one to one, behavior identical (F4.8, F4.9).
3. The fixes, each with a test that fails without it (F4.2–F4.6, F5.12).
4. New events (F4.11), later.

## Checks by hand

- A join while you are in Settings: A opens ESC → Settings, B joins, A closes Settings. Today A never sees "B joined"; after the fix A sees it.
- What play shows when the link drops or the session ends: B playing, cut and stall the link (`docs/testing.md`, the link proxy), then stop the server. Today nothing shows in play; after the fix a reconnecting status, then "session ended".
