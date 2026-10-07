import * as THREE from 'three';
import type { V3 } from '../kit/pieces';

// Build mode: where the player spawns. A see-through standing figure of the
// player's size, an arrow on the floor for the facing direction, and a tall
// thin beacon so it's easy to find from far away. Hidden while playing. A
// second one is the ghost of the spawn point about to be placed.

const COLOR = '#3dd5ff';

export class SpawnMarker {
  readonly root = new THREE.Group();
  private materials: (THREE.MeshBasicMaterial | THREE.LineBasicMaterial)[];

  constructor(scene: THREE.Scene, height: number, radius: number) {
    const fill = new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.25, depthWrite: false });
    const solid = new THREE.MeshBasicMaterial({ color: COLOR, transparent: true, opacity: 0.85, depthWrite: false });
    const line = new THREE.LineBasicMaterial({ color: COLOR });
    this.materials = [fill, solid, line];
    const body = new THREE.Mesh(new THREE.BoxGeometry(radius * 2, height, radius * 2), fill);
    body.position.y = height / 2;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), line);
    edges.position.copy(body.position);
    // Arrow along -z (yaw 0 looks down -z), flat on the floor.
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 3), solid);
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.set(0, 0.03, -0.55);
    const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.03, 6, 0.03), fill);
    beacon.position.y = height + 3;
    this.root.add(body, edges, arrow, beacon);
    this.root.renderOrder = 10;
    this.root.visible = false;
    for (const o of this.root.children) o.raycast = () => {}; // never blocks build-mode aiming
    scene.add(this.root);
  }

  set(pos: V3, yaw: number) {
    this.root.position.set(...pos);
    this.root.rotation.y = yaw;
  }

  setColor(c: THREE.Color) {
    for (const m of this.materials) m.color.copy(c);
  }

  set visible(v: boolean) {
    this.root.visible = v;
  }
}
