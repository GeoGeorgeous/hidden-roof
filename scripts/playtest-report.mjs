// The playtest's report (docs/playtest.md): reads the telemetry files the
// server wrote (.jsonl, or .jsonl.gz) and writes one HTML page: who was who
// (by device, never by name), each device's numbers, timelines with the marks
// and phases, the worst windows and hitches with what took the time, the
// network (VPN or not), joins, errors, and the server's own numbers.
// Usage: node scripts/playtest-report.mjs <files…> [--out report.html]
import fs from 'node:fs';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const outFile = outAt >= 0 ? args.splice(outAt, 2)[1] : 'playtest-report.html';
if (!args.length) throw new Error('usage: node scripts/playtest-report.mjs <files…> [--out report.html]');

const lines = [];
for (const f of args) {
  const raw = fs.readFileSync(f);
  const text = (f.endsWith('.gz') ? zlib.gunzipSync(raw) : raw).toString('utf8');
  for (const l of text.split('\n'))
    if (l.trim())
      try {
        lines.push(JSON.parse(l));
      } catch {
        // A line cut off by a crash: skipped.
      }
}
lines.sort((a, b) => (a.t < b.t ? -1 : 1));
const ms = (l) => Date.parse(l.t);
const of = (kind) => lines.filter((l) => l.kind === kind);
const windows = of('window');
const hitches = of('hitch');
const marks = of('mark');
const links = of('link');
const processes = of('process');
const sessions = of('session');

