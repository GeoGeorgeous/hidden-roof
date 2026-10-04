import * as THREE from 'three';
import type { Audio } from '../audio';
import { CAPS, type PaintColor } from '../config';
import type { Input } from '../input';
import { SLOTS, type Inventory, type Tool } from '../inventory/inventory';
import type { PaintSystem } from '../painting';
import { SprayTool } from '../spray/spray-tool';
import { LadderTool } from './ladder-tool';
import { MarkerTool } from './marker';
import { RollerTool } from './roller';
import { BrushTool } from './brush';
import type { Level } from '../level/level';
import { ViewSway, type Motion } from './view-sway';

// Routes input to the tool in hand: 1 = can, 2 = marker, 3 = stepladder, 4 =
// roller, 5 = scrub brush, Q/E = color (can, marker, roller), mouse wheel = cap (can), nib size
// (marker) or turning the ladder. Owns the UI the tools share: it
// reports color / cap changes (and which ones apply when switching tools) and
// where the tags go next to whichever tool is in hand.

export class Tools {
  readonly spray: SprayTool;
  readonly marker: MarkerTool;
  readonly ladder: LadderTool;
  readonly roller: RollerTool;
  readonly brush: BrushTool;
  private sway = new ViewSway();
  /** Called with the color when it changes or another tool comes out. */
  onColorChange: (color: PaintColor) => void = () => {};
  /** Called when the mouse wheel changes the marker's nib size. */
  onNibChange: () => void = () => {};
  /** Called with the cap name when it changes or the can comes out. */
  onCapChange: (name: string) => void = () => {};
  private last: { tool: Tool | null; color: string; cap: string } | null = null;

  constructor(
    scene: THREE.Scene,
    viewScene: THREE.Scene,
    paint: PaintSystem,
    solids: THREE.Mesh[],
    private audio: Audio,
    private inventory: Inventory,
    level: Level,
  ) {
    this.spray = new SprayTool(scene, paint, solids, audio);
    this.marker = new MarkerTool(paint, solids, audio);
    this.ladder = new LadderTool(scene, level);
    this.roller = new RollerTool(paint, solids, audio);
    this.brush = new BrushTool(paint, solids, audio);
    viewScene.add(this.spray.model.group, this.marker.model, this.ladder.model.group, this.roller.model.group, this.brush.model.group);
  }

  /** `enabled` is false in build mode: tools are put away but particles finish flying. */
  update(dt: number, input: Input, camera: THREE.Camera, eye: THREE.Vector3, motion: Motion & { position: THREE.Vector3 }, enabled: boolean) {
    const inv = this.inventory;
    this.sway.update(dt, input.mouseDX, input.mouseDY, motion, this.spray.model.sway);
    this.marker.sway.position.copy(this.spray.model.sway.position);
    this.marker.sway.rotation.copy(this.spray.model.sway.rotation);
    this.ladder.model.sway.position.copy(this.spray.model.sway.position);
    this.ladder.model.sway.rotation.copy(this.spray.model.sway.rotation);
    this.roller.sway.position.copy(this.spray.model.sway.position);
    this.roller.sway.rotation.copy(this.spray.model.sway.rotation);
    this.brush.sway.position.copy(this.spray.model.sway.position);
    this.brush.sway.rotation.copy(this.spray.model.sway.rotation);
    if (enabled) {
      SLOTS.forEach((_, i) => input.wasPressed(`Digit${i + 1}`) && inv.select(i));
      const dc = (input.wasPressed('KeyE') ? 1 : 0) - (input.wasPressed('KeyQ') ? 1 : 0);
      if (dc && inv.cycleColor(dc)) this.audio.click();
      if (SLOTS.some((_, i) => input.wasPressed(`Digit${i + 1}`))) this.audio.click();
      if (input.wheelSteps !== 0 && inv.tool === 'can' && inv.cycleCap(Math.sign(input.wheelSteps))) this.audio.click();
      if (input.wheelSteps !== 0 && inv.tool === 'marker' && this.marker.resize(-Math.sign(input.wheelSteps))) {
        this.audio.click();
        this.onNibChange();
      }
    }
    const tool = enabled ? inv.tool : null;
    this.reportChanges(tool);
    this.spray.update(dt, input, camera, eye, tool === 'can' ? inv : null);
    this.marker.update(dt, input, camera, eye, tool === 'marker', inv.color);
    this.ladder.update(input, camera, motion.position, tool === 'ladder');
    // After the marker: they share the scribble sound, and these only touch it while in hand or just put away.
    this.roller.update(dt, input, camera, eye, tool === 'roller', inv.color);
    this.brush.update(dt, input, camera, eye, tool === 'brush');
  }

  /** Paused (F3 open, pointer free): keeps posing the tool in hand at rest, so HOLD tuning shows live. */
  holdStill(camera: THREE.Camera) {
    const tool = this.last?.tool;
    if (tool === 'can') this.spray.model.update(0, camera, false, false, -1);
    else if (tool === 'marker') this.marker.pose(camera, false);
    else if (tool === 'ladder') this.ladder.model.update(camera, true);
    else if (tool === 'roller') this.roller.model.update(0, camera, true, this.inventory.color, false, 0);
    else if (tool === 'brush') this.brush.model.update(0, camera, true, false);
  }

  /** Screen anchor for the color / cap tags next to the tool in hand, or null with no tool. */
  labelAnchor(out: THREE.Vector3): THREE.Vector3 | null {
    const tool = this.last?.tool;
    if (tool === 'can') return this.spray.model.labelAnchor(out);
    if (tool === 'marker') return this.marker.labelAnchor(out);
    if (tool === 'roller') return this.roller.model.labelAnchor(out);
    return null;
  }

  private reportChanges(tool: Tool | null) {
    const inv = this.inventory;
    const prev = this.last;
    this.last = { tool, color: inv.color, cap: inv.cap };
    if (!prev || !tool) return;
    const switched = !!prev.tool && tool !== prev.tool;
    if (switched || inv.color !== prev.color) this.onColorChange(inv.color);
    if (tool === 'can' && (switched || inv.cap !== prev.cap)) this.onCapChange(CAPS[inv.cap].name);
  }
}
