# Admin mode in the game (IDEA-195)

The admin inside a live session: unseen, past every limit, flying, with every tool; finds who painted what, kicks,
bans, erases one player's paint and locks surfaces against paint. IDEA-193 (locks) and BL-153 (who painted it) are
merged into it. This file holds only the owner's approved decisions and what is still open; the server's routes go
into `docs/admin-api.md` once they are built.

## Approved (2026-11-01)

### Entry and presence

- **Release:** 1.6.1.
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
- **The server decides:** every power is the server's to grant and check; the game only shows it.
- **Lightweight:** in the game's one build, its code in `src/admin/`, loaded with `import()` only when the welcome
  says admin: players download and run none of it. Plain to look at; as little code as it can be.

### Who painted it

- **Pointing** at paint shows who painted what is seen there now (the last painter), no layers.
- **A small panel:** a key (or click) on the paint opens it: the painter's nickname, in the session or gone, then
  Kick, Ban (cctv's days and reason presets, or the admin's own reason) and Erase their paint; Esc closes it.

### Locks

- **One surface per click:** a face of a wall, or one paintable surface of a prop. Its paint stays as it is, and no
  one can change it: spray, marker, roller, sponge and runs all stop at it. The server refuses new paint there, and
  every game refuses it too (otherwise the painter would see paint the others don't).
- **Per session:** set live, sent in the welcome and on each change, kept with the session on disk; another session
  on the same level is free.
- **A wipe clears them too:** an admin wipe clears all paint and drops every lock.
- **Outlines on a key:** a key draws every locked surface's outline (one line mesh, the admin's only).

## Open (to discuss in detail)

How the server keeps a player's paint apart, all server side (clients unchanged). The candidate, to be talked
through: a grid of last painters per surface (cells a few cm in meters), plus a copy of what a cell held when another
painter covered it, so erasing a player puts back exactly what their strokes covered, one layer back. Measured: roof
fully painted at ultra is 565 MB of paint (the server's limit, `hostMemory`, 1024 MB); the copies can grow up to as
much again, so they need a cap.

- **The model:** grid and one copy under; grid only (erasing leaves paper); or a journal of ops (exact, every layer,
  unbounded memory, replaying drips a risk).
- **Cell size:** 4 cm (~+3.5% of paint memory) or 2 cm (~+14%).
- **The copies' cap:** fixed per session, a share of its paint, or none; past it the oldest go.
- **Copies in saves:** kept on disk with the grid (saves up to twice as big), or lost on a restart (an erase there
  leaves paper; who painted it still works).
- **Painters' records**, to ban one who left: the owner's idea is one table of everyone who played, kept for good
  with the bans' hashes only. Against it: a hash on the bans' fixed key, kept on the same disk, is pseudonymous
  personal data, and an IPv4 one reverses in minutes; the Privacy Policy promises monthly keys and 91 days. The
  candidate: a record per painter beside the paint, while their paint is on the wall, hashes for at most 30 (or 14)
  days since their last stroke; the Privacy Policy to say so.
- **The sponge:** the sponger as the cell's painter (erasing them brings back what they scrubbed), or no one.
- **Sending an erase:** as a restore (every game reconnects and loads the server's paint; no new client code) or a
  message of its own.
- **Banning from paint:** `POST /bans` by a painter's record, not only a player in the session.
- **One player's paint alone** (cctv's "see paint"): the server makes a paint file of only their cells, opened solo
  in the game by a one-time pass like the admin's.