// ---- helpers ----
const median = (xs) => {
  const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : null;
};
const max = (xs) => xs.reduce((m, x) => (typeof x === 'number' && (m === null || x > m) ? x : m), null);
const sum = (xs) => xs.reduce((n, x) => n + (typeof x === 'number' ? x : 0), 0);
const fmt = (x, d = 0) => (x === null || x === undefined || Number.isNaN(x) ? '–' : typeof x === 'number' ? x.toFixed(d) : String(x));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const time = (l) => new Date(ms(l)).toISOString().slice(5, 19).replace('T', ' ');
/** A percentile from summed bucket counts (`tops` as in PLAYTEST): the top of the bucket it falls in. */
const histP = (counts, tops, p) => {
  const n = sum(counts);
  if (!n) return null;
  let c = 0;
  for (let i = 0; i < counts.length; i++) if ((c += counts[i]) >= p * n) return i < tops.length ? tops[i] : Infinity;
  return null;
};
const addHist = (hs) => hs.filter(Boolean).reduce((a, h) => a.map((x, i) => x + (h[i] ?? 0)), new Array(Math.max(0, ...hs.filter(Boolean).map((h) => h.length))).fill(0));
const FRAME_TOPS = [8, 12, 17, 25, 33, 50, 100, 250];
const PING_TOPS = [25, 50, 75, 100, 150, 200, 300, 500, 1000];
const browser = (ua = '') => (/Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '?') + (/Windows/.test(ua) ? ' · Win' : /Mac OS/.test(ua) ? ' · Mac' : /Android/.test(ua) ? ' · Android' : /Linux/.test(ua) ? ' · Linux' : '');
const topLap = (laps) => Object.entries(laps ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k} ${fmt(v, 1)}`).join(', ');

// ---- who's who: devices ----
const deviceOfLink = new Map(links.filter((l) => l.event === 'device').map((l) => [l.link, l.device]));
const devices = new Map();
// Bots (npm run playtest:bots) send reports with nothing in them: not devices.
for (const w of [...windows, ...hitches, ...marks]) {
  if (!w.device || w.bot) continue;
  const d = devices.get(w.device) ?? devices.set(w.device, { id: w.device, names: new Set(), links: new Set(), ips: new Set(), loads: new Set(), windows: [], hitches: [], marks: [], env: null, vpn: null }).get(w.device);
  if (w.name) d.names.add(w.name);
  d.links.add(w.link);
  d.ips.add(w.ip);
  d.loads.add(w.load);
  if (w.kind === 'window') {
    d.windows.push(w);
    if (w.env) d.env = w.env;
    if (w.vpn !== undefined && w.vpn !== null) d.vpn = w.vpn;
  } else if (w.kind === 'hitch') d.hitches.push(w);
  else d.marks.push(w);
}
const devList = [...devices.values()];
const label = (d) => `${[...d.names].join(' / ') || '?'} · ${d.id.slice(0, 6)}`;
const byDevice = new Map(devList.map((d) => [d.id, d]));
const who = (l) => (l.device && byDevice.get(l.device) ? label(byDevice.get(l.device)) : `${l.name ?? '?'} · link ${l.link}`);

const takeovers = links.filter((l) => l.event === 'in' && l.how === 'takeover').map((l) => {
  const before = links.filter((x) => x.event === 'in' && x.code === l.code && x.player === l.player && ms(x) < ms(l)).at(-1);
  return { t: l, name: l.name, code: l.code, player: l.player, now: deviceOfLink.get(l.link), was: before ? deviceOfLink.get(before.link) : null };
});
const nameDevices = new Map();
for (const d of devList) for (const n of d.names) nameDevices.set(n, [...(nameDevices.get(n) ?? []), d]);
const sharedNames = [...nameDevices].filter(([, ds]) => ds.length > 1);
const ipChanges = links.filter((l) => l.event === 'ip-change');

// ---- per device numbers ----
const stats = devList.map((d) => {
  const W = d.windows;
  const f = W.map((w) => w.frames ?? {});
  const n = W.map((w) => w.net ?? {});
  const hist = addHist(f.map((x) => x.hist));
  const pingHist = addHist(n.map((x) => x.pingHist));
  const welcomes = W.flatMap((w) => (w.events ?? []).filter((e) => e.e === 'welcome'));
  const routes = W.flatMap((w) => (w.events ?? []).filter((e) => e.e === 'route'));
  const heap = W.map((w) => w.memory?.heapMB).filter((x) => typeof x === 'number');
  return {
    d,
    minutes: sum(W.map((w) => w.dur)) / 60000,
    fps: median(f.map((x) => x.fps)),
    p95: median(f.map((x) => x.interval?.p95)),
    p99: histP(hist, FRAME_TOPS, 0.99),
    worst: max(f.map((x) => x.interval?.max)),
    hitches: sum(W.map((w) => w.hitches)),
    gpu: median(f.map((x) => x.gpu?.p50)),
    cpu: median(f.map((x) => x.cpu?.p95)),
    calls: max(f.map((x) => x.calls?.max)),
    lost: sum(f.map((x) => (x.particles?.ownLost ?? 0) + (x.particles?.othersLost ?? 0))),
    ping: histP(pingHist, PING_TOPS, 0.5),
    ping95: histP(pingHist, PING_TOPS, 0.95),
    unanswered: sum(n.map((x) => x.pingsUnanswered)),
    stalls300: sum(n.map((x) => x.stalls?.['300'])),
    silence: max(n.map((x) => x.longestSilence)),
    queued: max(n.map((x) => x.maxQueued)),
    opWait: median(W.map((w) => w.paint?.opWait?.p95)),
    opLate: median(W.map((w) => w.paint?.opLate?.p95)),
    heapGrowth: heap.length > 1 ? heap.at(-1) - heap[0] : null,
    errors: sum(W.map((w) => w.errorCount)),
    self: median(W.map((w) => w.selfMs)),
    joins: welcomes,
    routes,
    reconnects: W.flatMap((w) => (w.events ?? []).filter((e) => e.e === 'closed')).length,
  };
});

// ---- phases: each Shift+F9 starts one, for everyone ----
const starts = marks.filter((m) => m.next).map((m) => ({ at: ms(m), phase: m.phase, by: who(m) }));
const phaseOf = (t) => starts.filter((s) => s.at <= t).at(-1)?.phase ?? 0;
const phases = [...new Set([0, ...starts.map((s) => s.phase)])].map((p) => {
  const W = windows.filter((w) => phaseOf(ms(w)) === p);
  return { p, by: starts.find((s) => s.phase === p)?.by ?? 'before the first', windows: W.length, fps: median(W.map((w) => w.frames?.fps)), p99: histP(addHist(W.map((w) => w.frames?.hist)), FRAME_TOPS, 0.99), ping95: histP(addHist(W.map((w) => w.net?.pingHist)), PING_TOPS, 0.95), hitches: sum(W.map((w) => w.hitches)), sprayers: max(W.map((w) => w.frames?.sprayers?.max)) };
});

// ---- worst windows and hitches ----
const worstWindows = [...windows].sort((a, b) => (b.frames?.interval?.p99 ?? 0) - (a.frames?.interval?.p99 ?? 0)).slice(0, 20);
const worstHitches = [...hitches].sort((a, b) => (b.frame?.interval ?? 0) - (a.frame?.interval ?? 0)).slice(0, 40);

// ---- errors, deduplicated ----
const errs = new Map();
for (const w of windows) for (const e of w.errors ?? []) {
  const k = `${e.kind}: ${e.msg}`;
  const x = errs.get(k) ?? errs.set(k, { k, n: 0, who: new Set(), stack: e.stack }).get(k);
  x.n++;
  x.who.add(who(w));
}

// ---- timelines ----
const t0 = lines.length ? ms(lines[0]) : 0;
const series = (pick) => devList.map((d) => ({ name: label(d), points: d.windows.map((w) => [(ms(w) - t0) / 60000, pick(w)]).filter(([, y]) => typeof y === 'number') }));
const serverSeries = (pick, name) => [{ name, points: processes.map((p) => [(ms(p) - t0) / 60000, pick(p)]).filter(([, y]) => typeof y === 'number') }];
const outRate = new Map();
for (const s of sessions) for (const l of s.links ?? []) outRate.set(ms(s), (outRate.get(ms(s)) ?? 0) + l.outBytes / 5 / 1024);
const charts = [
  { title: 'Frame rate (fps)', series: series((w) => w.frames?.fps) },
  { title: 'Frame time p95 (ms)', series: series((w) => w.frames?.interval?.p95) },
  { title: 'GPU time p50 (ms)', series: series((w) => w.frames?.gpu?.p50) },
  { title: 'Draw calls (max)', series: series((w) => w.frames?.calls?.max) },
  { title: "Others' spray particles (max)", series: series((w) => w.frames?.particles?.others?.max) },
  { title: 'Ping p95 (ms)', series: series((w) => w.net?.ping?.p95) },
  { title: 'Longest silence from the server (ms)', series: series((w) => w.net?.longestSilence) },
  { title: 'JS heap (MB)', series: series((w) => w.memory?.heapMB) },
  { title: 'Server: event loop delay p99 (ms)', series: serverSeries((p) => p.eventLoop?.p99, 'event loop p99') },
  { title: 'Server: CPU (share of a core)', series: serverSeries((p) => p.cpu ? p.cpu.user + p.cpu.system : null, 'cpu') },
  { title: 'Server: sent (KB/s)', series: [{ name: 'sent', points: [...outRate].map(([t, v]) => [(t - t0) / 60000, Math.round(v)]) }] },
];
const lineMarks = [...marks.map((m) => ({ x: (ms(m) - t0) / 60000, text: m.next ? `phase ${m.phase}` : `mark · ${who(m)}`, phase: m.next }))];

// ---- the page ----
const table = (head, rows) => `<div class="scroll"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const vpnLabel = (v) => (v === true ? 'yes' : v === false ? 'no' : '–');
const vpnGroups = [true, false, null].map((v) => {
  const S = stats.filter((s) => (s.d.vpn ?? null) === v);
  return S.length ? [vpnLabel(v), S.length, fmt(median(S.map((s) => s.ping))), fmt(median(S.map((s) => s.ping95))), fmt(sum(S.map((s) => s.stalls300))), fmt(max(S.map((s) => s.silence))), fmt(sum(S.map((s) => s.reconnects)))] : null;
}).filter(Boolean);

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Playtest report</title>
<style>
:root { color-scheme: light; --surface: #fcfcfb; --text: #0b0b0b; --text-2: #52514e; --grid: #e4e3df; --line: #d0cfc9;
  --s1:#2a78d6; --s2:#eb6834; --s3:#1baf7a; --s4:#eda100; --s5:#e87ba4; --s6:#008300; --s7:#6250d6; --s8:#e34948; }
@media (prefers-color-scheme: dark) { :root:where(:not([data-theme="light"])) { color-scheme: dark; --surface: #1a1a19; --text: #f0efec; --text-2: #c3c2b7; --grid: #2c2c2a; --line: #3a3a37;
  --s1:#3987e5; --s2:#d95926; --s3:#199e70; --s4:#c98500; --s5:#d55181; --s6:#008300; --s7:#9085e9; --s8:#e66767; } }
:root[data-theme="dark"] { color-scheme: dark; --surface: #1a1a19; --text: #f0efec; --text-2: #c3c2b7; --grid: #2c2c2a; --line: #3a3a37;
  --s1:#3987e5; --s2:#d95926; --s3:#199e70; --s4:#c98500; --s5:#d55181; --s6:#008300; --s7:#9085e9; --s8:#e66767; }
body { background: var(--surface); color: var(--text); font: 14px/1.45 system-ui, sans-serif; margin: 0 auto; padding: 16px; max-width: 1200px; }
h1 { font-size: 22px; } h2 { font-size: 17px; margin-top: 32px; } p.note { color: var(--text-2); }
.scroll { overflow-x: auto; } table { border-collapse: collapse; font-size: 12.5px; font-variant-numeric: tabular-nums; }
th, td { padding: 4px 8px; border-bottom: 1px solid var(--grid); text-align: left; white-space: nowrap; vertical-align: top; } th { color: var(--text-2); font-weight: 600; }
.charts { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 520px), 1fr)); gap: 24px; }
.chart h3 { font-size: 13px; margin: 0 0 4px; } .chart svg { width: 100%; height: 200px; overflow: visible; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; color: var(--text-2); margin: 8px 0 16px; }
.legend i { display: inline-block; width: 12px; height: 2px; vertical-align: middle; margin-right: 6px; }
.tip { position: fixed; pointer-events: none; background: var(--surface); border: 1px solid var(--line); padding: 6px 8px; font-size: 12px; display: none; z-index: 9; }
.flag { color: var(--s8); font-weight: 600; } code { font-size: 12px; }
</style></head><body>
<h1>Playtest report</h1>
<p class="note">${lines.length ? `${time(lines[0])} → ${time(lines.at(-1))} UTC` : 'no data'} · ${windows.length} reports from ${devList.length} devices · ${new Set(links.filter((l) => l.code).map((l) => l.code)).size} sessions · ${hitches.length} hitches reported · files: ${args.map(esc).join(', ')}</p>

<h2>Who's who</h2>
<p class="note">One row per device (a browser profile on a machine): names are labels, not people. A cleared browser or a private window shows up as a new device; the GPU and browser columns help match them.</p>
${table(['device', 'names', 'links', 'loads', 'IP hashes', 'VPN', 'browser', 'GPU', 'screen · dpr', 'cores · GB'], devList.map((d) => [esc(d.id.slice(0, 8)), esc([...d.names].join(', ')), d.links.size, d.loads.size, d.ips.size > 1 ? `<span class="flag">${d.ips.size}</span>` : d.ips.size, vpnLabel(d.vpn), esc(browser(d.env?.ua)), esc(d.env?.gpu?.renderer ?? '–'), esc(d.env ? `${d.env.screen?.join('×')} · ${d.env.dpr}` : '–'), esc(d.env ? `${d.env.cores} · ${d.env.memoryGB ?? '?'}` : '–')]))}
${takeovers.length ? `<p><b>Takeovers</b> (a player came in under the name of one who dropped, and got their slot):</p>${table(['time', 'session', 'name', 'player id', 'device now', 'device before'], takeovers.map((x) => [time(x.t), esc(x.code), esc(x.name), x.player, esc(x.now?.slice(0, 8) ?? '?'), x.was === x.now ? 'same' : `<span class="flag">${esc(x.was?.slice(0, 8) ?? '?')}</span>`]))}` : ''}
${sharedNames.length ? `<p><b>Names used by more than one device:</b> ${sharedNames.map(([n, ds]) => `${esc(n)} (${ds.map((d) => esc(d.id.slice(0, 6))).join(', ')})`).join('; ')}</p>` : ''}
${ipChanges.length ? `<p><b>Devices that came back from another address</b> (a VPN switching exit, Wi-Fi to mobile): ${ipChanges.map((c) => `${esc(c.device.slice(0, 6))} at ${time(c)}`).join(', ')}</p>` : ''}

<h2>Each device</h2>
<p class="note">Frame p99 is from the summed histogram over the whole session (bucket tops). Lost particles: spray asked for while the pool (3000) was full. Op wait: time from another player's paint op arriving to it showing (the figure's interpolation delay); op late: how much later than that player's best it arrived. Self: the telemetry's own time per 5 s window.</p>
${table(['device', 'min', 'fps', 'p95', 'p99', 'worst', 'hitches', 'GPU', 'CPU p95', 'calls', 'lost', 'ping', 'ping p95', 'unanswered', 'stalls >300', 'silence', 'queued', 'op wait', 'op late', 'heap +MB', 'reconnects', 'errors', 'self ms'], stats.map((s) => [esc(label(s.d)), fmt(s.minutes, 1), fmt(s.fps), fmt(s.p95, 1), fmt(s.p99), fmt(s.worst), s.hitches, fmt(s.gpu, 1), fmt(s.cpu, 1), fmt(s.calls), s.lost, fmt(s.ping), fmt(s.ping95), s.unanswered, s.stalls300, fmt(s.silence), fmt(s.queued), fmt(s.opWait), fmt(s.opLate), fmt(s.heapGrowth, 1), s.reconnects, s.errors ? `<span class="flag">${s.errors}</span>` : 0, fmt(s.self, 2)]))}

