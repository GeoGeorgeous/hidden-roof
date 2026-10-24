import { FEEL } from '../sandbox/feel';
import { stepOpacity } from '../sandbox/panel';
import * as THREE from 'three';
import type { Audio } from '../audio';
import { CAPS, CROSSHAIR, type PaintColor } from '../config';
import type { Action, Input } from '../input';
import { SIZED, type Inventory, type SizedTool } from '../inventory/inventory';
import { SLOTS, type Tool } from '../inventory/tool';
import type { PaintSystem } from '../painting';
import { SprayTool } from '../spray/spray-tool';
import { LadderTool } from './ladder-tool';
import { Eyedropper } from './eyedropper';
import { MarkerTool } from './marker';
import { RollerTool } from './roller';
import { SpongeTool } from './sponge';
import type { Level } from '../level/level';
import { sizedCrosshair, stepSize } from './size-range';
import { ViewSway, type Motion } from './view-sway';
import type { AvatarAction } from '../avatar/pose';
import type { Fact } from '../tutorial/types';

const isSized = (t: Tool | null): t is SizedTool => t !== null && t in SIZED;
/** Tools the wheel and the eyedropper change the color of. */
const COLORED: Record<Tool, boolean> = { can: true, marker: true, ladder: false, roller: true, sponge: false };
/** What pressing LMB with each tool shows others (the can's shake is separate); the ladder has none. */
const PRESS: Record<Tool, AvatarAction> = { can: 'spray', marker: 'spray', ladder: null, roller: 'roll', sponge: 'scrub' };

// Routes input to the tool in hand: 1 = can, 2 = marker, 3 = stepladder, 4 =
// roller, 5 = sponge, mouse wheel = color (can, marker, roller) or turning the ladder, its click the eyedropper,
// Q/E = the can's cap or the width (marker, roller, sponge). Owns the UI the tools share: it
// reports color / cap changes (and which ones apply when switching tools) and
// where the tags go next to whichever tool is in hand.

