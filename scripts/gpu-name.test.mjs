// Tests of the GPU's name (src/gpu-name.ts) in Node: short names from what
// browsers report on each OS, hidden names, integrated GPUs, software renderers.
// Usage: node scripts/gpu-name.test.mjs
import assert from 'node:assert/strict';
import { fasterGpuHow, gpuInfo, readGpu } from '../src/gpu-name.ts';

const cases = [
  // Chrome on Windows (the owner's laptop, both GPUs).
  ['ANGLE (Intel, Intel(R) UHD Graphics (0x00009A60) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Intel UHD Graphics', true],
  ['ANGLE (NVIDIA, NVIDIA RTX A2000 Laptop GPU (0x000025B8) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'NVIDIA RTX A2000 Laptop GPU', false],
  ['ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Intel Iris Xe Graphics', true],
  ['ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'AMD Radeon Graphics', true],
  ['ANGLE (AMD, AMD Radeon RX 6700 XT (0x000073DF) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'AMD Radeon RX 6700 XT', false],
  ['ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics (0x000056A0) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Intel Arc A770 Graphics', false],
  // Chrome on macOS.
  ['ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)', 'Apple M1 Pro', false],
  ['ANGLE (Intel Inc., Intel(R) Iris(TM) Plus Graphics 655, OpenGL 4.1)', 'Intel Iris Plus Graphics 655', true],
  // WSL (the shots and bench setup), Linux.
  ['ANGLE (Microsoft Corporation, D3D12 (NVIDIA RTX A2000 Laptop GPU), OpenGL 4.6 (Core Profile) Mesa 24.2.8-1ubuntu1~24.04.1)', 'NVIDIA RTX A2000 Laptop GPU', false],
  ['ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)', 'Intel UHD Graphics 620', true],
  ['NVIDIA GeForce GTX 1060 6GB/PCIe/SSE2', 'NVIDIA GeForce GTX 1060 6GB', false],
  // Firefox (rounded to a common name, "or similar"), Safari.
  ['NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0, D3D11', 'NVIDIA GeForce GTX 980', false],
  ['ANGLE (Intel, Intel(R) HD Graphics 400 Direct3D11 vs_5_0 ps_5_0), or similar', 'Intel HD Graphics 400', true],
  ['ANGLE (NVIDIA, NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0), or similar', 'NVIDIA GeForce GTX 980', false],
  ['Intel(R) HD Graphics, or similar', 'Intel HD Graphics', true],
  // Built-in GPUs by other names: Intel Xe (Linux), Meteor and Lunar Lake's Arc, AMD's APUs; and the cards they aren't.
  ['Mesa Intel(R) Xe Graphics (TGL GT2)', 'Intel Xe Graphics', true],
  ['ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Intel Arc Graphics', true],
  ['ANGLE (Intel, Intel(R) Arc(TM) 140V GPU (16GB) (0x000064A0) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Intel Arc 140V GPU', true],
  ['ANGLE (AMD, AMD Radeon(TM) Vega 8 Graphics (0x000015D8) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'AMD Radeon Vega 8 Graphics', true],
  ['ANGLE (AMD, AMD Radeon 780M Graphics (0x000015BF) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'AMD Radeon 780M Graphics', true],
  ['ANGLE (AMD, AMD Radeon(TM) R7 Graphics (0x00001313) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'AMD Radeon R7 Graphics', true],
  ['ANGLE (AMD, AMD Radeon RX 7600M XT (0x00007480) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'AMD Radeon RX 7600M XT', false],
  ['Apple GPU', 'Apple GPU', false],
  // Hidden.
  ['', null, false],
  ['Mozilla', null, false],
  ['WebKit WebGL', null, false],
];
for (const [raw, name, integrated] of cases) {
  const g = gpuInfo(raw);
  assert.equal(g.name, name, raw);
  assert.equal(g.integrated, integrated, raw);
  assert.equal(g.software, false, raw);
}

// Software renderers: named, and marked as not a GPU.
for (const raw of ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', 'llvmpipe (LLVM 17.0.6, 256 bits)', 'ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11)']) {
  const g = gpuInfo(raw);
  assert.ok(g.software && g.name, raw);
}

// Read once: the plain RENDERER where it names the GPU (Firefox: no extension asked for, so no deprecation warning);
// else the extension (Chromium, Safari), and nothing where that's hidden too.
const fakeGl = (renderer, unmasked) => {
  const asked = [];
  const gl = { RENDERER: 1, getParameter: (p) => (p === 1 ? renderer : unmasked), getExtension: (n) => (asked.push(n), unmasked === undefined ? null : { UNMASKED_RENDERER_WEBGL: 2 }) };
  return { gl, asked };
};
{
  const firefox = fakeGl('ANGLE (Intel, Intel(R) HD Graphics 400 Direct3D11 vs_5_0 ps_5_0), or similar', 'x');
  assert.equal(readGpu(firefox.gl).name, 'Intel HD Graphics 400');
  assert.deepEqual(firefox.asked, []);
  const chrome = fakeGl('WebKit WebGL', 'ANGLE (NVIDIA, NVIDIA RTX A2000 Laptop GPU (0x000025B8) Direct3D11 vs_5_0 ps_5_0, D3D11)');
  assert.equal(readGpu(chrome.gl).name, 'NVIDIA RTX A2000 Laptop GPU');
  assert.equal(readGpu(fakeGl('WebKit WebGL', undefined).gl).name, null);
}

// How to give the browser the faster GPU: per OS, nothing elsewhere.
assert.match(fasterGpuHow('windows'), /Display → Graphics → your browser → High performance/);
assert.match(fasterGpuHow('mac'), /Automatic graphics switching/);
assert.match(fasterGpuHow('linux'), /prime-run.*DRI_PRIME=1/);
assert.equal(fasterGpuHow('other'), null);

console.log('gpu name: all ok');
