import { msg } from '../messages';

/** A ban's reason and end (ms; null for good) as the player reads it. */
export function banWords(reason: string, until: number | null) {
  if (!until) return msg('menu.detailBannedForever', { reason });
  return msg('menu.detailBanned', { reason, date: new Date(until).toLocaleDateString(undefined, { dateStyle: 'medium' }) });
}

/** A ban's close text (server/bans.ts banText: its end in ms, 0 for good, and the reason) as the player reads it. */
export function banDetail(text: string) {
  const [, until = '0', reason = ''] = /^(\d+) ([\s\S]*)$/.exec(text) ?? [];
  return banWords(reason, +until || null);
}
