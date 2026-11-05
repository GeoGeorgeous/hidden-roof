import type * as THREE from 'three';

// What rays meet in the level: every prop's solid meshes, and each one's bounding
// sphere side by side, so `near` reads one array in order, not four objects a
// mesh. Level meshes sit at the origin, so their geometry's spheres are in world
// space.

export class Solids {
  meshes: readonly THREE.Mesh[] = [];
  /** x, y, z, radius of each of `meshes`. */
  private spheres = new Float64Array(0);

  /** The level's solids changed. */
  set(meshes: THREE.Mesh[]) {
    this.meshes = meshes;
    this.spheres = new Float64Array(meshes.length * 4);
    meshes.forEach((m, i) => {
      const { center, radius } = m.geometry.boundingSphere!;
      this.spheres.set([center.x, center.y, center.z, radius], i * 4);
    });
  }

  /**
   * The solids whose bounding sphere comes within `range` of `p`, into `out`
   * (cleared first): the broad phase before raycasting them (spray, marker,
   * the hand on walls).
   */
  near(p: THREE.Vector3, range: number, out: THREE.Object3D[]) {
    const s = this.spheres;
    out.length = 0;
    for (let i = 0, k = 0; k < s.length; i++, k += 4) {
      const dx = s[k] - p.x;
      const dy = s[k + 1] - p.y;
      const dz = s[k + 2] - p.z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) - s[k + 3] < range) out.push(this.meshes[i]);
    }
    return out;
  }
}
