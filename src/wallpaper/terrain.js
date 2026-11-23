// The rolling hills of the wallpaper: one broad grassy hill rising in front
// of the viewer, its crest highest left of centre and easing down to the
// right, with a darker, further hill behind it on the right and a faint far
// ridge beyond.
//
// The grid and its GPU lookups are murk3d's (Terrain.js): an sinh-warped grid,
// fine in the middle (where the near hill is) and coarse toward the edges,
// baked to a height + slope texture that the grass and ground shaders read
// with the same triangle interpolation as the mesh.
import * as THREE from 'three';
import { createNoise2D, fbm, smoothstep } from './murk/noise.js';

export const WORLD_HALF = 3000; // metres from the middle to the grid's edge
const SEGMENTS = 512;
const WARP = 4.2; // ~1.4 m cells in the middle, ~45 m at the edge
const SINH_K = Math.sinh(WARP);

// Where the viewer stands and which way they look: west (-x), so the evening
// sun sets over the hill and the midday sun lights it from the left (south).
export const VIEW = {
  x: 120,
  z: 0,
  eye: 1.6,
  fov: 38, // vertical, degrees
  pitch: 0.055, // radians up from level
};

const coordOf = (k) => (WORLD_HALF * Math.sinh(WARP * ((2 * k) / SEGMENTS - 1))) / SINH_K;

export class Terrain {
  constructor() {
    this.segments = SEGMENTS;
    this.noiseA = createNoise2D(11);
    this.noiseB = createNoise2D(23);
    const side = SEGMENTS + 1;
    this.coords = new Float32Array(side);
    for (let i = 0; i < side; i++) this.coords[i] = coordOf(i);
    this.heights = new Float32Array(side * side);
    for (let j = 0; j < side; j++) {
      for (let i = 0; i < side; i++) this.heights[j * side + i] = this.shape(this.coords[i], this.coords[j]);
    }
    this.heightTexture = this.buildHeightTexture();
  }

  // The landform, in the viewer's frame: f metres ahead, r metres to the right.
  shape(x, z) {
    const f = VIEW.x - x;
    const r = -z;
    const gauss = (v, w) => Math.exp(-(v / w) * (v / w));

    // The main hill: a long smooth swell whose crest runs across the view a
    // couple of hundred metres off, highest a little left of centre, lower
    // and further away to the right. Its near face is long and gentle, the
    // far side shorter.
    const crestF = 250 + 45 * Math.tanh((r - 60) / 220) + 10 * this.noiseA(r * 0.004, 1.3);
    const crestH = 30 + 9 * gauss(r + 70, 260) - 16 * smoothstep(80, 650, r) + 3 * this.noiseA(r * 0.006, 4.1);
    const df = f - crestF;
    const main = crestH * (df < 0 ? gauss(df, 205) : gauss(df, 125));

    // A second, further hill on the right, showing past the main one's flank.
    const second = 62 * gauss(f - 900, 260) * gauss(r - 520, 420);
    // And a faint, broad ridge far behind both.
    const far = 120 * gauss(f - 2050, 520) * gauss(r - 150, 1100) * (0.8 + 0.2 * this.noiseB(r * 0.0015, 2.0));

    // Gentle unevenness so no slope is perfectly smooth: broad swells and a
    // little finer roll, both small.
    const swell = fbm(this.noiseB, x * 0.004, z * 0.004, 4) * 4 + fbm(this.noiseA, x * 0.018, z * 0.018, 3) * 0.7;

    return main + second + far + swell;
  }

  // Height on the drawn mesh (the triangles), as the shaders see it.
  heightAt(x, z) {
    const side = SEGMENTS + 1;
    const gx = this.gridOf(x);
    const gz = this.gridOf(z);
    const i = Math.min(SEGMENTS - 1, Math.max(0, Math.floor(gx)));
    const j = Math.min(SEGMENTS - 1, Math.max(0, Math.floor(gz)));
    const c = this.coords;
    const fx = Math.min(1, Math.max(0, (x - c[i]) / (c[i + 1] - c[i])));
    const fz = Math.min(1, Math.max(0, (z - c[j]) / (c[j + 1] - c[j])));
    const h = this.heights;
    const ha = h[j * side + i];
    const hb = h[j * side + i + 1];
    const hc = h[(j + 1) * side + i];
    const hd = h[(j + 1) * side + i + 1];
    if (fx + fz <= 1) return ha + (hb - ha) * fx + (hc - ha) * fz;
    return hd + (hc - hd) * (1 - fx) + (hb - hd) * (1 - fz);
  }

