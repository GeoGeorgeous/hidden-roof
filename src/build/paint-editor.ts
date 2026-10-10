import * as THREE from 'three';
import { HINT, PAINT, TAG_FONTS, type PaintColor } from '../config';
import { download } from '../files';
import type { Input } from '../input';
import { rgbOf } from '../inventory/items';
import type { Level } from '../level/level';
import { solidsNear } from '../level/solids';
import { shared } from '../materials';
import { edge, type PaintImage } from '../paint-image';
import type { PaintSurface, PaintSystem } from '../painting';
import { savePaint } from '../save/save-paint';
import { facePoint, type FacePoint } from '../surfaces';
import { PaintedSpots } from './painted-spots';
import { hintFontReady, hintImage } from './stencil-text';

// Build mode's paint, which P saves with the level as its own (save/level-paint.ts):
// hints painted onto walls with the Hint entry of the picker (LEVEL): Enter
// types the text (<k>KEY</k> for a key cap), [ ] sets its size, T its font,
// Tab its color, LMB paints it where the preview shows; X wipes the paint off the
// face under the crosshair; H shows the paintable surfaces striped, then the
// painted spots through walls (painted-spots.ts).

/** What H shows: nothing, paintable surfaces striped, or the painted spots. */
type View = 'off' | 'paintable' | 'painted';

/** The paint surface under the crosshair, and which way a hint stands on it. */
interface Aim {
  surface: PaintSurface;
  at: FacePoint;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
}

const UP = new THREE.Vector3(0, 1, 0);
/** How far the preview floats off the wall, so it isn't lost in the face (m). */
const LIFT = 0.01;

export class PaintEditor {
  private text = '';
  private size = HINT.size;
  private font = HINT.font;
  private view: View = 'off';
  private spots: PaintedSpots;
  /** Surfaces and how many hold paint when the spots were last drawn: they're drawn again when that changes (a prop rebuilt). */
  private seen = '';
  private preview: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private previewKey = '';
  private image: PaintImage | null = null;
  private raycaster = new THREE.Raycaster();
  private near: THREE.Object3D[] = [];

  constructor(
    scene: THREE.Scene,
    private level: Level,
    private paint: PaintSystem,
    private say: (m: string) => void,
  ) {
    this.spots = new PaintedSpots(scene);
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
    this.preview = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    this.preview.renderOrder = 10;
    this.preview.visible = false;
    scene.add(this.preview);
    // Only build mode draws in the font: players never load it for this.
    void hintFontReady().then(() => (this.previewKey = ''));
  }

  set visible(on: boolean) {
    if (!on) {
      this.preview.visible = false;
      this.spots.visible = false;
      shared.uShowPaintable.value = 0;
      this.view = 'off';
    }
  }

  /** BUILD.spot* changed (F3). */
  syncLook() {
    this.spots.syncLook();
  }

  /** Every frame in build mode: H and X, and with the Hint entry selected (`hint`: its color) its keys and preview. */
  update(input: Input, camera: THREE.Camera, hint: PaintColor | null) {
    if (input.wasPressed('KeyH')) this.cycleView();
    const aim = hint || input.wasPressed('KeyX') ? this.aim(camera) : null;
    if (input.wasPressed('KeyX')) this.wipe(aim);
    if (this.view === 'painted') this.refreshSpots();
    this.preview.visible = false;
    if (!hint) return;
    if (input.wasPressed('Enter') || input.wasPressed('NumpadEnter')) this.editText();
    const dir = (input.wasTyped('BracketRight') ? 1 : 0) - (input.wasTyped('BracketLeft') ? 1 : 0);
    if (dir) {
      this.size = Math.min(HINT.maxSize, Math.max(HINT.minSize, +(this.size + dir * HINT.sizeStep).toFixed(3)));
      this.say(`HINT SIZE ${this.size.toFixed(2)} M`);
    }
    if (input.wasPressed('KeyT')) {
      const back = input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? -1 : 1;
      this.font = TAG_FONTS[(TAG_FONTS.indexOf(this.font) + back + TAG_FONTS.length) % TAG_FONTS.length];
      this.say(`HINT FONT ${this.font.toUpperCase()}`);
    }
    if (aim) this.showPreview(aim, hint);
  }

  /** LMB with the Hint entry selected: the hint on the wall under the crosshair. */
  stamp(color: PaintColor, camera: THREE.Camera) {
    if (!this.text) return this.editText();
    const aim = this.aim(camera);
    const img = hintImage(this.text, this.font, this.size, PAINT.texelsPerMeter * HINT.supersample);
    if (!aim || !img) return this.say('AIM AT A PAINTABLE SURFACE');
    if (!this.paint.imprint(aim.surface, aim.at, img, aim.right, aim.up, rgbOf(color))) return this.say('HINTS GO ON FLAT FACES');
    if (this.view === 'painted') this.refreshSpots(true);
    this.say('HINT PAINTED · X WIPES THE FACE');
  }

