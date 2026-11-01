# Admin mode (IDEA-195 @1.6.1; IDEA-288, IDEA-289 @1.7.1; cctv: CCTV-290)

The owner's approved decisions (2026-11-01). IDEA-193 (locks) and BL-153 (who painted it) are merged in. Once built,
the route goes into `docs/admin-api.md`, the lock race into `docs/known-limits.md`, the role's word into `CONTEXT.md`.

## 1.6.1: what it does

- **Entry:** cctv's "Join as admin" gets a one-time pass and opens `<game address>/#join=CODE&admin=PASS`. cctv's
  server list holds each server's game address.
- **Pass:** random, valid 60 s, works once, for that session's code only; in memory. It is after `#`, so no log or
  Referer has the pass or the code; the game wipes them from the address bar. It beats bans and the limits per
  address, but not the open links per address (`SERVER.linksPerIp`), which are counted before the JOIN.
- **Outside the players:** no seat, no line, no stats, no events, no beacon, not in cctv's listing. A full session
  stays 20/20 in the server list. Several admins fit one session. Any admin inside keeps a private session open.
- **Unseen by default:** nothing of the admin reaches the others. Unseen admins can't paint (tools off).
- **Seen (H):** to the others an ordinary player, joining and leaving with toasts. The plate is `Admin` in red, as a
  nameplate class (HUD, so the ink rule holds). It is numbered like any name when two are seen. Seen in a full
  session, the admin is a 21st figure; nothing counts figures. Admins see each other only while seen. The pause
  screen's player line never counts admins.
- **The nickname Admin is reserved** for players, in any case (`src/net/ban-words.ts`, menu and server).
- **Fly (J):** build mode's fly.
- **Kit:** every color and cap, and the tools the session allows. The session's pickups stay.
- **Player list (G):** the session's players, dropped ones too. Picking one puts the admin where their own game last
  showed that player. A player who dropped before the admin came is listed without go-to.
- **Keys** (in `config.ts`, hints on screen): H seen, J fly, L lock or unlock the face pointed at, O lock outlines,
  G list. None is taken in play; Tab is build mode's.
- **Kicks and bans:** stay on cctv.
- **No reconnect:** any closed link ends admin mode: LEAVE, a reload, a lost link, and wipe or restore from cctv. The
  game says so and returns to the player's own level and paint. The kit goes with the level, fly is off, and the page
  sends no beacon until it is reloaded. A new cctv click brings the admin back.
- **Server log:** one line marked admin per come and go (the security record), nothing else.

## 1.6.1: locks

- **Unit:** one face, as surface key plus face rect, the pair every op carries. A surface holds 1 to 134 faces
  (roof: 1219 surfaces), so not the whole surface.
- **Effect:** the face's paint stays. Spray, marker, roller, sponge and runs can't change it, on the server and in
  every game.
- **Players:** they see nothing until they paint the face. Then a toast says "I won't spoil this masterpiece"
  (`src/messages.ts`).
- **Scope:** per session, in the welcome and on each change, kept with the session on disk.
- **Wipe or restore:** clears every lock.
- **Outlines (O):** red, the admin's only.

## 1.6.1: how to build it

- **Server, admins:** `server/admins.ts`.
  - The pass `Map` lives in the admin API's process. It is deleted on use; expired ones are dropped at the next pass
    made, with no timer.
  - The admin path is admit, receive and remove. It never reaches the code that counts, lists, logs events or holds
    seats.
  - In `server/lobby.ts`, the link's message handler takes a JOIN with a pass first, before the ban check.
  - `Session.everyone()` (players, then admins) drives the six reach loops: ping, wipe, restore, end, relay and
    broadcast.
  - Unseen: the server drops the admin's state, ops and inventory first. Seen: it relays their ops, which count in no
    stat.
  - On wipe or restore, the server closes admin links with the existing `closed` rejection, not 1012.
  - Route: `POST /sessions/CODE/admin-pass` → `{ pass, expires }`. ADMIN_API stays 4.
- **Protocol:** `PROTOCOL` 9 → 10.
  - JOIN gets a `pass` field.
  - The welcome gets the admin flag and the locks.
  - Add a seen toggle, lock and unlock messages, and a role field on `joined` and welcome players. The word `admin` is
    taken by `SessionSetup.admin`, so the role needs another word, e.g. watcher.
  - Locks go on the wire as pairs of `SurfaceIndex` and rect: all of them in the welcome, one per change.
- **Game:** `src/admin/`, loaded with `import()` only when the welcome says admin. Hooks into `multiplayer.ts` stay
  thin.
  - Unseen: `inventory.allowOnly([])`.
  - Kit: `inventory.unlockAll()`, not the F3 wrapper or the welcome's `inventory`: both run `pickups.collectOwned`.
  - Fly: `player.fly`, with `unstick()` when it goes off.
  - Go-to: `Remotes` positions and `player.place`.
  - Outlines: build mode's `PaintedSpots` (one line mesh), fed the locked faces in red, made on O and disposed when
    O goes off.
- **Game, beacon:** set a flag at boot when the URL holds a pass, and check it where the beacon sends. The first
  beacon goes before any welcome.
- **Game, no reconnect:** on any close, end with the admin-ended text. Never write the tab session (`keepTabSession`).
- **Locks in code:** a `locked` flag on `Rect` (`src/surfaces.ts`), the same object on the server and in the game.
  - Check it in `src/painting.ts`: in `stamp()` and `roll()` (the op isn't sent), in `dot()` and `band()` (they catch
    seam spill onto a locked neighbor face), and in the runs' `dab`.
  - The server paints with the same code. `takenOps` gets one clause, which keeps locked ops out of the stats and the
    relay.
  - The toast is a flag read once a frame, shown at most once per toast lifetime.
  - Kept in `sessions.json` (`server/kept.ts` Entry) as an optional field.
- **File size:** `server/session.ts` has 393 lines, `src/net/multiplayer.ts` has 399. New parts go in their own
  modules. If a file still passes ~400 lines, move helpers, types or config out where it is logical: the SAVE
  serving into `server/paint-files.ts`, and admit's matching of a link to a player into `server/player.ts`. Run
  `npm run check` before and after.

## 1.6.1: limits and rules

- **Lock race (accepted):** stamps a player makes as the lock arrives (about one ping's worth) stay visible only to
  them until they reload or rejoin.
- **Protocol bump (accepted):** it wipes the public sessions' paint at deploy (`server/kept.ts`).
- **One game tab per browser (accepted):** playing and administering at once takes another browser or profile.
- **Authority:** every power is granted and checked by the server; the console can't. Players download and run no
  admin code. Plain to look at, as little code as it can be.
- **1.6.1's notes** say a patch; they are rewritten for this.

## 1.7.1: who painted what (IDEA-288) and a timelapse (IDEA-289)

- **When:** after the Painting Rework (TASK-231). A painter makes ~1760 ops a second now (one per particle) and should
  make ~60 after it (`docs/ideas/paint-refactoring.md`). A 15-minute ring for 20 painters is ~720 MB now and ~36 MB
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
