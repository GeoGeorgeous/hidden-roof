import { AUDIO } from './config';

// Sounds that are recordings, looped (docs/sound.md). They're fetched when first
// heard, not with the game: each weighs more than all the rest.

export const CITY = new URL('./assets/city-night.ogg', import.meta.url).href;
export const RAIN = new URL('./assets/rain-night.ogg', import.meta.url).href;
export const STORM = new URL('./assets/storm.ogg', import.meta.url).href;
export const RAIN_INDOORS = new URL('./assets/rain-indoors.ogg', import.meta.url).href;
export const THUNDERS = [
  new URL('./assets/thunder-1.ogg', import.meta.url).href,
  new URL('./assets/thunder-2.ogg', import.meta.url).href,
  new URL('./assets/thunder-3.ogg', import.meta.url).href,
];

/** A file's bytes, asked for again if the request drops; null if it never comes. */
async function download(file: string) {
  for (let left = AUDIO.recordingTries; left > 0; left--) {
    try {
      const res = await fetch(file);
      if (res.ok) return await res.arrayBuffer();
    } catch {
      // The next try, if there's one.
    }
    if (left > 1) await new Promise((done) => setTimeout(done, AUDIO.recordingRetry * 1000));
  }
  return null;
}

/** A recording, decoded; null if it can't be: that sound is silent then, and the game goes on. What a browser can't decode isn't asked for again. */
export async function loadRecording(ctx: AudioContext, file: string) {
  const bytes = await download(file);
  try {
    return bytes && (await ctx.decodeAudioData(bytes));
  } catch {
    return null;
  }
}

/** Plays a recording into `out` from a random place, fading in. False if it can't. */
export async function playLoop(ctx: AudioContext, file: string, out: AudioNode) {
  const buffer = await loadRecording(ctx, file);
  if (!buffer) return false;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const fade = ctx.createGain();
  fade.gain.setValueAtTime(0, ctx.currentTime);
  fade.gain.linearRampToValueAtTime(1, ctx.currentTime + AUDIO.recordingFade);
  src.connect(fade).connect(out);
  src.start(0, Math.random() * buffer.duration);
  return true;
}
