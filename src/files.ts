// Files the player keeps: downloads (screenshots, paint saves, levels) and
// opening one with the file picker.

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Opens the file picker (releases the mouse); resolves with the chosen file. */
export function pickFile(accept: string): Promise<File> {
  document.exitPointerLock();
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => (input.files?.[0] ? resolve(input.files[0]) : reject(new Error('no file')));
    input.click();
  });
}

/** For file names: 2026-10-04 18:31:05 -> 20261004-183105 */
export function stamp(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
