import type { Action } from './input.ts';

// Every message a player reads in the game, in one place, so each line can be reviewed and reworded without
// touching game logic. Grouped by the component that shows it; each group says where and when. A new text goes
// here, never into a call site.
// A template has `{name}` for a value msg() fills in, and `**bold**` for what the display draws bold. An action's
// name (`{forward}`, `{use}`) is not filled here: the display swaps it for the key's name when it draws
// (resolveLine below), so a rebound key shows as bound. No DOM: tested in Node (scripts/messages.test.mjs).
// Not messages, so not here: menu labels and button captions, tooltips, the popups' body paragraphs (save, upload,
// update notes), the HUD tags (CAP, NEW TOOL), the F3 panel's descriptions. The server list and join screens are the
// exception: all their words are here, captions included. Nothing player-facing comes from
// server/: it sends a `rejected` reason code and the game words it (menu.net*).

export const MESSAGES = {
  /** Subtitles at the bottom center: a control being taught (tutorial/hints.ts picks which, and for how long). Up to 3 lines, each its own entry line. */
  hint: {
    move: ['Press {forward} {left} {back} {right} to move', 'Hold {sprint} to run, press {jump} to jump'],
    spray: ['Press {use} to spray, {shake} to shake the can'],
    canTake: ['Press {slot1} to take the can'],
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
    ladderMove: ['Press {use} again to move it: only one stepladder stands at a time'],
    ladderShared: ['In a session, other players can climb your stepladder too'],
    spongeCrouch: ['Hold {crouch} to scrub paint off the floor'],
    lowPressure: ['Low pressure: hold {shake} to shake the can'],
    climb: ['Walk into the ladder or hold {jump} to climb', 'Hold {crouch} to stay on it'],
  },

  /** Centered over the hint, NOTIFY.toastSeconds each, stacked: things that happened (pickups and the stepladder in main.ts, joins and leaves in net/net-menu.ts). */
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

  /**
   * Top center, one at a time, while true: the link's state, the worst first (reconnecting > noSignal > badConnection).
   * Reconnecting is net/net-menu.ts's; the other two are net/link-health.ts's. Its icon: bars cycling, a red ring, one bar of three.
   */
  status: {
    reconnecting: 'Trying to reconnect · Attempt #{n}',
    /** The server has said nothing for a few seconds (NET.noSignal). */
    noSignal: 'No signal from the server',
    /** The round trip to the server is long (NET.badPing). */
    badConnection: 'Bad connection',
    /** There was trouble, now it's fine (notify.succeed on the status): the link reconnected, or No signal / Bad connection went away by itself. */
    reconnected: 'Reconnected',
  },

  /**
   * Blocks play until answered: a card with a label, a title, a text and a button. The first seven end a session the player was in
   * (net/lost-dialog.ts maps the failure to one; a failure while joining stays on the MULTIPLAYER page instead). Shown until answered:
   * Enter presses the button, Esc leaves without it (never reloads), and `esc` names that when it differs.
   */
  dialog: {
    /** The window to rejoin ran out ({minutes} of it). The only one that grows from the reconnecting status. */
    serverLost: { label: 'DISCONNECTED', title: 'Server not responding', text: "We couldn't reach the server for {minutes} minutes, so your place in the session is gone.", button: 'Save paint and leave', esc: 'Leave without saving' },
    /** The server came back without the session (it restarted). */
    sessionEnded: { label: 'SESSION ENDED', title: 'The session has ended', text: 'The server restarted and the session closed with it.', button: 'Save paint and leave', esc: 'Leave without saving' },
    /** The server closed the session: every player had left or lost their link, and none came back within {minutes}. */
    sessionEmpty: { label: 'SESSION ENDED', title: 'The session has ended', text: 'Everyone left or lost their connection, and no one came back within {minutes} minutes, so the session closed.', button: 'Save paint and leave', esc: 'Leave without saving' },
    /** The admin closed the session. */
    sessionClosed: { label: 'SESSION ENDED', title: 'The session has ended', text: 'The admin ended this session.', button: 'Save paint and leave', esc: 'Leave without saving' },
    /** The admin removed the player from the session. */
    removedByAdmin: { label: 'REMOVED', title: 'Removed from the session', text: 'The admin removed you from this session.', button: 'Save paint and leave', esc: 'Leave without saving' },
    openedElsewhere: { label: 'OPENED ELSEWHERE', title: 'Opened in another tab', text: 'You joined this session from another tab, so this one left it.', button: 'Got it' },
    updated: { label: 'UPDATE', title: 'A new version is out', text: 'The game was updated while you were away. Reload the page to play together again.', button: 'Reload page', esc: 'Leave without reloading' },
    sessionFull: { label: 'SESSION FULL', title: 'The session is full', text: 'Someone took your place while you were reconnecting.', button: 'Save paint and leave', esc: 'Leave without saving' },
    serverBusy: { label: 'SERVER BUSY', title: 'The server is busy', text: "It couldn't take you back right now. Try joining again later.", button: 'Save paint and leave', esc: 'Leave without saving' },
    /** Shown with the error as a callout. */
    networkError: { label: 'NETWORK ERROR', title: 'Something went wrong in the session', text: 'The game hit an error. Copy the network log from the menu to report it.', button: 'Open menu' },
    /** The frame loop threw (frame-guard.ts); shown with the error and its stack as a callout. */
    clientError: { label: 'CLIENT ERROR', title: 'The game crashed', text: 'Something broke on your side. Reload the page to keep playing; copy the error below to report it.', button: 'Reload page' },
  },

  /** Play's own HUD text that is not one of the four: the tool-hand alert (hud.ts, while the can is low) and the other players' nameplates (net/nameplates.ts: what each is doing, while true, and how far they are). */
  hud: {
    lowPressure: 'LOW PRESSURE — HOLD [{shake}] TO SHAKE',
    noteAway: 'Away',
    noteMenu: 'In menu',
    noteIdle: 'Idle',
    noteDropped: 'Disconnected',
    noteSilent: 'No signal',
    /** The dialog's key caps. */
    keyEnter: 'ENTER',
    keyEsc: 'ESC',
    /** Shown when that player's own link is bad (they say so: net/own-status.ts); the other notes win. */
    noteLagging: 'Lagging',
    /** How far another player is, in whole meters. */
    distance: '{meters}m',
  },

  /** The Multiplayer page's server list, the dialogs for joining a session (public: the house rules; private: its code) and the screen while one loads (net/lobby-page.ts, join-dialog.ts, loading-page.ts). */
  lobby: {
    // The list
    title: 'multiplayer',
    host: 'Host',
    hostUnavailable: 'Hosting is unavailable',
    refresh: 'Refresh',
    loadingList: 'Loading sessions',
    emptyTitle: 'No sessions right now',
    emptyText: 'Check back in a bit.',
    listFailedHint: 'Check your connection and try again in a moment.',
    public: 'Public',
    private: 'Private',
    ping: '{ms} ms',
    toolOff: '{tool} · not allowed',
    // The dialogs
    publicNameTitle: 'public session',
    publicTitle: 'house rules',
    publicLead: "You're joining a public session with other players.",
    privateTitle: 'private session',
    privateLead: 'Type the {length}-letter code the host shared.',
    codeBox: 'Letter {n} of the code',
    noSession: 'No session with this code',
    yourName: 'Your name',
    do: 'Do',
    dont: "Don't",
    doItems: ["Share the walls, make room for everyone's art", 'Respect the time and effort behind every piece', "Add to the scene, don't ruin it"],
    dontItems: ["Spam tags or deliberately ruin others' artwork", 'Paint ads, hate symbols, or hateful messages', 'Harass or target other players'],
    toolsLabel: 'Tools in this session',
    toolAllowed: 'Allowed',
    toolNotInSession: 'Off in this session',
    // {rules}, {terms} and {privacy} are links (the rules are no page)
    consentPublic: "By joining you confirm you're 18+ and accept the {rules}, {terms} and {privacy}, and that sessions may be recorded and shared.",
    banNote: 'Breaking the rules may result in a ban from public sessions.',
    consentPrivate: "By joining you confirm you're 18+ and accept the {terms} and {privacy}, and that sessions may be recorded and shared.",
    rules: 'House Rules',
    terms: 'Terms',
    privacy: 'Privacy',
    dontShow: "Don't show again",
    players: '{n}/{limit} players',
    cancel: 'Cancel',
    next: 'Next',
    back: 'Back',
    join: 'Join',
    // Loading a session
    loadingTitle: 'loading paint',
    loadingText: "Getting the roof ready. Everyone's paint shows up as it was left.",
    stepJoining: 'Joining {session}',
    stepDownloading: 'Downloading paint',
    stepPutting: 'Putting paint on the walls',
    stepDropping: 'Dropping you in',
    clickToPlay: 'Click to play',
    leave: 'Leave',
    // Waiting in line for a full session; {time} is m:ss, {s} whole seconds
    queueTitle: "you're #{n} in line",
    queueText: "The roof is full. You'll drop in as soon as a spot opens.",
    queueAhead: '{n} ahead of you',
    queueNext: "You're next",
    queueLostTitle: 'reconnecting',
    queueLost: 'Connection lost.',
    queueHeld: 'Your place #{n} is held for {time}.',
    queueAttempt: 'Attempt {n}',
    queueRetry: 'retry in {s} s',
    queueRetrying: 'trying now…',
    queueReconnect: 'Reconnect now',
    queueLeave: 'Leave queue',
  },

  /** The menu, its pages, and the screens before play: they keep their own places, and show until the next status or the step is done (a copy's flash: a few seconds). */
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
    netQueued: 'Waiting in line · #{n}',
    netBadSave: "That paint file doesn't fit this level",
    netBadLevel: "This level can't be hosted",
    netBusy: 'The server is full: try again later',
    netReplaced: 'This session was opened in another tab',
    netTooMany: 'Too many connections from your network: try again later',
    netNoHost: "This server doesn't take new sessions from players",
    netEnded: 'The session has ended',
    netClosed: 'The admin ended this session',
    netKicked: 'The admin removed you from this session',
    netSeats: 'Too many players from your network are in this session already',
    netRate: 'Too many joins from your network: wait a minute and try again',
    netTimeout: "The server didn't answer",
    netBroken: 'The game hit an error in the session: copy the network log for a report',
    netOffline: "Can't reach the site: check your connection",
    netServerDown: 'The game server is down',
    netNoServer: 'No game server at this address',
    netBlocked: 'The server is up but the connection was blocked (firewall or extension?)',
    joining: 'Joining…',
    typeName: 'Type a name first',
    nameLetters: 'A name is Latin letters A–Z and digits 0–9 only',
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
    // Create a session dialog (net/create-dialog.ts); the summary is `{players} players · ` and what it starts from
    createPlayers: 'Including you, {min} to {max}',
    createToolsAll: 'All tools on',
    createToolsNone: 'All tools off',
    createToolsOff: '{tools} off for everyone',
    createSummary: '{players} players · {start}',
    createStartEmpty: 'empty roof',
    createStartFile: 'from file',
    createStartNoFile: 'no file yet',
    createFileHint: 'Pick a .rhhpaint you saved',
    createNotPaint: "That isn't a .rhhpaint file.",
    createBusy: 'Creating…',
    // Settings → Gameplay: the button's confirmation
    hintsReset: 'Done: hints will show again',
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
    // Not here: the texts before the game's code runs stay where they run, as the entry must stay tiny (a phone loads none of the game): boot.ts ("The game didn't load", "The game needs WebGL") and index.html's noscript line.
    // Screen for small windows and touch devices
    smallHint: 'Send it to yourself for later.',
    smallCopied: 'Paste it on your computer to play.',
    smallWide: 'Wide enough to play now.',
    // Screen for a second tab of the game (other-tab.ts)
    otherTabTitle: 'The game is open in another tab',
    otherTabText: 'Hidden Roof runs in one tab at a time. Close this one and play on in the other.',
  },
} as const;

