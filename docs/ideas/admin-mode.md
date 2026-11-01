# Admin mode in the game (IDEA-195, IDEA-288, IDEA-289)

The admin inside a live session: unseen, past every limit, flying, with every tool, locking surfaces against paint
(IDEA-195, 1.6.1). Who painted what and erasing one player's paint (IDEA-288), and a timelapse (IDEA-289), come in
1.7.1, after the Painting Rework. IDEA-193 (locks) and BL-153 (who painted it) are merged in. This file holds only
the owner's approved decisions and what is still open; the server's routes go into `docs/admin-api.md` once they
are built.

## 1.6.1: approved (2026-11-01)

### Entry and presence

- **Entry:** a "Join as admin" button on a session in cctv opens the game with a one-time link. The server makes a
  random pass for that session's code: valid 60 s, works once, kept in memory only. It rides after `#` in the URL, so
  Caddy's access log and the Referer never see it, and the game wipes it from the address bar. Reconnects use the
  welcome's usual token. The game's console can't make anyone an admin.
- **Apart from the players:** the server keeps admins out of the session's players (a map of their own). So an admin
  comes into a full session without waiting in line or taking a seat, past the limits per address, counts in no
  stats, and is unseen: no state, presence or name reaches the others, the server list included. Several admins fit
  one session, each on their own link.
- **No trace:** an admin's coming and going leave no event and no count. Bans and kicks keep their own events, as now.
- **Seen on demand:** a key makes the admin seen; to the others they are then an ordinary player. Their nameplate reads
  `<name> (Admin)` in red: a nameplate class (the HUD, not the world, so the ink rule holds). The name is tinyauth's
  signed-in user (Remote-User), which Caddy passes to the server with cctv's request for the link: a host change for
  devops when built (`docs/deploy.md`). Players type only letters and digits, so no one can fake the plate, and no
  nickname needs reserving.
- **Paint only when seen:** unseen, the admin's tools are off and the server drops their ops (other games drop ops
  from a player they don't know, `src/net/remotes.ts`).
- **Fly:** build mode's fly (`player.fly`: no gravity, no collisions) on a key. Movement is the game's own anyway:
  nothing for the server to guard.
- **Key hints:** the admin's keys listed on screen (H unseen and seen, J fly, ...), texts in `src/messages.ts`.
- **Inventory:** every tool, color and cap at once; nothing to pick up, and the session's pickups stay as they are.
- **Kicks and bans stay on cctv:** in the game the admin watches; cctv's session page kicks and bans, as now.
- **Player list:** a key lists the session's players (dropped ones too); picking one puts the admin beside them
  (where the server last had them).
- **The server decides:** every power is the server's to grant and check; the game only shows it.
- **Lightweight:** in the game's one build, its code in `src/admin/`, loaded with `import()` only when the welcome
  says admin: players download and run none of it. Plain to look at; as little code as it can be.

### Locks

- **One surface per click:** a face of a wall, or one paintable surface of a prop. Its paint stays as it is, and no
  one can change it: spray, marker, roller, sponge and runs all stop at it. The server refuses new paint there, and
  every game refuses it too (otherwise the painter would see paint the others don't).
- **Per session:** set live, sent in the welcome and on each change, kept with the session on disk; another session
  on the same level is free.
- **A wipe clears them too:** an admin wipe clears all paint and drops every lock.
- **Outlines on a key:** a key draws every locked surface's outline (one line mesh, the admin's only).

## 1.7.1: who painted what (IDEA-288) and a timelapse (IDEA-289)

Decided 2026-11-01: not before the Painting Rework (TASK-231), which should bring a painter's ops from ~1760 a second
(the can's particles, each an op) to ~60 (`docs/ideas/paint-refactoring.md`, Network). Today a 15-minute ring with 20
painters would hold ~720 MB (the server's limit, `hostMemory`, is 1024 MB); after it, ~36 MB.

- **Approved direction:** a rolling window, ~15 minutes (a number in `config.ts`), all in the server's memory, nothing
  on disk. Spoiled within the window, it can be undone; older, it can't: anarchy, as on a real wall.
- **Approved:** pointing shows who painted what is seen there now (the last painter), no layers; a small panel on the
  paint (nickname, in the session or gone, Kick, Ban with cctv's presets or the admin's reason, Erase their paint;
  Esc closes it).

Candidate, to measure then decide:

- **A ring of op batches** for the window: the packed bytes the server relays already, who sent them and when, and
  the tiles (a few cm square, in meters) they touch. The oldest fall out.
- **A base to roll back to:** epochs of a few minutes; a tile is copied the first time it is touched in an epoch, so
  only tiles painted in the window cost memory.
- **Who painted it:** the newest op in the ring that covers the point, exact to the op.
- **Erasing a player:** each tile they touched in the window starts from its oldest copy and replays the ring without
  their ops: every layer inside the window comes back.
- **Banning one who left:** a painter's record (nickname, the bans' hashes) lives while their ops are in the ring:
  minutes, in memory only.
- **Timelapse (IDEA-289):** the same ring replayed over a wall's copies, if that costs next to nothing.

Open:

- Measure first: ops per painting second by tool (`GET /stats/paint`: `stamps` / `paintSeconds`), the ring's memory
  at 5, 10 and 20 painters (`npm run study:load` with that rate), and how long a rollback replays.
- Always recording (with a cap: under load the window shrinks), or only while an admin is in the session.
- Paint older than the window: nothing at all, or a cheap last painter per tile (~8 MB) to still see and ban.
- Sending an erase: as a restore (every game reconnects) or as tile patches (`PaintPatch`, `src/paint-surface.ts`, not
  yet checked).
- The ring's drips and wet times on replay: a likely result, not the very same.
