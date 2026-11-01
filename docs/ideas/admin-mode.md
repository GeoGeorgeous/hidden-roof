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
  Caddy's access log and the Referer never see it, and the game wipes it from the address bar. The game's console
  can't make anyone an admin. cctv's own server list (`CCTV_SERVERS`) gives each server its game's address; the game
  server answers only the pass.
- **The pass beats bans and limits:** checked first, a valid pass comes in from a banned address and past the limits
  per address (seats, JOINs a minute). Only the open links per address (`SERVER.linksPerIp`, 24) are counted as the
  socket opens, before the JOIN that carries the pass: that one stays.
- **No reconnect:** any closed link ends admin mode at once, a reload, a lost link and the admin's own wipe or restore
  from cctv included (they close every link). The server holds no place for an admin; the game says the admin mode
  has ended (`src/messages.ts`) and goes to the menu. A new link from cctv brings them back.
- **Apart from the players:** the server keeps admins out of the session's players (a map of their own). So an admin
  comes into a full session without waiting in line or taking a seat, past the limits per address, counts in no
  stats, and is unseen: no state, presence or name reaches the others, the server list included. Several admins fit
  one session, each on their own link.
- **No trace:** an admin's coming and going leave no event and no count, and their game sends no beacon once the
  welcome says admin. Their paint, seen, is relayed and painted but counts in no stat (stamps, paint seconds, colors,
  painters). Bans and kicks keep their own events, as now. The server's log (the security record, addresses gone
  after 14 days) keeps one line, marked admin, as an admin comes and goes: who was inside, if a pass ever leaks.
- **Seen on demand:** a key makes the admin seen; to the others they are then an ordinary player. Their nameplate reads
  `<name> (Admin)` in red: a nameplate class (the HUD, not the world, so the ink rule holds). The name is tinyauth's
  signed-in user (Remote-User), which Caddy passes to the server with cctv's request for the link: a host change for
  devops when built (`docs/deploy.md`), to be checked then; without it the plate reads plain `Admin`. Players type
  only letters and digits, so no one can fake the plate, and no nickname needs reserving. Becoming seen and unseen
  shows to the others as a join and a leave, toasts included.
- **Admins see each other:** every admin sees the others, seen or not, by their `(Admin)` plate (unseen ones faint).
- **Never a seat:** seen or not, the admin takes no seat and no place in line: no one is pushed out or kept waiting,
  and the server list still counts only the players (20/20). In the game the others see one more player.
- **Holds a private session:** any admin inside, seen or not, keeps a private session open as a player would; when
  the admin leaves it empty, it closes as usual.
- **Paint only when seen:** unseen, the admin's tools are off and the server drops their ops (other games drop ops
  from a player they don't know, `src/net/remotes.ts`).
- **Fly:** build mode's fly (`player.fly`: no gravity, no collisions) on a key. Movement is the game's own anyway:
  nothing for the server to guard.
- **Keys** (in `config.ts`), listed on screen, texts in `src/messages.ts`: H seen and unseen, J fly, L lock or unlock
  the face pointed at, O lock outlines, G the player list (go to). In play, none of them is taken (H, L and O are build mode's
  and the paint editor's only; Tab is build mode's, so not Tab).
- **Inventory:** every color and cap at once, and every tool the session allows (`setup.tools`: the server drops ops
  of tools that are off anyway); nothing to pick up, and the session's pickups stay as they are.
- **Kicks and bans stay on cctv:** in the game the admin watches; cctv's session page kicks and bans, as now.
- **Player list:** a key lists the session's players (dropped ones too); picking one puts the admin beside them
  (where the server last had them).
- **One game tab per browser** (`src/one-tab.ts`): playing and being the admin at once takes another browser or
  profile. Accepted.
- **The server decides:** every power is the server's to grant and check; the game only shows it.
- **Lightweight:** in the game's one build, its code in `src/admin/`, loaded with `import()` only when the welcome
  says admin: players download and run none of it. Plain to look at; as little code as it can be.

### Locks

