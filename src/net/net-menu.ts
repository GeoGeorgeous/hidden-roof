import { COLORS, PAINT, PAINT_DETAIL, SERVER } from '../config';
import { SLOTS } from '../inventory/tool';
import { download, pickFile, stamp } from '../files';
import type { PauseMenu } from '../pause-menu';
import { msg, type MessageId } from '../messages';
import type { Notify } from '../notify';
import { savePaint } from '../save/save-paint';
import { cycle, paintDetailName } from '../settings';
import { action, button, choice, div, pageHead, relabel, sentence, settingRow } from '../menu-ui';
import type { MultiplayerContext } from './game-context';
import { JoinDialog, rulesSeen } from './join-dialog';
import { LobbyPage } from './lobby-page';
import { shellButton, type Where } from './lobby-view';
import { LoadingPage } from './loading-page';
import { lostDialog, type LostButton } from './lost-dialog';
import { nameField, nameProblem, storedName } from './name-field';
import type { LobbyEntry } from './protocol';
import { Multiplayer, type Failure, type NetStatus } from './multiplayer';

// The Multiplayer page of the ESC menu: the server's list of sessions (lobby-page.ts), the link's state under it.
// A row opens the dialog for joining it (join-dialog.ts), and JOIN shows the screen while it loads
// (loading-page.ts); a public session whose rules the player has seen skips the dialog. HOST, when players may
// (SERVER.playerHost), is a form: a name, the session's PAINT DETAIL, the paint to start from: the level's own
// (save/level-paint.ts, none for most levels), this level's as it is, or a paint file. In a session the pause
// screen shows its live line (code, ping, players) and offers SAVE (the session's paint) and LEAVE SESSION.
// Returns the game's Multiplayer.

type Start = 'fresh' | 'mine' | 'file';
const STARTS: Start[] = ['fresh', 'mine', 'file'];
const START_LABEL: Record<Start, string> = { fresh: 'Fresh level', mine: 'This paint', file: 'A paint file' };
const DETAILS = Object.entries(PAINT_DETAIL) as [keyof typeof PAINT_DETAIL, number][];

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

