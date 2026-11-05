import * as THREE from 'three';
import { INDOOR_VIEW, INTERIORS } from '../config';
import type { Input } from '../input';
import type { Interiors } from '../interiors';

// Marking what's indoors by hand, for now: hold I to mark the cell of the grid
// you're on, U to unmark it. A sheet at your feet shows the grid, your cell and
// what's marked on the floor you stand on. Dev tools only (devtools.ts): one mesh, one small texture, redrawn
// when you've moved a cell or marked one. It changes the open level's rooms until
// a reload: copy them (F3 → Sound → Indoors) or save the level from build mode.

export class InteriorMarks {
  private cells = INDOOR_VIEW.cells;
  private data = new Uint8Array(this.cells * this.cells * 4);
  private texture = new THREE.DataTexture(this.data, this.cells, this.cells);
  private mesh: THREE.Mesh;
  private drawn = '';

  constructor(scene: THREE.Scene, private interiors: Interiors, private feet: () => THREE.Vector3) {
    const size = this.cells * INTERIORS.cell;
    this.texture.needsUpdate = true;
    const geometry = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** Every frame: `on` shows it, and takes the keys. */
  update(input: Input, on: boolean) {
    this.mesh.visible = on;
    if (!on) return;
    const at = this.feet();
    const marking = input.isDown('KeyI');
    const unmarking = input.isDown('KeyU');
    if (input.locked && (marking || unmarking)) this.brush(at, marking);
    this.draw(at);
  }

  /** What's marked, as JSON for the level. */
  json() {
    return JSON.stringify(this.interiors.list());
  }

  get count() {
    return this.interiors.list().length;
  }

  private brush(at: THREE.Vector3, on: boolean) {
    const c = INTERIORS.cell;
    const reach = Math.floor(INDOOR_VIEW.brush / 2);
    for (let i = -reach; i <= reach; i++) {
      for (let j = -reach; j <= reach; j++) {
        if (this.interiors.set(at.x + i * c, at.y, at.z + j * c, on)) this.drawn = '';
      }
    }
  }

  private draw(at: THREE.Vector3) {
    const c = INTERIORS.cell;
    const x = (Math.floor(at.x / c) + 0.5) * c;
    const z = (Math.floor(at.z / c) + 0.5) * c;
    this.mesh.position.set(x, at.y + INDOOR_VIEW.lift, z);
    const floor = Math.round(at.y);
    const now = [x, z, floor, INDOOR_VIEW.color, INDOOR_VIEW.opacity, INDOOR_VIEW.cursorOpacity, INDOOR_VIEW.gridOpacity].join();
    if (now === this.drawn) return;
    this.drawn = now;
    const color = new THREE.Color(INDOOR_VIEW.color);
    const half = (this.cells - 1) / 2;
    for (let j = 0; j < this.cells; j++) {
      for (let i = 0; i < this.cells; i++) {
        const k = (j * this.cells + i) * 4;
        // Laid flat, the plane's texture starts at its +z edge.
        const marked = this.interiors.has(x + (i - half) * c, floor, z + (half - j) * c);
        const here = i === half && j === half;
        const shade = marked ? INDOOR_VIEW.opacity : here ? INDOOR_VIEW.cursorOpacity : (Math.floor(x / c) + Math.floor(z / c) + i + j) % 2 ? 0 : INDOOR_VIEW.gridOpacity;
        this.data[k] = color.r * 255;
        this.data[k + 1] = color.g * 255;
        this.data[k + 2] = color.b * 255;
        this.data[k + 3] = shade * 255;
      }
    }
    this.texture.needsUpdate = true;
  }
}
