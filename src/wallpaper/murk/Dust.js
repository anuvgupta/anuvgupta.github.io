// Copied from murk3d (github.com/anuvgupta/murk3d).
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

// Dust in the air: a fine mist of tiny specks all about you, of slightly
// different sizes, drifting with the wind and wandering a little on their
// own. In ordinary light they are barely there; where a speck hangs in a
// sunbeam (it tests the sun's own shadow map, so only in the light between
// the shadows of leaves and walls) it catches the light, brightest looking
// toward the sun, so the shafts of light fill with glinting dust.
const COUNT = 3300;
const IN_SHAFTS = 2800; // more that show only inside a shaft of light
const BOX = 26; // metres across, round you
const LOW = 2.5; // metres below your eyes it reaches
const HIGH = 7.5; // and above

export class Dust {
  constructor({ wind, sun }) {
    this.wind = wind;
    this.sun = sun;
    const random = mulberry32(17);
    const all = COUNT + IN_SHAFTS;
    const pos = new Float32Array(all * 3);
    const seed = new Float32Array(all * 4);
    const extra = new Float32Array(all);
    extra.fill(1, COUNT);
    for (let i = 0; i < all; i++) {
      pos.set([random() * BOX, random() * (LOW + HIGH), random() * BOX], i * 3);
      // Size (nearly all very fine, the odd one a little larger), wander pace, phase, brightness.
      seed.set([Math.pow(random(), 2.8), 0.5 + random(), random() * 6.2832, 0.6 + random() * 0.4], i * 4);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    geometry.setAttribute('aExtra', new THREE.BufferAttribute(extra, 1));
    const own = {
      uTime: { value: 0 },
      uOrigin: { value: new THREE.Vector3() },
      uDrift: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() },
      uAmbient: { value: 0 },
      uNight: { value: 0 },
      uPixelScale: { value: 1 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.lights, own]),
      lights: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        #include <common>
        #include <shadowmap_pars_vertex>
        attribute vec4 aSeed;
        attribute float aExtra;
        uniform float uTime;
        uniform vec3 uOrigin;
        uniform vec3 uDrift;
        uniform vec3 uSunDir;
        uniform float uNight;
        uniform float uPixelScale;
        varying float vFade;
        varying float vPhase;
        varying float vCover;
        varying vec4 vShadowCoord;
        varying float vExtra;
        varying vec4 vRing[ 4 ];
        void main() {
          // Carried by the wind, each wandering slowly on its own.
          vec3 p = position + uDrift;
          float t = uTime * aSeed.y;
          p += vec3( sin( t * 0.43 + aSeed.z ), sin( t * 0.31 + aSeed.z * 2.1 ) * 0.6, cos( t * 0.37 + aSeed.z * 1.7 ) ) * 0.35;
          // Wrapped into the box round you, so the air you move into is always full.
          vec3 box = vec3( ${BOX.toFixed(1)}, ${(LOW + HIGH).toFixed(1)}, ${BOX.toFixed(1)} );
          vec3 lo = uOrigin - vec3( box.x * 0.5, ${LOW.toFixed(1)}, box.z * 0.5 );
          vec3 w = lo + mod( p - lo, box );
          // Thin out toward the box's walls, so none pops in or out.
          vec3 e = abs( ( w - lo ) / box - 0.5 ) * 2.0;
          float edge = 1.0 - smoothstep( 0.75, 1.0, max( e.x, max( e.y, e.z ) ) );
          vec4 mv = viewMatrix * vec4( w, 1.0 );
          gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          // A soft dot a few pixels across (bright motes read larger than
          // they are), never smaller: further off it only fades. (A dot a
          // pixel wide was smoothed away by the frame blending, which drops
          // lone bright pixels.)
          float size = ( 0.003 + 0.008 * aSeed.x ) * uPixelScale / max( d, 0.1 );
          gl_PointSize = clamp( size * 1.6, 2.0, 3.8 );
          vCover = min( 1.0, size * 0.8 );
          vExtra = aExtra;
          vFade = edge * smoothstep( 0.35, 1.2, d ) * ( 1.0 - smoothstep( 9.0, 13.0, d ) ) * aSeed.w;
          // By moonlight it shows far more plainly, so most of it rests.
          vFade *= 1.0 - uNight * step( 0.065, fract( aSeed.z * 5.37 ) );
          // Toward the sun: the forward glint of a mote in a beam. Seen from
          // the side or with the sun behind you it still shows in a beam
          // (it was next to nothing: the dust only showed looking into the sun).
          vec3 view = normalize( w - cameraPosition );
          vPhase = pow( max( dot( view, uSunDir ), 0.0 ), 6.0 ) * 3.0 + pow( max( dot( view, uSunDir ), 0.0 ), 1.5 ) * 0.6 + 0.3;
          vShadowCoord = vec4( 0.0 );
          #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
            vShadowCoord = directionalShadowMatrix[ 0 ] * vec4( w, 1.0 );
            // Points a metre to each side across the light: dark round a lit
            // speck means it hangs in a shaft, not in open sun.
            vec3 acrossA = normalize( cross( uSunDir, vec3( 0.001, 1.0, 0.0 ) ) );
            vec3 acrossB = cross( acrossA, uSunDir );
            vRing[ 0 ] = directionalShadowMatrix[ 0 ] * vec4( w + acrossA, 1.0 );
            vRing[ 1 ] = directionalShadowMatrix[ 0 ] * vec4( w - acrossA, 1.0 );
            vRing[ 2 ] = directionalShadowMatrix[ 0 ] * vec4( w + acrossB, 1.0 );
            vRing[ 3 ] = directionalShadowMatrix[ 0 ] * vec4( w - acrossB, 1.0 );
          #endif
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <packing>
        #include <lights_pars_begin>
        #include <shadowmap_pars_fragment>
        uniform vec3 uSunColor;
        uniform float uAmbient;
        varying float vFade;
        varying float vPhase;
        varying float vCover;
        varying vec4 vShadowCoord;
        varying float vExtra;
        varying vec4 vRing[ 4 ];
        void main() {
          float r = length( gl_PointCoord - 0.5 ) * 2.0;
          float a = ( 1.0 - smoothstep( 0.4, 1.0, r ) ) * vFade * vCover;
          float lit = 1.0;
          float inShaft = 0.0;
          #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
            DirectionalLightShadow s = directionalLightShadows[ 0 ];
            lit = getShadow( directionalShadowMap[ 0 ], s.shadowMapSize, s.shadowIntensity, s.shadowBias, s.shadowRadius, vShadowCoord );
            float ring = 0.0;
            for ( int i = 0; i < 4; i++ ) ring += getShadow( directionalShadowMap[ 0 ], s.shadowMapSize, s.shadowIntensity, s.shadowBias, s.shadowRadius, vRing[ i ] );
            inShaft = lit * ( 1.0 - smoothstep( 0.3, 0.85, ring / 4.0 ) );
          #endif
          // Those that only show in a shaft; and every speck in one is lit up
          // whichever way you look at it. Out in the open nothing changes.
          if ( vExtra > 0.5 ) a *= inShaft;
          vec3 c = uSunColor * lit * ( vPhase * 0.25 + inShaft * 0.9 ) + vec3( uAmbient );
          gl_FragColor = vec4( c * a, 1.0 );
        }`,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.receiveShadow = true;
    this.points.renderOrder = 2;
    this.drift = new THREE.Vector3();
  }

  setViewport(heightPx, fovDeg) {
    this.material.uniforms.uPixelScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  update(dt, eye, light) {
    const u = this.material.uniforms;
    u.uTime.value += dt;
    // Drift with the wind: faster as it blows, never a gale of dust.
    const w = this.wind;
    const s = w.strengthAt ? w.strengthAt(eye.x, eye.z) : w.uniforms.uWindStrength.value;
    const pace = 0.15 + 0.5 * s;
    this.drift.x += w.direction.x * pace * dt;
    this.drift.z += w.direction.y * pace * dt;
    this.drift.y += Math.sin(u.uTime.value * 0.11) * 0.02 * dt;
    u.uDrift.value.copy(this.drift);
    u.uOrigin.value.copy(eye);
    u.uSunDir.value.copy(this.sun.direction);
    u.uSunColor.value.copy(this.sun.color);
    // Faintly there in any daylight, beams or not.
    u.uAmbient.value = 0.006 * light;
    u.uNight.value = 1 - THREE.MathUtils.smoothstep(light, 0.25, 0.7);
  }
}
