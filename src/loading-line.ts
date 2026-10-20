// The loading screen's status (index.html .loading p): two lines in one place,
// the one .on shown; a new text goes on the hidden one and fades in over the
// other (boot.css). For boot.ts (the game didn't start) and loading.ts (each
// step), so the markup is known here alone. No imports: boot.ts stays small.

export function sayLoading(text: string) {
  const [a, b] = document.querySelectorAll('.loading p span');
  if (!b) return;
  const next = a.classList.contains('on') ? b : a;
  next.textContent = text;
  a.classList.toggle('on', next === a);
  b.classList.toggle('on', next === b);
}