<h2>Timelines</h2>
<p class="note">Minutes from the first line. Dashed lines: phases (Shift+F9) and marks (F9, "it lagged just now"). Hover for values.</p>
<div class="legend">${devList.map((d, i) => `<span><i style="background:var(--s${(i % 8) + 1})"></i>${esc(label(d))}</span>`).join('')}</div>
<div class="charts" id="charts"></div>

<h2>Phases</h2>
${table(['phase', 'started by', 'reports', 'fps', 'frame p99', 'ping p95', 'hitches', 'most spraying at once'], phases.map((p) => [p.p, esc(p.by), p.windows, fmt(p.fps), fmt(p.p99), fmt(p.ping95), p.hitches, fmt(p.sprayers)]))}
<p><b>Marks:</b> ${marks.filter((m) => !m.next).map((m) => `${time(m)} ${esc(who(m))}`).join(' · ') || 'none'}</p>

<h2>Worst windows</h2>
<p class="note">The 20 five-second windows with the worst frame p99, and their worst frame: the two sections that took longest, GPU, and what was going on.</p>
${table(['time', 'device', 'fps', 'p99', 'worst frame', 'took longest', 'GPU', 'calls', 'others spraying', 'in view', "others' particles", 'msgs/frame', 'long frame (LoAF)'], worstWindows.map((w) => { const x = w.frames ?? {}; const wf = x.worst ?? {}; const lf = x.longFrames?.longest; return [time(w), esc(who(w)), fmt(x.fps), fmt(x.interval?.p99), fmt(wf.interval), esc(topLap(wf.laps)), fmt(wf.gpu, 1), fmt(wf.calls), fmt(x.sprayers?.max), fmt(x.inView?.max), fmt(x.particles?.others?.max), fmt(w.net?.maxMessagesPerFrame), lf ? esc(`${fmt(lf.duration)} ms${lf.scripts?.[0] ? ` · ${lf.scripts[0].fn || lf.scripts[0].invoker || ''} ${lf.scripts[0].src ?? ''}` : ''}`) : '–']; }))}

