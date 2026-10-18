import * as THREE from 'three';
import { ATMOS, INK, SMOKE, THUNDER, VIEWMODEL } from '../config';
import { setHex } from '../hex-color';
import { makeSky } from '../sky';
import { setLinePointScale } from '../city/lines';
import type { Level } from '../level/level';
import { Atmosphere } from './atmosphere';
import { Heightmap } from './heightmap';
import { LightFX } from './light-fx';
import { Lighting } from './lighting';
import { Lightning } from './lightning';
import { PlayerLight } from './player-light';
import { Rain } from './rain';
import { Smoke } from './smoke';

// The world's weather and light: sky, fog, rain, smoke, lightning, the lamps
// (real lights, glows) and the player's own light, plus the two lights of the
// view scene (the can's pass). Main builds it, calls `rebuild` when the level
// changes and `update` once a frame; F3 reaches the parts through it.

/** What the environment needs to know of a frame. */
export interface EnvView {
  /** The frame's clock (ms). */
  time: number;
  dt: number;
  /** Where the picture is taken from (the camera, or the title and test views') and its camera. */
  at: THREE.Vector3;
  shown: THREE.Camera;
  /** The player's eye, and the player camera's field of view. */
  eye: THREE.Vector3;
  fov: number;
  /** The game is paused (no lightning strikes). */
  frozen: boolean;
  /** Build mode: daylight, so no rain, lightning or player light. */
  building: boolean;
}

export class Environment {
  readonly lighting: Lighting;
  readonly lightFx: LightFX;
  readonly lightning = new Lightning();
  readonly smoke: Smoke;
  readonly atmosphere: Atmosphere;
  readonly heightmap = new Heightmap();
  private fog = new THREE.FogExp2(INK.paper, ATMOS.fogDensity);
  private sky = makeSky();
  private rain: Rain;
  private playerLight: PlayerLight;
  private viewFill = new THREE.HemisphereLight(VIEWMODEL.fillSky, VIEWMODEL.fillGround, VIEWMODEL.fill);
  /** A warm practical-light rim. */
  private viewSun = new THREE.DirectionalLight(VIEWMODEL.rimColor, VIEWMODEL.rim);
  /** Drawing-buffer height: glow and smoke sprites are sized in its pixels. */
  private viewHeight = 1;
  private rainTime = 0;

  /** `viewScene` is the second pass the can is drawn in, so it never clips into walls. */
  constructor(scene: THREE.Scene, viewScene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    scene.fog = this.fog;
    scene.add(this.sky);
    this.viewSun.position.set(-1, 1, 2);
    viewScene.add(this.viewFill, this.viewSun);
    this.lighting = new Lighting(scene, renderer);
    this.lightFx = new LightFX(scene);
    this.rain = new Rain(scene);
    this.atmosphere = new Atmosphere(this.sky, this.lighting);
    this.playerLight = new PlayerLight(scene);
    this.smoke = new Smoke(scene);
  }

  /** The level changed: its lamps, smoke sources and rain shelter are made again. */
  rebuild(level: Level) {
    this.smoke.rebuild(level.emitters);
    this.lighting.setAnchors(level.lights);
    this.lightFx.rebuild(level.lights);
    this.heightmap.rebuild(level.colliders, level.totalBounds());
    this.rain.setHeightmap(this.heightmap);
  }

  /** The drawing buffer's height (px), which sizes glow and smoke sprites. */
  setViewHeight(height: number) {
    this.viewHeight = height;
  }

  /** Once a frame. The numbers from config are copied every frame, so F3 shows them live. */
  update({ time, dt, at, shown, eye, fov, frozen, building }: EnvView) {
    // Sprites follow the camera's FOV (sprinting, F3) like the world around them.
    const pointScale = this.viewHeight / (2 * Math.tan((fov * Math.PI) / 360));
    this.lightFx.setPointScale(pointScale);
    this.smoke.setPointScale(pointScale);
    setLinePointScale(pointScale);
    this.sky.position.copy(at);
    this.fog.density = ATMOS.fogDensity;
    setHex(this.fog.color, INK.paper);
    const lightning = this.lightning;
    if (!frozen) lightning.update(dt, ATMOS.rain && !building);
    this.lighting.update(at, shown.matrixWorldInverse, time / 1000, lightning.flash);
    (this.sky.material as THREE.ShaderMaterial).uniforms.uFlash.value = lightning.flash * THUNDER.flashSky;
    this.playerLight.update(eye, !building);
    setHex(this.viewFill.color, VIEWMODEL.fillSky);
    setHex(this.viewFill.groundColor, VIEWMODEL.fillGround);
    this.viewFill.intensity = VIEWMODEL.fill;
    setHex(this.viewSun.color, VIEWMODEL.rimColor);
    this.viewSun.intensity = VIEWMODEL.rim;
    this.lightFx.update();
    this.rainTime += dt;
    this.rain.update(this.rainTime, at);
    this.smoke.update(this.rainTime, SMOKE.lightBase + SMOKE.lightAmbient * ATMOS.ambient + SMOKE.lightFlash * lightning.flash);
  }
}
