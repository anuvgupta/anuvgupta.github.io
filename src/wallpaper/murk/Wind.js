// Adapted from murk3d (github.com/anuvgupta/murk3d), src/world/Wind.js.
// Copied as written, but for the weather below, which is calmer than the
// game's for a wallpaper; the windiness map is baked from these hills alone
// (the game's lakes, village, realms and woods are gone).
import * as THREE from 'three';
import { createNoise2D, smoothstep } from './noise.js';
import { WORLD_HALF, VIEW } from '../terrain.js';

const WORLD_SIZE = WORLD_HALF * 2;

// Windiness: how exposed each part of the map is, 0.15 (deep shelter) to 1
// (a bare ridge). Exposed ground feels the wind as it is, quick gusts and
// fast-rolling waves; sheltered ground feels a slow, smoothed version of
// it, so windy moments still come but build gradually and never get frantic.
const MAP = 256; // texels across the world

// Weather-ish wind: it drifts between calm spells, steady breezes and short
// gusts, and its direction wanders slowly. Shaders get the overall strength
// plus a travel offset, which they use to scroll a noise field downwind so
// gust fronts visibly roll across the grass and trees.
// For the wallpaper the breeze is lighter and steadier, and gusts are
// milder and rarer: a gust every few minutes rather than every half minute
// (the game's: calm 0.04-0.14, breeze 0.28-0.48, gust 0.7-1.0, with 40% of
// breezes turning into a gust).
const PHASES = {
  calm: { strength: [0.08, 0.18], duration: [8, 18], next: { calm: 0.2, breeze: 0.75, gust: 0.05 } },
  breeze: { strength: [0.24, 0.42], duration: [12, 28], next: { calm: 0.3, breeze: 0.6, gust: 0.1 } },
  gust: { strength: [0.55, 0.8], duration: [3, 6], next: { calm: 0.3, breeze: 0.7, gust: 0 } },
};

const rand = (a, b) => a + Math.random() * (b - a);

// Now and then (on top of the weather above) a gust front sweeps the whole
// view: a broad, ragged-edged swath of stronger wind that comes over from
// beyond the hill, down its face, across the meadow and out past the
// viewer, laying the grass over as it passes. It follows the wind's
// direction when it starts, along a path measured from the viewpoint.
const GUST = {
  first: [10, 20], // seconds before the first one
  every: [25, 60], // seconds between them
  from: -260, // metres along the wind from the viewer where it starts...
  to: 40, // ...and where it ends, past the viewer
  speed: [14, 19], // metres a second
  strength: [0.6, 1.0],
  halfWidth: [90, 140], // metres across the wind
};

export class Wind {
  constructor() {
    this.noise = createNoise2D(31);
    this.time = 0;
    this.baseAngle = 0.35; // radians; prevailing wind from the west-southwest
    this.direction = new THREE.Vector2(1, 0);
    this.strength = 0.25;
    this.target = 0.25;
    this.phase = 'breeze';
    this.phaseTime = 10;
    this.travel = 0;
    // Where the gust field has drifted to, as a vector: summed step by step
    // along the wind's current direction, and wrapped to the noise tile.
    // (Sampling at direction × total distance, any turn of the wind swung
    // the whole field by the distance travelled so far, kilometres after an
    // hour, so gusts raced and trees and grass thrashed frame to frame.)
    this.offset = new THREE.Vector2();
    this.offsetSlow = new THREE.Vector2();
    // The lake's wind chop, drifting downwind (in ripple-texture units).
    this.ripple = new THREE.Vector2();
    // Fog banks creep at a third of the gusts' pace (their noise tiles at 250 m).
    this.fogOffset = new THREE.Vector2();
    // The sheltered wind: strength smoothed over ~8 s, fronts rolling slowly.
    this.slow = 0.25;
    this.travelSlow = 0;
    this.mapData = new Float32Array(MAP * MAP).fill(0.5);
    this.mapTexture = new THREE.DataTexture(new Uint8Array(MAP * MAP).fill(128), MAP, MAP, THREE.RedFormat, THREE.UnsignedByteType);
    this.mapTexture.magFilter = this.mapTexture.minFilter = THREE.LinearFilter;
    this.mapTexture.flipY = false;
    this.mapTexture.needsUpdate = true;
    // When > 0, the shaders only see the wind advance this many times a
    // second (the pixelated modes), so a gust reads as a few big moves
    // instead of a constant shimmer of single pixels.
    this.stepHz = 0;
    // The occasional gust front (GUST, updateGust).
    this.gust = { active: false, wait: rand(...GUST.first), dir: new THREE.Vector2(1, 0), pos: 0, start: 0, end: 1, speed: 12, strength: 0, envelope: 0, halfWidth: 100, center: 0 };
    this._stepAcc = 0;

    this.uniforms = {
      uTime: { value: 0 },
      uWindDir: { value: this.direction.clone() },
      uWindStrength: { value: this.strength },
      uWindTravel: { value: 0 },
      uWindSlow: { value: this.slow },
      uWindTravelSlow: { value: 0 },
      uWindOffset: { value: this.offset.clone() },
      uWindOffsetSlow: { value: this.offsetSlow.clone() },
      uWindRipple: { value: this.ripple.clone() },
      uGustDir: { value: new THREE.Vector2(1, 0) },
      uGustPos: { value: 0 },
      uGustCenter: { value: 0 },
      uGustHalfWidth: { value: 100 },
      uGustStrength: { value: 0 },
      uWindMap: { value: this.mapTexture },
    };
  }

