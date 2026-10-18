// Tests of the GPU's name (src/gpu-name.ts) in Node: short names from what
// browsers report on each OS, hidden names, integrated GPUs, software renderers.
// Usage: node scripts/gpu-name.test.mjs
import assert from 'node:assert/strict';
import { fasterGpuHow, gpuInfo } from '../src/gpu-name.ts';

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
  // Firefox, Safari.
  ['NVIDIA GeForce GTX 980 Direct3D11 vs_5_0 ps_5_0, D3D11', 'NVIDIA GeForce GTX 980', false],
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
for (const raw of ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', 'llvmpipe (LLVM 17.0.6, 256 bits)']) {
  const g = gpuInfo(raw);
  assert.ok(g.software && g.name, raw);
}

// How to give the browser the faster GPU: per OS, nothing elsewhere.
assert.match(fasterGpuHow('windows'), /Display → Graphics → your browser → High performance/);
assert.match(fasterGpuHow('mac'), /Automatic graphics switching/);
assert.match(fasterGpuHow('linux'), /prime-run.*DRI_PRIME=1/);
assert.equal(fasterGpuHow('other'), null);

console.log('gpu name: all ok');
