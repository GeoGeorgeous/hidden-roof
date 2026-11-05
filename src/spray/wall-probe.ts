import * as THREE from 'three';
import type { Solids } from '../level/solids';
import type { PaintSurface, PaintSystem } from '../painting';
import { facePoint, type FacePoint } from '../surfaces';
import type { Wall, WallHit } from './stroke';

// What a tool meets within its reach: rays against the solids near the eye,
// gathered once a frame (near).

export interface WallSpot extends WallHit {
  surface: PaintSurface;
  at: FacePoint;
}

export class WallProbe implements Wall<WallSpot> {
  private raycaster = new THREE.Raycaster();
  private candidates: THREE.Object3D[] = [];

  constructor(
    private solids: Solids,
    private paint: PaintSystem,
    private reach: number,
  ) {}

  /** Gathers what rays from about `eye` can hit. */
  near(eye: THREE.Vector3) {
    this.solids.near(eye, this.reach, this.candidates);
    this.raycaster.far = this.reach;
  }

  /** The first solid along the ray. */
  cast(from: THREE.Vector3, along: THREE.Vector3) {
    this.raycaster.set(from, along);
    return this.candidates.length ? this.raycaster.intersectObjects(this.candidates, false)[0] : undefined;
  }

  /** Whether what a ray hit takes paint. */
  takes(hit: THREE.Intersection | undefined) {
    return !!hit && !!this.paint.get(hit.object);
  }

  /** Where the ray meets paint-taking surface; anything else in the way stops it. */
  find(from: THREE.Vector3, along: THREE.Vector3): WallSpot | null {
    const hit = this.cast(from, along);
    const surface = hit && this.paint.get(hit.object);
    if (!hit || !surface) return null;
    return { point: hit.point, distance: hit.distance, surface, at: facePoint(surface.geo, hit.faceIndex!, hit.uv!, { rect: 0, u: 0, v: 0 }) };
  }
}
