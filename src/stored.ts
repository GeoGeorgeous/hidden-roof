// localStorage where the browser allows it. Unavailable (a private window,
// site data blocked), reads give null and writes are dropped: whatever it
// keeps lasts for this session only.

export function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

let device: string | undefined;

/** This browser's random id, sent with HOST and JOIN: the admin's history counts people by it (and by address). Kept for the session where storage is blocked. */
export function deviceId() {
  device ??= stored('roofhiddenhaus.device') || undefined;
  if (!device) store('roofhiddenhaus.device', (device = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')));
  return device;
}

export function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Unavailable: see above.
  }
}
