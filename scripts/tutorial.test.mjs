// Tests of the tutorial (src/tutorial) in Node, on a fake clock: which hint shows, when it is learnt,
// what is stored. Usage: node --experimental-transform-types --disable-warning=ExperimentalWarning scripts/tutorial.test.mjs
import assert from 'node:assert/strict';
import { TUTORIAL } from '../src/config.ts';
import { Tutorial } from '../src/tutorial/tutorial.ts';
import { resolveLine } from '../src/notify.ts';

const KEY_NAMES = { use: 'LMB', sizeDown: 'Q', sizeUp: 'E', prev: 'WHEELUP', next: 'WHEELDOWN' };

/** A tutorial over a note board and an in-memory store; `play(seconds)` runs frames of 0.1 s. */
function setup(saved = null) {
  const board = new Map();
  const log = [];
  const notes = {
    set: (n) => (board.set(n.key, n), log.push(`set ${n.key}`)),
    clear: (key) => (board.delete(key), log.push(`clear ${key}`)),
  };
  const disk = { text: saved };
  const storage = { read: () => disk.text, write: (t) => (disk.text = t) };
  const t = new Tutorial(notes, storage);
  const snap = { tool: 'can', tools: ['can'], lowPressure: false, colors: 1, caps: 1, nearLadder: false, onLadder: false };
  let visible = true;
  const play = (seconds) => {
    for (let i = 0; i < Math.round(seconds * 10); i++) t.update(0.1, visible, snap);
  };
  const keys = () => [...board.keys()];
  const learnt = () => JSON.parse(disk.text ?? '{"done":[]}').done;
  return { t, board, log, snap, play, keys, learnt, disk, storage, pause: (v) => (visible = !v) };
}

// Text: placeholders become bold key names.
assert.equal(resolveLine('Press {use} to draw, {sizeDown} / {sizeUp} to change nib', (a) => KEY_NAMES[a]), 'Press **LMB** to draw, **Q** / **E** to change nib');

// Move is shown after its delay, and learnt after walking 3 m, not after a key press.
{
  const { t, play, keys, learnt } = setup();
  play(1);
  assert.deepEqual(keys(), []);
  play(1);
  assert.deepEqual(keys(), ['hint:move']);
  t.fact({ type: 'pressed', action: 'jump' });
  t.fact({ type: 'jumped' });
  t.fact({ type: 'moved', meters: 2.5 });
  play(5);
  assert.deepEqual(keys(), ['hint:move']);
  assert.deepEqual(learnt(), []);
  t.fact({ type: 'moved', meters: 0.6 });
  play(0.1);
  assert.deepEqual(keys(), ['hint:spray']);
  assert.deepEqual(learnt(), ['move']);
}

// minShown: walking right away doesn't flash the hint away.
{
  const { t, play, keys } = setup();
  play(1.6);
  t.fact({ type: 'moved', meters: 4 });
  play(1);
  assert.deepEqual(keys(), ['hint:move']);
  play(1.5);
  assert.deepEqual(keys(), ['hint:spray']);
}

// The spray hint waits for move, then goes on the can's use.
{
  const { t, play, keys } = setup();
  play(2);
  t.fact({ type: 'moved', meters: 5 });
  play(3);
  assert.deepEqual(keys(), ['hint:spray']);
  t.fact({ type: 'used', tool: 'can', amount: 0.6 });
  play(2.1);
  assert.deepEqual(keys(), []);
}

// A color hint is learnt by time, 5 visible seconds, and not while paused.
{
  const { play, keys, learnt, snap, pause } = setup('{"v":1,"done":["move","spray","cap"]}');
  snap.colors = 2;
  play(0.1);
  assert.deepEqual(keys(), ['hint:color']);
  play(3);
  pause(true);
  play(60);
  assert.deepEqual(keys(), ['hint:color']);
  pause(false);
  play(1.8);
  assert.deepEqual(keys(), ['hint:color']);
  play(0.4);
  assert.deepEqual(keys(), []);
  assert.deepEqual(learnt().sort(), ['cap', 'color', 'move', 'spray']);
}

