import { msg, msgLines } from '../messages';
import { PRIVACY, TERMS } from '../links';
import { action, div, el, notice, popup } from '../menu-ui';
import { store, stored } from '../stored';
import { codeBoxes } from './code-boxes';
import { lookupCode } from './lobby-list';
import { ruleItem, sentenceWith, sessionLine, toolsRow, type Where } from './lobby-view';
import { nameField, nameProblem } from './name-field';
import { CODE_LENGTH, type LobbyEntry } from './protocol';

// The dialog for joining a session, over the Multiplayer page (style.css, .join-popup). A public session takes two
// steps of one size (both laid in the same cell, the other one hidden): its line, the tools it allows and the player's
// name, large; then its house rules and what joining means (the Terms and Privacy), where the player can ask not to be
// shown them again, which skips only this step. A private one asks
// for its code, five boxes, and shows the session once the code finds one, then the name and what joining means.
// Esc goes back a step, CANCEL back to the list (net-menu.ts).

const RULES_KEY = 'roofhiddenhaus.rulesSeen';
/** The player asked not to see the house rules again. */
const rulesSeen = () => stored(RULES_KEY) === '1';

export interface JoinHooks {
  /** The dialog is wanted on screen (its page opens and calls `open`). */
  show(): void;
  /** JOIN for this session, with the name and the code to ask for. */
  join(name: string, code: string, session: LobbyEntry): void;
  /** CANCEL: back to the list. */
  cancel(): void;
}

/** What the dialog is asked for: the row picked, where the server is, and, coming back from a failed join, the code typed and why it failed. */
interface Ask {
  entry: LobbyEntry;
  where: Where;
  code?: string;
  error?: string;
}

export class JoinDialog {
  readonly root: HTMLElement;
  private head: HTMLElement;
  private body: HTMLElement;
  private buttons: HTMLElement;
  private name = nameField(msg('lobby.yourName'));
  private join = action(msg('lobby.join'), () => this.submit(), { primary: true });
  private next = action(msg('lobby.next'), () => this.submit(), { primary: true });
  private cancel = action(msg('lobby.cancel'), () => this.on.cancel(), { key: 'ESC' });
  private previous = action(msg('lobby.back'), () => void this.back(), { key: 'ESC' });
  private dontShow = Object.assign(el('input'), { type: 'checkbox' });
  private boxes = codeBoxes((code) => void this.lookup(code));
  private message = div('join-message');
  /** The private session's line and tools, filled once its code finds one. */
  private found = div('found');
  private tools = div('tools-slot');
  private asked: Ask | null = null;
  /** A public session's step: the name (1), or the house rules (2). */
  private step: 1 | 2 = 1;
  /** The session the code in the boxes found. */
  private session: LobbyEntry | null = null;
  /** Counts the codes looked up, so an answer that is not for the last one is dropped. */
  private lookups = 0;

  constructor(private on: JoinHooks) {
    const p = popup('');
    ({ root: this.root, head: this.head, body: this.body, buttons: this.buttons } = p);
    this.root.classList.add('join-popup');
  }

  /** Asks the player: the page opens (hooks.show) and shows the dialog. */
  ask(ask: Ask) {
    this.asked = ask;
    this.on.show();
  }

  /** The page is open: fill it for the session asked about. */
  open() {
    const { entry, code, error } = this.asked!;
    const isPublic = entry.kind === 'public';
    this.name.reload();
    this.session = null;
    this.found.replaceChildren();
    this.tools.replaceChildren(toolsRow(entry.tools));
    this.lookups++;
    if (isPublic) {
      this.step = 1;
      this.show();
    } else {
      this.head.textContent = msg('lobby.privateTitle');
      this.body.replaceChildren(div('lead', msg('lobby.privateLead', { length: CODE_LENGTH })), this.boxes.el, this.found, this.nameRow(), this.tools, this.consent(false), this.message);
      this.buttons.replaceChildren(this.cancel, this.join);
      this.boxes.set(code ?? '');
    }
    this.fail(error);
    this.sync();
    if (!isPublic && !code) this.boxes.focus();
    else if (!this.name.input.value) this.name.input.focus();
  }

