import { isCode } from './protocol';

// CCTV's Join as admin opens the game at #join=CODE&admin=PASS (server/admins.ts): read once as the page loads,
// and wiped from the address bar at once, so no copy of the address, bookmark or history entry holds the pass.
// A page opened with a pass sends no beacon (beacon.ts) until it is reloaded: an admin is not a player.

const hash = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.hash.slice(1));

/** This page was opened with an admin's pass. */
export const adminPage = hash.has('admin');

function read() {
  if (!adminPage && !hash.has('join')) return null;
  history.replaceState(history.state, '', location.pathname + location.search);
  const code = hash.get('join');
  const pass = hash.get('admin');
  return code && pass && isCode(code) ? { code, pass } : null;
}

/** The session and pass this page was opened with, if it was. */
export const adminLink = read();
