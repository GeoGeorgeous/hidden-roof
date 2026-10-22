# Every message in one place (BL-140, in 1.5.0)

The texts live in `src/messages.ts`: one typed object grouped by component (`hint`, `toast`, `chip`, `dialogue`, `hud`, `menu`), a template per entry with `{var}` and `**bold**`; `msg(id, vars)` and `msgLines(id, vars)` fill it. Action names (`{forward}`, `{use}`) stay in the text until display, where `label()` gives the key as bound. To change a text, change it there; this file says where each one shows and when. Every JS call site reads the catalogue (play, `src/net/`, the menu and its pages, the paint files' errors, Settings → Controls, the loading screen's steps, screen 10). Two places keep their own text, because they run before the game's code and the entry must stay tiny (a phone loads none of the game): `boot.ts` ("The game didn't load", "The game needs WebGL") and `index.html`'s noscript line. A new text goes into the catalogue, never into a call site. The four components: `docs/ideas/tutorial.md`, In-game UI. Only play gets them now; the rest "stays" in its menu or page.

Ids are `group.name`. Duration: how long it shows. Tech = technical (a code, a log, for reports).

## Inventory

| Id | Text (today → catalogue) | Where | Trigger | Lasts | Becomes |
|---|---|---|---|---|---|
| `toast.pickedUp` | `+ MARKER` → You picked up **{item}** | `main.ts` (`pickups.onCollect`) | a pickup collected | `HUD.toastTime` 2.2 s → 3 s | toast |
| `toast.alreadyHave` | `ALREADY HAVE …` → You already have **{item}** | `main.ts` (`pickups.onBlocked`) | a pickup the player has | same | toast |
| `toast.ladderBlocked` | The ladder can't stand there | `main.ts` (`tools.ladder.onBlocked`) | stepladder blocked | same | toast |
| `toast.screenshot` | Screenshot saved | `main.ts` | screenshot key | same | toast |
| `toast.joined` / `left` | `BOB JOINED` → **{user}** joined / left | `net-menu.ts:143` | a player joins or leaves | same | toast |
| `toast.unlockedAll` | `+ EVERYTHING` | `dev/devtools.ts` | F3 unlock all (dev) | same | toast |
| `hint.*` (17) | move, spray, four tools (take, use), cap, color, climb, and new: `ladderMove`, `ladderShared`, `spongeCrouch`, `lowPressure` | `tutorial/hints.ts` | by hint rules | by kind | hint |
| `hud.lowPressure` | LOW PRESSURE — HOLD [{shake}] TO SHAKE | `hud.ts` | can pressure low | while low | stays (tool-hand alert, a state) |
| `hud.noteAway` / `noteDropped` / `noteSilent` | AWAY / DISCONNECTED / NO SIGNAL | `net/remotes.ts:17` | another player's state | while true | stays (nameplate) |
| `menu.net*` (17) | the MULTIPLAYER page's status per state and failure | `net-menu.ts:27-45` | `NetStatus` change | until the next | stays on the page; `netReconnecting` also becomes the chip (`chip.reconnecting`) |
| `menu.session`, `pauseIdle`, `pauseStart` | Session · CODE / Paused / Click to start | `pause-menu.ts:262`, `net-menu.ts:140` | ESC menu status line | while true | stays in the menu |
| (the notice) | the status text again as the menu's notice | `net-menu.ts:94,139,148` | status, progress, log copy | `NOTICE_SECONDS` 3 s, Infinity for connecting and reconnecting | stays in the menu |
| `chip.reconnecting` | Trying to reconnect · Attempt #{n} | new (today `menu.netReconnecting`, `multiplayer.ts:219`) | link dropped, retrying | while true | chip |
| `dialogue.serverLost` + `serverLostAction` | Server not responding · button SAVE PAINT AND LEAVE | new (today nothing in play) | a session lost for good mid-play | until answered: Enter saves the session's paint as a .rhhpaint download and leaves, Esc leaves without saving (the menu opens) | dialogue |
| `dialogue.frameFailed` | Something broke. Reload the page to go on. | `frame-guard.ts:25` | the frame loop threw | until reload | dialogue (own card, above all) |
| `menu.joining`, `progress*` (6) | Joining… / Saving paint… / Uploading paint 40% … | `net-menu.ts`, `multiplayer.ts:131,282`, `server-link.ts:121-153` | HOST, JOIN, SAVE steps | until done | stays (menu, PLAY button) |
| `menu.typeName`, `codeLength`, `logCopied`, `logSaved` | form errors, log copy result | `net-menu.ts:75,111,95-97` | a click | until the next say / 3 s | stays on the page |
| `menu.saveBusy`, `saveReconnecting` | save failures | `multiplayer.ts:126,140` | SAVE refused | in the save popup | stays (popup) |
| `menu.detail*` (8) | BROWSER OFFLINE, WS 1006 · TRY 3, HTTP 502 … | `diagnostics.ts:41-54`, `multiplayer.ts:195,217,219` | link failure, appended in parentheses | with the status | stays. **Tech** |
| `menu.paint*` (8) | NOT A PAINT FILE, BROKEN PAINT FILE, SAVED BY A NEWER VERSION … | `paint-file.ts:80-155`, `load-paint.ts:48`, `files.ts:19`, `paint-menu.ts:64,88` | an upload fails | in the popup | stays (popup). Shown as a sentence |
| `menu.bind*` (5) | Press a key… / moved here from … / back to defaults | `controls-tab.ts:120,190,210` | rebinding | `PAUSE_MENU.undoSeconds` | stays (Settings → Controls) |
| `menu.perf*` (2) | Testing · 12 s left / Tested at your current settings | `perf-test-page.ts:129-162` | the performance test | while running | stays (page) |
| `menu.copied`, `linkCopied` | Copied / Link copied | `session-line.ts:56`, `small-screen.ts:41`, dev `debug/panel.ts:253` (COPIED) | a copy button | `COPIED_MS` 2.5 s (dev 1.5 s) | stays |
| `menu.load*` | Building the roof / Lighting the lamps / Putting up the paint / The level didn't load | `main.ts`, `loading.ts` | start up | until the game shows | stays (loading screen) |
| (not in the catalogue) | The game didn't load / The game needs WebGL / Hidden Roof needs JavaScript … | `boot.ts`, `index.html` | the game can't start | until reload | stays (loading screen); runs before the module graph |
| `menu.small*` | Send it to yourself for later / Paste it on your computer to play / Wide enough to play now | `small-screen.ts:37-60` | small window | `COPIED_MS` for the second | stays (screen 10) |