  /** A public session's step on screen: its line, the tools and the name, or the house rules and the consent; the other one under it, hidden, so both take the size of the larger. */
  private show() {
    const { entry, where } = this.asked!;
    const first = this.step === 1;
    this.head.textContent = msg(first ? 'lobby.publicNameTitle' : 'lobby.publicTitle');
    this.fail();
    const line = () => {
      const found = div('found');
      found.append(sessionLine(entry, where));
      return found;
    };
    const name = el('label', 'name-big');
    name.append(el('span', 'field-label', msg('lobby.yourName')), this.name.input);
    const steps = [div('step'), div('step')];
    steps[0].append(div('lead', msg('lobby.publicLead')), line(), this.tools, name);
    steps[1].append(line(), rules(), this.consent(true));
    steps[first ? 1 : 0].inert = true;
    const stack = div('steps');
    stack.append(...steps);
    this.body.replaceChildren(stack, this.message);
    if (first) {
      // The rules seen once are not shown again: JOIN comes straight from the name.
      this.buttons.replaceChildren(this.cancel, rulesSeen() ? this.join : this.next);
      return;
    }
    this.dontShow.checked = false;
    const label = el('label', 'link check');
    label.append(this.dontShow, msg('lobby.dontShow'));
    this.buttons.replaceChildren(label, this.previous, this.join);
  }

  /** Esc: from the house rules back to the name; false when there is no step to go back to (the dialog closes). */
  back() {
    if (this.asked?.entry.kind !== 'public' || this.step === 1) return false;
    this.step = 1;
    this.show();
    return true;
  }

  private nameRow() {
    const row = el('label', 'name-row');
    row.append(el('span', '', msg('lobby.yourName')), this.name.input);
    return row;
  }

  /** What joining means: the rules too, for a public session, with the note on bans. */
  private consent(isPublic: boolean) {
    const terms = link(TERMS, msg('lobby.terms'));
    const privacy = link(PRIVACY, msg('lobby.privacy'));
    const consent = div('consent');
    consent.append(isPublic ? sentenceWith(msg('lobby.consentPublic'), { rules: el('b', '', msg('lobby.rules')), terms, privacy }) : sentenceWith(msg('lobby.consentPrivate'), { terms, privacy }));
    if (isPublic) consent.append(div('ban-note', msg('lobby.banNote')));
    return consent;
  }

  /** Shows what went wrong (a name that won't do, a join that came back failed) in a notice, or clears it. */
  private fail(text?: string) {
    this.message.replaceChildren(...(text ? [notice(text, { error: true })] : []));
  }

  /** The code in the boxes changed: with all its letters, ask the server which session it is. */
  private async lookup(code: string) {
    const run = ++this.lookups;
    this.session = null;
    this.fail();
    this.found.replaceChildren();
    this.sync();
    if (code.length < CODE_LENGTH) return;
    const answer = await lookupCode(code);
    if (run !== this.lookups) return;
    // No session is the answer to the code; a server that can't answer is a failure.
    if ('why' in answer) this.found.replaceChildren(notice(msg(answer.why), { error: true }));
    else if (!answer.value) this.found.replaceChildren(div('none', msg('lobby.noSession')));
    else {
      this.session = answer.value;
      this.found.replaceChildren(sessionLine(answer.value, { region: this.asked!.where.region, ping: answer.ping }));
      this.tools.replaceChildren(toolsRow(answer.value.tools));
    }
    this.sync();
  }

  /** JOIN is for a private session only once its code found one. */
  private sync() {
    this.join.disabled = this.asked!.entry.kind === 'private' && !this.session;
  }

  private submit() {
    const { entry } = this.asked!;
    const name = this.name.input.value;
    const problem = nameProblem(name);
    if (problem) {
      this.fail(msg(problem));
      return this.name.input.focus();
    }
    if (entry.kind === 'public') {
      if (this.step === 1 && !rulesSeen()) {
        this.step = 2;
        return this.show();
      }
      if (this.dontShow.checked) store(RULES_KEY, '1');
      return this.on.join(name, entry.code ?? '', entry);
    }
    if (this.session) this.on.join(name, this.boxes.code, this.session);
  }
}

/** The Terms or the Privacy page, in a new tab: the paint stays. */
function link(href: string, text: string) {
  return Object.assign(el('a', '', text), { href, target: '_blank', rel: 'noopener' });
}

/** The house rules: what to do, and what not. */
function rules() {
  const grid = div('rules');
  for (const [allowed, label, items] of [[true, 'lobby.do', 'lobby.doItems'], [false, 'lobby.dont', 'lobby.dontItems']] as const) {
    const col = div('rules-col');
    col.append(el('span', 'field-label', msg(label)), ...msgLines(items).map((text) => ruleItem(text, allowed)));
    grid.append(col);
  }
  return grid;
}