<h2>Hitches</h2>
<p class="note">Frames over 100 ms, longest first (at most 5 per device per window are reported; the rest only counted).</p>
${table(['time', 'device', 'frame ms', 'CPU', 'GPU', 'took longest', 'msgs', 'others spraying', 'upload KB', 'shaders', 'playing', 'just before'], worstHitches.map((h) => { const f = h.frame ?? {}; return [time(h), esc(who(h)), fmt(f.interval), fmt(f.cpu, 1), fmt(f.gpu, 1), esc(topLap(f.laps)), fmt(f.messages), fmt(f.sprayers), fmt((f.uploadBytes ?? 0) / 1024), fmt(f.programs), f.playing ? 'yes' : 'menu', esc((h.events ?? []).map((e) => e.e).join(', '))]; }))}

<h2>Network</h2>
<p class="note">By what players said in the notice ("I'm playing through a VPN"). Stalls: no message from the server for over 300 ms (the server sends ~20 a second per player, so a silence is a held-up link).</p>
${table(['VPN', 'devices', 'ping p50', 'ping p95', 'stalls >300', 'longest silence', 'reconnects'], vpnGroups)}
<p><b>Joins</b></p>
${table(['device', 'back?', 'join ms', 'paint parts', 'parts ms', 'longest part gap', 'paint MB', 'load ms', 'plain HTTP ms', 'socket ping ms'], stats.flatMap((s) => s.joins.map((j, i) => [esc(label(s.d)), j.back ? 'back' : 'new', fmt(j.joinMs), fmt(j.parts), fmt(j.partsMs), fmt(j.longestPartGap), fmt((j.fileBytes ?? 0) / 2 ** 20, 1), fmt(j.loadMs), fmt(s.routes[i]?.httpMs), fmt(s.routes[i]?.wsPingMs)])))}

