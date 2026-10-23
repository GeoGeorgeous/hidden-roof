import { dialogueOf, MESSAGES, msg, msgLines, type DialogueId } from '../messages';
import type { Dialogue, Notify } from '../notify';

// F3 → Test → Messages: shows every in-game message on demand, through notify with the texts of
// messages.ts and no fake network state. The hint is set under a key of its own and above the
// tutorial's ranks, so the tutorial's hint waits and comes back when it is cleared.

const HINTS = Object.keys(MESSAGES.hint);
/** What a toast can be about: a pickup's name, a player's. */
const ITEMS = ['Marker', 'Red paint', 'Fat cap', 'Stepladder', 'Roller', 'Sponge'];
const NAMES = ['Geo', 'Mika', 'Dax', 'Noor', 'Yuki', 'Sasha', 'Tomás', 'Wren'];

export type MessageAction = 'hintRandom' | 'hintClear' | 'reconnecting' | 'reconnected' | 'noSignal' | 'badConnection' | 'chipClear' | 'joined' | 'joinedRandom' | 'left' | 'pickup' | `dialogue:${DialogueId}`;

/** What the client error shows as its callout here: a made-up stack, so the card can be seen without the game crashing. */
const FAKE_STACK = 'TypeError: Cannot read properties of undefined (reading \'position\')\n    at Player.update (player.ts:212:18)\n    at step (main.ts:301:9)\n    at guarded (frame-guard.ts:14:5)';
const FAKE_NETWORK = '[Network] Failed to load resource: net::ERR_CONNECTION_REFUSED';

const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];

export class MessageTools {
  /** The hint shown, an index of HINTS, or -1. */
  hint = -1;
  private attempt = 0;

  constructor(private notify: Notify) {}

  showHint(i: number) {
    this.hint = i;
    this.notify.set({ key: 'dev:hint', kind: 'advice', rank: 100, lines: msgLines(`hint.${HINTS[i]}` as `hint.${keyof typeof MESSAGES.hint}`) });
  }

  run(action: MessageAction) {
    const n = this.notify;
    switch (action) {
      case 'hintRandom':
        return this.showHint(Math.floor(Math.random() * HINTS.length));
      case 'hintClear':
        this.hint = -1;
        return n.clear('dev:hint');
      case 'reconnecting':
        return n.set({ key: 'net', kind: 'status', icon: 'cycle', lines: [msg('chip.reconnecting', { n: ++this.attempt })] });
      case 'reconnected':
        n.set({ key: 'net', kind: 'status', icon: 'cycle', lines: [msg('chip.reconnecting', { n: ++this.attempt })] });
        return n.succeed('net', msg('chip.reconnected'));
      case 'noSignal':
        return n.set({ key: 'net', kind: 'status', icon: 'ring', lines: [msg('chip.noSignal')] });
      case 'badConnection':
        return n.set({ key: 'net', kind: 'status', icon: 'bars', lines: [msg('chip.badConnection')] });
      case 'chipClear':
        this.attempt = 0;
        return n.clear('net');
      case 'joined':
        return n.event(msg('toast.joined', { user: 'Geo' }));
      case 'joinedRandom':
        return n.event(msg('toast.joined', { user: pick(NAMES) }));
      case 'left':
        return n.event(msg('toast.left', { user: pick(NAMES) }));
      case 'pickup':
        return n.event(msg('toast.pickedUp', { item: pick(ITEMS) }));
      default: {
        // Its own key: net-menu answers only the key 'net' (the real lost session), so a button here just closes the card: no download, no reload, no restore.
        const id = action.slice('dialogue:'.length) as DialogueId;
        const dialogue: Dialogue = dialogueOf(id, { minutes: 3 });
        if (id === 'clientError') dialogue.callout = FAKE_STACK;
        if (id === 'networkError') dialogue.callout = FAKE_NETWORK;
        // As in play: out of the reconnecting chip, when one shows.
        if (id === 'serverLost') dialogue.grow = 'net';
        return n.set({ key: 'test.dialogue', kind: 'error', dialogue });
      }
    }
  }
}
