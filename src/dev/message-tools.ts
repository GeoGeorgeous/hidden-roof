import { MESSAGES, msg, msgLines } from '../messages';
import type { Notify } from '../notify';

// F3 → Test → Messages: shows every in-game message on demand, through notify with the texts of
// messages.ts and no fake network state. The hint is set under a key of its own and above the
// tutorial's ranks, so the tutorial's hint waits and comes back when it is cleared.

const HINTS = Object.keys(MESSAGES.hint);
/** What a toast can be about: a pickup's name, a player's. */
const ITEMS = ['Marker', 'Red paint', 'Fat cap', 'Stepladder', 'Roller', 'Sponge'];
const NAMES = ['Geo', 'Mika', 'Dax', 'Noor', 'Yuki', 'Sasha', 'Tomás', 'Wren'];

export type MessageAction = 'hintRandom' | 'hintClear' | 'reconnecting' | 'noSignal' | 'badConnection' | 'chipClear' | 'joined' | 'joinedRandom' | 'left' | 'pickup' | 'dialogue';

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
        return n.set({ key: 'net', kind: 'status', spin: true, lines: [msg('chip.reconnecting', { n: ++this.attempt })] });
      case 'noSignal':
      case 'badConnection':
        return n.set({ key: 'net', kind: 'status', lines: [msg(`chip.${action}`)] });
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
      case 'dialogue':
        return n.set({ key: 'net', kind: 'error', lines: [msg('dialogue.sessionLost')] });
    }
  }
}
