// The slogans of the world's signs, in clauses (each ends at a 。 or , or .).
// The city's billboards (city-text.ts) show all of them; the placeable blade
// and shop signs pick one by their seed (kit/signs.ts).

export const JAPANESE = [
  '買え。',
  '考えるな。',
  '買え。考えるな。',
  'もっと買って、',
  'もっと幸せ。',
  '幸せは義務です。',
  '不満のない社会へ。',
  '笑顔を忘れずに。',
  'あなたは幸せです。',
  '正しい行動を選びましょう。',
];

export const ENGLISH = ['OBEY.', 'ENJOY.', 'COMPLY.', 'STAY HAPPY.', 'BUY MORE.', 'TRUST THE SYSTEM.', 'CHOICE IS A PRIVILEGE.'];

/** Length in characters (not UTF-16 units). */
export const chars = (t: string) => Array.from(t).length;

/** The slogans of `pool` at most `max` characters long; never empty: the shortest one if none is. */
export function fitting(pool: readonly string[], max: number): string[] {
  const fit = pool.filter((t) => chars(t) <= max);
  return fit.length ? fit : [pool.reduce((a, b) => (chars(b) < chars(a) ? b : a))];
}