export class Tools {
  readonly spray: SprayTool;
  readonly marker: MarkerTool;
  readonly ladder: LadderTool;
  readonly roller: RollerTool;
  readonly sponge: SpongeTool;
  private sway = new ViewSway();
  private eyedropper: Eyedropper;
  /** Called with the color when it changes or another tool comes out. */
  onColorChange: (color: PaintColor) => void = () => {};
  /** Called with the cap name when it changes or the can comes out. */
  onCapChange: (name: string) => void = () => {};
  /** Called with what the player did that a hint could be about (tutorial/wire.ts). */
  onFact: (fact: Fact) => void = () => {};
  /** What the marker, roller and sponge had drawn at the last frame (m). */
  private drawn = { marker: 0, roller: 0, sponge: 0 };
  private last: { tool: Tool | null; color: string; cap: string } | null = null;
  /** What the tool in hand is doing this frame, as others see it (net/snapshot.ts): pressing LMB with it, or shaking the can. */
  action: AvatarAction = null;

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
    this.sponge = new SpongeTool(paint, solids, audio);
    this.eyedropper = new Eyedropper(solids, paint);
    this.ladder.onPlaced = () => this.onFact({ type: 'used', tool: 'ladder', amount: 1 });
    viewScene.add(this.spray.model.group, this.marker.model, this.ladder.model.group, this.roller.model.group, this.sponge.model.group);
  }

  /** `enabled` is false in build mode: tools are put away but particles finish flying. */
  update(dt: number, input: Input, camera: THREE.Camera, eye: THREE.Vector3, motion: Motion & { position: THREE.Vector3; crouched: boolean }, enabled: boolean) {
    const inv = this.inventory;
    this.sway.update(dt, input.mouseDX, input.mouseDY, motion, this.spray.model.sway);
    this.marker.sway.position.copy(this.spray.model.sway.position);
    this.marker.sway.rotation.copy(this.spray.model.sway.rotation);
    this.ladder.model.sway.position.copy(this.spray.model.sway.position);
    this.ladder.model.sway.rotation.copy(this.spray.model.sway.rotation);
    this.roller.sway.position.copy(this.spray.model.sway.position);
    this.roller.sway.rotation.copy(this.spray.model.sway.rotation);
    this.sponge.sway.position.copy(this.spray.model.sway.position);
    this.sponge.sway.rotation.copy(this.spray.model.sway.rotation);
    if (enabled) {
      const slot = (i: number) => input.justPressed(`slot${i + 1}` as Action);
      SLOTS.forEach((_, i) => slot(i) && inv.select(i));
      if (SLOTS.some((_, i) => slot(i))) this.audio.click();
      const t = inv.tool;
      // Sandbox: Shift + wheel sets the can's opacity instead of the color.
      if (t === 'can' && FEEL.on && input.shiftDown() && input.wheelSteps) {
        stepOpacity(Math.sign(input.wheelSteps));
        input.wheelSteps = 0;
      }
      const wheel = input.step('prev', 'next');
      // Held, they keep stepping (the key's auto-repeat), as in build mode.
      const qe = input.step('sizeDown', 'sizeUp');
      const colored = t !== null && COLORED[t];
      if (wheel && colored && inv.cycleColor(wheel)) (this.audio.click(), this.onFact({ type: 'colorCycled' }));
      if (colored && input.justPressed('pick')) {
        const picked = this.eyedropper.pick(camera, eye, inv.colors);
        if (picked && inv.pickColor(picked)) (this.audio.click(), this.onFact({ type: 'colorPicked' }));
      }
      if (qe && t === 'can' && inv.cycleCap(qe)) (this.audio.click(), this.onFact({ type: 'capCycled' }));
      if (qe && isSized(t)) {
        const size = stepSize(SIZED[t], inv.size[t], qe);
        if (size !== inv.size[t]) (this.audio.click(), this.onFact({ type: 'sized', tool: t }));
        inv.size[t] = size;
      }
    }
    const tool = enabled ? inv.tool : null;
    this.reportChanges(tool);
    // The order is part of the op log: the marker silences the shared scribble channel before the roller and sponge use it, and the can's particles keep stamping while another tool is out.
    this.spray.update(dt, input, camera, eye, tool === 'can' ? inv : null);
    this.marker.update(dt, input, camera, eye, tool === 'marker', inv.color, inv.size.marker / 2);
    this.ladder.update(input, camera, motion.position, tool === 'ladder');
    // After the marker: they share the scribble sound, and these only touch it while in hand or just put away.
    this.roller.update(dt, input, camera, eye, tool === 'roller', inv.color, inv.size.roller);
    this.sponge.update(dt, input, camera, eye, tool === 'sponge', inv.size.sponge / 2);
    this.reportUse(dt, motion.crouched);
    this.action = tool === 'can' && this.spray.shaking ? 'shake' : tool && input.held('use') && input.locked ? PRESS[tool] : null;
  }

  /** Paused (F3 open, pointer free): keeps posing the tool in hand at rest, so HOLD tuning shows live. */
  holdStill(camera: THREE.Camera) {
    const tool = this.last?.tool;
    switch (tool) {
      case 'can': this.spray.model.update(0, camera, false, false, -1); break;
      case 'marker': this.marker.pose(camera, false); break;
      case 'ladder': this.ladder.model.update(camera, true); break;
      case 'roller': this.roller.model.update(0, camera, true, this.inventory.color, this.inventory.size.roller, false, 0); break;
      case 'sponge': this.sponge.model.update(0, camera, true, false); break;
      default: tool satisfies null | undefined;
    }
  }

  /** Crosshair size (px) for the tool in hand (null: none, or build mode). */
  crosshair(tool: Tool | null) {
    if (tool === 'can') return CAPS[this.inventory.cap].crosshair;
    return isSized(tool) ? sizedCrosshair(SIZED[tool], this.inventory.size[tool]) : CROSSHAIR.plain;
  }

  /** Screen anchor for the color / cap tags next to the tool in hand, or null with no tool. */
  labelAnchor(out: THREE.Vector3): THREE.Vector3 | null {
    const tool = this.last?.tool;
    switch (tool) {
      case 'can': return this.spray.model.labelAnchor(out);
      case 'marker': return this.marker.labelAnchor(out);
      case 'roller': return this.roller.model.labelAnchor(out);
      case 'ladder':
      case 'sponge':
      case null:
      case undefined: return null;
    }
  }

  /** Spray seconds and meters drawn this frame, as facts. */
  private reportUse(dt: number, crouched: boolean) {
    if (this.spray.flow > 0 && this.spray.landing) this.onFact({ type: 'used', tool: 'can', amount: dt });
    for (const tool of ['marker', 'roller', 'sponge'] as const) {
      const now = this[tool].distance;
      if (now > this.drawn[tool]) this.onFact({ type: 'used', tool, amount: now - this.drawn[tool], crouched });
      this.drawn[tool] = now;
    }
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