// A color switch learns it earlier (after minShown).
{
  const { t, play, keys, snap } = setup('{"v":1,"done":["move","spray","cap"]}');
  snap.colors = 3;
  play(0.1);
  t.fact({ type: 'colorCycled' });
  play(2.1);
  assert.deepEqual(keys(), []);
  assert.ok(t.isLearnt('color'));
}

// A tool hint has two steps; a step already true is skipped. It takes the place of move; move comes back after.
{
  const { t, play, keys, snap, board, learnt } = setup();
  play(2);
  assert.deepEqual(keys(), ['hint:move']);
  snap.tools = ['can', 'marker'];
  play(0.1);
  assert.deepEqual(keys(), ['hint:tool.marker']);
  assert.deepEqual(board.get('hint:tool.marker').lines, ['Press {slot2} to take the marker']);
  assert.equal(board.get('hint:tool.marker').kind, 'advice');
  snap.tool = 'marker';
  play(0.1);
  assert.deepEqual(board.get('hint:tool.marker').lines, ['Press {use} to draw, {sizeDown} / {sizeUp} to change nib']);
  t.fact({ type: 'used', tool: 'marker', amount: 0.7 });
  play(3);
  assert.deepEqual(learnt(), ['tool.marker']);
  assert.deepEqual(keys(), ['hint:move']);
}
{
  const { t, play, snap, board } = setup();
  snap.tool = 'roller';
  snap.tools = ['can', 'roller'];
  play(0.1);
  assert.deepEqual(board.get('hint:tool.roller').lines, ['Press {use} to roll, {sizeDown} / {sizeUp} to change width']);
}

// The stepladder's two info hints follow every tool hint's rule: in order, after the ladder hint; with the ladder away they
// show its take step; the info time counts only while the hint itself shows.
{
  const { play, keys, snap, board, learnt } = setup('{"v":1,"done":["move","spray","tool.ladder"]}');
  snap.tools = ['can', 'ladder'];
  snap.tool = 'can';
  play(1);
  assert.deepEqual(keys(), ['hint:ladder.move']);
  assert.deepEqual(board.get('hint:ladder.move').lines, ['Press {slot3} to take the stepladder']);
  play(TUTORIAL.infoSeconds * 2);
  assert.deepEqual(keys(), ['hint:ladder.move'], 'time on the take step does not count');
  snap.tool = 'ladder';
  play(0.2);
  assert.deepEqual(board.get('hint:ladder.move').lines, ['Press {use} again to move it: only one stepladder stands at a time']);
  play(TUTORIAL.infoSeconds - 0.5);
  snap.tool = 'can';
  play(5);
  assert.deepEqual(keys(), ['hint:ladder.move'], 'put away: the take step again, the timer waits');
  snap.tool = 'ladder';
  play(1);
  assert.deepEqual(keys(), ['hint:ladder.shared']);
  play(TUTORIAL.infoSeconds + 0.2);
  assert.deepEqual(keys(), []);
  assert.deepEqual(learnt(), ['move', 'spray', 'tool.ladder', 'ladder.move', 'ladder.shared']);
}
{
  const { play, keys, snap } = setup('{"v":1,"done":["move","spray"]}');
  snap.tools = ['can', 'ladder'];
  snap.tool = 'ladder';
  play(0.2);
  assert.deepEqual(keys(), ['hint:tool.ladder'], 'before the ladder hint is learnt, the info hints wait');
}

// The sponge's crouch hint: after the sponge hint; take step with the sponge away; learnt by scrubbing crouched, not standing.
{
  const { t, play, keys, snap, board, learnt } = setup('{"v":1,"done":["move","spray","tool.sponge"]}');
  snap.tools = ['can', 'sponge'];
  play(0.2);
  assert.deepEqual(board.get('hint:sponge.crouch').lines, ['Press {slot5} to take the sponge']);
  snap.tool = 'sponge';
  play(2.5);
  assert.deepEqual(keys(), ['hint:sponge.crouch']);
  t.fact({ type: 'used', tool: 'sponge', amount: 2, crouched: false });
  play(0.2);
  assert.deepEqual(keys(), ['hint:sponge.crouch']);
  t.fact({ type: 'used', tool: 'sponge', amount: 2, crouched: true });
  play(0.2);
  assert.deepEqual(keys(), []);
  assert.ok(learnt().includes('sponge.crouch'));
}

