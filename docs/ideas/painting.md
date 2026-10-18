# Painting: drips, caps, tank roofs

Reworking the painting: BL-015 first, BL-016 after it; BL-017 and BL-106 are independent.

## BL-015 Rework the drips: independent chance, no stacking across tools

The drip settings are not obvious: `chance` seems to be moved by the paint's density and other parameters (`DRIPS` and each tool's and cap's `drips`, `src/config.ts`). Make each setting do one thing, so tuning is predictable. Includes the core bug (was BL-008): roll a first coat, then spray on it, and the drips get stronger when they shouldn't; check how the excess paint (`DRIPS`) adds up across tools. Reproduce it with a test first. Part of reworking the painting.

## BL-016 Tune drips per tool by hand; remove the strong ones

Blocked by: BL-015; Status: Blocked, priority High, size M

Drips are too strong in general. Tune them for each tool (caps, marker, roller) by hand, by eye, after the config is clear. Maybe a cooldown on the paint (an open question).

## BL-017 Tune the caps so painting feels better

Adjust the can caps (`spread`, `rate`, `strength`, `dotSize`, `softness`) until painting feels right. Compare with Bombing!! 2.

## BL-106 Water tank roofs can't be painted

The cone roofs of the water tank and the tanks on stands (`p.cone`, `src/kit/equipment.ts`, `src/kit/steel.ts`) have no paint option or mapping; the paintable flat top sits hidden inside. Do: a cone paint mapping, checked against saves and page counts.
