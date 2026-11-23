// Adapted from murk3d (github.com/anuvgupta/murk3d), src/world/groundShading.js.
//
// The meadow's colours, shared by the ground and the grass so the blades
// match the turf they grow from and the far hillside (past the blades' draw
// distance) reads as the same field. Copied as written, keeping only the
// open-meadow path: the realms, roads, river beds, paving, marsh and snow
// branches are gone, since none of them exist on these hills (they were all
// no-ops outside their own places). Their entry points stay as inert stubs so
// the copied grass shader reads them unchanged.
import * as THREE from 'three';

const lin = (hex) => {
  const c = new THREE.Color(hex);
  return `vec3( ${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)} )`;
};

export const GROUND_GLSL = /* glsl */ `
  uniform sampler2D uNoise;

  // ---- Inert stand-ins for the game's map: all open meadow, no realm.
  // Mask channels: r grass, g road/path, b river bed, a paving.
  vec4 groundMask( vec2 p ) { return vec4( 1.0, 0.0, 0.0, 0.0 ); }
  vec3 realmGrassTint( vec2 p ) { return vec3( 1.0 ); }
  vec4 realmAt( vec2 p, out float snow ) { snow = 0.0; return vec4( 1.0 ); }
  float roadAmount( vec2 p, float g ) { return 0.0; }
  float roadVerge( vec4 m, float road ) { return smoothstep( 0.0, 0.08, m.g ) * ( 1.0 - road ) * ( 1.0 - m.b ); }

  // Four uncorrelated noise layers at different world scales. Each layer is
  // sampled on rotated axes so the noise lattice never lines up with the world.
  vec4 groundNoise( vec2 p ) {
    vec2 a = mat2( 0.866, 0.5, -0.5, 0.866 ) * p;
    vec2 b = mat2( 0.6, -0.8, 0.8, 0.6 ) * p;
    return vec4(
      texture( uNoise, a * 0.0021 ).r,
      texture( uNoise, b * 0.013 ).g,
      texture( uNoise, a * 0.09 ).b,
      texture( uNoise, b * 0.55 ).a
    );
  }

  vec3 meadowColor( vec2 p, vec4 n ) {
    // Warm yellow-greens: fresh spring green in the sun, deeper green in the lee.
    vec3 c = mix( ${lin(0x5c7f2e)}, ${lin(0x7fa23a)}, smoothstep( 0.2, 0.8, n.y ) );
    c = mix( c, ${lin(0x47682a)}, smoothstep( 0.55, 0.85, n.x ) * 0.45 );
    c = mix( c, ${lin(0xa3a052)}, smoothstep( 0.62, 0.9, 1.0 - n.x ) * 0.35 );
    c *= 0.92 + 0.16 * n.z;
    // Broad patchiness (tens of metres): drier straw-green sweeps and
    // richer hollows, so a distant hillside isn't one flat tone.
    float sweep = texture( uNoise, p * 0.012 + 0.37 ).r * 0.6 + texture( uNoise, p * 0.035 + 0.11 ).g * 0.4;
    c = mix( c, c * vec3( 1.12, 1.06, 0.78 ), smoothstep( 0.55, 0.8, sweep ) * 0.55 );
    c = mix( c, c * vec3( 0.86, 0.94, 0.9 ), smoothstep( 0.45, 0.2, sweep ) * 0.4 );
    return c;
  }

  vec3 dirtColor( vec4 n ) {
    vec3 c = mix( ${lin(0x6a5238)}, ${lin(0x8a7350)}, n.z );
    c *= 0.8 + 0.35 * n.w;
    return c;
  }

  // Detail factor for the ground (0 far .. 1 near); set by the caller.
  float groundDetail = 0.0;

  // carpet: how much of the grass carpet actually stands here (the blade
  // shader's own slope cull), so the lit under-grass colour never shows bare.
  vec3 groundColor( vec3 p, vec3 nrm, float carpet ) {
    vec4 m = groundMask( p.xz );
    vec4 n = groundNoise( p.xz );
    float road = roadAmount( p.xz, m.g );
    float gSward = max( m.r, roadVerge( m, road ) );
    float floorG = smoothstep( 0.5, 1.0, gSward ) * ( 1.0 - smoothstep( 0.02, 0.55, m.g ) );
    float trod = smoothstep( 0.0, 0.1, max( m.g, m.a ) );
    vec3 bare = mix( dirtColor( n ) * 0.95, meadowColor( p.xz, n ) * 0.8, ( 0.3 + 0.25 * n.w + 0.35 * carpet ) * mix( 1.0, floorG, trod ) );
    // The ground seen between and beyond the blades: as bright as the lit
    // carpet but pulled toward a warm olive, never a pure acid green.
    vec3 under = meadowColor( p.xz, n ) * vec3( 1.22, 1.2, 1.0 );
    float ul = dot( under, vec3( 0.3, 0.59, 0.11 ) );
    under = mix( under, vec3( ul ) * vec3( 1.06, 1.0, 0.8 ), 0.3 );
    // Close by, between the blades you see the turf's floor, not their lit
    // tips: a green thatch of old stems and leaves in clumps, laid in strands
    // this way and that, with specks of soil. It gives way to the lit average
    // with distance, where it stands in for the blades.
    if ( groundDetail > 0.01 ) {
      vec2 q = p.xz;
      float clump = texture( uNoise, q * 0.9 + 0.21 ).g * 0.6 + texture( uNoise, q * 2.3 + 0.6 ).b * 0.4;
      float fineK = smoothstep( 0.4, 0.9, groundDetail );
      float s1 = texture( uNoise, vec2( q.x * 0.8 + q.y * 0.6, q.y * 0.8 - q.x * 0.6 ) * vec2( 7.0, 1.1 ) ).a;
      float s2 = texture( uNoise, vec2( q.x * 0.5 - q.y * 0.87, q.y * 0.5 + q.x * 0.87 ) * vec2( 7.0, 1.1 ) + 0.4 ).a;
      float strand = mix( 0.0, smoothstep( 0.55, 0.78, max( s1, s2 ) ), fineK );
      float speck = smoothstep( 0.78, 0.9, texture( uNoise, q * 3.1 + 0.83 ).r ) * fineK;
      vec3 thatch = under * ( 0.82 + 0.28 * clump );
      thatch = mix( thatch, thatch * vec3( 1.3, 1.25, 0.95 ), strand * 0.35 );
      thatch = mix( thatch, dirtColor( n ) * 0.55, speck * 0.35 );
      under = mix( under, thatch, groundDetail * 0.8 );
    }
    vec3 c = mix( bare, under, floorG * carpet );

    float slope = 1.0 - nrm.y;
    // Banks: worn earth on moderate slopes. Where the meadow grows (mask r) a
    // hillside stays grass well past 45 degrees; only where the grass has
    // already thinned does the earth show.
    float sward = smoothstep( 0.3, 0.8, m.r ) * 0.1;
    float bank = smoothstep( 0.3 + sward, 0.46 + sward, slope + ( n.z - 0.5 ) * 0.1 );
    c = mix( c, dirtColor( n ) * 0.9, bank * mix( 0.6, 0.28, max( smoothstep( 0.3, 0.8, m.r ), carpet * 0.8 ) ) );
    return c;
  }
`;