// Low pressure is about the can: with the can away it shows "take the can"; learnt by shaking; leaves unlearnt when the pressure is back.
{
  const { t, play, keys, snap, board, learnt } = setup('{"v":1,"done":["move","spray"]}');
  snap.lowPressure = true;
  snap.tool = 'marker';
  snap.tools = ['can', 'marker'];
  play(0.2);
  assert.deepEqual(keys(), ['hint:tool.marker']);
  snap.tool = 'roller';
  snap.tools = ['can', 'roller'];
  play(0.1);
  snap.tools = ['can'];
  snap.tool = null;
  play(0.2);
  assert.deepEqual(board.get('hint:pressure').lines, ['Press {slot1} to take the can']);
  snap.tool = 'can';
  play(0.2);
  assert.deepEqual(board.get('hint:pressure').lines, ['Low pressure: hold {shake} to shake the can']);
  snap.lowPressure = false;
  play(0.2);
  assert.deepEqual(keys(), []);
  assert.ok(!learnt().includes('pressure'));
  snap.lowPressure = true;
  play(2.1);
  t.fact({ type: 'pressed', action: 'shake' });
  play(0.2);
  assert.deepEqual(keys(), []);
  assert.ok(learnt().includes('pressure'));
}

// A context hint leaves unlearnt when away from the ladder, and starts over.
{
  const { t, play, keys, snap, learnt } = setup('{"v":1,"done":["move","spray"]}');
  snap.nearLadder = true;
  play(0.5);
  assert.deepEqual(keys(), ['hint:ladder.climb']);
  t.fact({ type: 'climbed', meters: 1 });
  snap.nearLadder = false;
  play(0.5);
  assert.deepEqual(keys(), []);
  assert.deepEqual(learnt(), ['move', 'spray']);
  snap.nearLadder = true;
  play(0.1);
  t.fact({ type: 'climbed', meters: 1 });
  play(5);
  assert.deepEqual(keys(), ['hint:ladder.climb']);
  snap.onLadder = true;
  snap.nearLadder = false;
  t.fact({ type: 'climbed', meters: 1 });
  play(0.1);
  assert.deepEqual(keys(), []);
  assert.ok(learnt().includes('ladder.climb'));
}

// Hints off sets nothing and records nothing; on again, it shows what wasn't learnt.
{
  const { t, play, keys, disk, log } = setup();
  t.setEnabled(false);
  play(5);
  t.fact({ type: 'moved', meters: 10 });
  play(5);
  assert.deepEqual(keys(), []);
  assert.deepEqual(log, []);
  assert.equal(disk.text, null);
  t.setEnabled(true);
  play(2);
  assert.deepEqual(keys(), ['hint:move']);
  t.setEnabled(false);
  assert.deepEqual(keys(), []);
}

// Show again clears the progress; stored progress is loaded.
{
  const { t, play, keys, learnt, storage } = setup('{"v":1,"done":["move"]}');
  play(3);
  assert.deepEqual(keys(), ['hint:spray']);
  t.reset();
  assert.deepEqual(learnt(), []);
  assert.deepEqual(keys(), []);
  play(2);
  assert.deepEqual(keys(), ['hint:move']);
  assert.equal(new Tutorial({ set() {}, clear() {} }, storage).isLearnt('move'), false);
}
{
  const { t, play, keys } = setup('not json');
  play(2);
  assert.deepEqual(keys(), ['hint:move']);
  assert.equal(t.isLearnt('move'), false);
}
// No storage at all: in memory, no errors.
{
  const t = new Tutorial({ set() {}, clear() {} });
  t.update(2, true, { tool: 'can', tools: ['can'], lowPressure: false, colors: 1, caps: 1, nearLadder: false, onLadder: false });
}

console.log('tutorial: ok');
