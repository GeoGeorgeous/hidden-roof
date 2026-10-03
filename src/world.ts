import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeSurfaceMaterial, SKY, textures } from './materials';
import type { PaintSystem } from './painting';
import type { Ladder } from './player';
import { boxSurface, cylinderSurface, type Axis, type BoxFace } from './surfaces';

// Level-building helpers. Levels call these to add paintable primitives,
// non-paintable decor, colliders and ladders.

export type TexName = keyof ReturnType<typeof textures>;

export interface PartOptions {
  tex?: TexName;
  tint?: THREE.ColorRepresentation;
  /** Paintable surfaces get a paint atlas. Decor does not. */
  paintable?: boolean;
  /** Add an AABB collider (default true). */
  collide?: boolean;
  /** Particles can hit it (default true). Far scenery should set false. */
  solid?: boolean;
  /** Box faces to omit. */
  skip?: BoxFace[];
  emissive?: number;
  tileMeters?: number;
}

export class World {
  readonly root = new THREE.Group();
  /** Meshes particles can hit (paintable + solid decor). */
  readonly solids: THREE.Mesh[] = [];
  readonly colliders: THREE.Box3[] = [];
  readonly ladders: Ladder[] = [];
  spawn = new THREE.Vector3();
  spawnYaw = 0;
  /** Follows the camera (see main loop). */
  readonly sky = makeSky();

  constructor(
    scene: THREE.Scene,
    private paint: PaintSystem,
  ) {
    scene.add(this.root);
    scene.add(this.sky);
  }

  /** Box from min/max corners. */
  box(min: [number, number, number], max: [number, number, number], o: PartOptions = {}): THREE.Mesh {
    const a = new THREE.Vector3(...min);
    const b = new THREE.Vector3(...max);
    const geo = boxSurface(a, b, o.skip);
    const mesh = this.addMesh(geo.geometry, o);
    if (o.paintable !== false) this.paint.register(mesh, mesh.material as THREE.ShaderMaterial, geo);
    if (o.collide !== false) this.colliders.push(new THREE.Box3(a, b));
    return mesh;
  }

  /** Cylinder starting at `start` (cap center), extending `length` along +axis. Collider is its AABB. */
  cylinder(start: [number, number, number], axis: Axis, length: number, radius: number, o: PartOptions & { segments?: number; caps?: [boolean, boolean] } = {}) {
    const s = new THREE.Vector3(...start);
    const geo = cylinderSurface(s, axis, length, radius, o.segments ?? 16, o.caps);
    const mesh = this.addMesh(geo.geometry, o);
    if (o.paintable !== false) this.paint.register(mesh, mesh.material as THREE.ShaderMaterial, geo);
    if (o.collide !== false) this.colliders.push(geo.geometry.boundingBox!.clone());
    return mesh;
  }

  /** Invisible collider. */
  wall(min: [number, number, number], max: [number, number, number]) {
    this.colliders.push(new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)));
  }

  /**
   * Ladder on a wall face. `base` is the bottom center of the ladder against the wall,
   * `normal` points away from the wall (axis-aligned), `height` is how far it climbs.
   */
  ladder(base: [number, number, number], normal: [number, number, number], height: number, width = 0.6) {
    const b = new THREE.Vector3(...base);
    const n = new THREE.Vector3(...normal);
    const side = new THREE.Vector3(-n.z, 0, n.x); // horizontal, along the wall
    const tex: PartOptions = { tex: 'metal', tint: '#c9a24a', paintable: false, collide: false };
    const railOff = width / 2;
    for (const s of [-1, 1]) {
      const c = b.clone().addScaledVector(side, s * railOff).addScaledVector(n, 0.12);
      this.box(...boxAround(c, side, n, 0.04, 0.04, 0, height + 0.9), tex);
    }
    for (let y = 0.3; y < height; y += 0.3) {
      const c = b.clone().addScaledVector(n, 0.12).setY(b.y + y);
      this.box(...boxAround(c, side, n, width, 0.03, -0.015, 0.015), tex);
    }
    // Climb volume: in front of the ladder, reaching above the top so you can step off.
    const v0 = b.clone().addScaledVector(side, -width / 2).addScaledVector(n, 0);
    const v1 = b.clone().addScaledVector(side, width / 2).addScaledVector(n, 0.45);
    const volume = new THREE.Box3().setFromPoints([v0, v1]);
    volume.min.y = b.y;
    volume.max.y = b.y + height + 0.25;
    this.ladders.push({ volume, normal: n });
  }

  /** Non-paintable mesh with arbitrary geometry (no collider). */
  decor(geometry: THREE.BufferGeometry, o: PartOptions = {}) {
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    return this.addMesh(geometry, o);
  }

  /** Many non-paintable boxes merged into one draw call (skyline etc). */
  mergedBoxes(boxes: [number, number, number, number, number, number][], o: PartOptions = {}) {
    const geos = boxes.map(([x0, y0, z0, x1, y1, z1]) =>
      boxSurface(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1), o.skip).geometry,
    );
    return this.decor(mergeGeometries(geos), { solid: false, ...o });
  }

  private addMesh(geometry: THREE.BufferGeometry, o: PartOptions) {
    const tx = textures();
    const material = makeSurfaceMaterial({ base: tx[o.tex ?? 'concrete'], tint: o.tint, emissive: o.emissive, tileMeters: o.tileMeters });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    this.root.add(mesh);
    if (o.solid !== false) this.solids.push(mesh);
    return mesh;
  }
}

/** Min/max of a box centered horizontally on `c`, `w` along `side`, `d` along `n`, y from c.y+y0 to c.y+y1. */
function boxAround(c: THREE.Vector3, side: THREE.Vector3, n: THREE.Vector3, w: number, d: number, y0: number, y1: number) {
  const pts = [
    c.clone().addScaledVector(side, -w / 2).addScaledVector(n, -d / 2),
    c.clone().addScaledVector(side, w / 2).addScaledVector(n, d / 2),
  ];
  const box = new THREE.Box3().setFromPoints(pts);
  return [
    [box.min.x, c.y + y0, box.min.z],
    [box.max.x, c.y + y1, box.max.z],
  ] as [[number, number, number], [number, number, number]];
}

function makeSky() {
  const geo = new THREE.SphereGeometry(900, 24, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uHorizon: { value: SKY.horizon },
      uZenith: { value: SKY.zenith },
      uFog: { value: SKY.fog },
      uSunDir: { value: SKY.sunDir },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uHorizon, uZenith, uFog, uSunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -1.0, 1.0);
        vec3 col = h > 0.0 ? mix(uHorizon, uZenith, pow(h, 0.6)) : mix(uHorizon, uFog * 0.7, clamp(-h * 4.0, 0.0, 1.0));
        float s = max(dot(d, uSunDir), 0.0);
        col += vec3(1.0, 0.85, 0.6) * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.25);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}
