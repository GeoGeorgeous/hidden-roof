import * as THREE from 'three';
import type { PickupKind } from './items';
import { itemModel } from '../pickups/visuals';

// Hotbar icons: each item's pickup model (pickups/visuals.ts), rendered once
// by the game's own renderer into a small offscreen target and cached as an
// image. No extra renderer, no render loop: an icon costs one tiny render the
// first time it's shown (the can once per paint color, since its label shows it).
// Its pixels are read back without waiting for the GPU (a synchronous read
// stalls until all queued work, light baking included, is done): until they
// arrive the icon is blank, then onReady asks for a redraw.

const SIZE = 96;
/** A transparent pixel: the icon while it's being read back. */
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

export class Thumbnails {
  private cache = new Map<PickupKind, string>();
  /** Icons on their way back from the GPU; forget() drops one, so a stale result is ignored. */
  private pending = new Map<PickupKind, Promise<void>>();
  private target = new THREE.WebGLRenderTarget(SIZE, SIZE);
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  private canvas = Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });
  /** An icon arrived: draw the hotbar again. */
  onReady = () => {};

  constructor(private renderer: THREE.WebGLRenderer) {
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    this.camera.position.set(0, 0, 5);
  }

  /** Image URL of an item's icon, e.g. 'marker', 'ladder', or 'color:red' for the can with a red label; blank until it's ready. */
  get(kind: PickupKind) {
    const url = this.cache.get(kind);
    if (url) return url;
    if (!this.pending.has(kind)) {
      const job = this.render(kind).then((done) => {
        if (this.pending.get(kind) !== job) return;
        this.pending.delete(kind);
        this.cache.set(kind, done);
        this.onReady();
      });
      this.pending.set(kind, job);
    }
    return BLANK;
  }

  /** Drop every cached icon, so each is rendered again from the current models next time. */
  forgetAll() {
    this.cache.clear();
    this.pending.clear();
  }

  private async render(kind: PickupKind) {
    const model = itemModel(kind);
    model.rotation.y = 0.5; // a three-quarter view, like the spinning pickup
    this.scene.add(model);
    // Fit the model, keeping its proportions.
    const box = new THREE.Box3().setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    const half = Math.max(box.max.x - box.min.x, box.max.y - box.min.y) * 0.56;
    Object.assign(this.camera, { left: c.x - half, right: c.x + half, top: c.y + half, bottom: c.y - half });
    this.camera.updateProjectionMatrix();

    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevColor = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.scene, this.camera);
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevColor, prevAlpha);
    this.scene.remove(model);
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    });
    // The read is queued after the render; the target can be drawn into again at once.
    const pixels = await r.readRenderTargetPixelsAsync(this.target, 0, 0, SIZE, SIZE, new Uint8Array(SIZE * SIZE * 4));

    // GL rows run bottom-up, canvas rows top-down.
    const ctx = this.canvas.getContext('2d')!;
    const img = ctx.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y++) img.data.set(pixels.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
    ctx.putImageData(img, 0, 0);
    return this.canvas.toDataURL();
  }
}
