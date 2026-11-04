import { CAPTURE } from '../config';
import { download, stamp } from '../files';

// Recording the canvas (capture mode, CAPTURE.keys.record): its frames as shown
// and the game's sound, encoded by the browser; the file downloads when the
// recording stops. Only the canvas: the page's HTML (HUD, name tags) isn't in it.

export class Recorder {
  private recorder: MediaRecorder | null = null;
  /** When the recording started (performance.now() ms), or null: none runs. */
  startedAt: number | null = null;

  /** Starts a recording at `mbps` (Mbit/s) with `sound`, or stops the one running. */
  toggle(canvas: HTMLCanvasElement, mbps: number, sound: MediaStreamTrack | null) {
    if (this.recorder) this.stop();
    else this.start(canvas, mbps, sound);
  }

  /** Stops a recording, if one runs: its file downloads. */
  stop() {
    this.recorder?.stop();
    this.recorder = null;
    this.startedAt = null;
  }

  private start(canvas: HTMLCanvasElement, mbps: number, sound: MediaStreamTrack | null) {
    const mimeType = CAPTURE.videoTypes.find((t) => MediaRecorder.isTypeSupported(t));
    if (!mimeType) return console.warn('capture: the browser records none of', CAPTURE.videoTypes);
    const stream = canvas.captureStream(CAPTURE.fps);
    if (sound) stream.addTrack(sound);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: mbps * 1_000_000, audioBitsPerSecond: CAPTURE.audioBitrate });
    const name = `roof-hidden-haus-${stamp(new Date())}.${mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      // The sound's track is the game's, for the next recording too.
      for (const track of stream.getVideoTracks()) track.stop();
      download(new Blob(chunks, { type: mimeType }), name);
    };
    recorder.start();
    this.recorder = recorder;
    this.startedAt = performance.now();
  }
}
