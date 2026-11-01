import { createHash, randomBytes } from 'node:crypto';
import { dayAt } from './days';
import { monthOfDay } from './stats-period';

// The key of the hashes that stand for people (people.ts) and visitors (traffic-log.ts): a new one each UTC month, never logged
// or sent. A person is counted once in a month by hash, and can't be matched across two.

/** The key and when it began (ms), as it is kept. */
export interface Salt {
  key: string;
  since: number;
}

const KEY_BYTES = 32;

export class MonthSalt {
  key: string;
  since: number;

  /** The salt as it was kept (`from`), or a new one from `now` (ms). */
  constructor(from?: Salt | null, now = Date.now()) {
    this.key = from?.key ?? randomBytes(KEY_BYTES).toString('hex');
    this.since = from?.since ?? now;
  }

  /** Replaced by a new one that began at `since` (default: `ms`) if `ms` is in a later UTC month than this one began in: true if it was. */
  renew(ms: number, since = ms) {
    if (monthOfDay(dayAt(ms)) <= monthOfDay(dayAt(this.since))) return false;
    this.key = randomBytes(KEY_BYTES).toString('hex');
    this.since = since;
    return true;
  }

  /** The hash that stands for `parts`, joined as they are: 16 characters of the SHA-256 of the key and them. */
  id(...parts: string[]) {
    const h = createHash('sha256').update(this.key);
    for (const p of parts) h.update(p);
    return h.digest('base64url').slice(0, 16);
  }

  toJSON(): Salt {
    return { key: this.key, since: this.since };
  }
}
