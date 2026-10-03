import * as THREE from 'three';
import type { Audio } from '../audio';
import type { Input } from '../input';
import { SLOTS, type Inventory } from '../inventory/inventory';
import type { PaintSystem } from '../painting';
import { SprayTool } from '../spray/spray-tool';
import { MarkerTool } from './marker';
import { ViewSway, type Motion } from './view-sway';

// Routes input to the tool in hand: 1 = can, 2 = marker, Q/E = color,
// mouse wheel = cap.

export class Tools {
  readonly spray: SprayTool;
  readonly marker: MarkerTool;
  private sway = new ViewSway();

  constructor(
    scene: THREE.Scene,
    viewScene: THREE.Scene,
    paint: PaintSystem,
    solids: THREE.Mesh[],
    private audio: Audio,
    private inventory: Inventory,
  ) {
    this.spray = new SprayTool(scene, paint, solids, audio);
    this.marker = new MarkerTool(paint, solids, audio);
    viewScene.add(this.spray.model.group, this.marker.model);
  }

  /** `enabled` is false in build mode: tools are put away but particles finish flying. */
  update(dt: number, input: Input, camera: THREE.Camera, eye: THREE.Vector3, motion: Motion, enabled: boolean) {
    const inv = this.inventory;
    this.sway.update(dt, input.mouseDX, input.mouseDY, motion, this.spray.model.sway);
    this.marker.sway.position.copy(this.spray.model.sway.position);
    this.marker.sway.rotation.copy(this.spray.model.sway.rotation);
    if (enabled) {
      SLOTS.forEach((_, i) => input.wasPressed(`Digit${i + 1}`) && inv.select(i));
      const dc = (input.wasPressed('KeyE') ? 1 : 0) - (input.wasPressed('KeyQ') ? 1 : 0);
      if (dc && inv.cycleColor(dc)) this.audio.click();
      if (input.wasPressed('Digit1') || input.wasPressed('Digit2')) this.audio.click();
      if (input.wheelSteps !== 0 && inv.cycleCap(Math.sign(input.wheelSteps))) this.audio.click();
    }
    const tool = enabled ? inv.tool : null;
    this.spray.update(dt, input, camera, eye, tool === 'can' ? inv : null);
    this.marker.update(input, camera, eye, tool === 'marker', inv.color);
  }
}
