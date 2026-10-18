import { PERF_TEST, RENDER } from './config';
import { currentOs, type GpuInfo } from './gpu-name';
import { action, div } from './menu-ui';
import type { PauseMenu } from './pause-menu';
import { browserOf, perfTip, TIERS, tierOf, tierShare, type PerfResult, type PerfTest, type TestedSettings } from './perf-test';

// The performance test's popup (Settings → Graphics → Performance test → Run),
// over the blurred flight: the time left and a progress line; the average fps,
// its 1% low and its tier on a read-only slider; the CPU and GPU ms a frame
// as bars (the one that limits the frame in paper); the settings it ran with,
// draw calls and the video card; then what to change. While it runs the
// numbers follow the last moments, eased, PERF_TEST.liveMs apart; done, they
// settle on the run's. Stop or Esc ends it with no result, back to Settings;
// so does leaving the page (resuming, a session starting) or hiding the
// window. Dismiss and Esc go back to its row, Run again (Enter) runs it again.
// Nothing is kept.

/** Shown while there's no number yet (no GPU timer: Firefox, Safari). */
const NONE = '—';

export function perfTestPage(menu: PauseMenu, test: PerfTest, gpu: GpuInfo, settings: () => TestedSettings) {
  const toSettings = () => (menu.openSettings('Graphics', 'Performance test'), true);
  const stop = () => (test.stop(), toSettings());

  const status = Object.assign(document.createElement('span'), { className: 'perf-status' });
  const progress = document.createElement('i');
  const title = div('perf-title');
  title.append(div('popup-title', 'performance test'), status);
  const line = div('perf-progress');
  line.append(progress);
  const head = div('perf-head');
  head.append(title, line);

  const fps = document.createElement('b');
  const fpsLine = div('perf-fps');
  fpsLine.append(fps, Object.assign(document.createElement('span'), { textContent: 'FPS' }));
  const low = div('perf-low');
  const headline = div('perf-headline');
  const tiers = div('perf-tiers');
  tiers.title = 'Set by the test';
  const tierEls = TIERS.map((name) => {
    const el = div('perf-tier');
    const fill = document.createElement('i');
    const bar = div('bar');
    bar.append(fill);
    el.append(bar, Object.assign(document.createElement('span'), { textContent: name }));
    tiers.append(el);
    return { el, fill };
  });
  const score = div('perf-score');
  score.append(fpsLine, low, headline, tiers);

  const bars = div('perf-bars');
  const timeBar = (name: string) => {
    const fill = document.createElement('i');
    const bar = div('bar');
    bar.append(fill);
    const value = Object.assign(document.createElement('span'), { className: 'ms' });
    bars.append(Object.assign(document.createElement('span'), { className: 'name', textContent: name }), bar, value);
    return { bar, fill, value };
  };
  const cpuBar = timeBar('CPU');
  const gpuBar = timeBar('GPU');
  const facts = div('perf-facts');
  const fact = (name: string) => {
    const el = div('fact');
    const value = Object.assign(document.createElement('span'), { className: 'v' });
    el.append(Object.assign(document.createElement('span'), { className: 'k', textContent: name }), value);
    facts.append(el);
    return { el, value };
  };
  const ran = { size: fact('Resolution'), volumetrics: fact('Volumetrics'), paint: fact('Paint detail'), city: fact('City detail') };
  const calls = fact('Draw calls').value;
  const card = fact('Video card');
  card.el.classList.add('card');
  card.value.textContent = gpu.name ?? 'Unknown';
  const times = div('perf-times');
  const timesHead = div('perf-times-head');
  timesHead.append(div('col-title', 'frame time'), div('perf-hint', 'Less is better'));
  times.append(timesHead, bars, facts);
  const body = div('perf-body');
  body.append(score, times);

  const advice = div('perf-advice');
  const tip = div('perf-tip');
  tip.append(div('col-title', 'what to change'), advice);
  const buttons = div('popup-buttons');
  const box = div('popup perf-popup');
  box.append(head, body, tip, buttons);
  const root = div('page popup-page');
  root.append(box);

  /** The numbers shown, eased towards the live ones while it runs. */
  let shown: { fps: number; cpu: number; gpu: number; calls: number } | null = null;
  let ticker = 0;
  let tested: TestedSettings;

  const end = () => (clearInterval(ticker), (ticker = 0));
  menu.addPage('perf', root, () => {}, () => (test.running ? stop() : toSettings()), () => (end(), test.stop()));

  // A hidden window gets no frames: the gap would count as one slow frame. Stopped, as by Esc.
  document.addEventListener('visibilitychange', () => document.hidden && test.running && stop());

  /** The numbers: fps (its tier on the slider), CPU and GPU ms (the larger in paper), draw calls. */
  const draw = (n: { fps: number | null; cpu: number | null; gpu: number | null; calls: number | null }) => {
    fps.textContent = n.fps === null ? NONE : `${Math.round(n.fps)}`;
    const share = n.fps === null ? 0 : tierShare(n.fps);
    const tier = n.fps === null ? -1 : tierOf(n.fps);
    tierEls.forEach(({ el, fill }, i) => {
      fill.style.transform = `scaleX(${Math.min(1, Math.max(0, share * TIERS.length - i))})`;
      el.classList.toggle('on', i === tier);
    });
    const limit = n.gpu !== null && n.cpu !== null ? (n.gpu >= n.cpu ? gpuBar : cpuBar) : null;
    for (const [b, ms] of [[cpuBar, n.cpu], [gpuBar, n.gpu]] as const) {
      b.fill.style.transform = `scaleX(${ms === null ? 0 : Math.min(1, ms / PERF_TEST.barMs)})`;
      b.bar.classList.toggle('limit', b === limit);
      b.value.textContent = ms === null ? NONE : `${ms.toFixed(1)} ms`;
    }
    calls.textContent = n.calls === null ? NONE : Math.round(n.calls).toLocaleString('en-US');
  };

  /** While it runs: the time left, and the live numbers eased in. */
  const tick = () => {
    const live = test.live();
    if (!live) return;
    const total = PERF_TEST.warmup + PERF_TEST.seconds;
    status.textContent = `Testing · ${Math.max(1, Math.ceil((1 - live.progress) * total))} s left`;
    progress.style.transform = `scaleX(${live.progress})`;
    if (live.fps === null || live.cpuMs === null || live.calls === null) return;
    const to = { fps: live.fps, cpu: live.cpuMs, gpu: live.gpuMs ?? 0, calls: live.calls };
    const was = shown ?? to;
    const ease = (k: keyof typeof to) => was[k] + (to[k] - was[k]) * PERF_TEST.ease;
    shown = { fps: ease('fps'), cpu: ease('cpu'), gpu: ease('gpu'), calls: ease('calls') };
    draw({ ...shown, gpu: live.gpuMs === null ? null : shown.gpu });
  };

  const done = (r: PerfResult) => {
    end();
    status.textContent = 'Tested at your current settings';
    progress.style.transform = 'scaleX(1)';
    draw({ fps: r.fps, cpu: r.cpuMs.p50, gpu: r.gpuMs?.p50 ?? null, calls: r.calls });
    low.textContent = `1% low ${Math.round(r.low)} FPS`;
    headline.textContent = `${TIERS[tierOf(r.fps)]} at your settings`;
    const t = perfTip(r, { gpu, os: currentOs(), browser: browserOf(navigator.userAgent), maxFps: RENDER.maxFps, settings: tested });
    advice.replaceChildren(Object.assign(document.createElement('b'), { textContent: t.lead }), Object.assign(document.createElement('span'), { textContent: t.more }));
    buttons.replaceChildren(action('Dismiss', toSettings, { key: 'ESC' }), action('Run again', run, { primary: true }));
  };

  /** Run: the popup, live, then the results; stopped, nothing. */
  function run() {
    end();
    shown = null;
    tested = settings();
    for (const [k, f] of Object.entries(ran)) f.value.textContent = tested[k as keyof typeof ran];
    draw({ fps: null, cpu: null, gpu: null, calls: null });
    low.textContent = '1% low after the run';
    headline.textContent = 'Measuring…';
    advice.replaceChildren(Object.assign(document.createElement('span'), { textContent: 'Watching where each frame’s time goes.' }));
    buttons.replaceChildren(action('Stop', stop, { key: 'ESC' }));
    status.textContent = `Testing · ${Math.ceil(PERF_TEST.warmup + PERF_TEST.seconds)} s left`;
    progress.style.transform = 'scaleX(0)';
    menu.openPage('perf');
    void test.start().then((r) => r && done(r));
    ticker = window.setInterval(tick, PERF_TEST.liveMs);
  }

  return { run };
}
