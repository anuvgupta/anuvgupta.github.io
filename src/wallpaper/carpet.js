// The distant grass: a carpet painted over the terrain where blades would be
// narrower than a pixel. Past the middle distance a blade can't be seen
// sway, only drawn as grain, so instead of blades the hill gets this layer:
// the blades' own colour, lit by the same material and lights, glowing the
// same way against a low sun, and rolling with the same wind waves as
// lighter and darker sweeps. The blades shrink into it over the hand-off
// band (Grass.js), so the field runs on without a seam.
//
// It is the terrain's own mesh drawn a second time, on top, in the grass's
// material (Lambert): the terrain's material lights differently (it takes
// the sky's environment light), so the turf painted into it never quite
// matched the blades at sunrise, midday and sunset alike.
import * as THREE from 'three';
import { GROUND_GLSL } from './murk/ground.js';
import { WIND_GLSL } from './murk/Wind.js';
import { TERRAIN_HEIGHT_GLSL } from './terrain.js';

// Metres from the viewer: the carpet comes in under the blades, so the
// ground between far blades is already the field's colour, and fades out
// past the hill, before the far ranges.
const CARPET_IN = [22, 45];
const CARPET_OUT = [350, 600];

export function createCarpet({ geometry, terrain, noise, wind, sun }) {
  const material = new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false });
  // Drawn exactly over the terrain (the same mesh): pulled a hair toward the
  // viewer so the depth test never flickers between the two.
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;
  const uniforms = {
    uNoise: { value: noise },
    uHeightMap: { value: terrain.heightTexture },
    uSunDir: { value: sun.direction },
    uSunColor: { value: sun.color },
    ...wind.uniforms,
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;`)
      .replace('#include <project_vertex>', `#include <project_vertex>\nvWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        uniform sampler2D uHeightMap;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        ${GROUND_GLSL}
        ${TERRAIN_HEIGHT_GLSL}
        ${WIND_GLSL}
        vec3 carpetN;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 p = vWPos.xz;
        float vd = distance( vWPos, cameraPosition );
        // The ground's normal as the blades take it (Grass.js), and the same
        // slope cull, so the carpet lies only where blades would grow.
        float hL = terrainHeight( p - vec2( 0.6, 0.0 ) );
        float hR = terrainHeight( p + vec2( 0.6, 0.0 ) );
        float hD = terrainHeight( p - vec2( 0.0, 0.6 ) );
        float hU = terrainHeight( p + vec2( 0.0, 0.6 ) );
        carpetN = normalize( vec3( hL - hR, 1.2, hD - hU ) );
        float grows = smoothstep( 0.5, 0.68, min( terrainSlope( p ), carpetN.y ) );
        // A far blade's colour (Grass.js, fully evened out with distance),
        // averaged over the part of it you see: mostly its upper half.
        vec3 base = meadowColor( p, groundNoise( p ) );
        vec3 tip = mix( base * vec3( 1.08, 1.1, 0.92 ), vec3( 0.62, 0.72, 0.4 ), 0.26 );
        vec3 col = mix( base * 0.8, tip * 0.93, 0.7 ) * realmGrassTint( p ) * 0.94;
        { float gl = dot( col, vec3( 0.3, 0.59, 0.11 ) ); col = mix( col, vec3( gl ) * vec3( 1.06, 1.0, 0.8 ), 0.15 ); }
        // Close to the hand-off, the grain of blade tips; it averages away
        // with distance (the noise is mipmapped), so it never speckles.
        float tips = texture( uNoise, p * vec2( 1.6, 0.9 ) + 0.27 ).b * 0.55 + texture( uNoise, p * 3.7 + 0.71 ).a * 0.45;
        col *= mix( 1.0, 0.86 + 0.28 * tips, 1.0 - smoothstep( 60.0, 160.0, vd ) );
        // Wind: the field's waves, as light and dark sweeps.
        col *= windTone( p );
        diffuseColor.rgb = col;
        diffuseColor.a = smoothstep( ${CARPET_IN[0].toFixed(1)}, ${CARPET_IN[1].toFixed(1)}, vd )
          * ( 1.0 - smoothstep( ${CARPET_OUT[0].toFixed(1)}, ${CARPET_OUT[1].toFixed(1)}, vd ) ) * grows;
        if ( diffuseColor.a < 0.002 ) discard;`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = normalize( ( viewMatrix * vec4( carpetN, 0.0 ) ).xyz );`
      )
      .replace(
        '#include <opaque_fragment>',
        `// The sun through the blades when looking toward it, as on a blade
        // (Grass.js), averaged up its length; and no brighter than grass ever
        // gets, so it never blooms.
        vec3 viewDir = normalize( vWPos - cameraPosition );
        float trans = pow( max( dot( viewDir, uSunDir ), 0.0 ), 6.0 ) * 0.38;
        outgoingLight += uSunColor * diffuseColor.rgb * trans * 0.7;
        outgoingLight = min( outgoingLight, vec3( 2.5 ) );
        #include <opaque_fragment>`
      );
  };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'carpet';
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = 1;
  return mesh;
}
