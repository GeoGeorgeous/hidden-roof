import { COLORS, PAINT, SERVER } from '../config';
import { download, stamp } from '../files';
import type { PauseMenu } from '../pause-menu';
import { msg, type MessageId } from '../messages';
import type { Notify } from '../notify';
import { button, div, el, notice, pageHead } from '../menu-ui';
import { createDialog } from './create-dialog';
import type { MultiplayerContext } from './game-context';
import { JoinDialog, rulesSeen } from './join-dialog';
import { LobbyPage } from './lobby-page';
import { shellButton, type Where } from './lobby-view';
import { LoadingPage } from './loading-page';
import { QueuePage } from './queue-page';
import { lostDialog, type LostButton } from './lost-dialog';
import { nameField, nameProblem, storedName } from './name-field';
import type { LobbyEntry } from './protocol';
import { Multiplayer } from './multiplayer';
import type { Failure, NetStatus } from './status';

// The Multiplayer page of the ESC menu: the server's list of sessions (lobby-page.ts), the link's state under it.
// A row opens the dialog for joining it (join-dialog.ts), and JOIN shows the screen while it loads
// (loading-page.ts), or the line (queue-page.ts) while a full session has no place; a public session whose rules the player has seen skips the dialog. HOST, when players may
// (SERVER.playerHost), opens the new session dialog (create-dialog.ts): a private session at the host's PAINT
// DETAIL, from an empty roof (the level's own paint, save/level-paint.ts, none for most levels) or a paint file.
// In a session the pause screen shows its live line (code, ping, players) and offers SAVE (the session's paint)
// and LEAVE SESSION.
// Returns the game's Multiplayer.

/** What the player reads about the link: every failure has its text. */
const STATUS: Record<Failure | 'connecting' | 'reconnecting', MessageId> & Partial<Record<NetStatus['state'], MessageId>> = {
  connecting: 'menu.netConnecting',
  reconnecting: 'menu.netReconnecting',
  version: 'menu.netVersion',
  'no-session': 'menu.netNoSession',
  full: 'menu.netFull',
  'bad-save': 'menu.netBadSave',
  'bad-level': 'menu.netBadLevel',
  busy: 'menu.netBusy',
  replaced: 'menu.netReplaced',
  'too-many': 'menu.netTooMany',
  'no-host': 'menu.netNoHost',
  kicked: 'menu.netKicked',
  ended: 'menu.netEnded',
  restarted: 'menu.netEnded',
  expired: 'menu.netEnded',
  timeout: 'menu.netTimeout',
  broken: 'menu.netBroken',
  offline: 'menu.netOffline',
  'server-down': 'menu.netServerDown',
  'no-server': 'menu.netNoServer',
  blocked: 'menu.netBlocked',
};

