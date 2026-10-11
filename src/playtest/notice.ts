// The playtest build's notice (docs/playtest.md): on a device's first launch,
// what this build records and where it goes, with an optional "Using a VPN?".
// It also keeps the device's id: a random one made on first launch, which the
// report keys players on (a name isn't a person: docs/playtest.md, Who's who).

const KEY = 'roofhiddenhaus.playtest';

interface Stored {
  device: string;
  seen: boolean;
  vpn: boolean | null;
}

const id = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).slice(0, 13);

function load(): Stored {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stored | null;
    if (s?.device) return s;
  } catch {
    // No storage: a new device every load, and the notice every time.
  }
  return { device: id(), seen: false, vpn: null };
}

const stored = load();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // No storage.
  }
}
save();

/** Who this is, as far as the playtest can tell: the device (kept), this page load, and whether they said they're on a VPN. */
export const identity = { device: stored.device, load: id(), get vpn() {
  return stored.vpn;
} };

const TEXT = `
<h2>PLAYTEST BUILD</h2>
<p>This is the public playtest build of Hidden Roof. To find what makes the game slow or laggy with many players, it records how it runs <b>while you're in a multiplayer session</b>, and sends that to the game's server every few seconds:</p>
<ul>
<li>frame rate and frame times, and what took the time</li>
<li>GPU time, draw calls, paint and texture memory, spray particles</li>
<li>ping, network traffic, delays and drops of the link, how smooth other players look</li>
<li>your device: browser, GPU name, screen size, CPU cores, memory, and the game's settings</li>
<li>errors the game hits, and the name you play under</li>
</ul>
<p>Not recorded: your IP address in the clear (only a scrambled form, to tell two players on one network apart), anything you type but your name, anything outside the game. Single player sends nothing.</p>
<p>Only the developer sees it, to make the game run better. It's deleted after the playtest.</p>
<label><input type="checkbox" class="vpn"> I'm playing through a VPN</label>
<button class="ok">OK</button>`;

/** Shown once per device (every load without storage); `onClose` when it's gone. */
export function showNotice(onClose: () => void = () => {}) {
  // Automated browsers (the tests, `npm run shots`) don't see it: it would sit over the menus they press.
  if (stored.seen || navigator.webdriver) return onClose();
  const el = document.createElement('div');
  el.className = 'overlay playtest-notice';
  el.innerHTML = `<div class="playtest-sheet">${TEXT}</div>`;
  const vpn = el.querySelector<HTMLInputElement>('.vpn')!;
  el.querySelector('.ok')!.addEventListener('click', (e) => {
    e.stopPropagation();
    stored.seen = true;
    stored.vpn = vpn.checked;
    save();
    el.remove();
    onClose();
  });
  // Clicks here don't reach the game (which would take the pointer).
  el.addEventListener('mousedown', (e) => e.stopPropagation());
  document.body.appendChild(el);
}