- **One face per click:** the face pointed at, as a paint surface and its face rect (the pair every paint op carries).
  Not the whole surface: one holds 1 to 134 faces (roof: 1219 surfaces, many of 10 faces or more). Its paint stays as
  it is, and no one can change it: spray, marker, roller, sponge and runs all stop at it. The server refuses new paint
  there, and every game refuses it too (otherwise the painter would see paint the others don't).
- **A known limit, accepted:** a player painting the face as its lock arrives keeps the few stamps of that moment
  (about one ping's worth) that the server dropped, seen only by them until they reload or rejoin. Into
  `docs/known-limits.md` when built.
- **Per session:** set live, sent in the welcome and on each change, kept with the session on disk; another session
  on the same level is free.
- **A wipe or a restore clears them:** either is a new paint, with no locks (saves carry none).
- **Outlines on a key:** O draws every locked face's outline in red (one line mesh, the admin's only: players never
  see it, so the ink rule holds for them).
- **Players see nothing** of a lock until they paint the face.
- **Players are told:** paint that won't stick to a locked surface shows the HUD line pickups use ("You picked up
  ..."): "I won't spoil this masterpiece" (`src/messages.ts`).

### The release

- **Stays in 1.6.1**, though its notes say a patch; the notes are rewritten for it.
- **A protocol bump** (new messages: `PROTOCOL` 9 to 10) wipes the public sessions' paint at deploy, as a new protocol
  does today (`server/kept.ts`). Accepted.
- **Files at the size limit** (`server/session.ts` 393 lines, `src/net/multiplayer.ts` 399): split only where it is
  logical. The new parts go in modules of their own (the passes, the locks, the admins' map on the server;
  `src/admin/` and the locks in the game), so these two get only their hooks. If they still pass ~400: helpers, types
  and config out, e.g. the session's SAVE serving into `server/paint-files.ts` and admit's matching of a link to a
  player (token, device, a dropped nickname) into `server/player.ts`. Behavior the same, `npm run check` before and
  after.

### How it is built (the design checked against the code, 2026-11-01)

The same behavior as above, at the least code; each is where the code already does most of it.

- **Server, admins:** their map, and one `everyone()` (players, then admins) for the six loops that reach everyone
  (ping, wipe, restore, end, relay, broadcast in `server/session.ts`). Admitting, receiving and removing an admin is a
  short path of its own (`server/admins.ts`) that never reaches the sites that count, list, log events or hold seats:
  "no trace" and "never a seat" are that path, not checks scattered over the session.
- **The pass:** one branch first in the link's message handler (`server/lobby.ts`), before the ban check: a JOIN with
  a valid pass goes to the admin path and never through the bans, the rate, the seats or the line, so none of them
  knows about admins. A `Map` in the same process as the admin API, deleted on use, the expired dropped at the next
  pass made: no timer. An HMAC would not make it work once.
- **Unseen is tools off:** the game takes every tool away with the session's existing `inventory.allowOnly`, and the
  server drops an unseen admin's state, ops and inventory first thing; seen, the session's tools come back.
- **Every color and cap:** `inventory.unlockAll()` once, from `src/admin/` (it already skips the tools a session
  turned off). Not the F3 wrapper, nor the welcome's `inventory`: both run `pickups.collectOwned`, which takes the
  session's pickups.
- **No beacon:** one flag, set at boot when the URL carries the pass, read where the beacon sends: the first beacon
  goes as the level is ready, before any welcome.
- **No reconnect:** the server closes an admin's link on a wipe or restore with an existing rejection (`closed`), not
  the players' reconnect code (1012); the game ends admin mode on any closed link with its own text, and never keeps
  the token in the tab's session.
- **Locks:** a `locked` flag on the face rect (`Rect`, `src/surfaces.ts`), the same object on the server and in the
  game. Read where paint is written in `src/painting.ts`: `stamp()` and `roll()` (so the op isn't sent), `dot()` and
  `band()` (which also catch a stroke spilling over a seam onto a locked neighbor face), and the runs' `dab`. The
  server paints with the same code, so it refuses there too; `takenOps` gets one clause so the ops stay out of the
  stats and the relay. On the wire: pairs of the surface's index (`SurfaceIndex`, `src/op-wire.ts`) and the rect,
  all in the welcome, one pair on each change.
- **The locked line:** painting sets a flag, read once a frame, shown as a toast no more often than a toast lasts.
- **Outlines:** build mode's `PaintedSpots` (`src/build/painted-spots.ts`) is already one line mesh of face boxes
  (`texelToWorld`): fed the locked faces, in red, made on the first O, gone when O is off.
- **Plates:** one role field on the `joined` entries and the welcome's players. `admin` is taken (`SessionSetup.admin`:
  a session cctv made), so the role gets another word (e.g. watcher), in `CONTEXT.md` when built.

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