export function multiplayerMenu(hud: PauseMenu, notify: Notify, ctx: MultiplayerContext) {
  const net = new Multiplayer(ctx);
  const sub = div('page-sub');
  const rows = div('rows lobby');
  const status = div('mp-status');
  // The network log, for a report: the action of the notice of a failed link.
  const log = button('Copy network log', () => copyLog(), 'net-log');
  const foot = div('mp-foot');
  foot.append(status);
  const hostButton = shellButton(msg('lobby.host'), SERVER.playerHost ? () => hud.openPage('create') : null, { icon: 'broadcast', key: 'H', title: SERVER.playerHost ? undefined : msg('lobby.hostUnavailable') });
  hostButton.classList.add('host-button');
  const root = div('page mp-page');
  // The link's state is there before the page was ever opened (a session hosted by the page, a link lost).
  rows.append(foot);
  root.append(pageHead(msg('lobby.title'), sub), hostButton, rows);

  const hostName = nameField(msg('lobby.yourName'));
  /** The session being joined (a row of the list, where the server is, the code asked for) from JOIN until the player is in or it failed. */
  let joining: { entry: LobbyEntry; where: Where; code: string } | null = null;
  /** The row picked, while its dialog is open. */
  let picked: { entry: LobbyEntry; where: Where } | null = null;

  /** Why the link failed, while its notice is showing: the list, asked again, won't say it twice. */
  let linkFailed: MessageId | undefined;
  /** Progress (…) dimmer; a link that `failed` (for this reason) is a notice with COPY NETWORK LOG. */
  const say = (text: string, failed?: MessageId) => {
    status.replaceChildren(failed ? notice(text, { error: true, actions: [log] }) : text);
    linkFailed = failed;
  };
  const show = (...els: HTMLElement[]) => {
    rows.replaceChildren(...els, foot);
    say('');
  };
  const list = new LobbyPage(
    (entry, where) => {
      picked = { entry, where };
      // A public session's rules, once seen, are not asked again; a name is still needed.
      if (entry.kind === 'public' && rulesSeen() && !nameProblem(storedName())) join(storedName(), entry.code ?? '', entry);
      else dialog.ask({ entry, where });
    },
    // The server is down for the list too: its notice says so, with the log, and the link's notice goes.
    (why) => (why === linkFailed ? (say(''), [log]) : []),
  );
  /** Back from a dialog to the list as it was, without asking the server again. */
  let keep = false;
  const back = () => ((keep = true), hud.openPage('mp'));
  const choose = () => {
    show(list.el);
    if (!keep) void list.refresh();
    keep = false;
  };
  /** From JOIN to the player being in: the loading screen, and the dialog or the list back if it fails. */
  const join = (who: string, code: string, entry: LobbyEntry) => {
    joining = { ...picked!, code };
    say('');
    loading.show(entry, joining.where);
    hud.openPage('loading');
    net.join(who, code);
  };
  const dialog = new JoinDialog({ show: () => hud.openPage('join'), join, cancel: back });
  const loading = new LoadingPage(() => (cancelJoin(), hud.openPage('mp')));
  const queue = new QueuePage(() => (cancelJoin(), hud.openPage('mp')), () => net.retryNow());
  const cancelJoin = () => {
    joining = null;
    void net.leave();
  };
  /** The network log to the clipboard; a file where the clipboard is out of reach (refused, or none: plain http, as on a LAN). */
  const copyLog = () => {
    const text = net.log.text();
    const done = (how: string) => (say(how), hud.notice(how));
    (navigator.clipboard?.writeText(text) ?? Promise.reject()).then(
      () => done(msg('menu.logCopied')),
      () => (download(new Blob([text], { type: 'text/plain' }), `roof-network-${stamp(new Date())}.txt`), done(msg('menu.logSaved'))),
    );
  };
  // HOST: a private session of the player's (their name, the dialog's choices), at their PAINT DETAIL; the loading screen while it opens.
  const player = el('label', 'name-row');
  player.append(el('span', '', msg('lobby.yourName')), hostName.input);
  const create = createDialog({
    player,
    create: async (s) => {
      const problem = nameProblem(hostName.input.value);
      if (problem) throw new Error(msg(problem));
      const save = s.file ? new Uint8Array(await s.file.arrayBuffer()) : (ctx.levelPaint() ?? undefined);
      const entry: LobbyEntry = { kind: 'private', name: s.name, limit: s.limit, tools: s.tools, players: [hostName.input.value] };
      picked = { entry, where: list.where ?? { region: SERVER.region, ping: 0 } };
      joining = { ...picked, code: '' };
      loading.show(entry, picked.where);
      hud.openPage('loading');
      net.host(hostName.input.value, PAINT.texelsPerMeter, { name: s.name, limit: s.limit, tools: s.tools }, save);
    },
    cancel: back,
  });
  // Back (and Esc) from here while JOIN or HOST is loading the session cancels it: the pause screen can't offer PLAY before the paint is in.
  hud.addPage('mp', root, choose, () => (net.status.state === 'connecting' && net.leave(), false));
  hud.addPage('create', create, () => hostName.reload(), () => (back(), true));
  hud.addPage('join', dialog.root, () => dialog.open(), () => (back(), true));
  hud.addPage('loading', loading.root, () => {}, () => (cancelJoin(), hud.openPage('mp'), true));
  hud.addPage('queue', queue.root, () => {}, () => (cancelJoin(), hud.openPage('mp'), true));
  addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLInputElement || !root.checkVisibility()) return;
    if (e.code === 'KeyR') void list.refresh();
    else if (e.code === 'KeyH' && SERVER.playerHost) hud.openPage('create');
  });

  /** The state before this one. */
  let was: NetStatus['state'] = 'off';
  // The lost session's dialog: Enter presses its button (save the paint and leave, leave, reload, open the menu); Esc, which opens the menu, just leaves.
  const answerLost = (button: LostButton, accepted: boolean) => {
    if (accepted && button === 'reload') return location.reload();
    if (accepted && button === 'menu') document.exitPointerLock();
    void net.resolveLoss(accepted && button === 'save');
  };
  net.onStatus = (s: NetStatus) => {
    hud.setSession(s.state === 'in' || s.state === 'reconnecting' ? s.code : null, s.state === 'in');
    hud.setJoining(s.state === 'connecting' || s.state === 'queued' ? msg('menu.joining') : null);
    const id = s.state === 'failed' ? STATUS[s.reason] : STATUS[s.state];
    const known = s.state === 'queued' ? msg(s.lost ? 'menu.netReconnecting' : 'menu.netQueued', { n: s.position }) : id && msg(id);
    // What was seen (a close code, an HTTP status, tries) goes along, for reports.
    const detail = s.state === 'failed' || s.state === 'reconnecting' ? s.detail : undefined;
    const text = known && detail ? `${known} (${detail})` : known;
    say(text ?? '', s.state === 'failed' ? id : undefined);
    // A failed JOIN goes back: to its dialog when the session is full (it may have room soon), else to the list, which is asked again.
    if (s.state === 'failed' && !s.code && joining) {
      const back = joining;
      if (s.reason === 'full') dialog.ask({ ...back, error: text });
      else (hud.openPage('mp'), say(text ?? '', id));
    }
    // The line is its own screen; the welcome from it goes on to the loading screen.
    if (s.state === 'queued' && joining) {
      if (was !== 'queued') (queue.show(joining), hud.openPage('queue'));
      queue.update(s);
    } else if (s.state === 'connecting' && was === 'queued' && joining) (loading.show(joining.entry, joining.where), hud.openPage('loading'));
    if (s.state !== 'connecting' && s.state !== 'queued') joining = null;
    // In play the link's loss is a status, as long as it lasts; a session lost mid-play is a dialog in its place (the menu's line above says either with the page open). A failed JOIN or HOST stays on the page.
    if (s.state === 'reconnecting') notify.set({ key: 'net', kind: 'status', icon: 'cycle', text: msg('status.reconnecting', { n: s.tries }) });
    else if (s.state === 'failed' && s.code) {
      const { dialog, button } = lostDialog(s.reason, s.detail);
      notify.set({ key: 'net', kind: 'dialog', dialog, answer: (accepted) => answerLost(button, accepted) });
    } else if (s.state === 'in' && was === 'reconnecting') notify.succeed('net', msg('status.reconnected'));
    else notify.clear('net');
    was = s.state;
    if (text) hud.notice(text, s.state === 'connecting' || s.state === 'reconnecting' || s.state === 'queued' ? Infinity : undefined);
    else if (s.state === 'in') hud.notice(msg('menu.session', { code: s.code }), 0);
  };
  // Only the link-up, in-session check tells null: a link that went down resets the health silently, so null here is the trouble going away by itself.
  net.onHealth = (h) => (h ? notify.set({ key: 'net', kind: 'status', icon: h.id === 'noSignal' ? 'ring' : 'bars', text: msg(`status.${h.id}`) }) : notify.succeed('net', msg('status.reconnected')));
  net.onEnd = () => hud.toTitle();
  net.onPlayer = (who, joined) => notify.toast(msg(joined ? 'toast.joined' : 'toast.left', { user: who.replaceAll('*', '') }));
  hud.onLeave = () => net.leave();
  hud.sessionInfo = () => ({ ping: net.ping, players: net.players.map((p) => ({ name: p.name, color: p.color && COLORS[p.color] })) });
  // Each step of HOST, JOIN or SAVE as it goes, with how far along an upload or download is.
  net.onProgress = (text) => {
    if (text) (say(text), hud.notice(text, Infinity), net.status.state === 'connecting' && hud.setJoining(short(text)));
    else hud.notice('', 0);
    if (joining) loading.update(text);
  };
  return net;
}

/** PLAY's short form of a progress line while joining: 'Loading 40%', or 'Joining…' before there's a share. */
function short(progress: string) {
  const share = /\d+%$/.exec(progress);
  return share ? msg('menu.progressShort', { percent: share[0] }) : msg('menu.joining');
}
