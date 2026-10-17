import { joinBytes } from '../save/paint-file.ts';
import type { ToClient } from './protocol';

// A welcome or a save with a paint file comes as the message, then the file
// in `parts` parts (protocol.ts partFrames): put together here, message by message.

type WithFile = Extract<ToClient, { type: 'welcome' | 'save' }>;

export class PartsIn {
  /** The message whose parts are coming, and how many have come (of the last one, once whole). */
  coming: WithFile | null = null;
  got = 0;
  private parts: Uint8Array[] = [];

  /** `m` as it came: what to handle now, with its paint file once whole; null while one is coming. */
  take(m: ToClient): { m: ToClient; file?: undefined } | { m: WithFile; file: Uint8Array } | null {
    if (m.type === 'part') {
      if (!this.coming) return null;
      this.parts.push(m.bytes);
      this.got = this.parts.length;
      if (this.got < this.coming.parts) return null;
      const whole = { m: this.coming, file: joinBytes(this.parts) };
      this.coming = null;
      this.parts = [];
      return whole;
    }
    if ((m.type === 'welcome' || m.type === 'save') && m.parts) {
      [this.coming, this.parts, this.got] = [m, [], 0];
      return null;
    }
    return { m };
  }
}