Not moved, and not in the catalogue: menu labels and button captions, tooltips, the popups' body paragraphs (save, upload, update notes: page copy, not messages), the HUD tags (CAP, NEW TOOL), the F3 panel's descriptions (`debug/hint-text-*.ts`, dev only). Nothing player-facing comes from `server/`: it sends a `rejected` reason code and the game words it (`menu.net*`). The CSP and boot checks show nothing to players beyond `boot*` and `noScript`.

Counts in the catalogue: hint 17, toast 7, chip 3, dialogue 2, hud 5, menu 73.

## Statuses

Exist today (`net/multiplayer.ts` `NetStatus`, `Failure`; `net/diagnostics.ts`):

| State | Source | Today | Blocking in play |
|---|---|---|---|
| `connecting` | HOST/JOIN started | page status, PLAY button | no (menu, before play) |
| `in` | welcome received | `Session · CODE` | no |
| `reconnecting` | socket closed or server silent `NET.serverSilence` 15 s; retries 1, 2, 4, 8 s, until `SERVER.rejoinWindow` 180 s | menu notice, frozen nameplates | no: the chip |
| `failed` `ended` | rejoin window over, or the session is gone | menu notice | yes (dialogue: server not responding) |
| `failed` `replaced` | opened in another tab | menu notice | yes |
| `failed` `broken` | a message the game couldn't handle | menu notice | yes |
| `failed` `version` | server of another protocol, from the server or `diagnose` | menu notice | yes |
| `failed` `timeout` | no answer in `NET.connectTimeout` 15 s (before the welcome) | page | JOIN only: no |
| `failed` `no-session`, `full`, `bad-save`, `bad-level`, `busy`, `too-many` | the server's `rejected` | page | JOIN or HOST only: no (`too-many` can also hit a reconnect: then yes) |
| `failed` `offline`, `server-down`, `no-server`, `blocked` | `diagnose()` after a socket failed | page | while reconnecting these are retried (chip), then `ended` |
| other player: `away`, `dropped`, `silent` (`NET.silentAfter` 3 s) | presence, snapshots | nameplate note | no |

Data that exists but is not shown as a status: `Traffic.ping` (a ping every `SERVER.ping` 2 s), up/down rates (`Traffic`), each player's `delay` and `jitter` (`netLines`), the time since the last server message (`ServerLink.heard`).

Built on feat/hints-net (`src/net/link-health.ts`, tested in `scripts/link-health.test.mjs`; thresholds in `NET`, F3 → Link status). At most one chip, the worst first: reconnecting (net-menu's) > no signal > bad connection. Each shows when its value stays past the limit and clears when it stays under the clear value (hysteresis); no signal acts at once, ping holds `NET.statusHold` 5 s.

| Status (chip id) | Data, where read | Limit (clear) |
|---|---|---|
| `chip.noSignal` | `ServerLink.lastHeard`, in `Multiplayer.update` | silent over 4 s (1.5 s) |
| `chip.badConnection` | `Traffic.ping` (`Multiplayer.ping`) | over 300 ms for 5 s (under 200 ms for 5 s) |
| `hud.noteLagging` (LAGGING) | `RemoteTimeline.stats.delay` per player (`RemotePlayer.lagging`, same flag) | over 300 ms for 5 s (under 200 ms for 5 s) |

Packet loss was dropped (owner, 2026-10-22): a WebSocket doesn't lose packets, and the snapshot gaps it would have counted were another player's low fps. High delay is a note on that player's nameplate, not a chip: it comes after AWAY, DISCONNECTED and NO SIGNAL, which win (a player who is here and heard is the only one marked LAGGING).

Still candidates:

| Candidate | Data | Proposed threshold | Component |
|---|---|---|---|
| Slow upload (a paint file) | upload progress rate | under 8 KB/s | stays in the menu's progress line |
| Server full / busy / version | `rejected` reasons | exist | JOIN: page; mid-play: dialogue |
| Away, dropped, back | `Remotes.onPresence` | exists as nameplate | toast "**{user}** is back" |
| Context lost, online/offline, pointer lock or clipboard refused | browser events | event fires | toast or chip |

## Open questions for the owner

1. ~~Reconnecting: a chip at once or after 2 s?~~ Decided (owner, 2026-10-22): at once.
2. ~~Which candidate statuses in 1.5.0?~~ Decided and built: no signal and bad connection as chips, high delay as a nameplate note (LAGGING); packet loss dropped.
3. ~~A failure while joining?~~ Decided: it stays on the MULTIPLAYER page; the dialogue only in play, after the player was in (BL-114: `NetStatus` `failed` carries `code`; done on feat/hints-net).
