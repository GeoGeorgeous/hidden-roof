// npm run check: every step in order, stopping at the first failure, then how long
// each took (docs/testing.md). A step that takes far longer than usual shows at once.
import { spawnSync } from 'node:child_process';

const STEPS = [
  ['quick', 'npm run check:quick'],
  ['smoke', 'npm run smoke'],
  ['game', 'npm run test:game'],
  ['server', 'npm run test:server'],
  ['multiplayer', 'node scripts/multiplayer.test.mjs'],
  ['csp', 'npm run test:csp'],
  ['golden', 'npm run golden'],
];

const times = [];
const start = performance.now();
for (const [name, command] of STEPS) {
  const t = performance.now();
  const { status } = spawnSync(command, { stdio: 'inherit', shell: true });
  times.push([name, (performance.now() - t) / 1000]);
  if (status !== 0) report(`failed at ${name}`, status ?? 1);
}
report('passed', 0);

function report(verdict, code) {
  console.log(`\ncheck ${verdict}: ${times.map(([n, s]) => `${n} ${s.toFixed(0)} s`).join(', ')}; ${((performance.now() - start) / 1000).toFixed(0)} s in all`);
  process.exit(code);
}
