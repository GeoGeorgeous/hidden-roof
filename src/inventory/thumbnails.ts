import * as THREE from 'three';
import type { PickupKind } from './items';
import { itemModel } from '../pickups/visuals';

// Hotbar icons: each item's pickup model (pickups/visuals.ts), rendered once
// by the game's own renderer into a small offscreen target and cached as an
// image. No extra renderer, no render loop: an icon costs one tiny render the
// first time it's shown (the can once per paint color, since its label shows it).

const SIZE = 96;

export class Thumbnails {
  private cache = new Map<PickupKind, string>();
  private target = new THREE.WebGLRenderTarget(SIZE, SIZE);
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  private pixels = new Uint8Array(SIZE * SIZE * 4);
  private canvas = Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });

  constructor(private renderer: THREE.WebGLRenderer) {
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    this.camera.position.set(0, 0, 5);
  }

  /** Image URL of an item's icon, e.g. 'marker', 'ladder', or 'color:red' for the can with a red label. */
  get(kind: PickupKind) {
    let url = this.cache.get(kind);
    if (!url) this.cache.set(kind, (url = this.render(kind)));
    return url;
  }

  private render(kind: PickupKind) {
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
    r.readRenderTargetPixels(this.target, 0, 0, SIZE, SIZE, this.pixels);
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevColor, prevAlpha);
    this.scene.remove(model);
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    });

    // GL rows run bottom-up, canvas rows top-down.
    const ctx = this.canvas.getContext('2d')!;
    const img = ctx.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y++) img.data.set(this.pixels.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
    ctx.putImageData(img, 0, 0);
    return this.canvas.toDataURL();
  }
}
