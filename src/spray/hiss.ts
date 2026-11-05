import { MathUtils } from 'three';
import { BRUSH, HISS, SPRAY } from '../config';

/** How loud the can hisses for this hand, on top of its cap's volume: `distance` to what it sprays (m), `speed` of the hand (m/s). */
export function hissFollows(opacity: number, distance: number, speed: number) {
  const open = MathUtils.lerp(HISS.opacityLow, HISS.opacityHigh, opacity);
  const wall = MathUtils.lerp(HISS.near, HISS.far, MathUtils.clamp(distance / SPRAY.reach, 0, 1));
  const hand = MathUtils.lerp(1, HISS.moving, MathUtils.clamp(speed / BRUSH.speedRef, 0, 1));
  return open * wall * hand;
}
