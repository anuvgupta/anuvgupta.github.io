// Adapted from murk3d (github.com/anuvgupta/murk3d), src/world/TerrainMaterial.js.
//
// MeshStandardMaterial whose albedo is computed per pixel from world position:
// the meadow's turf and, on the steepest banks, worn earth. No tiled textures,
// so nothing looks blocky up close or repeats at a distance. (The game's rock,
// snow and debug paths are left out: these hills are all turf.)
import * as THREE from 'three';
import { GROUND_GLSL } from './ground.js';
import { TERRAIN_HEIGHT_GLSL } from '../terrain.js';

export function createTerrainMaterial({ noise, heightMap }) {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, envMapIntensity: 1.35 });
  // How much of the Bliss green shows: 1 by day, 0 at night (set per frame).
  material.userData.lush = { value: 1 };
  // The horizon haze colour (the atmosphere's fog, set per frame): the far
  // ranges fade into it, so they lie faint and layered on the horizon.
  material.userData.haze = { value: new THREE.Color() };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNoise = { value: noise };
    shader.uniforms.uLush = material.userData.lush;
    shader.uniforms.uHaze = material.userData.haze;
    shader.uniforms.uHeightMap = { value: heightMap };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        varying vec3 vWNormal;`
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
        vWNormal = normalize( mat3( modelMatrix ) * objectNormal );`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        varying vec3 vWNormal;
        uniform sampler2D uHeightMap;
        uniform float uLush;
        uniform vec3 uHaze;
        ${TERRAIN_HEIGHT_GLSL}
        ${GROUND_GLSL}
        // The far mountains' ridges: noise stretched tall and narrow across the
        // view, so it streaks down their slopes as spurs (high) and gullies (low).
        float mountainGully( vec3 p ) {
          // Across by bearing from the viewer, not by world position: the
          // ranges lie well off to the side, where lines of one world z run
          // into the distance and show as stripes along the slopes.
          float az = atan( p.z - cameraPosition.z, cameraPosition.x - p.x );
          // (Gullies tens of metres apart: finer than that, mipmapping at this
          // distance averages the noise to a flat tone.)
          return texture( uNoise, vec2( az * 10.6, p.y * 0.0008 ) + 0.31 ).r * 0.75
            + texture( uNoise, vec2( az * 15.9, p.y * 0.0012 ) + 0.77 ).g * 0.25;
        }
        // The far ranges' surface normal, from the height field across ~60 m.
        // Out there the grid's cells are tens of metres deep but only metres
        // wide, so the mesh's own normals step from row to row and light the
        // slopes in streaks.
        vec3 farNormal( vec2 p ) {
          const float S = 60.0;
          float hL = terrainHeight( p - vec2( S, 0.0 ) );
          float hR = terrainHeight( p + vec2( S, 0.0 ) );
          float hD = terrainHeight( p - vec2( 0.0, S ) );
          float hU = terrainHeight( p + vec2( 0.0, S ) );
          return normalize( vec3( hL - hR, 2.0 * S, hD - hU ) );
        }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 wn = normalize( vWNormal );
        // A gradient normal from the height texture, spanning about one grid
        // cell: it averages neighbouring faces instead of stepping per
        // triangle the way a screen-space derivative does.
        vec3 faceN;
        {
          float mm = max( abs( vWPos.x ), abs( vWPos.z ) ) * T_SINHK / T_HALF;
          float sp = ( 2.0 * T_HALF * T_WARP / ( T_SEG * T_SINHK ) ) * sqrt( 1.0 + mm * mm ) * 0.8;
          float hL = terrainHeight( vWPos.xz - vec2( sp, 0.0 ) );
          float hR = terrainHeight( vWPos.xz + vec2( sp, 0.0 ) );
          float hD = terrainHeight( vWPos.xz - vec2( 0.0, sp ) );
          float hU = terrainHeight( vWPos.xz + vec2( 0.0, sp ) );
          faceN = normalize( vec3( hL - hR, 2.0 * sp, hD - hU ) );
        }
        float steepK = smoothstep( 0.9, 0.62, min( wn.y, faceN.y ) );
        vec3 wnClass = normalize( mix( wn, faceN, 0.7 * steepK ) );
        // The same baked slope the blade shader culls by, so the carpet colour
        // stops exactly where the blades do.
        float carpet = smoothstep( 0.5, 0.68, min( terrainSlope( vWPos.xz ), min( wn.y, faceN.y ) ) );
        groundDetail = 1.0 - smoothstep( 8.0, 40.0, length( vViewPosition ) );
        vec3 ground = groundColor( vWPos, wnClass, carpet );
        // Bliss: past the blades the turf reads as one lush green carpet in
        // broad, soft sweeps, and the far mountains as indigo. By night
        // the meadow's own moonlit colours come back.
        {
          float vd = length( vViewPosition );
          float sweep = texture( uNoise, vWPos.xz * 0.0035 + 0.53 ).r * 0.7 + texture( uNoise, vWPos.xz * 0.011 + 0.2 ).g * 0.3;
          vec3 lush = mix( vec3( 0.085, 0.30, 0.014 ), vec3( 0.15, 0.46, 0.022 ), smoothstep( 0.3, 0.7, sweep ) );
          ground = mix( ground, lush, smoothstep( 40.0, 150.0, vd ) * 0.85 * uLush );
          // Indigo, like far mountains in a clear midday haze, with lighter
          // spurs and darker gullies down their slopes.
          vec3 range = mix( vec3( 0.03, 0.018, 0.12 ), vec3( 0.2, 0.15, 0.4 ), smoothstep( 0.35, 0.65, mountainGully( vWPos ) ) );
          ground = mix( ground, range, smoothstep( 700.0, 1200.0, vd ) * 0.9 * uLush );
        }
        diffuseColor.rgb *= ground;`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        // Light the far ranges by their smoothed normal.
        vec3 farN = normalize( vWNormal );
        {
          float smoothK = smoothstep( 600.0, 1200.0, length( vViewPosition ) );
          if ( smoothK > 0.0 ) {
            farN = normalize( mix( farN, farNormal( vWPos.xz ), smoothK ) );
            normal = normalize( ( viewMatrix * vec4( farN, 0.0 ) ).xyz );
          }
        }`
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          // Far ranges: extra haze past the meadow, more the further they lie.
          float far = 1.0 - exp( -max( length( vViewPosition ) - 800.0, 0.0 ) * 0.0002 );
          // The mountains lie clearest at their peaks, fading into the haze
          // toward their feet.
          float feet = ( 1.0 - smoothstep( 60.0, 200.0, vWPos.y ) ) * smoothstep( 1200.0, 1800.0, length( vViewPosition ) );
          far = mix( far, 1.0, feet * 0.45 );
          // By day, spurs facing the sun on the left stand clear of the haze;
          // gullies and the faces turned away sink into it. By night the
          // ranges are plain silhouettes in the haze.
          float mtn = smoothstep( 1200.0, 1800.0, length( vViewPosition ) );
          far = mix( far, max( far, 0.8 ), mtn * ( 1.0 - uLush ) );
          mtn *= uLush;
          if ( mtn > 0.0 ) {
            float lit = smoothstep( -0.25, 0.35, farN.z );
            float tone = smoothstep( 0.3, 0.7, mountainGully( vWPos ) ) * 0.65 + lit * 0.35;
            far = mix( far, clamp( far * mix( 1.5, 0.35, tone ), 0.0, 1.0 ), mtn );
            outgoingLight *= mix( 1.0, mix( 0.6, 1.5, tone ), mtn );
          }
          outgoingLight = mix( outgoingLight, uHaze * vec3( 0.76, 0.68, 1.2 ), far );
        }
        #include <opaque_fragment>`
      );
  };
  return material;
}
