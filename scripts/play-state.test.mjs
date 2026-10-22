// Tests of the play state (src/play-state.ts) in Node: when the game stops,
// and what Esc and Enter do playing, on the pause screen, on a page, with F3 open.
// Usage: node scripts/play-state.test.mjs
import assert from 'node:assert/strict';
import { PlayState } from '../src/play-state.ts';

/** A play state over a fake pointer lock, session and menu; `done` lists what the keys did. */
function setup({ locked = false, multiplayer = false, joining = false, page = false } = {}) {
  const input = { locked };
  let dialogue = false;
  const session = { multiplayer, joining };
  const done = [];
  const menu = { page: () => page, release: () => done.push('release'), resume: () => done.push('resume'), back: () => done.push('back'), primary: () => done.push('primary'), dialogue: () => dialogue, confirm: () => ((dialogue = false), done.push('confirm')) };
  const play = new PlayState(input, session, menu);
  const key = (code, down = true, repeat = false) => play.key(code, down, repeat);
  const tap = (code) => [key(code), key(code, false)];
  return { input, session, play, key, tap, done, up: () => (dialogue = true) };
}

// Paused in single player the game stops; in a session it goes on; playing it runs.
for (const [locked, multiplayer, paused, frozen] of [[false, false, true, true], [false, true, true, false], [true, false, false, false], [true, true, false, false]]) {
  const { play } = setup({ locked, multiplayer });
  assert.deepEqual([play.paused, play.frozen], [paused, frozen], `locked ${locked}, multiplayer ${multiplayer}`);
}
{
  const { play, input } = setup();
  assert.equal(play.mode, 'paused');
  input.locked = true;
  assert.equal(play.mode, 'play');
  play.building = true;
  assert.equal(play.mode, 'build');
}

// Playing: Esc frees the mouse (the keyboard lock keeps it from the browser) and is the menu's; Enter is a game key (build mode's).
{
  const { tap, key, done } = setup({ locked: true });
  assert.deepEqual(tap('Escape'), [true, true]);
  key('Escape', true, true);
  assert.deepEqual(done, ['release', 'release']);
  assert.equal(key('Enter'), false);
  assert.equal(key('NumpadEnter'), false);
  assert.equal(key('KeyW'), false);
}

// The pause screen: Esc resumes once released, not on the press; a repeat does nothing; Enter resumes.
{
  const { key, tap, play, done } = setup();
  assert.equal(key('Escape'), true);
  assert.deepEqual(done, []);
  key('Escape', true, true);
  key('Escape', false);
  assert.deepEqual(done, ['resume']);
  // Held to the end: the browser left fullscreen, and the release doesn't resume.
  key('Escape');
  play.disarm();
  key('Escape', false);
  assert.deepEqual(done, ['resume']);
  // A release with no press before it doesn't resume.
  key('Escape', false);
  assert.deepEqual(tap('Enter'), [true, true]);
  key('NumpadEnter', true, true);
  assert.deepEqual(done, ['resume', 'resume']);
}

// Joining or hosting, until the session's paint has loaded (BL-105): nothing resumes (Enter, Esc released, the PLAY button and a
// click on the game, which call resume()), not even an Esc pressed meanwhile and released after; a page's keys go on.
{
  const { key, tap, play, session, done } = setup({ joining: true });
  assert.deepEqual(tap('Enter'), [true, true]);
  assert.deepEqual(tap('Escape'), [true, true]);
  play.resume();
  assert.deepEqual(done, []);
  // Pressed while joining, released once in: no resume behind the player's back.
  key('Escape');
  session.joining = false;
  key('Escape', false);
  assert.deepEqual(done, []);
  play.resume();
  tap('Enter');
  assert.deepEqual(done, ['resume', 'resume']);
}
{
  const { tap, play, done } = setup({ joining: true, page: true });
  play.setPanel(true);
  tap('Escape');
  assert.deepEqual(done, [], 'F3 open: Esc does not resume while joining');
  play.setPanel(false);
  tap('Escape');
  tap('Enter');
  assert.deepEqual(done, ['back', 'primary'], 'on a page, Esc goes back and Enter runs the primary button as ever');
}

// A page (SAVE, SETTINGS): Esc goes back and doesn't resume when released; Enter runs its primary button.
{
  const { tap, done } = setup({ page: true });
  tap('Escape');
  tap('Enter');
  tap('NumpadEnter');
  assert.deepEqual(done, ['back', 'primary', 'primary']);
}

// F3 open: Esc resumes on the press (the panel holds the mouse); Enter is the panel's (a number field), not the menu's.
{
  const { tap, key, play, done } = setup({ page: true });
  let shown = 0;
  play.onPanel = () => shown++;
  play.setPanel(true);
  play.setPanel(true);
  assert.equal(shown, 1);
  tap('Escape');
  assert.deepEqual(done, ['resume']);
  assert.equal(key('Enter'), false);
  play.setPanel(false);
  assert.equal(shown, 2);
}

// A dialogue in play: Enter confirms it (and is no game key); Esc opens the menu and confirms it too. With none, nothing changes.
{
  const { tap, key, up, done } = setup({ locked: true });
  up();
  assert.equal(key('Enter'), true);
  assert.deepEqual(done, ['confirm']);
  assert.equal(key('Enter'), false, 'gone: Enter is a game key again');
  up();
  tap('Escape');
  assert.deepEqual(done, ['confirm', 'release', 'confirm']);
}

// Keys that aren't Esc or Enter are never the menu's.
{
  const { key, done } = setup();
  for (const code of ['KeyK', 'KeyB', 'F3', 'Space']) assert.equal(key(code), false);
  assert.deepEqual(done, []);
}

console.log('play state: ok (when the game stops; Esc and Enter playing, on the pause screen, on a page, with F3 open)');
