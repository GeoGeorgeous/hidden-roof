// What a key is called when the keyboard layout says what it prints (input.ts keyName).

/** A key's name from its layout's printed character: a Latin letter shows (AZERTY's Z for KeyW); any other script, a digit or a symbol doesn't, so the physical key's name is used (a Russian layout's KeyW is W, as the keycap game guides say). */
export function layoutName(printed: string | undefined) {
  return printed && /^\p{Script=Latin}$/u.test(printed) ? printed.toUpperCase() : undefined;
}
