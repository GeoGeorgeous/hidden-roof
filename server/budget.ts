import { SERVER } from '../src/config';

// What one link may send a session (a token bucket per link): messages and bytes a second, with room for a burst. A
// game sends about 45 messages and a few KB a second; what it sends again after a drop (paint ops) comes as a few batches.

export class Budget {
  private messages: number = SERVER.linkBurst.messages;
  private bytes: number = SERVER.linkBurst.bytes;
  private at = Date.now();

  /** One more message of `size` bytes: false when the link is over its budget (nothing is taken then). */
  take(size: number) {
    const now = Date.now();
    const s = (now - this.at) / 1000;
    this.at = now;
    this.messages = Math.min(SERVER.linkBurst.messages, this.messages + s * SERVER.linkRate.messages);
    this.bytes = Math.min(SERVER.linkBurst.bytes, this.bytes + s * SERVER.linkRate.bytes);
    if (this.messages < 1 || this.bytes < size) return false;
    this.messages--;
    this.bytes -= size;
    return true;
  }
}
