# Notifications beyond play (IDEA-204)

What is left of the 2026-10-17 audit (module M4) after the notify model shipped for play. Built: `src/notify.ts` (hint, toast, status, dialog; the clock runs only while play is visible), `src/notify-view.ts`, `src/dialog-view.ts`, the texts in `src/messages.ts`, the link statuses in `src/net/link-health.ts`, the lost-session dialogs in `src/net/lost-dialog.ts`. Nothing here is decided.

## Open

- **Other surfaces.** Only play draws notify's notes. The menu keeps its own status line (`PauseMenu.notice`, `NOTICE_SECONDS` inline in `src/pause-menu.ts`), the MULTIPLAYER page its status, the loading screen its steps, and three "Copy → Copied" flashes their own timers (`COPIED_MS` in `src/session-line.ts` and `src/small-screen.ts`, the F3 panel's). One queue across surfaces would show a join that happened in Settings when the player is back, and could put a badge in the tab title while it is hidden.
- **Screen readers.** No `aria-live` or `role` anywhere in src. One polite `role="status"` and one `role="alert"` region, made at boot; announce phases, not every percent; respect reduced motion.
- **More events.** Away, dropped and back (a `Remotes.onPresence` hook: toast "**{user}** is back"), WebGL context lost, online and offline, a refused pointer lock, fullscreen or clipboard, "updated to vX". `src/net/remotes.ts`, `src/main.ts`.
- **Battery.** `navigator.getBattery` works in Chromium only and needs HTTPS (no LAN http testing); Firefox removed it, Safari never had it. Its useful signal is "unplugged" (Energy Saver's 30 Hz cap). An optional Chromium-only extra, or no.

## Status candidates

| Candidate | Data | Proposed threshold | Component |
|---|---|---|---|
| Slow upload (a paint file) | upload progress rate | under 8 KB/s | the menu's progress line |
| Away, dropped, back | `Remotes.onPresence` | exists on the nameplate | toast |
| Context lost, online/offline, pointer lock or clipboard refused | browser events | event fires | toast or status |

Data that exists but is not shown as a status: up/down rates (`Traffic`), each player's `delay` and `jitter` (`netLines`).