<h2>Errors</h2>
${errs.size ? table(['count', 'error', 'devices', 'stack'], [...errs.values()].sort((a, b) => b.n - a.n).map((e) => [e.n, esc(e.k), esc([...e.who].join(', ')), `<code>${esc((e.stack ?? '').split('\n').slice(0, 3).join(' ⏎ '))}</code>`])) : '<p>None.</p>'}

<h2>Server</h2>
${table(['', 'value'], [['event loop p99, worst (ms)', fmt(max(processes.map((p) => p.eventLoop?.p99)), 1)], ['event loop max, worst (ms)', fmt(max(processes.map((p) => p.eventLoop?.max)), 1)], ['CPU, highest (share of a core)', fmt(max(processes.map((p) => (p.cpu ? p.cpu.user + p.cpu.system : null))), 2)], ['GC pause, longest (ms)', fmt(max(processes.map((p) => p.gc?.longest)))], ['RSS, highest (MB)', fmt(max(processes.map((p) => p.memoryMB?.rss)))], ['send queue, highest (KB)', fmt(max(sessions.flatMap((s) => (s.links ?? []).map((l) => l.maxQueued / 1024))))], ['sends to a backed-up socket', fmt(sum(sessions.flatMap((s) => (s.links ?? []).map((l) => l.backedUp))))], ['paint runs per tick, worst (ms)', fmt(max(sessions.map((s) => s.drips?.max)), 2)], ['reports dropped (too big or too many)', fmt(sum(sessions.flatMap((s) => (s.links ?? []).map((l) => l.reportsDropped))))]])}
<p><b>Link events</b></p>
${table(['time', 'event', 'link', 'session', 'player', 'name', 'how / reason / close code'], links.filter((l) => l.event !== 'open' && l.event !== 'device').map((l) => [time(l), esc(l.event), l.link, esc(l.code ?? ''), fmt(l.player), esc(l.name ?? ''), esc(l.how ?? l.reason ?? l.closeCode ?? '')]))}
<div class="tip" id="tip"></div>
<script>
const charts = ${JSON.stringify(charts)};
const marks = ${JSON.stringify(lineMarks)};
const W = 520, H = 200, L = 40, B = 20;
const host = document.getElementById('charts');
const tip = document.getElementById('tip');
const ns = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, parent) => { const e = document.createElementNS(ns, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
for (const c of charts) {
  const all = c.series.flatMap((s) => s.points);
  if (!all.length) continue;
  const box = document.createElement('div'); box.className = 'chart';
  box.innerHTML = '<h3></h3>'; box.firstChild.textContent = c.title; host.appendChild(box);
  const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': c.title }, box);
  const xMax = Math.max(...all.map((p) => p[0]), ...marks.map((m) => m.x), 1e-6);
  const yMax = Math.max(...all.map((p) => p[1])) * 1.1 || 1;
  const x = (v) => L + (v / xMax) * (W - L - 8), y = (v) => H - B - (v / yMax) * (H - B - 8);
  for (let i = 0; i <= 4; i++) { const v = (yMax / 4) * i; el('line', { x1: L, x2: W - 8, y1: y(v), y2: y(v), stroke: 'var(--grid)' }, svg); const t = el('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 10, fill: 'var(--text-2)' }, svg); t.textContent = v >= 100 ? Math.round(v) : v.toFixed(1); }
  for (let i = 0; i <= 4; i++) { const v = (xMax / 4) * i; const t = el('text', { x: x(v), y: H - 4, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--text-2)' }, svg); t.textContent = v.toFixed(xMax < 5 ? 1 : 0) + ' min'; }
  for (const m of marks) el('line', { x1: x(m.x), x2: x(m.x), y1: 8, y2: H - B, stroke: m.phase ? 'var(--text-2)' : 'var(--line)', 'stroke-dasharray': '4 3' }, svg);
  c.series.forEach((s, i) => { if (s.points.length) el('polyline', { points: s.points.map((p) => x(p[0]) + ',' + y(p[1])).join(' '), fill: 'none', stroke: 'var(--s' + ((i % 8) + 1) + ')', 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg); });
  const cross = el('line', { y1: 8, y2: H - B, stroke: 'var(--text-2)', visibility: 'hidden' }, svg);
  svg.addEventListener('mousemove', (e) => {
    const r = svg.getBoundingClientRect(); const mx = ((e.clientX - r.left) / r.width) * W; const at = ((mx - L) / (W - L - 8)) * xMax;
    cross.setAttribute('x1', mx); cross.setAttribute('x2', mx); cross.setAttribute('visibility', 'visible');
    const rows = c.series.map((s, i) => { const p = s.points.reduce((b, q) => (!b || Math.abs(q[0] - at) < Math.abs(b[0] - at) ? q : b), null); return p && Math.abs(p[0] - at) < xMax / 40 ? '<div><span style="color:var(--s' + ((i % 8) + 1) + ')">━</span> ' + s.name.replace(/</g, '&lt;') + ': <b>' + (Math.round(p[1] * 10) / 10) + '</b></div>' : ''; }).join('');
    const near = marks.filter((m) => Math.abs(m.x - at) < xMax / 80).map((m) => '<div>' + m.text.replace(/</g, '&lt;') + '</div>').join('');
    tip.innerHTML = '<div>' + at.toFixed(1) + ' min</div>' + rows + near; tip.style.display = rows || near ? 'block' : 'none';
    tip.style.left = Math.min(e.clientX + 14, innerWidth - 260) + 'px'; tip.style.top = e.clientY + 14 + 'px';
  });
  svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; cross.setAttribute('visibility', 'hidden'); });
}
</script></body></html>`;
fs.writeFileSync(outFile, html);
console.log(`playtest report: ${outFile} (${windows.length} reports, ${devList.length} devices, ${hitches.length} hitches)`);
