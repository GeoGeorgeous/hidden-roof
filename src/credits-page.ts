import { div } from './menu-ui';
import { pageHead } from './settings-page';

// The Credits page of the ESC menu: who made the game, what inspired it, and
// the fonts and code it ships with, each with its license (public/licenses).

const TEAM = [
  ['Idea & development', 'GeoGeorgeous & Claude'],
  ['Testing', 'alszlo\nsinglemate\nivansuper\nmaria_mimi_ch\nlx\nmoskosmash\nchocoboi\nJennifer Aster'],
];

/** A credit: its name, what it is or does here, and a link (its page, or its license's text). */
type Entry = [name: string, about: string, link: string, href: string];
const license = (file: string) => `${import.meta.env.BASE_URL}licenses/${file}.txt`;

const SECTIONS: [title: string, entries: Entry[]][] = [
  [
    'inspired by',
    [
      ['Bombing!!: A Graffiti Sandbox & Bombing!! 2', 'The paint sandbox', 'Steam ↗', 'https://store.steampowered.com/app/1527520/'],
      ['Marc Eckō’s Getting Up: Contents Under Pressure', 'Rooftops and tags', 'Steam ↗', 'https://store.steampowered.com/app/260190/'],
      ['Daisuke Tajima — Beyond the Lines', 'The pen-and-ink city look', 'Book ↗', 'https://www.seigensha.com/books/978-4-86152-902-3/'],
    ],
  ],
  [
    'fonts',
    [
      ['Sedgwick Ave Display', 'Kevin Burke & Mirko Velimirovic · titles', 'SIL OFL 1.1', license('sedgwick-ave-display')],
      ['Archivo', 'Omnibus-Type · menus and text', 'SIL OFL 1.1', license('archivo')],
      ['Noto Sans JP', 'Google & Adobe · neon signs', 'SIL OFL 1.1', license('noto-sans-jp')],
      ['Permanent Marker', 'Font Diner · build-mode hints', 'Apache 2.0', license('permanent-marker')],
      ['Bangers', 'Vernon Adams · build-mode hints', 'SIL OFL 1.1', license('bangers')],
      ['Inter', 'Rasmus Andersson · signs', 'SIL OFL 1.1', license('inter')],
    ],
  ],
  [
    'open source',
    [
      ['three.js', '3D rendering', 'MIT', license('three.js')],
      ['ws', 'WebSocket server for multiplayer', 'MIT', license('ws')],
    ],
  ],
];

export function creditsPage() {
  const rows = div('rows credits');
  const team = div('team');
  for (const [role, names] of TEAM) {
    const line = div('team-line');
    line.append(Object.assign(document.createElement('span'), { textContent: role }), Object.assign(document.createElement('b'), { textContent: names }));
    team.append(line);
  }
  rows.append(team);
  for (const [title, entries] of SECTIONS) {
    rows.append(div('credits-title', title));
    for (const [name, about, link, href] of entries) {
      const el = div('credit');
      const text = div('text');
      text.append(Object.assign(document.createElement('b'), { textContent: name }), Object.assign(document.createElement('span'), { textContent: about }));
      el.append(text, Object.assign(document.createElement('a'), { textContent: link, href, target: '_blank', rel: 'noopener' }));
      rows.append(el);
    }
  }
  const end = div('credits-end');
  end.append('Geometry, textures and sounds are all made in code.', document.createElement('br'), 'Full license texts ship with the game.');
  rows.append(end);
  const root = div('page credits-page');
  root.append(pageHead('credits'), rows);
  return root;
}
