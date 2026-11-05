# Admin mode: who painted what and a timelapse (IDEA-288 @1.9.0, IDEA-289)

Admin mode itself shipped in 1.6.1 (`server/admins.ts`, `src/admin`; its limits in `docs/known-limits.md`). What
follows is the owner's approved plan for its next part (2026-11-01).

## 1.9.0: who painted what (IDEA-288) and a timelapse (IDEA-289)

- **When:** after the Painting Rework (TASK-231). A painter makes ~1760 ops a second now (one per particle) and should
  make ~60 after it (`docs/known-limits.md`). A 15-minute ring for 20 painters is ~720 MB now and ~36 MB
  then (`hostMemory` 1024 MB).
- **Approved:**
  - The window is ~15 minutes (`config.ts`), in the server's memory only. Paint spoiled within it can be undone;
    older paint can't.
  - Pointing shows the last painter of what is seen. A panel offers Kick, Ban (cctv's presets or the admin's reason)
    and Erase.
- **Candidate:** a ring of op batches (the bytes the server relays, with who and when, and the tiles they touch).
  - Epoch copies: a tile is copied on its first touch in an epoch.
  - Who: the newest op in the ring that covers the point.
  - Erase: replay the ring over the oldest copy, without that player's ops.
  - A painter's record (nickname, ban hashes) lives only while their ops are in the ring.
  - Timelapse: replay the same ring, if that costs nearly nothing.
- **Open:**
  - Measure ops a second by tool (`GET /stats/paint`: stamps / paintSeconds), the ring's memory at 5, 10 and 20
    painters (`npm run study:load`), and replay time.
  - Record always (with a cap) or only while an admin is present.
  - Paint older than the window: nothing, or a last painter per tile (~8 MB).
  - Send an erase as a restore, or as tile patches (`PaintPatch`, unchecked).
  - Drips on replay come out close, not identical.
