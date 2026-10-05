// Pure black / pure white UI ink. One CSS blend mode can only invert what is
// under a glyph (white by difference: dark gray on paper, light gray on ink).
// A stack of four copies of the layer, each its own blend mode (style.css, the
// ink-l0..l3 classes), does more, and only where a glyph is, since outside the
// glyphs each layer is transparent:
//   l0 `color` with a gray: the pixel under the glyph loses its hue (its luma stays)
//   l1 `color-burn` with 50% gray: everything at or under mid-gray goes black
//   l2 `color-dodge` with 99% white: everything left above black goes white
//   l3 `difference` with white: flips it, so the glyph is white over dark and black over light
// The copies are kept in step with the original by a MutationObserver, which
// copies attributes and text (not nodes, so transitions and the like survive).

/** Make `source` ink layer 0 and add the three copies after it. */
export function inkLayers(source: HTMLElement) {
  source.classList.add('ink-l0');
  const copies = [1, 2, 3].map((k) => {
    const copy = source.cloneNode(true) as HTMLElement;
    copy.classList.replace('ink-l0', `ink-l${k}`);
    copy.setAttribute('aria-hidden', 'true');
    return copy;
  });
  let after: Node = source;
  for (const c of copies) {
    after.parentNode!.insertBefore(c, after.nextSibling);
    after = c;
  }
  const sync = () => {
    copies.forEach((c, i) => mirror(source, c, `ink-l${i + 1}`));
  };
  new MutationObserver(sync).observe(source, { attributes: true, characterData: true, childList: true, subtree: true });
}

/** Copies `src`'s attributes, text and children onto `dst` (the root keeps its own layer class). */
function mirror(src: Element, dst: Element, layer: string | null) {
  for (const a of Array.from(src.attributes)) {
    const value = layer && a.name === 'class' ? a.value.replace('ink-l0', layer) : a.value;
    if (dst.getAttribute(a.name) !== value) dst.setAttribute(a.name, value);
  }
  for (const a of Array.from(dst.attributes)) if (!src.hasAttribute(a.name) && a.name !== 'aria-hidden') dst.removeAttribute(a.name);
  const same = src.childNodes.length === dst.childNodes.length && Array.from(src.childNodes).every((n, i) => n.nodeType === dst.childNodes[i].nodeType && (n.nodeType !== 1 || (n as Element).tagName === (dst.childNodes[i] as Element).tagName));
  if (!same) {
    dst.replaceChildren(...Array.from(src.childNodes, (n) => n.cloneNode(true)));
    return;
  }
  src.childNodes.forEach((n, i) => {
    const d = dst.childNodes[i];
    if (n.nodeType === 1) mirror(n as Element, d as Element, null);
    else if (d.nodeValue !== n.nodeValue) d.nodeValue = n.nodeValue;
  });
}
