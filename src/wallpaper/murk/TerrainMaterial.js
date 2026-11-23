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
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNoise = { value: noise };
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
        ${TERRAIN_HEIGHT_GLSL}
        ${GROUND_GLSL}`
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
        diffuseColor.rgb *= ground;`
      );
  };
  return material;
}
