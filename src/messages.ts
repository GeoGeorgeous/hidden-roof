// Every message a player reads in the game, in one place, so each line can be reviewed and reworded without
// touching game logic. Grouped by the component that shows it (docs/ideas/messages.md lists where and when).
// A template has `{name}` for a value msg() fills in, and `**bold**` for what the display draws bold. An action's
// name (`{forward}`, `{use}`) is not filled here: the display swaps it for the key's name when it draws
// (tutorial/text.ts resolveLine), so a rebound key shows as bound. No DOM: tested in Node (scripts/messages.test.mjs).

export const MESSAGES = {
  /** Subtitles at the bottom center: a control being taught. Up to 3 lines, each its own entry line. */
  hint: {
    move: ['Press {forward} {left} {back} {right} to move', 'Hold {sprint} to run, press {jump} to jump'],
    spray: ['Press {use} to spray, {shake} to shake the can'],
    markerTake: ['Press {slot2} to take the marker'],
    marker: ['Press {use} to draw, {sizeDown} / {sizeUp} to change nib'],
    ladderTake: ['Press {slot3} to take the stepladder'],
    ladder: ['Press {use} to put it down, {prev} / {next} to turn it'],
    rollerTake: ['Press {slot4} to take the roller'],
    roller: ['Press {use} to roll, {sizeDown} / {sizeUp} to change width'],
    spongeTake: ['Press {slot5} to take the sponge'],
    sponge: ['Press {use} to scrub paint off, {sizeDown} / {sizeUp} to change size'],
    cap: ['Press {sizeDown} / {sizeUp} to change the cap'],
    color: ['Scroll {prev} / {next} to change color'],
    climb: ['Walk into the ladder or hold {jump} to climb', 'Hold {crouch} to stay on it'],
  },

  /** Centered over the hint, 3 s each, stacked: things that happened. */
  toast: {
    pickedUp: 'You picked up **{item}**',
    alreadyHave: 'You already have **{item}**',
    ladderBlocked: "The ladder can't stand there",
    screenshot: 'Screenshot saved',
    joined: '**{user}** joined',
    left: '**{user}** left',
    /** Dev only (F3, unlock all). */
    unlockedAll: 'You picked up **everything**',
  },

  /** Top center, one at a time, while true: the link's state. */
  chip: {
    reconnecting: 'Trying to reconnect · Attempt #{n}',
    /** The server has said nothing for a few seconds (NET.noSignal). */
    noSignal: 'No signal from the server',
    /** The round trip to the server is long (NET.badPing). */
    badConnection: 'Bad connection',
    /** Others' snapshots are missing (NET.lossShare). */
    packetLoss: 'Packet loss',
    /** Another player is shown far behind (NET.highDelay). */
    highDelay: 'High delay for **{user}**',
  },

  /** Blocks play until confirmed. */
  dialogue: {
    sessionLost: "You're playing alone now; your paint is kept",
    /** The frame loop threw (frame-guard.ts): its own card with a Reload button. */
    frameFailed: 'Something broke. Reload the page to go on.',
  },

  /** Play's own HUD text that is not one of the four: the tool-hand alert and the other players' nameplate notes. */
  hud: {
    lowPressure: 'LOW PRESSURE — HOLD [{shake}] TO SHAKE',
    noteAway: 'AWAY',
    noteDropped: 'DISCONNECTED',
    noteSilent: 'NO SIGNAL',
  },

  /** The menu, its pages, and the screens before play: they keep their own places. */
  menu: {
    // ESC menu status line
    pauseIdle: 'Paused',
    pauseStart: 'Click to start',
    session: 'Session · {code}',
    // MULTIPLAYER page status; a failure appends its detail: "text (detail)"
    netConnecting: 'Connecting…',
    netReconnecting: 'Connection lost · reconnecting…',
    netVersion: 'A new version is out: reload the page',
    netNoSession: 'No session with that code',
    netFull: 'That session is full',
    netBadSave: "That paint file doesn't fit this level",
    netBadLevel: "This level can't be hosted",
    netBusy: 'The server is full: try again later',
    netReplaced: 'This session was opened in another tab',
    netTooMany: 'Too many connections from your network: try again later',
    netEnded: 'The session has ended',
    netTimeout: "The server didn't answer",
    netBroken: 'The game hit an error in the session: copy the network log for a report',
    netOffline: "Can't reach the site: check your connection",
    netServerDown: 'The game server is down',
    netNoServer: 'No game server at this address',
    netBlocked: 'The server is up but the connection was blocked (firewall or extension?)',
    joining: 'Joining…',
    typeName: 'Type a name first',
    codeLength: 'The code is {length} letters',
    logCopied: 'Network log copied',
    logSaved: 'Network log saved as a file',
    saveBusy: 'The server is busy: save again later',
    saveDropped: 'The link dropped before the paint came: save again',
    saveReconnecting: 'Reconnecting: save again once back in the session',
    // Progress of HOST, JOIN and SAVE; PLAY shows the short form while joining
    progressSaving: 'Saving paint…',
    progressLoading: 'Loading paint…',
    progressUploading: 'Uploading paint {percent}',
    progressSavingParts: 'Saving paint {percent}',
    progressDownloading: 'Downloading paint {percent}',
    progressJoining: 'Joining session…',
    progressGoingBack: 'Going back in…',
    progressCreating: 'Creating session…',
    progressCreatingSave: 'Creating session from the save…',
    progressShort: 'Loading {percent}',
    /** What was seen when a link failed, for reports (technical). */
    detailWs: 'WS {code}',
    detailTry: 'WS {code} · TRY {n}',
    detailOffline: 'BROWSER OFFLINE',
    detailNoHttp: 'NO HTTP ANSWER IN {seconds} S',
    detailHttpFailed: 'HTTP FAILED',
    detailServerUp: 'SERVER UP',
    detailProtocol: 'SERVER PROTOCOL {theirs}, OURS {ours}',
    detailHttp: 'HTTP {status}',
    detailNoAnswer: 'NO ANSWER IN {seconds} S',
    detailNoWayBack: 'NO WAY BACK IN {seconds} S',
    // Paint files (save and upload popups; thrown with the text, shown as a sentence)
    paintNotFile: 'NOT A PAINT FILE',
    paintBroken: 'BROKEN PAINT FILE',
    paintNewer: 'SAVED BY A NEWER VERSION',
    paintOlder: 'SAVED BY AN OLDER VERSION',
    paintOtherVersion: 'SAVED FOR ANOTHER VERSION OF {level}',
    paintOtherLevel: 'SAVED FOR {level}',
    paintNoFile: 'NO FILE CHOSEN',
    paintNoFit: 'That paint file doesn’t fit this level.',
    // Settings → Controls
    bindPrompt: 'Press a key, click a mouse button or scroll to bind {action}. Esc cancels.',
    bindRefused: '{reason} Try another key.',
    bindMoved: '{key} moved here from {action}.',
    bindMovedEmpty: '{key} moved here from {action}, which has no key now.',
    bindReset: 'Controls are back to defaults.',
    // Settings → Graphics → performance test
    perfTesting: 'Testing · {seconds} s left',
    perfTested: 'Tested at your current settings',
    // Small copy flashes
    copied: 'Copied',
    linkCopied: 'Link copied',
    // Loading screen
    loadRoof: 'Building the roof',
    loadLamps: 'Lighting the lamps',
    loadPaint: 'Putting up the paint',
    loadFailed: "The level didn't load: reload the page",
    bootFailed: "The game didn't load: reload the page",
    bootNoWebgl: 'The game needs WebGL, and this browser has it turned off',
    noScript: 'Hidden Roof needs JavaScript and a desktop browser with WebGL2.',
    // Screen for small windows and touch devices
    smallHint: 'Send it to yourself for later.',
    smallCopied: 'Paste it on your computer to play.',
    smallWide: 'Wide enough to play now.',
  },
} as const;

type Messages = typeof MESSAGES;
/** `group.name`: 'toast.joined'. */
export type MessageId = { [G in keyof Messages]: `${G}.${keyof Messages[G] & string}` }[keyof Messages];
export type Vars = Record<string, string | number>;

const template = (id: MessageId) => {
  const [group, name] = id.split('.') as [keyof Messages, string];
  return (MESSAGES[group] as Record<string, string | readonly string[]>)[name];
};

/** A message's lines, `{name}` filled from `vars`. A name without a value stays as it is, `{name}` in view, so it is caught. Values go in as plain text. */
export function msgLines(id: MessageId, vars: Vars = {}): string[] {
  const t = template(id);
  return (typeof t === 'string' ? [t] : t).map((line) => line.replace(/\{(\w+)\}/g, (whole, name: string) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole)));
}

/** A one-line message. */
export const msg = (id: MessageId, vars: Vars = {}) => msgLines(id, vars).join('\n');
