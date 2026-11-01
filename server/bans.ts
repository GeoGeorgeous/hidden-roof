import { createHmac, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { prefix } from './address';
import { writeAtomic } from './atomic';
import { DAY } from './days';
import { readJson } from './json-file';
import { log } from './log';

// The admin's bans (docs/admin-api.md, Bans): a player kept out of every session, by their address (an IPv6 one by its
// /64) and their game's device id, for some days or for good. Both only as hashes on a key of the bans' own, made once
// and never renewed (the month's salt of people.ts would let a ban lapse with the month), kept with the bans in
// DATA_DIR/bans.json; without DATA_DIR they last until a restart.

export interface Ban {
  id: string;
  /** The hashes of the address and the device it holds. */
  keys: string[];
  /** The player's nickname then, and what the admin gave as the reason (the player is told it). */
  name: string;
  reason: string;
  /** When it was made and ends (ms); `until` null: for good. */
  made: number;
  until: number | null;
}

const KEY_BYTES = 32;
const inForce = (b: Ban, now = Date.now()) => b.until === null || b.until > now;
const isBan = (b: unknown): b is Ban => {
  const o = b as Ban;
  return !!o && typeof o.id === 'string' && Array.isArray(o.keys) && o.keys.every((k) => typeof k === 'string') && typeof o.name === 'string' && typeof o.reason === 'string' && Number.isFinite(o.made) && (o.until === null || Number.isFinite(o.until));
};

/** What a banned player's game is told in the close frame: the end (ms, 0 for good) and the reason (src/net/link-closed.ts reads it). */
export const banText = (b: Ban) => `${b.until ?? 0} ${b.reason}`;

export class Bans {
  private key = randomBytes(KEY_BYTES).toString('hex');
  private list: Ban[] = [];
  private file: string | null = null;

  /** Kept in `dir` (DATA_DIR): read back, the ended ones dropped. A file of no use is set aside as bans.json.bad, and no one is banned. */
  async keepIn(dir: string) {
    this.file = path.join(dir, 'bans.json');
    try {
      const kept = await readJson<{ key?: unknown; bans?: unknown }>(this.file);
      if (kept) {
        if (typeof kept.key !== 'string' || !Array.isArray(kept.bans)) throw new Error('no key and bans in it');
        [this.key, this.list] = [kept.key, kept.bans.filter(isBan).filter((b) => inForce(b))];
      }
    } catch (e) {
      log('-----', 'bans.json is no use, no one is banned now (the old one is kept as bans.json.bad):', e);
      await fs.rename(this.file, `${this.file}.bad`).catch(() => {});
    }
    await this.save();
  }

  /** The ban in force on `ip` or `device`, if any. */
  of(ip: string, device?: string) {
    const keys = this.keys(ip, device);
    return this.list.find((b) => inForce(b) && b.keys.some((k) => keys.includes(k)));
  }

  /** The bans in force, the newest first. */
  get all() {
    return this.list.filter((b) => inForce(b)).reverse();
  }

  /** A ban on `ip` and `device` (the player `name`) for `days` (null: for good). */
  async add(ip: string, device: string | undefined, name: string, reason: string, days: number | null) {
    const made = Date.now();
    const ban: Ban = { id: randomBytes(4).toString('hex'), keys: this.keys(ip, device), name, reason, made, until: days === null ? null : made + days * DAY };
    this.list = [...this.list.filter((b) => inForce(b, made)), ban];
    await this.save();
    return ban;
  }

  /** Ban `id` with another reason, or ending sooner: `days` from when it was made (null: for good, only for one that is); null if there's none in force, 'longer' if `days` would make it end later. */
  async change(id: string, to: { days?: number | null; reason?: string }) {
    const ban = this.list.find((b) => b.id === id && inForce(b));
    if (!ban) return null;
    if (to.days !== undefined) {
      const until = to.days === null ? null : ban.made + to.days * DAY;
      if (until === null ? ban.until !== null : ban.until !== null && until > ban.until) return 'longer';
      ban.until = until;
    }
    if (to.reason !== undefined) ban.reason = to.reason;
    await this.save();
    return ban;
  }

  /** Ban `id` lifted at once; false if there's none in force. */
  async lift(id: string) {
    const ban = this.list.find((b) => b.id === id && inForce(b));
    if (!ban) return false;
    this.list = this.list.filter((b) => b !== ban && inForce(b));
    await this.save();
    return true;
  }

  /** The hashes that stand for an address and a device: the HMAC of each on the key, 22 characters (128 bits). */
  private keys(ip: string, device?: string) {
    const h = (s: string) => createHmac('sha256', this.key).update(s).digest('base64url').slice(0, 22);
    return device ? [h(`i${prefix(ip)}`), h(`d${device}`)] : [h(`i${prefix(ip)}`)];
  }

  private async save() {
    if (this.file) await writeAtomic(this.file, JSON.stringify({ key: this.key, bans: this.list }), 0o600);
  }
}
