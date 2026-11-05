import { AUDIO } from './config';

// The city below: a night recorded on a roof, looped (docs/sound.md). It's fetched
// on the first gesture, not with the game: it weighs more than all the rest.

const FILE = new URL('./assets/city-night.ogg', import.meta.url).href;

/** Plays the recording into `out` from a random place, fading in. False if it can't: the city is silent then, and the game goes on. */
export async function playCity(ctx: AudioContext, out: AudioNode) {
  try {
    const res = await fetch(FILE);
    if (!res.ok) return false;
    const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const fade = ctx.createGain();
    fade.gain.setValueAtTime(0, ctx.currentTime);
    fade.gain.linearRampToValueAtTime(1, ctx.currentTime + AUDIO.ambienceFade);
    src.connect(fade).connect(out);
    src.start(0, Math.random() * buffer.duration);
    return true;
  } catch {
    return false;
  }
}
