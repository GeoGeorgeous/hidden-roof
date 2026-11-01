import { isIP } from 'node:net';

/** The longest text taken for an address that is none. */
const MOST = 64;

/** `ip` as counted and limited: an IPv6 address by its first 64 bits (a device keeps them while the rest changes), an IPv4 one as it is; text that is no address is cut and returned as it is. Never throws. */
export function prefix(ip: string) {
  ip = ip.trim().replace(/^::ffff:/i, '').replace(/%.*$/, '');
  if (isIP(ip) !== 6) return ip.slice(0, MOST);
  const [head, tail] = ip.split('::');
  const a = head ? head.split(':') : [];
  const b = tail ? tail.split(':') : [];
  const all = tail === undefined ? a : [...a, ...Array<string>(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b];
  return `${all.slice(0, 4).map((g) => (parseInt(g, 16) || 0).toString(16)).join(':')}::/64`;
}
