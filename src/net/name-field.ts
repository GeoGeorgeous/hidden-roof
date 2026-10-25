import type { MessageId } from '../messages';
import { el } from '../menu-ui';
import { store, stored } from '../stored';
import { cleanName, isName, NAME_MAX } from './protocol';

// The player's name for a session, kept between visits: a field in each form that needs it (the join dialogs, HOST),
// all of them the same name. Only Latin letters and digits can be typed in (protocol.ts, isName).

const NAME_KEY = 'roofhiddenhaus.name';

/** The name kept from the last time. */
export const storedName = () => cleanName(stored(NAME_KEY) ?? '');

/** A field for the name: what is typed is cleaned as it goes and kept. `reload` puts the kept name in it (another form may have changed it). */
export function nameField(placeholder: string) {
  const input = Object.assign(el('input'), { type: 'text', maxLength: NAME_MAX, placeholder, spellcheck: false });
  input.addEventListener('input', () => {
    const name = cleanName(input.value);
    if (name !== input.value) input.value = name;
    store(NAME_KEY, name);
  });
  return { input, reload: () => (input.value = storedName()) };
}

/** What is wrong with the name, in words, or null when it's good for the server. */
export const nameProblem = (name: string): MessageId | null => (isName(name) ? null : name ? 'menu.nameLetters' : 'menu.typeName');