  pickPhase() {
    const options = PHASES[this.phase].next;
    let r = Math.random();
    for (const [name, p] of Object.entries(options)) {
      r -= p;
      if (r <= 0) {
        this.phase = name;
        break;
      }
    }
    const def = PHASES[this.phase];
    this.target = rand(...def.strength);
    this.phaseTime = rand(...def.duration);
  }

  update(dt) {
    this.time += dt;
    this.updateGust(dt);
    this.phaseTime -= dt;
    if (this.phaseTime <= 0) this.pickPhase();

    // Builds into a gust over ~5 s and dies away over ~8 s (the game's took
    // about 1 s and 3 s), with a slow waver on top.
    const rate = this.target > this.strength ? 0.2 : 0.12;
    this.strength += (this.target - this.strength) * (1 - Math.exp(-rate * dt));
    const flutter = this.noise(this.time * 0.12, 3.7) * 0.05;
    const s = Math.max(0, this.strength + flutter);

    const angle = this.baseAngle + this.noise(this.time * 0.015, 9.1) * 0.7;
    this.direction.set(Math.cos(angle), Math.sin(angle));

    // Gust fronts move faster in stronger wind: 1.2-3.6 m/s here, unhurried
    // for a view that never moves (the game's raced past at 3-12 m/s, so
    // the waves over the hill cycled every second or so).
    const speed = 1.2 + 3.6 * s;
    this.travel += dt * speed;
    this.slow += (s - this.slow) * (1 - Math.exp(-dt / 12));
    const speedSlow = 0.6 + 1.5 * this.slow;
    this.travelSlow += dt * speedSlow;
    // The gust noise repeats every 500/3 m (both its scales tile there).
    const wrap = (v, p) => v.set(((v.x % p) + p) % p, ((v.y % p) + p) % p);
    wrap(this.offset.addScaledVector(this.direction, dt * speed), 500 / 3);
    wrap(this.offsetSlow.addScaledVector(this.direction, dt * speedSlow), 500 / 3);
    wrap(this.ripple.addScaledVector(this.direction, dt * 0.175), 1);
    wrap(this.fogOffset.addScaledVector(this.direction, dt * speed * 0.35), 250);

    if (this.stepHz > 0) {
      this._stepAcc += dt;
      if (this._stepAcc < 1 / this.stepHz) return;
      this._stepAcc = 0;
    }
    this.uniforms.uTime.value = this.time;
    this.uniforms.uWindDir.value.copy(this.direction);
    this.uniforms.uWindStrength.value = s;
    this.uniforms.uWindTravel.value = this.travel;
    this.uniforms.uWindSlow.value = this.slow;
    this.uniforms.uWindTravelSlow.value = this.travelSlow;
    this.uniforms.uWindOffset.value.copy(this.offset);
    this.uniforms.uWindOffsetSlow.value.copy(this.offsetSlow);
    this.uniforms.uWindRipple.value.copy(this.ripple);
    const g = this.gust;
    this.uniforms.uGustStrength.value = g.active ? g.strength * g.envelope : 0;
    if (g.active) {
      this.uniforms.uGustDir.value.copy(g.dir);
      this.uniforms.uGustPos.value = g.pos;
      this.uniforms.uGustCenter.value = g.center;
      this.uniforms.uGustHalfWidth.value = g.halfWidth;
    }
  }

