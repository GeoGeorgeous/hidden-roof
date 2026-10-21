# Public servers (BL-043 to BL-047, TASK-189)

The public server: see also docs/deploy.md. Order: BL-043 first; 044, 045 (needs 044) and 046, 047 follow.

## BL-043 One public server, running 24/7

See `docs/deploy.md`.

## BL-044 Disable host and join (don't remove them)

Blocked by: BL-043; Status: Blocked, priority Medium, size S

Disable, with stubs, and switch them off on the server's side too.

## BL-045 A window of public servers instead of host and join

Blocked by: BL-043, BL-044; Status: Blocked, priority Medium, size M

Name, number of players and ping (one server for now). Build the UI of the new screen in Claude Code.

## BL-046 A queue to enter the server

Blocked by: BL-043; Status: Blocked, priority Medium, size M

(no body in the backlog)

## BL-047 Admin panel: players online, ban by IP

Blocked by: BL-043; Status: Blocked, priority Medium, size L

See who is online; block by IP forever or for a time.

## TASK-189 House rules before joining a public server

Blocked by: BL-045; Status: Blocked, priority High, size S

On the way into a public server, the house rules and one action to accept them (joining is the action): players are 18+; joining accepts the Terms and the Privacy Policy, linked; sessions may be recorded and published, nicknames included. Remembered per device in `localStorage` (strictly necessary: no consent needed). Why: playing alone binds no one to the Terms. The Terms get their moderation section with it (docs/ideas/legal.md).