  /** P: all paint on the walls as the level's own, `<name>.rhhpaint`. What it saved, for the status line; null without paint. */
  async save(name: string) {
    if (!this.paint.surfaces.some((s) => s.data)) return null;
    download(new Blob([(await savePaint(this.paint, { name })) as BlobPart]), `${name}.rhhpaint`);
    const blurry = PAINT.texelsPerMeter < HINT.detail ? ` · AT PAINT DETAIL ${PAINT.texelsPerMeter}: ULTRA KEEPS HINTS SHARP` : '';
    return `${name}.rhhpaint${blurry}`;
  }

  private cycleView() {
    this.view = this.view === 'off' ? 'paintable' : this.view === 'paintable' ? 'painted' : 'off';
    shared.uShowPaintable.value = this.view === 'paintable' ? 1 : 0;
    this.spots.visible = false;
    this.seen = '';
    if (this.view === 'painted') this.refreshSpots();
    this.say(this.view === 'paintable' ? 'PAINTABLE SURFACES: STRIPED' : this.view === 'painted' ? `PAINTED FACES: ${this.spots.count} (WHAT P SAVES)` : 'PAINT VIEW OFF');
  }

  /** The spots drawn again when surfaces came or went, or took paint or lost it (or `force`: paint changed). */
  private refreshSpots(force = false) {
    const seen = `${this.paint.surfaces.length}|${this.paint.surfaces.filter((s) => s.data).length}`;
    if (seen === this.seen && !force) return;
    this.seen = seen;
    this.spots.show(this.paint);
  }

  private wipe(aim: Aim | null) {
    if (!aim) return this.say('AIM AT A PAINTED SURFACE');
    this.paint.wipe(aim.surface, aim.at.rect);
    if (this.view === 'painted') this.refreshSpots(true);
    this.say('FACE WIPED');
  }

  private editText() {
    const typed = window.prompt('Hint text (<k>KEY</k> for a key cap)', this.text || '<k>LMB</k> Spray');
    if (typed === null) return;
    this.text = typed.trim();
    this.say(`HINT: ${this.text || 'NONE'} — CLICK TO RESUME`);
  }

  /** The paint surface under the crosshair, within reach. */
  private aim(camera: THREE.Camera): Aim | null {
    camera.getWorldDirection(this.raycaster.ray.direction);
    this.raycaster.ray.origin.copy(camera.position);
    this.raycaster.far = HINT.reach;
    const hit = this.raycaster.intersectObjects(solidsNear(this.level.solids, camera.position, HINT.reach, this.near), false)[0];
    const surface = hit && this.paint.get(hit.object);
    if (!surface) return null;
    const at = facePoint(surface.geo, hit.faceIndex!, hit.uv!, { rect: 0, u: 0, v: 0 });
    const normal = surface.geo.rects[at.rect].face?.normal.clone().normalize() ?? hit.face!.normal.clone();
    // Upright on a wall; on a floor or a ceiling, its top away from you.
    const up = UP.clone().projectOnPlane(normal);
    if (up.lengthSq() < 0.01) up.copy(this.raycaster.ray.direction).projectOnPlane(normal);
    up.normalize();
    return { surface, at, point: hit.point, normal, right: new THREE.Vector3().crossVectors(up, normal), up };
  }

  private showPreview(aim: Aim, color: PaintColor) {
    // The font's look too: F3 changes it.
    const key = `${this.text}|${this.font}|${JSON.stringify(HINT.looks[this.font])}|${this.size}|${color}|${PAINT.texelsPerMeter}`;
    if (key !== this.previewKey) {
      this.previewKey = key;
      this.image = this.text ? hintImage(this.text, this.font, this.size, PAINT.texelsPerMeter * HINT.supersample) : null;
      this.preview.material.map?.dispose();
      this.preview.material.map = this.image && previewTexture(this.image, color);
      this.preview.material.needsUpdate = true;
    }
    if (!this.image) return;
    const m = new THREE.Matrix4().makeBasis(aim.right, aim.up, aim.normal);
    this.preview.quaternion.setFromRotationMatrix(m);
    this.preview.position.copy(aim.point).addScaledVector(aim.normal, LIFT);
    this.preview.scale.set(this.image.width, this.image.height, 1);
    this.preview.visible = true;
  }
}

/** The hint in its color, as a texture for the preview: in sharp pixels with its edge, as the paint shows. */
function previewTexture(img: PaintImage, color: PaintColor) {
  const [r, g, b] = rgbOf(color).map((c) => Math.round(c * 255));
  const data = new Uint8Array(img.w * img.h * 4);
  // Texture rows go bottom up.
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) data.set([r, g, b, 255 * edge(img.alpha[y * img.w + x] / 255, img.softness)], ((img.h - 1 - y) * img.w + x) * 4);
  const t = new THREE.DataTexture(data, img.w, img.h);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