  // The occasional gust front (GUST): wait, then sweep from beyond the hill
  // to past the viewer, easing in and out at the ends of its path.
  updateGust(dt) {
    const g = this.gust;
    if (!g.active) {
      g.wait -= dt;
      if (g.wait > 0) return;
      g.active = true;
      g.dir.copy(this.direction);
      const along = VIEW.x * g.dir.x + VIEW.z * g.dir.y;
      g.start = along + GUST.from;
      g.end = along + GUST.to;
      g.pos = g.start;
      g.speed = rand(...GUST.speed);
      g.strength = rand(...GUST.strength);
      g.halfWidth = rand(...GUST.halfWidth);
      g.center = -VIEW.x * g.dir.y + VIEW.z * g.dir.x + rand(-40, 40);
    }
    g.pos += g.speed * dt;
    const t = (g.pos - g.start) / (g.end - g.start);
    g.envelope = smoothstep(0, 0.15, t) * (1 - smoothstep(0.85, 1, t));
    if (t >= 1) {
      g.active = false;
      g.wait = rand(...GUST.every);
    }
  }

  // Bake the windiness map from the land: ridges and hilltops (ground
  // standing above its surroundings) and height are windy; hollows are
  // sheltered; a slow noise makes some stretches of open country windier
  // than others.
  buildMap(terrain) {
    const cell = WORLD_SIZE / MAP;
    const h = new Float32Array(MAP * MAP);
    for (let j = 0; j < MAP; j++) for (let i = 0; i < MAP; i++) h[j * MAP + i] = terrain.heightAt((i + 0.5) * cell - WORLD_HALF, (j + 0.5) * cell - WORLD_HALF);
    const avg = boxBlur(h, 6);
    const noise = createNoise2D(77);
    for (let j = 0; j < MAP; j++) {
      for (let i = 0; i < MAP; i++) {
        const x = (i + 0.5) * cell - WORLD_HALF;
        const z = (j + 0.5) * cell - WORLD_HALF;
        const k = j * MAP + i;
        const rise = h[k] - avg[k];
        let e = 0.46 + Math.max(-0.2, Math.min(0.32, rise / 16)) + 0.24 * smoothstep(25, 130, h[k]);
        // Windswept uplands and quiet country, a few hundred metres across.
        e += 0.24 * noise(x * 0.0035 + 3.1, z * 0.0035 - 1.7);
        this.mapData[k] = e;
      }
    }
    // Broad zones, not a patchwork: soften over ~20 m.
    this.mapData.set(boxBlur(this.mapData, 3));
    this.uploadMap();
  }

  uploadMap() {
    const data = this.mapTexture.image.data;
    for (let k = 0; k < MAP * MAP; k++) {
      this.mapData[k] = Math.max(0.15, Math.min(1, this.mapData[k]));
      data[k] = Math.round(this.mapData[k] * 255);
    }
    this.mapTexture.needsUpdate = true;
  }

  // Windiness at a world position (bilinear, like the shaders see it).
  exposureAt(x, z) {
    const fx = (x + WORLD_HALF) / (WORLD_SIZE / MAP) - 0.5;
    const fz = (z + WORLD_HALF) / (WORLD_SIZE / MAP) - 0.5;
    const i = Math.max(0, Math.min(MAP - 2, Math.floor(fx)));
    const j = Math.max(0, Math.min(MAP - 2, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - i));
    const tz = Math.min(1, Math.max(0, fz - j));
    const d = this.mapData;
    const a = d[j * MAP + i] + (d[j * MAP + i + 1] - d[j * MAP + i]) * tx;
    const b = d[(j + 1) * MAP + i] + (d[(j + 1) * MAP + i + 1] - d[(j + 1) * MAP + i]) * tx;
    return a + (b - a) * tz;
  }

