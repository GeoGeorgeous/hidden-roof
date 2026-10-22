// A hint's text at display time. Rebinding or the keyboard layout arriving changes the key names, so lines
// keep `{action}` until they're drawn.

import type { Action } from '../input.ts';

/** `Press {use} to draw` as `Press **LMB** to draw`: each placeholder becomes the action's key name, in bold. */
export function resolveLine(line: string, label: (action: Action) => string) {
  return line.replace(/\{(\w+)\}/g, (_, action: string) => `**${label(action as Action)}**`);
}
