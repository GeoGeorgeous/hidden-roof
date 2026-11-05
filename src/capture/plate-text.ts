import { type Action, keyName, label } from '../input';
import { msg } from '../messages';

// How capture mode's plates write things: the player build's (overlay.ts) and
// the dev tools' (dev/capture-plate.ts). `**` marks what's in bold.

export const b = (s: string | number) => `**${s}**`;
export const key = (code: string) => b(keyName(code));
/** An action's key as bound (Settings → Controls). */
export const bound = (action: Action) => b(label(action));
const gcd = (a: number, c: number): number => (c ? gcd(c, a % c) : a);
const ratio = ([w, h]: readonly [number, number]) => `${w / gcd(w, h)}:${h / gcd(w, h)}`;
/** The frame drawn. */
export const frameName = (size: readonly [number, number] | null) => (size ? `${ratio(size)} ${size[0]}×${size[1]}` : msg('capture.window'));
