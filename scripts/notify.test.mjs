// Tests of the in-game messages (src/notify.ts) in Node: the toast queue and its clock, one hint at a time by rank, keyed chips.
// Usage: npm test (node --experimental-transform-types scripts/notify.test.mjs)
import assert from 'node:assert/strict';
import './ts-imports.mjs';

const { NOTIFY } = await import('../src/config.ts');
const { Notify } = await import('../src/notify.ts');

const texts = (n, kind) => n.shown().filter((x) => x.kind === kind).map((x) => (x.dialogue ? x.dialogue.title : x.lines.join('|')));
const card = (title, rest = {}) => ({ label: 'LABEL', title, text: 'text', button: 'OK', ...rest });
const play = (n, seconds) => n.update(seconds, true);

// A pickup and a join in the same moment are both seen, the first above the second, and both go after their time.
{
  const n = new Notify();
  n.event('You picked up **Marker**');
  n.event('**Geo** joined');
  assert.deepEqual(texts(n, 'event'), ['You picked up **Marker**', '**Geo** joined']);
  play(n, NOTIFY.toastSeconds - 0.1);
  assert.equal(texts(n, 'event').length, 2);
  play(n, 0.2);
  assert.deepEqual(texts(n, 'event'), []);
}

// A full stack drops the oldest.
{
  const n = new Notify();
  for (let i = 1; i <= NOTIFY.maxToasts + 1; i++) n.event(`toast ${i}`);
  assert.deepEqual(texts(n, 'event'), ['toast 2', 'toast 3', 'toast 4']);
}

// A toast doesn't run down while play isn't visible, and one that arrives then is still seen in full.
{
  const n = new Notify();
  n.event('before');
  play(n, 2);
  n.update(100, false);
  n.event('while away');
  n.update(100, false);
  assert.deepEqual(texts(n, 'event'), ['before', 'while away']);
  play(n, 0.9);
  assert.deepEqual(texts(n, 'event'), ['before', 'while away']);
  play(n, 0.2);
  assert.deepEqual(texts(n, 'event'), ['while away']);
  play(n, 2);
  assert.deepEqual(texts(n, 'event'), []);
}

// One hint at a time: the highest rank, then the oldest; the rest wait, still set.
{
  const n = new Notify();
  n.set({ key: 'a', kind: 'advice', rank: 1, lines: ['basic'] });
  n.set({ key: 'b', kind: 'advice', rank: 2, lines: ['context one'] });
  n.set({ key: 'c', kind: 'advice', rank: 2, lines: ['context two'] });
  assert.deepEqual(texts(n, 'advice'), ['context one']);
  n.set({ key: 'd', kind: 'advice', rank: 3, lines: ['new tool', 'second line'] });
  assert.deepEqual(texts(n, 'advice'), ['new tool|second line']);
  n.clear('d');
  assert.deepEqual(texts(n, 'advice'), ['context one']);
  n.clear('b');
  assert.deepEqual(texts(n, 'advice'), ['context two']);
  n.clear('c');
  assert.deepEqual(texts(n, 'advice'), ['basic']);
  // A hint waits however long it takes: toasts and time don't touch it.
  n.event('x');
  play(n, 1000);
  assert.deepEqual(texts(n, 'advice'), ['basic']);
}

// A keyed chip shows while set; setting it again replaces its text, not adds one; two stack, a third waits.
{
  const n = new Notify();
  n.set({ key: 'net', kind: 'status', lines: ['Trying to reconnect · Attempt #1'] });
  n.set({ key: 'net', kind: 'status', lines: ['Trying to reconnect · Attempt #2'] });
  assert.deepEqual(texts(n, 'status'), ['Trying to reconnect · Attempt #2']);
  n.set({ key: 'b', kind: 'status', lines: ['second'] });
  n.set({ key: 'c', kind: 'status', lines: ['third'] });
  assert.deepEqual(texts(n, 'status'), ['Trying to reconnect · Attempt #2', 'second']);
  play(n, 1000);
  assert.equal(texts(n, 'status').length, 2);
  n.clear('net');
  assert.deepEqual(texts(n, 'status'), ['second', 'third']);
  n.clear('nothing');
}

// What shows is the same array until it changes (the display redraws on `version`).
{
  const n = new Notify();
  n.set({ key: 'h', kind: 'advice', lines: ['hint'] });
  const a = n.shown();
  const v = n.version;
  n.set({ key: 'h', kind: 'advice', lines: ['hint'] });
  play(n, 1);
  assert.equal(n.version, v);
  assert.equal(n.shown(), a);
}

// A dialogue replaces the chip with its key, blocks until confirmed (one at a time), and the hook hears which.
{
  const n = new Notify();
  const heard = [];
  n.onConfirm = (key, accepted) => heard.push(`${key}${accepted ? '' : ' (no)'}`);
  n.set({ key: 'net', kind: 'status', icon: 'cycle', lines: ['Trying to reconnect · Attempt #2'] });
  assert.equal(n.blocked, false);
  assert.equal(n.shown()[0].icon, 'cycle');
  n.set({ key: 'net', kind: 'error', dialogue: card('You are playing alone now') });
  assert.deepEqual(texts(n, 'status'), []);
  assert.deepEqual(texts(n, 'error'), ['You are playing alone now']);
  assert.equal(n.blocked, true);
  n.set({ key: 'other', kind: 'error', dialogue: card('second', { callout: 'Error: x', esc: 'Leave' }) });
  assert.equal(n.shown().find((x) => x.kind === 'error').dialogue.button, 'OK');
  assert.deepEqual(texts(n, 'error'), ['You are playing alone now']);
  play(n, 1000);
  assert.equal(n.blocked, true);
  n.confirm();
  assert.deepEqual(texts(n, 'error'), ['second']);
  n.confirm(false);
  n.confirm();
  assert.equal(n.blocked, false);
  assert.deepEqual(heard, ['net', 'other (no)']);
}

// A chip that succeeded shows its result (a check, past tense) for NOTIFY.doneSeconds of play, then goes; clock stops while hidden.
{
  const n = new Notify();
  n.succeed('net', 'Reconnected');
  assert.deepEqual(texts(n, 'status'), [], 'nothing to succeed');
  n.set({ key: 'net', kind: 'status', icon: 'cycle', lines: ['Trying to reconnect · Attempt #3'] });
  n.set({ key: 'other', kind: 'status', icon: 'bars', lines: ['Bad connection'] });
  n.succeed('net', 'Reconnected');
  const [chip] = n.shown();
  assert.deepEqual([chip.lines[0], chip.icon, chip.done], ['Reconnected', 'check', true]);
  assert.equal(n.shown().length, 2, 'the other chip stays');
  n.update(100, false);
  play(n, NOTIFY.doneSeconds - 0.1);
  assert.deepEqual(texts(n, 'status'), ['Reconnected', 'Bad connection']);
  play(n, 0.2);
  assert.deepEqual(texts(n, 'status'), ['Bad connection'], 'it goes by itself');
  // A new state for the key after a success starts a fresh chip; setting the same chip again while done does too.
  n.set({ key: 'net', kind: 'status', icon: 'cycle', lines: ['Trying to reconnect · Attempt #1'] });
  n.succeed('net', 'Reconnected');
  n.set({ key: 'net', kind: 'status', icon: 'cycle', lines: ['Trying to reconnect · Attempt #1'] });
  play(n, NOTIFY.doneSeconds + 1);
  assert.deepEqual(texts(n, 'status'), ['Bad connection', 'Trying to reconnect · Attempt #1']);
}

console.log('notify: ok (toast queue and clock, hint by rank, keyed chips, dialogue)');