  // The wind strength felt at a world position: sheltered places follow the
  // slow wind and feel less of it.
  strengthAt(x, z) {
    const e = this.exposureAt(x, z);
    const s = this.uniforms.uWindStrength.value;
    return (this.slow + (s - this.slow) * e) * (0.35 + 0.65 * e);
  }
}

// Separable box blur of a MAP x MAP grid, radius r cells.
function boxBlur(src, r) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let j = 0; j < MAP; j++) {
    for (let i = 0; i < MAP; i++) {
      let sum = 0;
      let n = 0;
      for (let d = -r; d <= r; d++) {
        const ii = i + d;
        if (ii < 0 || ii >= MAP) continue;
        sum += src[j * MAP + ii];
        n++;
      }
      tmp[j * MAP + i] = sum / n;
    }
  }
  for (let j = 0; j < MAP; j++) {
    for (let i = 0; i < MAP; i++) {
      let sum = 0;
      let n = 0;
      for (let d = -r; d <= r; d++) {
        const jj = j + d;
        if (jj < 0 || jj >= MAP) continue;
        sum += tmp[jj * MAP + i];
        n++;
      }
      out[j * MAP + i] = sum / n;
    }
  }
  return out;
}

// GLSL helper: local wind strength at a world position. Needs uNoise and the
// wind uniforms declared by the including shader.
export const WIND_GLSL = /* glsl */ `
  uniform float uTime;
  uniform vec2 uWindDir;
  uniform float uWindStrength;
  uniform float uWindTravel;

  uniform float uWindSlow;
  uniform float uWindTravelSlow;
  uniform vec2 uWindOffset;
  uniform vec2 uWindOffsetSlow;
  uniform vec2 uWindRipple;
  uniform sampler2D uWindMap;
  uniform vec2 uGustDir;
  uniform float uGustPos;
  uniform float uGustCenter;
  uniform float uGustHalfWidth;
  uniform float uGustStrength;

  // The occasional gust front here (Wind.updateGust): a sharp leading edge
  // with a longer tail behind it, across a broad swath with ragged sides.
  float gustAt( vec2 p ) {
    if ( uGustStrength <= 0.0 ) return 0.0;
    float along = dot( p, uGustDir ) - uGustPos; // > 0: not reached yet
    float prof = along > 0.0 ? exp( -along * along / 144.0 ) : exp( -along * along / 1600.0 );
    float lat = dot( p, vec2( -uGustDir.y, uGustDir.x ) ) - uGustCenter;
    float rag = texture( uNoise, vec2( lat * 0.004, along * 0.003 ) + 0.71 ).r;
    float side = 1.0 - smoothstep( 0.6, 1.0, abs( lat ) / ( uGustHalfWidth * ( 0.7 + 0.6 * rag ) ) );
    return uGustStrength * prof * side;
  }

  // How exposed this spot is: 0.15 deep shelter .. 1 a bare ridge.
  float windExposure( vec2 p ) {
    return texture( uWindMap, ( p + ${WORLD_HALF.toFixed(1)} ) / ${WORLD_SIZE.toFixed(1)} ).r;
  }

  // 0..~1.6: the wind felt here. Exposed ground gets the live wind with
  // quick gust fronts and ripples rolling downwind; sheltered ground the
  // slow wind (smoothed over ~8 s) with slow-rolling fronts, and less of it.
  float windAt( vec2 p ) {
    float e = windExposure( p );
    vec2 qf = p - uWindOffset;
    vec2 qs = p - uWindOffsetSlow;
    float fast = smoothstep( 0.3, 0.8, texture( uNoise, qf * 0.006 ).g ) * 0.9 + texture( uNoise, qf * 0.03 ).b * 0.35;
    float slow = smoothstep( 0.3, 0.8, texture( uNoise, qs * 0.006 ).g ) * 0.9 + 0.17;
    float local = mix( slow, fast, e );
    float strength = mix( uWindSlow, uWindStrength, e );
    return strength * ( 0.35 + local * 1.2 ) * ( 0.35 + 0.65 * e ) + gustAt( p ) * 0.7;
  }
`;
