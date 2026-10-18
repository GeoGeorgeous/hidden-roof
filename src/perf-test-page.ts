import { RENDER } from './config';
import { currentOs, type GpuInfo } from './gpu-name';
import { action, div, fileChip, hl, keyHint, para, popup } from './menu-ui';
import type { PauseMenu } from './pause-menu';
import { browserOf, perfMessage, perfNumbers, type PerfResult, type PerfTest } from './perf-test';

// The performance test's pages (Settings → Graphics → Performance test → RUN):
// while it runs, the game as it is with only TESTING… [ESC] TO STOP over it
// (Esc: back to Settings, no result); then the `performance test` popup with
// the numbers, the settings, the GPU and the message, RUN AGAIN and DISMISS.
// Leaving the page (resuming, a session starting) or hiding the window stops
// the test. Back on Settings, the row shows. Nothing is kept.

export function perfTestPage(menu: PauseMenu, test: PerfTest, gpu: GpuInfo, settings: () => string) {
  const toSettings = () => (menu.openSettings('Graphics', 'Performance test'), true);

  const testing = div('page bare-page testing-page');
  const line = div('testing');
  line.append('TESTING…', keyHint('ESC'), 'TO STOP');
  testing.append(line);
  menu.addPage('testing', testing, () => {}, () => (test.stop(), toSettings()), () => test.stop());

  // A hidden window gets no frames: the gap would count as one slow frame. Stopped, as by Esc.
  document.addEventListener('visibilitychange', () => document.hidden && test.running && (test.stop(), toSettings()));

  const shown = popup('performance test');
  menu.addPage('perf', shown.root, () => {}, toSettings);

  const show = (r: PerfResult) => {
    const msg = perfMessage(r, { gpu, os: currentOs(), browser: browserOf(navigator.userAgent), maxFps: RENDER.maxFps });
    shown.body.replaceChildren(
      fileChip(perfNumbers(r), `${r.calls} draw calls`),
      para('', hl(gpu.name ?? 'GPU hidden by the browser'), ` · ${settings()}`),
      para('lead', msg.lead),
      ...(msg.more ? [para('', msg.more)] : []),
    );
    shown.buttons.replaceChildren(action('Dismiss', toSettings, { key: 'ESC' }), action('Run again', run, { primary: true }));
    menu.openPage('perf');
  };

  /** RUN: the test, then its popup; stopped, nothing. */
  function run() {
    menu.openPage('testing');
    void test.start().then((r) => r && show(r));
  }

  return { run, show };
}
