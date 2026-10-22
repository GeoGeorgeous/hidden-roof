import { SERVER } from '../config';
import { dialogueOf, type DialogueId } from '../messages';
import type { Dialogue } from '../notify';
import type { Failure } from './multiplayer';

// The dialogue for a session the player was in and lost: which message by why it failed, and what its button does
// (Esc always leaves without it: net-menu.ts). The texts are messages.ts's.

/** What the button does: save the session's paint to a file and leave, leave, reload the page, or open the menu and leave. */
export type LostButton = 'save' | 'leave' | 'reload' | 'menu';

const LOST: Partial<Record<Failure, { id: DialogueId; button: LostButton }>> = {
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
export function lostDialogue(reason: Failure, detail?: string): { dialogue: Dialogue; button: LostButton } {
  const { id, button } = LOST[reason] ?? LOST.ended!;
  const dialogue: Dialogue = { ...dialogueOf(id, { minutes: Math.round(SERVER.rejoinWindow / 60) }) };
  if (id === 'networkError') dialogue.callout = detail;
  // Only this one comes from the reconnecting chip.
  if (id === 'serverLost') dialogue.grow = true;
  return { dialogue, button };
}
