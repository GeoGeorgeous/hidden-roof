# Leaving a session (BUGS-172)

Today LEAVE SESSION (`Multiplayer.leave`, `src/net/multiplayer.ts`) ends the link but keeps the session's paint on the walls, and joining replaced the player's own paint with the session's for good.

## Decided (owner, 2026-10-20)

- Leaving clears the session's paint and shows the title view (the first menu, with the city view).
- The paint the player had before joining comes back, if it can be kept cheaply; otherwise the level starts blank and JOIN asks whether to save the solo paint first (only when there is some). No question on leaving.

## Why it is cheap

SAVE and UPLOAD already turn the level's paint into a paint file and back (`savePaint`, `src/save/save-paint.ts`; `loadPaint`, `src/save/load-paint.ts`). On join, when there is solo paint: keep `savePaint`'s bytes in memory (one compressed file, about a quarter of the atlases: no second paint system, nothing on the GPU). On leave: clear the paint and free its pages, then `loadPaint` those bytes, or nothing. A reload during the session loses the solo paint, as it does today.

## Open

- Hosting: does a host who started from their own paint get the pre-session paint back on leave, or keep the session's?
- A drop that reconnects is not a leave: only LEAVE SESSION, a kick and giving up on the reconnect restore.
