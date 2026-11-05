# Sound

The game's sound is synthesized in `src/audio.ts`, but for the recordings played by `src/recordings.ts`: the city below (the City slider, `AUDIO.ambienceGain`), the rain (Rain, `AUDIO.rainGain`), the far rumble of heavy rain under it, indoors too (Storm, `AUDIO.stormGain`), the rain indoors (Rain indoors, `AUDIO.indoorRainGain`) and thunder (Thunder, `AUDIO.thunderGain`).

- **Loading:** a recording is fetched when first heard: the city on the first gesture, the rain, the storm and thunder with it when it's raining, as it is by default, or the first time it rains, the one indoors the first time you're in a room in the rain, never with the game: each weighs more than the rest of the game. A loop fades in over `AUDIO.recordingFade`. If one can't load or decode, that sound is silent and the game goes on.
- **The rain's level:** `ATMOS.rainDensity` is set, not weather, so the recordings don't change with it; density only scales their volume.
- **Thunder:** lightning asks for it after `THUNDER.minDelay` to `maxDelay`, so the flash comes first; one of three rolls, never the same twice running, softer and duller the farther the strike. Rolls are out of the storm's loop, or they'd come with no flash and at the same place each time.
- **Rooms:** the level has no rooms, and its shapes don't tell a room from a canopy (a roof over you by the heightmap, and big slabs only, were both tried), so `src/interiors.ts` holds cells marked by hand on the level's grid: `INTERIORS.cell` wide, each with its floors in whole meters (a step up is still the floor it's on), indoors up to `INTERIORS.height`, a storey, over a floor, or less where something starts over a head (`INTERIORS.headroom`) in the cell. The player's feet are what's in a room, the free camera's view when filming. In one the city is duller and quieter (`indoorCity`, `indoorTone`) and the rain changes to the one indoors, over `indoorFade`; the storm stays as it is, thunder is muffled with the city.
- **Where they live:** in the level file, `interiors`, `[cell x, floor height, cell z]` each, with how high it reaches last when that's less than a storey; they ride along with the level into a session like pickups. Cells don't follow props: move a room in build mode and its cells stay.
- **Marking them:** dev tools only, both switches off to start, in F3 → Sound → Indoors (`src/dev/interior-marks.ts`). Mark rooms: hold I to mark the cell you're on, U to take off the mark you're on. Show rooms: a sheet at your feet shows the grid, your cell and what's marked where you stand. A mark's height is worked out when it's made, from the colliders, so a pipe over another stays out of the room, and a thing on the floor, under `headroom`, is no ceiling; a low beam cuts a cell short. A mark from before heights is a full storey: U and I on it again. It holds until a reload: SAVE LEVEL downloads the level with them, P in build mode too, and P is the one for a level with its own wall paint.
- **Memory:** all of it decoded is about 175 MB.

## The city: `src/assets/city-night.ogg`

- **Source:** [180912 Night city rumble](https://freesound.org/people/TRP/sounds/572530/) by TRP, CC0, recorded on a roof in Toronto. Listed in Credits.
- **The cut:** from Freesound's HQ preview (Ogg Vorbis, about 150 kbit/s), not yet the FLAC original, which needs a login. 1 to 44 s and 76 s to the end, the loud knock between them left out, crossfaded over 4 s; the end crossfades into the start over 4 s, so the file loops with no seam. 2:37, Opus 96 kbit/s, 1.6 MB; about 60 MB as decoded audio.
- **Level:** left as recorded, so the slider's default sits within about 1 LU of the old synthesized rumble.

```sh
ffmpeg -i source -filter_complex "[0:a]atrim=1:44,asetpts=PTS-STARTPTS[a];[0:a]atrim=76:198.5,asetpts=PTS-STARTPTS[b];[a][b]acrossfade=d=4:c1=qsin:c2=qsin[c]" -map '[c]' -c:a pcm_f32le spliced.wav
ffmpeg -i spliced.wav -filter_complex "[0:a]asplit[p][q];[p]atrim=4,asetpts=PTS-STARTPTS[body];[q]atrim=0:4,asetpts=PTS-STARTPTS[head];[body][head]acrossfade=d=4:c1=qsin:c2=qsin[o]" -map '[o]' -c:a pcm_f32le loop.wav
ffmpeg -i loop.wav -c:a libopus -b:a 96k -vbr on -application audio -map_metadata -1 src/assets/city-night.ogg
```

## The rain: `src/assets/rain-night.ogg`

- **Source:** [LS_34173_PH_HeavyRain](https://freesound.org/people/kevp888/sounds/464041/) by Kevin Luce (kevp888), CC BY 4.0, binaural, from a porch in the Philippines. CC BY needs its credit: Credits, and `public/licenses/heavy-rain.txt`, which says what was changed.
- **The cut:** from Freesound's HQ preview (MP3), not yet the WAV original, which needs a login. 0:15 to 1:45, where it's strong and steady (it swells after that, then thins out), the end crossfaded into the start over 4 s, lowered 1.5 dB to the city's level. 1:26, Opus 96 kbit/s, about 1 MB; about 33 MB as decoded audio.
- **Level:** `AUDIO.rainGain` puts a recording at this level at the old synthesized rain's loudness.

```sh
ffmpeg -i source -filter_complex "[0:a]atrim=15:105,asetpts=PTS-STARTPTS,asplit[p][q];[p]atrim=4,asetpts=PTS-STARTPTS[body];[q]atrim=0:4,asetpts=PTS-STARTPTS[head];[body][head]acrossfade=d=4:c1=qsin:c2=qsin,volume=-1.5dB[o]" -map '[o]' -c:a pcm_f32le rain-loop.wav
ffmpeg -i rain-loop.wav -c:a libopus -b:a 96k -vbr on -application audio -map_metadata -1 src/assets/rain-night.ogg
```

## The storm and thunder: `src/assets/storm.ogg`, `src/assets/thunder-1.ogg` to `3`

- **Source:** [09052019_moscow_heavy_rain_thunders_traffic](https://freesound.org/people/Archos/sounds/474562/) by Archos, CC0, from an 11th floor balcony. Listed in Credits.
- **The cut:** from Freesound's HQ preview (MP3), not yet the WAV original. Its three rolls of thunder are cut out into files of their own (33 s for 14 s, 57.5 s for 11.5 s, 123.5 s for 15.5 s; in over 1 s, out over 2.5 s, left at their level, so `thunderGain` is what puts them with the storm). The loop is 1 to 32 s, 68 to 122 s and 138 s to the end, crossfaded over 4 s, the end into the start too, raised 9.8 dB to the city's level. 1:36, Opus 96 kbit/s, 1 MB; about 37 MB decoded.

```sh
ffmpeg -i source -filter_complex "[0:a]atrim=1:32,asetpts=PTS-STARTPTS[a];[0:a]atrim=68:122,asetpts=PTS-STARTPTS[b];[0:a]atrim=138:161.5,asetpts=PTS-STARTPTS[c];[a][b]acrossfade=d=4:c1=qsin:c2=qsin[ab];[ab][c]acrossfade=d=4:c1=qsin:c2=qsin[o]" -map '[o]' -c:a pcm_f32le d1.wav
ffmpeg -i d1.wav -filter_complex "[0:a]asplit[p][q];[p]atrim=4,asetpts=PTS-STARTPTS[body];[q]atrim=0:4,asetpts=PTS-STARTPTS[head];[body][head]acrossfade=d=4:c1=qsin:c2=qsin[o]" -map '[o]' -c:a pcm_f32le d2.wav
ffmpeg -i d2.wav -af volume=9.8dB -c:a libopus -b:a 96k -vbr on -application audio -map_metadata -1 src/assets/storm.ogg
ffmpeg -ss 33 -t 14 -i source -af "afade=t=in:d=1,afade=t=out:st=11.5:d=2.5" -c:a libopus -b:a 96k -vbr on -application audio -map_metadata -1 src/assets/thunder-1.ogg
```

## The rain indoors: `src/assets/rain-indoors.ogg`

- **Source:** [Rain on tin roof, dripping onto tin window sills](https://freesound.org/people/stecman/sounds/569313/) by stecman, CC0, from a room with the windows ajar. Listed in Credits.
- **The cut:** from Freesound's HQ preview (MP3), not yet the original. 1 to 40 s and 52 to 116 s, a louder moment between them left out, crossfaded over 4 s, the end into the start too, raised 8.4 dB to the city's level. 1:35, Opus 96 kbit/s, 1 MB; about 36 MB decoded.

```sh
ffmpeg -i source -filter_complex "[0:a]atrim=1:40,asetpts=PTS-STARTPTS[a];[0:a]atrim=52:116,asetpts=PTS-STARTPTS[b];[a][b]acrossfade=d=4:c1=qsin:c2=qsin[o]" -map '[o]' -c:a pcm_f32le i1.wav
ffmpeg -i i1.wav -filter_complex "[0:a]asplit[p][q];[p]atrim=4,asetpts=PTS-STARTPTS[body];[q]atrim=0:4,asetpts=PTS-STARTPTS[head];[body][head]acrossfade=d=4:c1=qsin:c2=qsin[o]" -map '[o]' -c:a pcm_f32le i2.wav
ffmpeg -i i2.wav -af volume=8.4dB -c:a libopus -b:a 96k -vbr on -application audio -map_metadata -1 src/assets/rain-indoors.ogg
```
