import * as THREE from 'three';
import type { PickupKind } from './items';
import { itemModel } from '../pickups/visuals';

// Icons for the hotbar (each item's pickup model, pickups/visuals.ts) and the
// build picker (props, build/prop-icon.ts): a model rendered once by the
// game's own renderer into a small offscreen target and cached as an image.
// No extra renderer, no render loop: an icon costs one tiny render the first
// time it's shown (the can once per paint color, since its label shows it).
// Its pixels are read back without waiting for the GPU (a synchronous read
// stalls until all queued work, light baking included, is done): until they
// arrive the icon is blank, then onReady asks for a redraw.

const SIZE = 96;
/** A transparent pixel: the icon while it's being read back. */
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

export class Thumbnails {
  private cache = new Map<string, string>();
  /** Icons on their way back from the GPU; forgetAll() drops them, so a stale result is ignored. */
  private pending = new Map<string, Promise<void>>();
  private target = new THREE.WebGLRenderTarget(SIZE, SIZE);
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  private canvas = Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });
  /** An icon arrived: draw again. */
  onReady = () => {};

  constructor(private renderer: THREE.WebGLRenderer) {
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
  }

  /** Image URL of the icon named `key` (e.g. 'marker', or 'color:red' for the can with a red label), drawn from `model` the first time; blank until it's ready. */
  get(key: string, model: () => THREE.Object3D) {
    const url = this.cache.get(key);
    if (url) return url;
    if (!this.pending.has(key)) {
      const job = this.render(model()).then((done) => {
        if (this.pending.get(key) !== job) return;
        this.pending.delete(key);
        this.cache.set(key, done);
        this.onReady();
      });
      this.pending.set(key, job);
    }
    return BLANK;
  }

  /** Drop every cached icon, so each is rendered again from the current models next time. */
  forgetAll() {
    this.cache.clear();
    this.pending.clear();
  }

  private async render(model: THREE.Object3D) {
    this.scene.add(model);
    // Fit the model, keeping its proportions, all of its depth in view.
    const box = new THREE.Box3().setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    const half = Math.max(box.max.x - box.min.x, box.max.y - box.min.y) * 0.56;
    Object.assign(this.camera, { left: c.x - half, right: c.x + half, top: c.y + half, bottom: c.y - half, far: box.max.z - box.min.z + 2 });
    this.camera.position.z = box.max.z + 1;
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

/** An item's icon (hotbar, build picker): its pickup model at a three-quarter view, like the spinning pickup. */
export function itemIcon(icons: Thumbnails, kind: PickupKind) {
  return icons.get(kind, () => {
    const model = itemModel(kind);
    model.rotation.y = 0.5;
    return model;
  });
}