type Messages = typeof MESSAGES;
/** `group.name`: 'toast.joined'. The dialog's messages have several fields: see dialogOf. */
export type MessageId = { [G in Exclude<keyof Messages, 'dialog'>]: `${G}.${keyof Messages[G] & string}` }[Exclude<keyof Messages, 'dialog'>];
export type DialogId = keyof Messages['dialog'];
export type Vars = Record<string, string | number>;

/** A dialog's text: `esc` is what Esc does when that isn't what the button does. */
export interface DialogText {
  label: string;
  title: string;
  text: string;
  button: string;
  esc?: string;
}

/**
 * A hint's line as the player reads it: `Press {use} to draw` as `Press **LMB** to draw`. Each `{action}` becomes
 * its key name in bold, at display time (notify-view.ts), so rebinding or the keyboard layout arriving changes it.
 * An unbound key (`—`) isn't bold.
 */
export function resolveLine(line: string, label: (action: Action) => string) {
  return line.replace(/\{(\w+)\}/g, (_, action: string) => {
    const key = label(action as Action).replaceAll('*', '×');
    return key === '—' ? key : `**${key}**`;
  });
}

/** `{name}` filled from `vars`. A name without a value stays as it is, `{name}` in view, so it is caught. Values go in as plain text. */
const fill = (line: string, vars: Vars) => line.replace(/\{(\w+)\}/g, (whole, name: string) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));

const template = (id: MessageId) => {
  const [group, name] = id.split('.') as [keyof Messages, string];
  return (MESSAGES[group] as Record<string, string | readonly string[]>)[name];
};

/** A message's lines, filled. */
export function msgLines(id: MessageId, vars: Vars = {}): string[] {
  const t = template(id);
  return (typeof t === 'string' ? [t] : t).map((line) => fill(line, vars));
}

/** A one-line message. */
export const msg = (id: MessageId, vars: Vars = {}) => msgLines(id, vars).join('\n');

/** A dialog's label, title, text and button, filled. */
export function dialogOf(id: DialogId, vars: Vars = {}): DialogText {
  const d: DialogText = MESSAGES.dialog[id];
  return { label: fill(d.label, vars), title: fill(d.title, vars), text: fill(d.text, vars), button: fill(d.button, vars), esc: d.esc && fill(d.esc, vars) };
}