  gridOf(v) {
    const q = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, v));
    return ((Math.asinh((q * SINH_K) / WORLD_HALF) / WARP + 1) * SEGMENTS) / 2;
  }

  // Height in r, slope (normal y) in g: murk3d's buildHeightTexture.
  buildHeightTexture() {
    const side = this.segments + 1;
    const data = new Float32Array(side * side * 2);
    const hts = this.heights;
    const c = this.coords;
    for (let j = 0; j < side; j++) {
      const j0 = Math.max(0, j - 1);
      const j1 = Math.min(side - 1, j + 1);
      for (let i = 0; i < side; i++) {
        const i0 = Math.max(0, i - 1);
        const i1 = Math.min(side - 1, i + 1);
        const idx = j * side + i;
        const dhx = hts[j * side + i0] - hts[j * side + i1];
        const dhz = hts[j0 * side + i] - hts[j1 * side + i];
        const span = c[i1] - c[i0];
        data[idx * 2] = hts[idx];
        data[idx * 2 + 1] = span / Math.sqrt(dhx * dhx + span * span + dhz * dhz * ((span * span) / Math.max(1e-6, (c[j1] - c[j0]) ** 2)));
      }
    }
    const tex = new THREE.DataTexture(data, side, side, THREE.RGFormat, THREE.FloatType);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }

  // The mesh: the grid's triangles, split the same way the lookups are.
  buildGeometry() {
    const side = SEGMENTS + 1;
    const pos = new Float32Array(side * side * 3);
    const c = this.coords;
    for (let j = 0; j < side; j++) {
      for (let i = 0; i < side; i++) {
        const k = (j * side + i) * 3;
        pos[k] = c[i];
        pos[k + 1] = this.heights[j * side + i];
        pos[k + 2] = c[j];
      }
    }
    const index = new Uint32Array(SEGMENTS * SEGMENTS * 6);
    let n = 0;
    for (let j = 0; j < SEGMENTS; j++) {
      for (let i = 0; i < SEGMENTS; i++) {
        const a = j * side + i;
        const b = a + 1;
        const d = a + side;
        const e = d + 1;
        index[n++] = a;
        index[n++] = d;
        index[n++] = b;
        index[n++] = e;
        index[n++] = b;
        index[n++] = d;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// GLSL mirror of heightAt(), for vertex shaders: murk3d's TERRAIN_HEIGHT_GLSL
// on this grid (no outer ring). Needs `uniform sampler2D uHeightMap;`.
export const TERRAIN_HEIGHT_GLSL = /* glsl */ `
  const float T_SEG = ${SEGMENTS.toFixed(1)};
  const float T_WARP = ${WARP.toFixed(6)};
  const float T_HALF = ${WORLD_HALF.toFixed(1)};
  const float T_SINHK = ${SINH_K.toFixed(6)};

  float terrainCoord( float k ) {
    return T_HALF * sinh( T_WARP * ( 2.0 * k / T_SEG - 1.0 ) ) / T_SINHK;
  }
  vec2 terrainGrid( vec2 p ) {
    vec2 q = clamp( p, vec2( -T_HALF ), vec2( T_HALF ) );
    return ( asinh( q * T_SINHK / T_HALF ) / T_WARP + 1.0 ) * T_SEG * 0.5;
  }

  float terrainHeight( vec2 p ) {
    vec2 g = terrainGrid( p );
    g = clamp( g, vec2( 0.0 ), vec2( T_SEG - 0.0001 ) );
    vec2 cell = floor( g );
    vec2 c0 = vec2( terrainCoord( cell.x ), terrainCoord( cell.y ) );
    vec2 c1 = vec2( terrainCoord( cell.x + 1.0 ), terrainCoord( cell.y + 1.0 ) );
    vec2 f = clamp( ( p - c0 ) / ( c1 - c0 ), 0.0, 1.0 );
    ivec2 ic = ivec2( cell );
    float ha = texelFetch( uHeightMap, ic, 0 ).r;
    float hb = texelFetch( uHeightMap, ic + ivec2( 1, 0 ), 0 ).r;
    float hc = texelFetch( uHeightMap, ic + ivec2( 0, 1 ), 0 ).r;
    float hd = texelFetch( uHeightMap, ic + ivec2( 1, 1 ), 0 ).r;
    if ( f.x + f.y <= 1.0 ) return ha + ( hb - ha ) * f.x + ( hc - ha ) * f.y;
    return hd + ( hc - hd ) * ( 1.0 - f.x ) + ( hb - hd ) * ( 1.0 - f.y );
  }

  // Surface normal y (1 = flat, 0 = vertical), bilinear across the cell.
  float terrainSlope( vec2 p ) {
    vec2 g = terrainGrid( p );
    g = clamp( g, vec2( 0.0 ), vec2( T_SEG - 0.0001 ) );
    vec2 cell = floor( g );
    vec2 f = fract( g );
    ivec2 ic = ivec2( cell );
    float a = texelFetch( uHeightMap, ic, 0 ).g;
    float b = texelFetch( uHeightMap, ic + ivec2( 1, 0 ), 0 ).g;
    float c = texelFetch( uHeightMap, ic + ivec2( 0, 1 ), 0 ).g;
    float d = texelFetch( uHeightMap, ic + ivec2( 1, 1 ), 0 ).g;
    return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
  }
`;
