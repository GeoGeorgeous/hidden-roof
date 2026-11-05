import { DRIPS } from './config';
import { paintRandom } from './lcg';

// Wet paint: what may start a paint run. Paint landing on opaque paint is wet,
// and each texel keeps when its wet paint is dry: one number, so nothing runs
// per frame. Past DRIPS.passes a texel rolls the dice for its spot (a square of
// DRIPS.spot), by the rule of the tool that painted it. Pure numbers, so Node
// tests it (scripts/paint-wet.test.mjs).

/** How a tool's wet paint runs. */
export interface RunRule {
  /** The odds that a spot all past the build-up starts a run (0..1). */
  chance: number;
  /** Passes a failed roll takes off the texel. Infinity: all it holds. */
  miss: number;
  /** How long a spot rests after a run (s). 0: it doesn't, and keeps no paint. */
  rest: number;
  /** The passes a spot keeps, on average over it, that make it as likely and its runs as long as it gets. 0: the dice alone say how long. */
  full: number;
}

/** Where a face starts in its atlas: spots are counted from there. */
export type FaceOrigin = { x: number; y: number };

/** A square of wall, by the paint clock (WetPaint.now). */
interface Spot {
  /** It starts no run until then. */
  rest: number;
  /** When the paint it keeps, past what its texels hold, is dry. */
  kept: number;
}

/** What wet paint needs of a surface. */
export interface WetSurface {
  geo: { atlasW: number; atlasH: number; texelsPerMeter: number };
  /** Per texel, the paint clock time (WetPaint.now) at which its wet paint on already-opaque paint is dry (created on first wet paint). */
  wet: Float32Array | null;
  /** The spots that ran or keep paint, by their first texel (created on first use). */
  spots: Map<number, Spot> | null;
}

/** The can's rule: a failed roll leaves the paint there, a spot rests after a run, the longer the less likely it runs. */
export const canRule = (chance: number): RunRule => ({ chance, miss: DRIPS.miss, rest: chance > 0 ? DRIPS.rest / chance : 0, full: DRIPS.full });

/** The marker's and the roller's rule: each roll takes all the paint there, a run's length is the dice's. */
export const toolRule = (chance: number): RunRule => ({ chance, miss: Infinity, rest: 0, full: 0 });

export class WetPaint {
  /** The paint clock (s), advanced by the game's frame time (PaintSystem.tick): wet paint dries by it. */
  now = 0;
  /** Dice rolled and runs started so far (F3). */
  rolls = 0;
  runs = 0;

  /** `amt` coats more on opaque texel (x, y) of `face`. Returns how long a run starting here is (0..1 of DRIPS' lengths); null: none starts. */
  add(s: WetSurface, face: FaceOrigin, x: number, y: number, amt: number, rule: RunRule) {
    const wet = (s.wet ??= new Float32Array(s.geo.atlasW * s.geo.atlasH));
    const k = y * s.geo.atlasW + x;
    const until = Math.max(wet[k], this.now) + (amt / DRIPS.passCoats) * DRIPS.dryTime;
    const need = DRIPS.passes * DRIPS.dryTime;
    if (until - this.now < need) {
      wet[k] = until;
      return null;
    }
    const spot = rule.rest > 0 ? this.spot(s, face, x, y) : null;
    if (spot && this.now < spot.rest) {
      wet[k] = this.now + need;
      this.keep(s, spot, until - wet[k]);
      return null;
    }
    this.rolls++;
    const fill = spot && rule.full ? Math.min(1, Math.max(0, spot.kept - this.now) / (rule.full * DRIPS.dryTime * DRIPS.keptDry)) : 0;
    const size = DRIPS.spot * s.geo.texelsPerMeter;
    if (paintRandom.drips() >= (rule.chance * (1 + fill * DRIPS.fullOdds)) / size ** 2) {
      wet[k] = Math.max(this.now, until - rule.miss * DRIPS.dryTime);
      if (spot) this.keep(s, spot, until - wet[k]);
      return null;
    }
    this.runs++;
    wet[k] = this.now;
    const luck = paintRandom.drips();
    if (!spot) return luck;
    spot.rest = this.now + rule.rest;
    spot.kept = this.now;
    return rule.full ? luck * DRIPS.lengthLuck + fill * (1 - DRIPS.lengthLuck) : luck;
  }

  /** The spot of a texel: a face's squares start at its corner, so one never holds two faces, whatever lies beside it in the atlas. */
  private spot(s: WetSurface, face: FaceOrigin, x: number, y: number) {
    const size = DRIPS.spot * s.geo.texelsPerMeter;
    const spots = (s.spots ??= new Map());
    const first = (at: number, from: number) => from + Math.floor(Math.floor((at - from) / size) * size);
    const key = first(y, face.y) * s.geo.atlasW + first(x, face.x);
    let spot = spots.get(key);
    if (!spot) spots.set(key, (spot = { rest: 0, kept: 0 }));
    return spot;
  }

  /** `seconds` of a texel's paint (at DRIPS.dryTime a pass) go to its spot, spread over it, where they dry slower. */
  private keep(s: WetSurface, spot: Spot, seconds: number) {
    spot.kept = Math.max(spot.kept, this.now) + (seconds * DRIPS.keptDry) / (DRIPS.spot * s.geo.texelsPerMeter) ** 2;
  }
}
