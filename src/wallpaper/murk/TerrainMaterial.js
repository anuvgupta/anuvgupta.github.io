// Adapted from murk3d (github.com/anuvgupta/murk3d), src/world/TerrainMaterial.js.
//
// MeshStandardMaterial whose albedo is computed per pixel from world position:
// the meadow's turf and, on the steepest banks, worn earth. No tiled textures,
// so nothing looks blocky up close or repeats at a distance. (The game's rock,
// snow and debug paths are left out: these hills are all turf.)
import * as THREE from 'three';
import { GROUND_GLSL } from './ground.js';
import { TERRAIN_HEIGHT_GLSL, PEAKS, VIEW } from '../terrain.js';

const f1 = (v) => v.toFixed(1);
const PEAKS_GLSL = PEAKS.map(([F, R, h, w]) => `vec4( ${f1(F)}, ${f1(R)}, ${f1(h)}, ${f1(w)} )`).join(', ');

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
        // The far mountains' texture, 0 (dark: gullies, forest, faces in
        // shadow) to 1 (light: spurs, clearings, faces to the sun), as Bliss
        // and paintings of it show them: soft strokes running down from each
        // peak, broad blotches of forest, and the sunlit side lighter.
        const vec4 PEAKS[${PEAKS.length}] = vec4[]( ${PEAKS_GLSL} );
        float mountainTone( vec3 p, float lit ) {
          // The peak whose slope this is: the tallest here, as in the landform.
          vec2 fr = vec2( ${f1(VIEW.x)} - p.x, -p.z );
          vec4 pk = PEAKS[0];
          float best = -1.0;
          for ( int i = 0; i < ${PEAKS.length}; i++ ) {
            vec4 k = PEAKS[i];
            float d = length( fr - k.xy );
            float h = k.z * exp( -pow( sqrt( d * d + 400.0 ) / k.w, 0.85 ) );
            if ( h > best ) { best = h; pk = k; }
          }
          // Where things lie in the view: bearing and elevation angle.
          vec3 d = p - cameraPosition;
          vec2 view = vec2( atan( d.z, -d.x ), d.y / length( d.xz ) );
          vec3 dp = vec3( ${f1(VIEW.x)} - pk.x, pk.z, -pk.y ) - cameraPosition;
          vec2 apex = vec2( atan( dp.z, -dp.x ), dp.y / length( dp.xz ) );
          // Strokes fanning down from the summit as seen, as a painter lays
          // them: noise by angle around the apex on screen, stretched along
          // the stroke.
          vec2 fan = view - apex;
          // (Broken along their length, and only from a little below the
          // summit, so they never meet in a starburst.)
          float stroke = texture( uNoise, vec2( atan( fan.x, -fan.y ) * 0.8 + pk.x * 0.0007, length( fan ) * 8.0 ) + 0.31 ).r;
          stroke = mix( 0.5, stroke, smoothstep( 0.004, 0.02, length( fan ) ) );
          // Forest blotches, wider than tall.
          float mott = texture( uNoise, vec2( view.x * 6.0, view.y * 15.0 ) + 0.62 ).g;
          return smoothstep( 0.1, 0.9, smoothstep( 0.3, 0.7, stroke ) * 0.25 + smoothstep( 0.3, 0.7, mott ) * 0.4 + lit * 0.35 );
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
          // Indigo, like far mountains in a clear midday haze, darker in the
          // forest and gullies.
          float rangeK = smoothstep( 700.0, 1200.0, vd ) * 0.9 * uLush;
          if ( rangeK > 0.0 ) {
            vec3 range = mix( vec3( 0.03, 0.018, 0.12 ), vec3( 0.2, 0.15, 0.4 ), mountainTone( vWPos, 0.5 ) );
            ground = mix( ground, range, rangeK );
          }
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
          // By day, spurs and clearings facing the sun on the left stand
          // clear of the haze; gullies, forest and the faces turned away sink
          // into it. By night the ranges lie deep in the haze, the same
          // texture showing only faintly.
          float mtn = smoothstep( 1200.0, 1800.0, length( vViewPosition ) );
          float tone = 0.5;
          if ( mtn > 0.0 ) {
            tone = mountainTone( vWPos, smoothstep( -0.25, 0.35, farN.z ) );
            far = mix( far, max( far, 0.8 ), mtn * ( 1.0 - uLush ) );
            float day = mtn * uLush;
            far = mix( far, clamp( far * mix( 1.5, 0.35, tone ), 0.0, 1.0 ), day );
            outgoingLight *= mix( 1.0, mix( 0.5, 1.6, tone ), day );
          }
          outgoingLight = mix( outgoingLight, uHaze * vec3( 0.76, 0.68, 1.2 ), far );
          outgoingLight *= mix( 1.0, mix( 0.7, 1.3, tone ), mtn * ( 1.0 - uLush ) );
        }
        #include <opaque_fragment>`
      );
  };
  return material;
}
