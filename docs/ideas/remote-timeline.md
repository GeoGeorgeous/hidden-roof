# The remote player's timeline as a pure module (BL-112)

Decided 2026-10-18 (architecture run on the network code); moved out of 1.4.0 on 2026-10-19 (it moves code rather than removing it, and touches remote smoothing before a release). No behavior change.

## Problem

`src/net/remote-player.ts` mixes the clock with the figure: lag, target, jitter, snaps and events are private; it reads `document.hidden`; tests set private fields (`lag`, `target`). Its clock logic is ~120 lines behind 5 methods, only reachable through a scene.

## Design

The seam goes between the clock and the figure. A pure `RemoteTimeline` (`src/net/remote-timeline.ts`) owns the snapshots, lag, target, jitter, the shown time, the timed events and the catch-up: `receive(snapshot, now)`, `schedule(t, run, hidden)`, `sample(now, dt)` → the pose to show (position, velocity, yaw, pitch, flags, color, cap, flow, guessing) or null, `reset()`, `flush()`, `heard`, `stats`. Hidden comes in as a parameter (no `document` inside), so Node tests it (npm test): interpolation, the extrapolation cap, a clock that starts over, events in their order, a hidden tab's flush, the catch-up after a pile-up. RemotePlayer keeps the avatar, look, smoothing, ladder facing and spray; game.test stops setting `lag`/`target` and the tests read `events` through the timeline. Also: tests and net-lab read `remotes.list` (a private map) for looks and figures; give Remotes a read-only view.

## Done when

Node test in npm test; tests stop setting private fields; npm run check before and after, golden identical. Stop and report if it grows past M.
