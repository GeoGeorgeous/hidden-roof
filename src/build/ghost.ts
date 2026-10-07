import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PropDef } from '../kit/def';
import { mirrored, type V3 } from '../kit/pieces';
import { expandPieces } from '../level/build-prop';

// Translucent preview of the prop about to be placed: green when valid, red when
// it overlaps something or can't go on this face. As an overlay, it lights up
// a placed prop instead (build/prop-settings.ts): drawn over its faces. As an
// outline, it draws a placed prop's edges over everything (the build target).

export const GREEN = new THREE.Color('#3dff7a');
/** An outline draws the edges where faces turn more than this (degrees). */
const OUTLINE_ANGLE = 25;
export const RED = new THREE.Color('#ff3b30');

export class Ghost {
  readonly root = new THREE.Group();
  /** World-space colliders of the previewed prop (for the overlap test). */
  colliders: THREE.Box3[] = [];
  private material: THREE.MeshBasicMaterial | THREE.LineBasicMaterial;
  private mesh: THREE.Mesh | THREE.LineSegments | null = null;
  private key = '';
  private outline: boolean;

  constructor(scene: THREE.Scene, { color = GREEN as THREE.ColorRepresentation, opacity = 0.4, overlay = false, outline = false } = {}) {
    this.outline = outline;
    // An overlay is pulled toward the camera, so it isn't lost in the faces it covers; an outline is drawn over everything.
    this.material = outline
      ? new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false })
      : new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: overlay, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
    this.root.renderOrder = 10;
    scene.add(this.root);
  }

  /** `ctx`: the prop's stacking neighbors there (a block on a block is one storey), its setting and text when not the defaults, whether it is flipped. */
  showProp(def: PropDef, pos: V3, rot: number, ctx: { above: boolean; below: boolean; adjust?: number; text?: string; mirror?: boolean }) {
    const adjust = ctx.adjust ?? def.adjust?.initial() ?? 0;
    const text = ctx.text ?? def.text ?? '';
    const key = `${def.type}|${def.variant}|${pos.join(',')}|${rot}|${ctx.above}|${ctx.below}|${adjust}|${text}|${!!ctx.mirror}`;
    if (key === this.key) return;
    this.key = key;
    const pieces = def.build({ seed: 0, pos, rot, above: ctx.above, below: ctx.below, adjust, text });
    const ex = expandPieces(ctx.mirror ? mirrored(pieces) : pieces, pos, rot, false);
    const geos = ex.decor.map((d) => stripToPosition(d.geo));
    this.setGeometry(geos.length ? mergeGeometries(geos) : null);
    this.colliders = ex.colliders;
  }

  /** Pickups preview as a simple glowing column. */
  showPickup(pos: V3) {
    const key = `pickup|${pos.join(',')}`;
    if (key === this.key) return;
    this.key = key;
    const g = new THREE.BoxGeometry(0.5, 1.0, 0.5);
    g.translate(pos[0], pos[1] + 0.5, pos[2]);
    this.setGeometry(g);
    this.colliders = [new THREE.Box3(new THREE.Vector3(pos[0] - 0.25, pos[1] + 0.05, pos[2] - 0.25), new THREE.Vector3(pos[0] + 0.25, pos[1] + 1, pos[2] + 0.25))];
  }

  /** Color and opacity, as an overlay or outline (live from F3). */
  setLook(color: THREE.ColorRepresentation, opacity: number) {
    this.material.color.set(color);
    this.material.opacity = opacity;
  }

  setValid(valid: boolean) {
    this.material.color.copy(valid ? GREEN : RED);
  }

  set visible(v: boolean) {
    this.root.visible = v;
  }

  private setGeometry(g: THREE.BufferGeometry | null) {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.root.remove(this.mesh);
      this.mesh = null;
    }
    if (!g) return;
    if (this.outline) {
      this.mesh = new THREE.LineSegments(new THREE.EdgesGeometry(g, OUTLINE_ANGLE), this.material);
      g.dispose();
    } else this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.renderOrder = 11;
    this.root.add(this.mesh);
  }
}

/** Ghost only needs positions + normals; drop the rest so merging never mismatches. */
function stripToPosition(g: THREE.BufferGeometry) {
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.attributes.position);
  out.setAttribute('normal', g.attributes.normal);
  out.setIndex(g.index);
  return out;
}
