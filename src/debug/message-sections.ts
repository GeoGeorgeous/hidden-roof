import { NOTIFY } from '../config';
import { MESSAGES } from '../messages';
import { defaultOf } from './defaults';
import { getValue, r, setValue, type Hooks, type Item, type Section } from './tuning';

// F3 panel contents for the in-game messages (dev/message-tools.ts shows them, NOTIFY is the look).

const HINTS = Object.keys(MESSAGES.hint);
const DIALOGS = Object.keys(MESSAGES.dialog) as (keyof typeof MESSAGES.dialog)[];
const SHADES = ['auto', 'always', 'never'] as const;

/** One press shows one message. */
const act = (h: Hooks, label: string, action: Parameters<Hooks['message']>[0]): Item => ({ kind: 'action', label, run: () => h.message(action) });

export function messageSections(h: Hooks): Section[] {
  const look = (label: string, key: string, min: number, max: number, step: number) => r(label, ['NOTIFY', key], min, max, step, () => h.syncNotify());
  return [
    {
      id: 'messages',
      title: 'Messages',
      items: [
        { kind: 'heading', label: 'HINT' },
        act(h, 'random hint', 'hintRandom'),
        { kind: 'choice', label: 'hint', options: HINTS.map((n) => n.replace(/([A-Z])/g, ' $1').toUpperCase()), get: () => h.messageHintShown(), pick: (i) => h.messageHint(i) },
        act(h, 'clear hint', 'hintClear'),
        {
          kind: 'choice',
          label: 'overlay',
          options: SHADES.map((s) => s.toUpperCase()),
          get: () => SHADES.indexOf(getValue(['NOTIFY', 'shade']) as (typeof SHADES)[number]),
          pick: (i) => (setValue(['NOTIFY', 'shade'], SHADES[i]), h.syncNotify()),
          copy: () => ({ NOTIFY: { shade: NOTIFY.shade } }),
          reset: () => (setValue(['NOTIFY', 'shade'], defaultOf(['NOTIFY', 'shade'])), h.syncNotify()),
        },
        { kind: 'heading', label: 'STATUSES AND TOASTS' },
        act(h, 'reconnecting', 'reconnecting'),
        act(h, 'reconnected', 'reconnected'),
        act(h, 'no signal', 'noSignal'),
        act(h, 'bad connection', 'badConnection'),
        act(h, 'clear status', 'statusClear'),
        act(h, 'toast: Geo joined', 'joined'),
        act(h, 'toast: random joined', 'joinedRandom'),
        act(h, 'toast: left', 'left'),
        act(h, 'toast: pickup', 'pickup'),
        { kind: 'heading', label: 'DIALOG' },
        ...DIALOGS.map((id) => act(h, id.replace(/([A-Z])/g, ' $1').toLowerCase(), `dialog:${id}` as const)),
        { kind: 'heading', label: 'LOOK' },
        look('hint: from bottom', 'hintBottom', 0, 200, 1),
        look('text: size', 'fontSize', 8, 24, 1),
        look('text: line height', 'lineHeight', 10, 32, 1),
        look('box: padding across', 'padX', 0, 24, 1),
        look('box: padding down', 'padY', 0, 16, 1),
        look('box: opacity', 'boxOpacity', 0, 1, 0.01),
        look('overlay: height', 'shadeHeight', 0, 400, 5),
        look('overlay: strength', 'shadeStrength', 0, 1, 0.01),
        look('toast: gap above hint', 'toastGap', 0, 40, 1),
        r('toast: seconds', ['NOTIFY', 'toastSeconds'], 0.5, 8, 0.1),
        look('status: from top', 'statusTop', 0, 200, 1),
      ],
    },
  ];
}
