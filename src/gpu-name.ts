// The GPU the browser draws with, as players read it: a short name from
// WEBGL_debug_renderer_info (read once; browsers may hide it), whether it looks
// integrated, and how to give the browser the faster GPU on this OS. Settings
// shows it under Resolution, the perf lines and the performance test name it.
// Pure but `readGpu`: tested in Node (scripts/gpu-name.test.mjs).

export interface GpuInfo {
  /** What the browser reports, for logs and the bench: "ANGLE (Intel, Intel(R) UHD Graphics (0x00009A60) Direct3D11 vs_5_0 ps_5_0, D3D11)". */
  raw: string;
  /** "Intel UHD Graphics", or null when the browser hides it. */
  name: string | null;
  /** Integrated by its name (Intel UHD / HD / Iris, AMD Radeon Graphics without a model): a laptop may have a faster one. */
  integrated: boolean;
  /** Drawn on the CPU (SwiftShader, llvmpipe): not a GPU. */
  software: boolean;
}

export type Os = 'windows' | 'mac' | 'linux' | 'other';

/** Names browsers give in place of the real one. */
const MASKED = /^(|mozilla|webkit|webkit webgl|generic renderer|disabled)$/i;
/**
 * Built into the processor, by name: Intel UHD / HD / Iris / Xe and the model-less Arc of Meteor Lake (Arc 1x0V:
 * Lunar Lake), AMD's APUs (Radeon Graphics, Vega 8, 780M, R7). Dedicated Arc and Radeon cards have a model (A770, RX 6700).
 */
const INTEGRATED = [/^intel\b.*\b(uhd|hd|iris|xe)\b/i, /^intel arc (graphics|1\d0v)\b/i, /^amd radeon( r\d| vega \d+| \d{3}m)? graphics$/i];

/**
 * Reads the GPU once from the game's context: the plain RENDERER where it names the GPU (Firefox, which warns that
 * the extension is going away), else WEBGL_debug_renderer_info (Chromium and Safari say "WebKit WebGL" there).
 */
export function readGpu(gl: Pick<WebGLRenderingContext, 'getParameter' | 'getExtension' | 'RENDERER'>): GpuInfo {
  const plain = String(gl.getParameter(gl.RENDERER) ?? '');
  if (shortGpuName(plain)) return gpuInfo(plain);
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return gpuInfo(ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '');
}

export function gpuInfo(raw: string): GpuInfo {
  const name = shortGpuName(raw);
  return {
    raw,
    name,
    integrated: !!name && INTEGRATED.some((re) => re.test(name)),
    // Windows' own is the Microsoft Basic Render Driver (WARP), used when the GPU is blocked.
    software: /swiftshader|llvmpipe|softpipe|software|basic render/i.test(raw),
  };
}

/**
 * The name without ANGLE's wrapping, the vendor, the device id, the graphics API
 * and trademarks: "ANGLE (NVIDIA, NVIDIA RTX A2000 Laptop GPU (0x000025B8) Direct3D11
 * vs_5_0 ps_5_0, D3D11)" → "NVIDIA RTX A2000 Laptop GPU". Null when hidden.
 */
function shortGpuName(raw: string): string | null {
  // Firefox rounds the name to a common one and says so: "ANGLE (…), or similar".
  let s = raw.trim().replace(/,? or similar$/, '');
  if (MASKED.test(s)) return null;
  // ANGLE (vendor, renderer, backend): the renderer.
  const angle = /^ANGLE \((.*)\)$/.exec(s);
  if (angle) {
    const parts = angle[1].split(', ');
    s = parts.length > 1 ? parts[1] : parts[0];
  }
  s = s
    .replace(/^ANGLE Metal Renderer: /, '')
    // WSL and other wrappers name the real adapter inside: "D3D12 (NVIDIA RTX A2000 Laptop GPU)".
    .replace(/^D3D12 \((.*)\)$/, '$1')
    .replace(/^Vulkan [\d.]+ \((.*)\)$/, '$1')
    .replace(/^Mesa /, '')
    .replace(/\((R|TM)\)/gi, '')
    .replace(/\s*\(0x[0-9a-f]+\)/gi, '')
    .replace(/\s+(Direct3D|OpenGL|Vulkan|Metal).*$/i, '')
    .replace(/\/PCIe\/SSE2$/, '')
    // Mesa's chip codename: "(KBL GT2)".
    .replace(/\s*\([A-Z0-9 ]+\)$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s || null;
}

/** This browser's OS, from the platform it reports. */
export function currentOs(): Os {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const p = `${nav.userAgentData?.platform ?? ''} ${navigator.platform} ${navigator.userAgent}`;
  if (/win/i.test(p)) return 'windows';
  if (/mac/i.test(p)) return 'mac';
  if (/linux|x11|cros/i.test(p)) return 'linux';
  return 'other';
}

/** How to give the browser a second, faster GPU on this OS, if the computer has one; null where there's nothing to do. */
export function fasterGpuHow(os: Os): string | null {
  switch (os) {
    case 'windows':
      return 'If this computer has a second, faster GPU: Windows Settings → System → Display → Graphics → your browser → High performance, then restart the browser.';
    case 'mac':
      return 'If this Mac has a second, faster GPU: System Settings → Battery → Options → turn off Automatic graphics switching.';
    case 'linux':
      return 'If this computer has a second, faster GPU: start the browser with prime-run (NVIDIA) or DRI_PRIME=1 (AMD).';
    default:
      return null;
  }
}
