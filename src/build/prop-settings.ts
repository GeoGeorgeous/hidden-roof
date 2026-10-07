import * as THREE from 'three';
import { BUILD } from '../config';
import { defOf } from '../kit';
import type { PropDef } from '../kit/def';
import type { Input } from '../input';
import type { Level } from '../level/level';
import type { PropInstance } from '../level/build-prop';
import { MAX_TEXT } from '../render/ink/words';
import { Ghost } from './ghost';

// Build mode's per-instance prop settings: [ and ] change the aimed prop's own
// setting (floodlight tilt), Enter types a sign's text (the sign under the
// crosshair, else the next ones of the selected type placed; new signs reuse
// the last text typed or picked). A placed prop with settings lights up under
// the crosshair, so it's plain that it has some.

export class PropSettings {
  /** Text for the next signs placed, per prop type (last typed or picked). */
  readonly texts = new Map<string, string>();
  private highlight: Ghost;

  constructor(
    scene: THREE.Scene,
    private level: Level,
    private say: (m: string) => void,
  ) {
    this.highlight = new Ghost(scene, { color: BUILD.highlightColor, opacity: BUILD.highlightOpacity, overlay: true });
    this.highlight.visible = false;
  }

  /** `aimed`: what the crosshair is on; `selected`: the prop about to be placed, if one is. */
  update(input: Input, aimed: THREE.Object3D | null, selected: PropDef | null) {
    const id = aimed ? this.level.idOf(aimed) : undefined;
    const inst = id === undefined ? undefined : this.level.props.get(id);
    const def = inst && defOf(inst.type, inst.variant);
    const dir = (input.wasTyped('BracketRight') ? 1 : 0) - (input.wasTyped('BracketLeft') ? 1 : 0);
    if (dir && inst && def?.adjust) this.adjust(inst, def, dir);
    if (input.wasPressed('Enter') || input.wasPressed('NumpadEnter')) this.editText(inst && def?.text !== undefined ? inst : null, selected);
    this.show(inst && def && (def.adjust || def.text !== undefined) ? inst : null);
  }

  set visible(v: boolean) {
    if (!v) this.highlight.visible = false;
  }

  private adjust(inst: PropInstance, def: PropDef, dir: number) {
    const a = def.adjust!;
    const v = this.level.setAdjust(inst.id, (inst.adjust ?? a.initial()) + dir * a.step);
    if (v !== null) this.say(`${a.label} ${v}°`);
  }

  /** Type a text for the aimed sign, or for the next signs of the selected type. */
  private editText(aimed: PropInstance | null, selected: PropDef | null) {
    const sign = aimed ? defOf(aimed.type, aimed.variant)! : selected?.text !== undefined ? selected : null;
    if (!sign) return this.say('AIM AT A SIGN WITH TEXT');
    const current = aimed?.text ?? this.texts.get(sign.type) ?? sign.text!;
    const typed = window.prompt('Sign text (empty = default)', current);
    if (typed === null) return;
    const text = typed.trim().slice(0, MAX_TEXT);
    if (text) this.texts.set(sign.type, text);
    else this.texts.delete(sign.type);
    if (aimed) this.level.setText(aimed.id, text);
    this.say(`TEXT: ${text || 'DEFAULT'} — CLICK TO RESUME`);
  }

  /** Light up a placed prop with settings, as it is now (its tilt, its text). */
  private show(inst: PropInstance | null) {
    this.highlight.visible = !!inst;
    if (!inst) return;
    const def = defOf(inst.type, inst.variant)!;
    this.highlight.showProp(def, inst.pos, inst.rot, { ...this.level.stackContext(def, inst.pos, inst.rot), adjust: inst.adjust, text: inst.text });
  }
}
