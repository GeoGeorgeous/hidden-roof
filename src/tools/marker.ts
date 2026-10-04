import * as THREE from 'three';
import { inkify } from '../render/ink/tone';
import { COLORS, HOLD, MARKER, type PaintColor } from '../config';
import type { Audio } from '../audio';
import type { Input } from '../input';
import { rgbOf } from '../inventory/items';
import { glove, segment, sleeve } from '../spray/hands';
import type { PaintSystem } from '../painting';
import { StrokeSweep } from './stroke';
import { setHex } from '../hex-color';

// Marker: a pump marker with a hard square nib. It draws a solid line straight
// into the surface texture under the crosshair, at close range, in the current
// color: square stamps with their sides along the surface's axes, so strokes
// are as wide as the nib going straight and wider on the diagonal, like a held
// chisel. No particles, no pressure. With paint runs on (DRIPS), going over
// the same spot again, or holding the nib still, can start a run like the can.
// The mouse wheel changes the nib size (MARKER.radiusMin..radiusMax, see wheel-size.ts).
// Fast mouse moves are filled by interpolating rays between frames. The band
// on the barrel shows the current color, like the can's label.

/** Held still, the nib stamps the same spot every frame: let it add to runs this often (per s), whatever the frame rate. */
const STILL_DRIP_RATE = 30;
/** Rays at most this far apart (radians), so fast moves leave no gaps. */
const RAY_STEP = 0.003;

export class MarkerTool {
  readonly model = new THREE.Group();
  /** Sway/bob offsets are written here (see tools/view-sway.ts). */
  readonly sway = new THREE.Group();
  private tipModel = new THREE.Group();
  private stroke: StrokeSweep;
  /** Show the paint color, so they keep their color: the band and the inked nib. */
  private bandMat = inkify(new THREE.MeshLambertMaterial({ color: COLORS.black }), true);
  private nibMat = inkify(new THREE.MeshLambertMaterial({ color: COLORS.black }), true);

  constructor(
    private paint: PaintSystem,
    solids: THREE.Mesh[],
    private audio: Audio,
  ) {
    this.stroke = new StrokeSweep(solids, paint);
    const black = inkify(new THREE.MeshLambertMaterial({ color: '#1a1a1e' }));
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.13, 10), black);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.03, 10), this.bandMat);
    // Square nib in a collar, the band showing the color.
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.012, 10), black);
    const nib = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.016, 0.009), this.nibMat);
    band.position.y = 0.02;
    collar.position.y = 0.071;
    nib.position.y = 0.083;
    this.tipModel.add(body, band, collar, nib, penGrip());
    this.sway.add(this.tipModel);
    this.model.add(this.sway);
  }

  update(dt: number, input: Input, camera: THREE.Camera, eye: THREE.Vector3, active: boolean, color: PaintColor) {
    this.model.visible = active;
    setHex(this.bandMat.color, COLORS[color]);
    setHex(this.nibMat.color, COLORS[color]);
    const drawing = active && input.lmb && input.locked;
    this.pose(camera, drawing);
    if (!drawing) {
      this.stroke.lift();
      this.audio.setScribble(0);
      return;
    }
    // Every stamp may feed a run while moving (overlap depends on the path, not the frame rate).
    let drew = false;
    const { angle } = this.stroke.sweep(dt, camera, eye, this.spec(), (hit, surface, fresh) => {
      if (!surface) return;
      this.paint.stamp(surface, hit.uv!, hit.faceIndex!, MARKER.radius, MARKER.strength, rgbOf(color), 0, fresh ? MARKER.drips : 0, true);
      drew = true;
    });
    this.audio.setScribble(drew ? Math.min(1, 0.15 + angle * 40) : 0);
  }

  private spec() {
    return { reach: MARKER.reach, rayStep: RAY_STEP, maxRays: 32, stillRate: STILL_DRIP_RATE };
  }

  /** A point just right of the marker, for the color tag (same place as the can's). */
  labelAnchor(out: THREE.Vector3) {
    this.model.updateMatrixWorld();
    return this.tipModel.localToWorld(out.set(0.05, 0.02, 0));
  }

  pose(camera: THREE.Camera, drawing: boolean) {
    this.model.position.copy(camera.position);
    this.model.quaternion.copy(camera.quaternion);
    // Held like a pen at HOLD.marker; pushed forward (and a little up) while drawing.
    const h = HOLD.marker;
    const d = h.distance;
    this.tipModel.position.set(h.x * d, (h.y + (drawing ? 0.053 : 0)) * d, -d - (drawing ? 0.04 : 0));
    this.tipModel.rotation.set(h.pitch, h.yaw, h.roll);
    this.tipModel.scale.setScalar(h.scale);
  }
}

/**
 * Gloved hand holding the marker like a pen, in the marker's space (pen along
 * +y, nib up): curled fingers as one block beside the pen, index finger and
 * thumb pinching it near the nib, then cuff and sleeve. Simpler than the can hand.
 */
function penGrip() {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const g = new THREE.Group();
  const fist = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.07, 0.055), glove);
  fist.position.set(0.032, -0.03, 0.006);
  g.add(
    fist,
    segment(V(0.026, 0.004, -0.012), V(0.012, 0.03, -0.012), 0.016, glove), // index, knuckle to middle joint
    segment(V(0.012, 0.03, -0.012), V(0.0, 0.045, -0.008), 0.015, glove), // index tip on the pen
    segment(V(0.02, -0.02, 0.026), V(0.004, 0.028, 0.012), 0.018, glove), // thumb
    segment(V(0.04, -0.065, 0.01), V(0.06, -0.13, 0.03), 0.046, glove), // cuff
    segment(V(0.06, -0.13, 0.03), V(0.1, -0.38, 0.12), 0.07, sleeve),
  );
  return g;
}
