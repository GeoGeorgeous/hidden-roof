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

export function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Unavailable: see above.
  }
}
