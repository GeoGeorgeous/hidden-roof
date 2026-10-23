import { COLORS, PAINT, PAINT_DETAIL } from '../config';
import { download, pickFile, stamp } from '../files';
import type { PauseMenu } from '../pause-menu';
import { msg, type MessageId } from '../messages';
import type { Notify } from '../notify';
import { savePaint } from '../save/save-paint';
import { store, stored } from '../stored';
import { cycle, paintDetailName } from '../settings';
import { action, button, choice, div, el, pageHead, relabel, sentence, settingRow } from '../menu-ui';
import { cleanName, CODE_LENGTH, CODE_LETTERS, isName, NAME_MAX } from './protocol';
import type { MultiplayerContext } from './game-context';
import { lostDialog, type LostButton } from './lost-dialog';
import { Multiplayer, type Failure, type NetStatus } from './multiplayer';

// The Multiplayer page of the ESC menu: HOST (a name, the session's PAINT
// DETAIL, the paint to start from: the level's own (save/level-paint.ts, none
// for most levels), this level's as it is, or a paint file) or JOIN (a name
// and the code the host shares), the link's state under them. In a session
// the pause screen shows its live line (code, ping, players) and offers SAVE
// (the session's paint) and LEAVE SESSION. Returns the game's Multiplayer.

type Start = 'fresh' | 'mine' | 'file';
const STARTS: Start[] = ['fresh', 'mine', 'file'];
const START_LABEL: Record<Start, string> = { fresh: 'Fresh level', mine: 'This paint', file: 'A paint file' };
const DETAILS = Object.entries(PAINT_DETAIL) as [keyof typeof PAINT_DETAIL, number][];
const NAME_KEY = 'roofhiddenhaus.name';

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
  const root = div('page mp-page');
  root.append(pageHead('multiplayer', sub), rows);

  let name = cleanName(stored(NAME_KEY) ?? '');
  const nameInput = textInput(name, NAME_MAX, 'Your name', (v) => {
    name = cleanName(v);
    if (name !== v) nameInput.value = name;
    store(NAME_KEY, name);
  });
  const codeInput = textInput('', CODE_LENGTH, 'A B C D E', () => (codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '')));
  codeInput.classList.add('code');
  let detail = 0;
  let start: Start = 'fresh';
  /** HOST or JOIN is open (Back goes to the choice between them). */
  let inForm = false;

  /** An error in red, progress (…) dimmer; after the link `failed`, COPY NETWORK LOG under it. */
  const say = (text: string, error = false, failed = false) => {
    status.textContent = text;
    status.classList.toggle('error', error);
    log.hidden = !failed;
  };
  const named = () => {
    if (isName(name)) return name;
    say(msg(name ? 'menu.nameLetters' : 'menu.typeName'), true);
    return null;
  };
  const show = (title: string, ...els: HTMLElement[]) => {
    sub.textContent = title;
    inForm = !!title;
    rows.replaceChildren(...els, foot);
    say('');
  };
  const choose = () => show('', bigRow('Host a session', 'Open your roof and get a code to share.', host), bigRow('Join a session', "Paint on a friend's roof with their code.", join));
  /** NAME, with what it is for. */
  const nameRow = (more = '') => settingRow('Name', nameInput, { desc: `Your name as a player: everyone in the session sees it over you.${more}` });
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
        net.host(who, detail, save);
      } catch (e) {
        say(sentence((e as Error).message), true);
      } finally {
        relabel(go, 'Host');
      }
    }, { primary: true });
    show('Host a session', nameRow(' Not the name of the session.'), detailRow, startRow, submit(go));
  };
  const join = () => {
    const go = action('Join', () => {
      const who = named();
      const code = codeInput.value.toUpperCase();
      if (who && [...code].every((c) => CODE_LETTERS.includes(c)) && code.length === CODE_LENGTH) net.join(who, code);
      else if (who) say(msg('menu.codeLength', { length: CODE_LENGTH }), true);
    }, { primary: true });
    show('Join a session', nameRow(), settingRow('Code', codeInput, { desc: `The ${CODE_LENGTH} letters the host shared.` }), submit(go));
  };
  // Back (and Esc) from here while JOIN or HOST is loading the session cancels it: the pause screen can't offer PLAY before the paint is in.
  hud.addPage('mp', root, choose, () => (net.status.state === 'connecting' && net.leave(), inForm && (choose(), true)));

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
  };
  return net;
}

/** PLAY's short form of a progress line while joining: 'Loading 40%', or 'Joining…' before there's a share. */
function short(progress: string) {
  const share = /\d+%$/.exec(progress);
  return share ? msg('menu.progressShort', { percent: share[0] }) : msg('menu.joining');
}

/** HOST A SESSION / JOIN A SESSION: a big row with what it's for. */
function bigRow(title: string, desc: string, act: () => void) {
  const b = button('', act, 'big-row');
  const text = div('text');
  text.append(el('b', '', title), el('span', '', desc));
  b.append(text, el('i', '', '›'));
  return b;
}

/** The form's button, centered under its rows (the status line under it). */
function submit(go: HTMLElement) {
  const box = div('submit');
  box.append(go);
  return box;
}

function textInput(value: string, max: number, placeholder: string, onInput: (v: string) => void) {
  const input = Object.assign(el('input'), { type: 'text', value, maxLength: max, placeholder, spellcheck: false });
  input.addEventListener('input', () => onInput(input.value));
  return input;
}
