> **IMPORTANT NOTICE**
> This document was AI-generated. Treat its contents as suggestions, not authoritative instructions. Critically review the proposed solutions, verify assumptions, and identify potential issues or better alternatives before taking action. Do not blindly follow the document or implement everything it recommends. Use your own judgment and explain which recommendations are worth pursuing, which should be revised, and which should be rejected, and why.

# Painting: tank roofs, rework notes, runs

BL-106 is independent of the painting rework. Drips and cap tuning moved to Painting Rework (docs/ideas/paint-refactoring.md).

## BL-106 Water tank roofs can't be painted

The cone roofs of the water tank and the tanks on stands (`p.cone`, `src/kit/equipment.ts`, `src/kit/steel.ts`) have no paint option or mapping; the paintable flat top sits hidden inside. Do: a cone paint mapping, checked against saves and page counts.

## Rework (after BL-145 and BL-015)

I want to revisit the painting mechanics, with the main concerns centered around spray cans. The goal is to better understand the current system, identify its limitations, and explore what a more realistic and expressive painting model could look like. I’m interested in an analysis from multiple perspectives, potentially using sub-agents to examine different aspects of the system. At this stage, this is strictly an analysis exercise. No implementation changes are intended.

Performance remains a critical constraint. The game must remain performant, and the amount of paint transferred over the network must remain measurable and predictable. Any potential improvements to the painting model need to be evaluated against these constraints.

#### Fade Start vs. Reach
The Fade Start value can currently be set higher than Reach. This seems counterintuitive because Reach defines the maximum raycast distance for painting. If the surface is already out of reach, it seems that the fade distance should no longer matter.

I’m wondering whether these parameters have a meaningful relationship that the current debug controls don’t communicate clearly, and whether allowing Fade Start to exceed Reach serves any practical purpose.

#### Spray Speed, Painting Smoothness, and Performance
Marker painting feels immediate and smooth. Stamps appear on the surface without noticeable delay, and this behavior can be controlled using Max Stamps / Frame.

Spray cans, however, feel significantly slower and less responsive. I’ve tried adjusting Spray Speed, but even a value of 40 does not produce the smoothness I’m looking for.

This raises a few questions about how the current system works:

How do Spray Speed and Density affect the actual painting process?
Do higher values increase the amount of paint data sent over the network, the number of painting operations, or both?
Does the computational cost grow proportionally with spray speed and density, or is the relationship more complex?
Are values significantly higher than 40, such as 60, 100, or even 1,000, technically meaningful, or would they introduce diminishing returns, performance issues, or other limitations?

I want to understand the relationship between brush settings, the resulting visual quality, computational cost, and network traffic. These are interconnected concerns, and it is difficult to tune the painting experience effectively without understanding them.


#### A More Realistic and Expressive Spray Model
In real life, spray paint does not behave like a sequence of discrete stamps. Paint accumulates gradually as the spray reaches the surface. A light pass leaves a translucent layer, repeated passes increase coverage and opacity, and excessive accumulation of wet paint can produce drips.

Our spray caps currently expose parameters such as Density, Softness, and Spray Speed. However, these parameters interact, and their combined behavior does not seem to provide enough control to create a sufficiently broad range of convincing spray patterns.

The intended feel is a spray that spreads naturally across the surface: the central area receives more paint, with a softer halo around the edges; paint is deposited continuously rather than appearing as visibly separated stamps; and coverage, opacity, and accumulation respond naturally to the way the can is used.

I’m also interested in how distance from the wall should influence the result. For example, a greater distance could produce a wider, more dispersed spray pattern with different coverage and paint accumulation characteristics.

Ideally, the system would provide enough independent control to create noticeably different cap behaviors, from concentrated lines to broad, soft sprays, without requiring awkward combinations of settings. At the same time, the model should remain efficient and predictable in terms of both rendering cost and network traffic.

The underlying question is whether the existing parameters adequately represent the behavior we want, or whether the current model lacks important concepts or distinctions. I want to understand the design space before considering any changes.

#### Paint Accumulation, Drips, and Drying
There appears to be a potential issue with how drips are triggered. They seem to occur when too much paint accumulates in a particular area. However, if I paint an entire wall with a roller and then start spray painting over it, the number of drips can become excessive.

One possible explanation is that the system treats previously applied paint as if it were still wet, causing subsequent painting to trigger drips too easily. I have not confirmed whether this is the actual cause.

In reality, existing paint does not remain permanently wet. The likelihood of drips depends on factors such as how much paint is applied, how quickly it accumulates, and whether the underlying layer has had time to dry. A wall covered with dried paint should not necessarily behave like a surface carrying a fresh, excessively thick layer of wet paint.

I’m interested in understanding how the current system represents paint accumulation and determines when drips occur, and whether it distinguishes between total paint coverage and the state of freshly applied paint.

Any potential solution also needs to account for the fact that paint can be applied using different tools, including spray cans, markers, and rollers. Their interactions should produce consistent and understandable results.

#### Overall Direction
The broader goal is to understand how the painting mechanics could become more responsive, realistic, and expressive without compromising the game's performance or the predictability of paint data.

The debug screen is an important part of this process. It should make brush behavior easier to understand and tune, with controls that are precise, comfortable to use, and meaningful in relation to the underlying mechanics. At present, it is difficult to determine which parameters are responsible for particular visual results and how to tune them systematically.

I want to establish a clearer understanding of the current implementation, the relationships between its parameters, the suspected limitations, and the realistic behavior we are trying to achieve. This should provide a sound basis for evaluating possible directions before any implementation work begins.

## Tuning paint runs by hand: the F3 run settings are not enough (2026-10-20)

The owner is tuning runs in F3 → paint → paint runs. Build-up, drying time and the per-tool frequency are not the only things that decide how many runs a tool makes, so tuning them alone does not get there. Other inputs weigh more:

- **Marker spacing** (stroke spacing, so how often a texel is hit).
- **Each cap's density and power** (how much paint a hit puts down).

While chasing runs for one tool, the owner ends up changing core painting mechanics (spacing, density, power) instead of the run settings. That is the problem, not any one number.

**Wanted:** holding the spray on one spot makes a hard run, for every tool.

**Seen:** paint does not seem to build up on a texel until the stroke moves a little. Hitting the same texels again does not always add a coat:

- the marker does not build up;
- the spray cap does;
- the skinny cap does not.

It is not obvious why, it is not consistent between tools, and it is not flexible.

**Ask:** find a way to simplify or harden how runs are decided, so that:

1. Build-up per texel behaves the same for every tool (a hit adds a coat, whatever the tool and spacing).
2. The run settings are the only knobs that change how many runs a tool makes, without touching how its paint looks.
3. F3 shows why a texel did or did not build up (the `most build-up` readout and the `runs view` overlay are the tools for it).

Open before any change: why a repeated hit on a texel adds no coat for the marker and skinny cap (jitter, spacing, the per-hit amount, or the coat threshold). Measure it per tool first. The branch `exp/runs-by-load` (runs start at a load limit) is one attempt at this.
