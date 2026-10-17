// Tests of the play state (src/play-state.ts) in Node: when the game stops,
// and what Esc and Enter do playing, on the pause screen, on a page, with F3 open.
// Usage: node scripts/play-state.test.mjs
import assert from 'node:assert/strict';
import { PlayState } from '../src/play-state.ts';

/** A play state over a fake pointer lock, session and menu; `done` lists what the keys did. */
function setup({ locked = false, multiplayer = false, page = false } = {}) {
  const input = { locked };
  const session = { multiplayer };
  const done = [];
  const menu = { page: () => page, release: () => done.push('release'), resume: () => done.push('resume'), back: () => done.push('back'), primary: () => done.push('primary') };
  const play = new PlayState(input, session, menu);
  const key = (code, down = true, repeat = false) => play.key(code, down, repeat);
  const tap = (code) => [key(code), key(code, false)];
  return { input, session, play, key, tap, done };
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

// Keys that aren't Esc or Enter are never the menu's.
{
  const { key, done } = setup();
  for (const code of ['KeyK', 'KeyB', 'F3', 'Space']) assert.equal(key(code), false);
  assert.deepEqual(done, []);
}

console.log('play state: ok (when the game stops; Esc and Enter playing, on the pause screen, on a page, with F3 open)');
