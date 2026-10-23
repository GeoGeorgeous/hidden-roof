// A SAVE in a session on its way (multiplayer.ts): the server makes the paint file, and a second SAVE meanwhile waits for the same one.

export class SaveRequest {
  private waiting: { promise: Promise<Uint8Array>; done: (bytes: Uint8Array) => void; fail: (e: Error) => void } | null = null;

  /** One is under way. */
  get active() {
    return this.waiting !== null;
  }

  /** The file on its way; `start` runs when this call begins the request (not when it joins one under way). */
  request(start: () => void) {
    if (!this.waiting) {
      let done!: (bytes: Uint8Array) => void, fail!: (e: Error) => void;
      const promise = new Promise<Uint8Array>((ok, no) => ((done = ok), (fail = no)));
      this.waiting = { promise, done, fail };
      start();
    }
    return this.waiting.promise;
  }

  /** The request on its way gets its file (`bytes`), or fails with `error`. */
  settle(bytes: Uint8Array | null, error: string) {
    if (bytes) this.waiting?.done(bytes);
    else this.waiting?.fail(new Error(error));
    this.waiting = null;
  }
}
