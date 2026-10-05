import * as THREE from 'three';
import { cityTextAtlas } from './ink/city-text';
import { textures } from '../textures';

/** GPU memory of a 2D texture the game made (RGBA, with mipmaps unless it has none). */
function bytesOf(t: THREE.Texture) {
  const img = t.image as { width: number; height: number } | null;
  if (!img) return 0;
  const base = img.width * img.height * 4;
  return t.generateMipmaps && t.minFilter !== THREE.NearestFilter && t.minFilter !== THREE.LinearFilter ? Math.round((base * 4) / 3) : base;
}

let total = -1;

/** The fixed textures: the base materials' and the sign and wall lettering atlases (paint and baked light are counted where they live). */
export function staticTextureBytes() {
  if (total < 0) total = Object.values(textures()).reduce((sum, t) => sum + bytesOf(t), 0) + bytesOf(cityTextAtlas());
  return total;
}
