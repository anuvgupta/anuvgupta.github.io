// Copied from murk3d (github.com/anuvgupta/murk3d).
// A small tileable noise texture for shaders. Each channel holds periodic
// fractal Perlin noise at a different base frequency, so one texture fetch
// gives four uncorrelated noise values and shaders can layer them at several
// world scales without visible tiling.

import * as THREE from 'three';
import { mulberry32 } from './noise.js';

export function makePeriodicPerlin(seed) {
  const random = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grads = [];
  for (let i = 0; i < 256; i++) {
    const a = (i / 256) * Math.PI * 2;
    grads.push([Math.cos(a), Math.sin(a)]);
  }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

  // Perlin noise that repeats every `period` units in x and y.
  return function (x, y, period) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const g = (ix, iy) => {
      const h = perm[(((ix % period) + period) % period) + perm[(((iy % period) + period) % period) & 255]];
      return grads[h];
    };
    const dot = (gr, dx, dy) => gr[0] * dx + gr[1] * dy;
    const n00 = dot(g(xi, yi), xf, yf);
    const n10 = dot(g(xi + 1, yi), xf - 1, yf);
    const n01 = dot(g(xi, yi + 1), xf, yf - 1);
    const n11 = dot(g(xi + 1, yi + 1), xf - 1, yf - 1);
    const u = fade(xf);
    const v = fade(yf);
    return (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v;
  };
}

export function createNoiseTexture(size = 256, seed = 5) {
  const data = new Uint8Array(size * size * 4);
  const channels = [
    { base: 4, octaves: 5 },
    { base: 8, octaves: 5 },
    { base: 16, octaves: 4 },
    { base: 32, octaves: 3 },
  ];
  const noises = channels.map((_, i) => makePeriodicPerlin(seed + i * 17));

  for (let c = 0; c < 4; c++) {
    const { base, octaves } = channels[c];
    const noise = noises[c];
    const values = new Float32Array(size * size);
    let min = Infinity;
    let max = -Infinity;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let amp = 1;
        let period = base;
        let sum = 0;
        for (let o = 0; o < octaves; o++) {
          sum += amp * noise((x / size) * period, (y / size) * period, period);
          amp *= 0.5;
          period *= 2;
        }
        values[y * size + x] = sum;
        if (sum < min) min = sum;
        if (sum > max) max = sum;
      }
    }
    // Normalise to the full 0–255 range.
    for (let i = 0; i < size * size; i++) {
      data[i * 4 + c] = Math.round(((values[i] - min) / (max - min)) * 255);
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// Tileable normal map of small choppy wavelets, for water.
export function createWaterNormalTexture(size = 256, seed = 11) {
  const noise = makePeriodicPerlin(seed);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let amp = 1;
      let period = 6;
      let sum = 0;
      for (let o = 0; o < 5; o++) {
        const n = noise((x / size) * period, (y / size) * period, period);
        // Sharpened crests read as wavelets rather than blobs.
        sum += amp * (1 - Math.abs(n * 1.6));
        amp *= 0.5;
        period *= 2;
      }
      heights[y * size + x] = sum;
    }
  }
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => heights[((y + size) % size) * size + ((x + size) % size)];
  const strength = 2.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      data[o] = Math.round((-dx / len) * 127.5 + 127.5);
      data[o + 1] = Math.round((-dy / len) * 127.5 + 127.5);
      data[o + 2] = Math.round((1 / len) * 127.5 + 127.5);
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}
