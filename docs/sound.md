# Sound

All of the game's sound is synthesized in `src/audio.ts` but the city below (the City slider, `AUDIO.ambienceGain`), which is a recording: `src/assets/city-night.ogg`, played by `src/city-sound.ts`.

- **Source:** [180912 Night city rumble](https://freesound.org/people/TRP/sounds/572530/) by TRP, CC0, recorded on a roof in Toronto. Listed in Credits.
- **The cut:** from Freesound's HQ preview (Ogg Vorbis, about 150 kbit/s), not yet the FLAC original, which needs a login. 1 to 44 s and 76 s to the end, the loud knock between them left out, crossfaded over 4 s; the end crossfades into the start over 4 s, so the file loops with no seam. 2:37, Opus 96 kbit/s, 1.6 MB; about 60 MB as decoded audio.
- **Loading:** fetched on the first gesture, never with the game: it weighs more than the rest of the game together. It fades in over `AUDIO.ambienceFade`. If it can't load or decode, the city is silent and the game goes on.
- **Level:** left as recorded, so the slider's default sits within about 1 LU of the old synthesized rumble.

To cut it again:

```sh
ffmpeg -i source -filter_complex "[0:a]atrim=1:44,asetpts=PTS-STARTPTS[a];[0:a]atrim=76:198.5,asetpts=PTS-STARTPTS[b];[a][b]acrossfade=d=4:c1=qsin:c2=qsin[c]" -map '[c]' -c:a pcm_f32le spliced.wav
ffmpeg -i spliced.wav -filter_complex "[0:a]asplit[p][q];[p]atrim=4,asetpts=PTS-STARTPTS[body];[q]atrim=0:4,asetpts=PTS-STARTPTS[head];[body][head]acrossfade=d=4:c1=qsin:c2=qsin[o]" -map '[o]' -c:a pcm_f32le loop.wav
ffmpeg -i loop.wav -c:a libopus -b:a 96k -vbr on -application audio -map_metadata -1 src/assets/city-night.ogg
```