export function multiplayerMenu(hud: PauseMenu, notify: Notify, ctx: MultiplayerContext, levelName: () => string) {
  const net = new Multiplayer(ctx);
  const sub = div('page-sub');
  const rows = div('rows');
  const status = div('mp-status');
  // The network log, for a report: offered once the link failed.
  const log = button('Copy network log', () => copyLog(), 'net-log');
  const foot = div('mp-foot');
  foot.append(status, log);
  const hostButton = shellButton(msg('lobby.host'), SERVER.playerHost ? () => host() : null, { icon: 'broadcast', key: 'H', title: SERVER.playerHost ? undefined : msg('lobby.hostUnavailable') });
  hostButton.classList.add('host-button');
  const root = div('page mp-page');
  // The link's state is there before the page was ever opened (a session hosted by the page, a link lost).
  rows.append(foot);
  root.append(pageHead(msg('lobby.title'), sub), hostButton, rows);

  const hostName = nameField(msg('lobby.yourName'));
  let detail = 0;
  let start: Start = 'fresh';
  /** The HOST form is open (Back goes to the list). */
  let inForm = false;
  /** The session being joined (a row of the list, where the server is, the code asked for) from JOIN until the player is in or it failed. */
  let joining: { entry: LobbyEntry; where: Where; code: string } | null = null;
  /** The row picked, while its dialog is open. */
  let picked: { entry: LobbyEntry; where: Where } | null = null;

  /** An error in red, progress (…) dimmer; after the link `failed`, COPY NETWORK LOG under it. */
  const say = (text: string, error = false, failed = false) => {
    status.textContent = text;
    status.classList.toggle('error', error);
    log.hidden = !failed;
  };
  const named = () => {
    const problem = nameProblem(hostName.input.value);
    if (problem) say(msg(problem), true);
    return problem ? null : hostName.input.value;
  };
  const show = (title: string, ...els: HTMLElement[]) => {
    sub.textContent = title;
    inForm = !!title;
    hostButton.hidden = inForm;
    rows.classList.toggle('lobby', !inForm);
    rows.replaceChildren(...els, foot);
    say('');
  };
  const list = new LobbyPage((entry, where) => {
    picked = { entry, where };
    // A public session's rules, once seen, are not asked again; a name is still needed.
    if (entry.kind === 'public' && rulesSeen() && !nameProblem(storedName())) join(storedName(), entry.code ?? '', entry);
    else dialog.ask({ entry, where });
  });
  const choose = () => {
    show('', list.el);
    void list.refresh();
  };
  /** From JOIN to the player being in: the loading screen, and the dialog or the list back if it fails. */
  const join = (who: string, code: string, entry: LobbyEntry) => {
    joining = { ...picked!, code };
    say('');
    loading.show(entry, joining.where);
    hud.openPage('loading');
    net.join(who, code);
  };
  const dialog = new JoinDialog({ show: () => hud.openPage('join'), join, cancel: () => hud.openPage('mp') });
  const loading = new LoadingPage(() => (cancelJoin(), hud.openPage('mp')));
  const cancelJoin = () => {
    joining = null;
    void net.leave();
  };
  /** NAME, with what it is for. */
  const nameRow = (more = '') => settingRow('Name', hostName.input, { desc: `Your name as a player: everyone in the session sees it over you.${more}` });
  /** The network log to the clipboard; a file where the clipboard is out of reach (refused, or none: plain http, as on a LAN). */
  const copyLog = () => {
    const text = net.log.text();
    const done = (how: string) => (say(how), hud.notice(how));
    (navigator.clipboard?.writeText(text) ?? Promise.reject()).then(
      () => done(msg('menu.logCopied')),
      () => (download(new Blob([text], { type: 'text/plain' }), `roof-network-${stamp(new Date())}.txt`), done(msg('menu.logSaved'))),
    );
  };
  const host = () => {
    detail = PAINT.texelsPerMeter;
    const detailRow = settingRow('Paint detail', choice(() => paintDetailName(DETAILS.find(([, t]) => t === detail)![0]), (d) => (detail = cycle(DETAILS.map(([, t]) => t), detail, d))).el, { desc: 'Everyone in the session paints at this detail.' });
    const startRow = settingRow('Start with', choice(() => START_LABEL[start], (d) => (start = cycle(STARTS, start, d))).el, { desc: "The paint level as it comes (its hints, if it has any), this level's paint as it is now, or a saved paint file." });
    const go = action('Host', async () => {
      const who = named();
      if (!who) return;
      try {
        if (start === 'mine') relabel(go, 'Packing paint…');
        const save = start === 'mine' ? await savePaint(ctx.paint, { name: levelName() }) : start === 'file' ? new Uint8Array(await (await pickFile('.rhhpaint')).arrayBuffer()) : (ctx.levelPaint() ?? undefined);
        net.host(who, detail, { name: who, limit: SERVER.players.private, tools: [...SLOTS] }, save);
      } catch (e) {
        say(sentence((e as Error).message), true);
      } finally {
        relabel(go, 'Host');
      }
    }, { primary: true });
    hostName.reload();
    show('Host a session', nameRow(' Not the name of the session.'), detailRow, startRow, submit(go));
  };
  // Back (and Esc) from here while JOIN or HOST is loading the session cancels it: the pause screen can't offer PLAY before the paint is in.
  hud.addPage('mp', root, choose, () => (net.status.state === 'connecting' && net.leave(), inForm && (choose(), true)));
  hud.addPage('join', dialog.root, () => dialog.open(), () => (hud.openPage('mp'), true));
  hud.addPage('loading', loading.root, () => {}, () => (cancelJoin(), hud.openPage('mp'), true));
  addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLInputElement || !root.checkVisibility() || inForm) return;
    if (e.code === 'KeyR') void list.refresh();
    else if (e.code === 'KeyH' && SERVER.playerHost) host();
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
    hud.setJoining(s.state === 'connecting' ? msg('menu.joining') : null);
    const id = s.state === 'failed' ? STATUS[s.reason] : STATUS[s.state];
    const known = id && msg(id);
    // What was seen (a close code, an HTTP status, tries) goes along, for reports.
    const detail = s.state === 'failed' || s.state === 'reconnecting' ? s.detail : undefined;
    const text = known && detail ? `${known} (${detail})` : known;
    say(text ?? '', s.state === 'failed', s.state === 'failed');
    // A failed JOIN goes back: to its dialog when the session is full (it may have room soon), else to the list, which is asked again.
    if (s.state === 'failed' && !s.code && joining) {
      const back = joining;
      if (s.reason === 'full') dialog.ask({ ...back, error: text });
      else (hud.openPage('mp'), say(text ?? '', true, true));
    }
    if (s.state !== 'connecting') joining = null;
    // In play the link's loss is a status, as long as it lasts; a session lost mid-play is a dialog in its place (the menu's line above says either with the page open). A failed JOIN or HOST stays on the page.
    if (s.state === 'reconnecting') notify.set({ key: 'net', kind: 'status', icon: 'cycle', text: msg('status.reconnecting', { n: s.tries }) });
    else if (s.state === 'failed' && s.code) {
      const { dialog, button } = lostDialog(s.reason, s.detail);
      notify.set({ key: 'net', kind: 'dialog', dialog, answer: (accepted) => answerLost(button, accepted) });
    } else if (s.state === 'in' && was === 'reconnecting') notify.succeed('net', msg('status.reconnected'));
    else notify.clear('net');
    was = s.state;
    if (text) hud.notice(text, s.state === 'connecting' || s.state === 'reconnecting' ? Infinity : undefined);
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

/** The form's button, centered under its rows (the status line under it). */
function submit(go: HTMLElement) {
  const box = div('submit');
  box.append(go);
  return box;
}
