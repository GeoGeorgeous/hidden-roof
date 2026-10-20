// npm run bench: the Settings performance test (src/perf-test.ts) on the real
// GPU, to compare builds. The build with the dev tools (npm run build:dev:
// bundled as players get it, so the load is the game's, not Vite's dev server
// compiling modules; window.game drives it), a fresh profile (the game's
// defaults), the level players get, the window at the screen's size; the test started from Settings
// as a player does, 3 runs, the median of each percentile. Also the load: how
// long, and how smooth its frames were. Prints the JSON and writes it to
// .cache/bench/<git describe>-<gpu>.json. Stops on a software GPU.
// Compares builds only, never a player's result with a bench result. Run it
// when needed (before and after a render or level change, comparing GPUs),
// never in `npm run check` or CI. See docs/testing.md.
// Usage: npm run bench [-- url]          (no url: builds and serves dist-dev; WSL: GPU=Intel for the iGPU)
//        npm run bench -- a.json b.json  (both, and the change in %)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { preview } from 'vite';
import { freePort, openTestBrowser } from './test-browser.mjs';

const RUNS = 3;
const args = process.argv.slice(2);

async function bench(url) {
  let site = null;
  if (!url) {
    execSync('npm run build:dev -- --logLevel error', { stdio: ['ignore', 'ignore', 'inherit'] });
    site = await preview({ build: { outDir: 'dist-dev' }, logLevel: 'error', preview: { port: await freePort() } });
    url = site.resolvedUrls.local[0];
  }
  const test = await openTestBrowser(url, { level: null, gpu: true });
  try {
    if (!test.realGpu) throw new Error('no real GPU: no display to open a window on');
    // No viewport: Playwright's would stand in for the screen's size.
    const probe = await test.browser.newPage({ viewport: null });
    // The display's refresh rate too, on a blank page: the game's frames may be slower than it.
    const { refreshHz, ...screen } = await probe.evaluate(async () => {
      const intervals = await new Promise((done) => {
        const list = [];
        let last = 0;
        const tick = (t) => (last && list.push(t - last), (last = t), list.length < 60 ? requestAnimationFrame(tick) : done(list));
        requestAnimationFrame(tick);
      });
      return { width: screen.width, height: screen.height, refreshHz: Math.round(1000 / intervals.sort((a, b) => a - b)[30]) };
    });
    await probe.close();
    const page = await test.browser.newPage({ viewport: screen });
    // The load's frames, from the first script to the game loaded; the test's results as they come.
    await page.addInitScript(() => {
      const load = (window.benchLoad = { start: performance.now(), intervals: [], ms: 0 });
      let last = load.start;
      const tick = (t) => {
        load.intervals.push(t - last);
        last = t;
        if (window.game?.loaded()) load.ms = t - load.start;
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.goto(test.url);
    await page.waitForFunction(() => window.benchLoad.ms > 0, null, { timeout: 180000 });
    const gpu = await page.evaluate(() => window.game.gpu);
    if (gpu.software) throw new Error(`no real GPU: ${gpu.raw}`);
    // The lamp light baked, as players see the menu once loaded.
    await page.waitForFunction(() => window.game.baker.stats.pending === 0, null, { timeout: 120000 });
    const page0 = await page.evaluate(() => {
      const g = window.game;
      window.benchResults = [];
      const start = g.perfTest.start.bind(g.perfTest);
      g.perfTest.start = () => start().then((r) => (r && window.benchResults.push(r), r));
      g.hud.menu.openSettings('Graphics');
      // The build, as the pause menu's foot shows it (src/version.ts).
      const build = [...document.querySelectorAll('.overlay .pause-foot span')].map((s) => s.textContent).find((t) => /^v\d/.test(t));
      return { settings: g.settings.summary(), build };
    });
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      await page.click(i ? '.popup-page:not([hidden]) .btn:has-text("Run again")' : '.setting-row:has-text("Performance test") .btn');
      await page.waitForFunction((n) => window.benchResults.length === n, i + 1, { timeout: 60000 });
      runs.push(rounded(await page.evaluate((n) => window.benchResults[n], i)));
      await page.waitForSelector('.popup-page:not([hidden])');
    }
    const message = await page.textContent('.popup.perf-popup .perf-advice');
    const load = await page.evaluate(() => window.benchLoad);
    const sorted = [...load.intervals].sort((a, b) => a - b);
    const result = {
      build: page0.build,
      date: new Date().toISOString(),
      gpu: { name: gpu.name, raw: gpu.raw },
      os: `${os.type()} ${os.release()} (${process.platform})`,
      cpuCores: os.cpus().length,
      browser: `Chromium ${test.browser.version()}`,
      screen: `${screen.width}x${screen.height}`,
      refreshHz,
      settings: page0.settings,
      ...medianOf(runs),
      message,
      load: { seconds: round(load.ms / 1000), frames: load.intervals.length, fps: round((load.intervals.length * 1000) / load.ms), longestFrameMs: round(sorted.at(-1) ?? 0) },
      runs,
    };
    const json = JSON.stringify(result, null, 1);
    console.log(json);
    fs.mkdirSync('.cache/bench', { recursive: true });
    const file = `.cache/bench/${describe()}-${(gpu.name ?? 'hidden').replace(/[^\w]+/g, '-')}.json`;
    fs.writeFileSync(file, json);
    console.log(`\n${result.gpu.name}: ${result.fps} fps, GPU ${result.gpuMs?.p50 ?? 'n/a'} ms, CPU ${result.cpuMs.p50} ms (medians of ${RUNS} runs); loaded in ${result.load.seconds} s at ${result.load.fps} fps\n${file}`);
  } catch (e) {
    console.error(`bench: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await test.close();
    await site?.close();
  }
}

/** Each number of the runs: their median. */
function medianOf(runs) {
  const med = (pick) => {
    const v = runs.map(pick).filter((x) => x !== undefined && x !== null).sort((a, b) => a - b);
    return v.length ? round(v[Math.floor(v.length / 2)]) : null;
  };
  const spread = (key) => (runs.some((r) => !r[key]) ? null : { p50: med((r) => r[key].p50), p95: med((r) => r[key].p95), p99: med((r) => r[key].p99) });
  return { fps: med((r) => r.fps), low: med((r) => r.low), frameMs: spread('frameMs'), cpuMs: spread('cpuMs'), gpuMs: spread('gpuMs'), calls: med((r) => r.calls) };
}

/** Two results side by side, and the change from the first to the second (no threshold). */
function compare(a, b) {
  const rows = [['', a.build, b.build, 'change']];
  const add = (name, x, y) => rows.push([name, fmt(x), fmt(y), x && y !== null && y !== undefined ? `${y >= x ? '+' : ''}${(((y - x) / x) * 100).toFixed(1)}%` : '']);
  rows.push(['gpu', a.gpu.name, b.gpu.name, ''], ['settings', a.settings, b.settings, '']);
  add('fps', a.fps, b.fps);
  add('1% low fps', a.low, b.low);
  for (const key of ['frameMs', 'cpuMs', 'gpuMs']) for (const p of ['p50', 'p95', 'p99']) add(`${key} ${p}`, a[key]?.[p], b[key]?.[p]);
  add('draw calls', a.calls, b.calls);
  add('load s', a.load?.seconds, b.load?.seconds);
  add('load fps', a.load?.fps, b.load?.fps);
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
  for (const r of rows) console.log(r.map((c, i) => String(c).padEnd(widths[i])).join('  '));
}

/** A run's numbers to 0.01. */
const rounded = (o) => JSON.parse(JSON.stringify(o, (_, v) => (typeof v === 'number' ? round(v) : v)));
const fmt = (v) => (v === undefined || v === null ? 'n/a' : v);
const round = (v) => Math.round(v * 100) / 100;

function describe() {
  try {
    return execSync('git describe --tags --always --dirty', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

if (args.length === 2 && args.every((a) => a.endsWith('.json'))) compare(...args.map((f) => JSON.parse(fs.readFileSync(f, 'utf8'))));
else await bench(args[0]);
