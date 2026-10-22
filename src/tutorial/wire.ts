import * as THREE from 'three';
import { BINDINGS, PLAYER, PRESSURE, TUTORIAL } from '../config';
import type { Action, Input } from '../input';
import type { Inventory } from '../inventory/inventory';
import { SLOTS } from '../inventory/tool';
import type { Ladder, Player } from '../player';
import type { Tutorial } from './tutorial';
import type { Snapshot } from './types';

// What the game tells the tutorial each frame (types.ts): the player's walking, running, jumping and climbing as
// facts, and how things are as a snapshot. The tools and pickups send their own facts straight to `tutorial.fact`.

const middle = new THREE.Vector3();
const ACTIONS = Object.keys(BINDINGS) as Action[];

export class TutorialWire {
  private stride: number;
  private feetY: number;
  /** Standing on the floor when the frame began: a jump key press then is a jump. */
  private grounded = false;

  constructor(
    private tutorial: Tutorial,
    private player: Player,
    private inventory: Inventory,
    private ladders: readonly Ladder[],
  ) {
    this.stride = player.stride;
    this.feetY = player.position.y;
  }

  /** Before the player moves. */
  before() {
    this.grounded = this.player.onGround && !this.player.onLadder;
  }

  /** After the player and the tools did this frame. `input`: the player's (nothing while paused). `visible`: play is on screen. */
  frame(dt: number, visible: boolean, input: Input) {
    const { player, tutorial } = this;
    const moved = player.stride - this.stride;
    this.stride = player.stride;
    if (moved > 0) tutorial.fact({ type: 'moved', meters: moved });
    if (player.sprinting) tutorial.fact({ type: 'sprinted', seconds: dt });
    if (this.grounded && input.justPressed('jump') && player.velocity.y > 0) tutorial.fact({ type: 'jumped' });
    const rose = player.position.y - this.feetY;
    this.feetY = player.position.y;
    if (player.onLadder && rose > 0) tutorial.fact({ type: 'climbed', meters: rose });
    for (const action of ACTIONS) if (input.justPressed(action)) tutorial.fact({ type: 'pressed', action });
    tutorial.setEnabled(TUTORIAL.enabled);
    tutorial.update(dt, visible, this.snapshot());
  }

  private snapshot(): Snapshot {
    const { player, inventory } = this;
    middle.copy(player.position).y += PLAYER.height / 2;
    return {
      tool: inventory.tool,
      lowPressure: inventory.pressure < PRESSURE.sputterThreshold,
      tools: SLOTS.filter((t) => inventory.has(t)),
      colors: inventory.colors.length,
      caps: inventory.caps.length,
      nearLadder: !player.onLadder && this.ladders.some((l) => l.volume.distanceToPoint(middle) <= TUTORIAL.ladderRadius),
      onLadder: player.onLadder,
    };
  }
}
