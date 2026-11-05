import * as THREE from 'three';
import { INDOOR_VIEW, INTERIORS } from '../config';
import type { Input } from '../input';
import type { Interiors } from '../interiors';

// Marking what's indoors by hand, each with its own switch in F3 → Sound → Indoors.
// Mark rooms: hold I to mark the cell of the grid you're on, U to take off the mark
// you're on. A mark reaches up to the first thing over your head in that cell.
// Show rooms: a sheet at your feet shows the grid, your cell and what's marked where
// you stand. Dev tools only (devtools.ts): one mesh, one small texture, redrawn when
// you've moved or marked. It changes the open level's rooms until a reload: SAVE
// LEVEL there, or P in build mode, gives the level with them.

export class InteriorMarks {
  private cells = INDOOR_VIEW.cells;
  private data = new Uint8Array(this.cells * this.cells * 4);
  private texture = new THREE.DataTexture(this.data, this.cells, this.cells);
  private mesh: THREE.Mesh;
  private drawn = '';

  constructor(scene: THREE.Scene, private interiors: Interiors, private colliders: readonly THREE.Box3[], private feet: () => THREE.Vector3) {
    const size = this.cells * INTERIORS.cell;
    this.texture.needsUpdate = true;
    const geometry = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** Every frame. */
  update(input: Input) {
    const at = this.feet();
    const marking = input.isDown('KeyI');
    if (INDOOR_VIEW.mark && input.locked && (marking || input.isDown('KeyU'))) this.brush(at, marking);
    this.mesh.visible = INDOOR_VIEW.show;
    if (INDOOR_VIEW.show) this.draw(at);
  }

  get count() {
    return this.interiors.list().length;
  }

  private brush(at: THREE.Vector3, on: boolean) {
    const c = INTERIORS.cell;
    const reach = Math.floor(INDOOR_VIEW.brush / 2);
    for (let i = -reach; i <= reach; i++) {
      for (let j = -reach; j <= reach; j++) {
        const x = at.x + i * c;
        const z = at.z + j * c;
        if (this.interiors.set(x, at.y, z, on, this.reach(x, Math.round(at.y), z))) this.drawn = '';
      }
    }
  }

  /** How high a mark on `floor` reaches at this point: to the first thing in its cell that starts over a head, a storey at most. Walls start lower, a pipe overhead doesn't. */
  private reach(x: number, floor: number, z: number) {
    const c = INTERIORS.cell;
    const x0 = Math.floor(x / c) * c;
    const z0 = Math.floor(z / c) * c;
    let top = floor + INTERIORS.height;
    for (const { min, max } of this.colliders) {
      if (min.y >= floor + INTERIORS.headroom && min.y < top && max.x > x0 && min.x < x0 + c && max.z > z0 && min.z < z0 + c) top = min.y;
    }
    return Math.floor((top - floor) * 100) / 100;
  }

  private draw(at: THREE.Vector3) {
    const c = INTERIORS.cell;
    const x = (Math.floor(at.x / c) + 0.5) * c;
    const z = (Math.floor(at.z / c) + 0.5) * c;
    this.mesh.position.set(x, at.y + INDOOR_VIEW.lift, z);
    const y = Math.round(at.y * 10) / 10;
    const now = [x, z, y, INDOOR_VIEW.color, INDOOR_VIEW.opacity, INDOOR_VIEW.cursorOpacity, INDOOR_VIEW.gridOpacity].join();
    if (now === this.drawn) return;
    this.drawn = now;
    const color = new THREE.Color(INDOOR_VIEW.color);
    const half = (this.cells - 1) / 2;
    for (let j = 0; j < this.cells; j++) {
      for (let i = 0; i < this.cells; i++) {
        const k = (j * this.cells + i) * 4;
        // Laid flat, the plane's texture starts at its +z edge.
        const marked = this.interiors.has(x + (i - half) * c, y, z + (half - j) * c);
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
