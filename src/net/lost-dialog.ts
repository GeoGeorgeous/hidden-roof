import { SERVER } from '../config';
import { dialogOf, type DialogId } from '../messages';
import type { Dialog } from '../notify';
import type { Failure } from './multiplayer';

// The dialog for a session the player was in and lost: which message by why it failed, and what its button does
// (Esc always leaves without it: net-menu.ts). The texts are messages.ts's.

/** What the button does: save the session's paint to a file and leave, leave, reload the page, or open the menu and leave. */
export type LostButton = 'save' | 'leave' | 'reload' | 'menu';

const LOST: Partial<Record<Failure, { id: DialogId; button: LostButton }>> = {
  expired: { id: 'serverLost', button: 'save' },
  ended: { id: 'sessionEnded', button: 'save' },
  replaced: { id: 'openedElsewhere', button: 'leave' },
  version: { id: 'updated', button: 'reload' },
  full: { id: 'sessionFull', button: 'save' },
  busy: { id: 'serverBusy', button: 'save' },
  'too-many': { id: 'serverBusy', button: 'save' },
  broken: { id: 'networkError', button: 'menu' },
};

/** The card for a session lost because of `reason` (`detail`: what was seen, shown for a network error); any other reason is a session that ended. */
export function lostDialog(reason: Failure, detail?: string): { dialog: Dialog; button: LostButton } {
  const { id, button } = LOST[reason] ?? LOST.ended!;
  const dialog: Dialog = { ...dialogOf(id, { minutes: Math.round(SERVER.rejoinWindow / 60) }) };
  if (id === 'networkError') dialog.callout = detail;
  // Only this one comes from the reconnecting status.
  if (id === 'serverLost') dialog.grow = 'net';
  return { dialog, button };
}
