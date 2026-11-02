import * as THREE from 'three';
import { CAPTURE } from '../config';

// Capture mode's flight: the points the camera was at when they were added,
// flown through in order over `seconds`, easing in and out, at an even speed
// between (by length along the path). The path is a Catmull-Rom curve through
// the positions; the view turns from each point's to the next one's (slerp)
// along the same stretch of the path, without the tilt a slerp adds between.

const turn = new THREE.Quaternion();
const look = new THREE.Euler(0, 0, 0, 'YXZ');

interface Point {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export class Flight {
  readonly points: Point[] = [];
  seconds = CAPTURE.flightSeconds;
  /** Time into the flight (s), or -1: not flying. */
  private time = -1;
  private curve: THREE.CatmullRomCurve3 | null = null;

  get flying() {
    return this.time >= 0;
  }

  /** How far the flight has gone (s). */
  get elapsed() {
    return Math.max(0, this.time);
  }

  /** A point where `camera` is, looking where it looks. */
  add(camera: THREE.Camera) {
    this.points.push({ position: camera.position.clone(), quaternion: camera.quaternion.clone() });
  }

  removeLast() {
    this.points.pop();
  }

  /** The time of the flight, a step longer (+1) or shorter (-1). */
  lengthen(steps: number) {
    this.seconds = THREE.MathUtils.clamp(this.seconds + steps * CAPTURE.flightStep, CAPTURE.flightMin, CAPTURE.flightMax);
  }

  stop() {
    this.time = -1;
  }

  /** Starts the flight from the first point (two at least), or stops it. */
  toggle() {
    if (this.flying || this.points.length < 2) return this.stop();
    this.curve = new THREE.CatmullRomCurve3(
      this.points.map((p) => p.position),
      false,
      'centripetal',
    );
    this.time = 0;
  }

  /** Moves `camera` `dt` further along; the flight ends at the last point. */
  update(dt: number, camera: THREE.Camera) {
    this.time += dt;
    const u = Math.min(1, this.time / this.seconds);
    const curve = this.curve!;
    const t = curve.getUtoTmapping(u * u * (3 - 2 * u), 0); // 0: by the fraction of the length, not a distance
    curve.getPoint(t, camera.position);
    const at = t * (this.points.length - 1);
    const i = Math.min(this.points.length - 2, Math.floor(at));
    look.setFromQuaternion(turn.slerpQuaternions(this.points[i].quaternion, this.points[i + 1].quaternion, at - i), 'YXZ');
    camera.rotation.set(look.x, look.y, 0, 'YXZ');
    camera.updateMatrixWorld();
    if (u >= 1) this.time = -1;
  }
}
