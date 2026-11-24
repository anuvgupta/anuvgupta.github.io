// Copied from murk3d (github.com/anuvgupta/murk3d).
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

// Ambient particles around the player: drifting dust motes and pollen that
// catch the light, and a few faint sparks at night. They live in the world
// within a box about you, wrapping round to its far side when you leave them
// behind, so the air is never empty.
//
// All of them drift gently and alike: a little with the wind and a little the
// way you are going, each a touch faster or slower, with a slow wander; and
// they sink slowly, a new one appearing up high somewhere about you as each
// reaches the ground. While
// you move, each mote's own glow stretches into a short streak behind it,
// on your side of it (opposite the way you are going), as if it were flying
// along with you; streaks come and go with your movement, and standing still
// they are soft drifting dots. (The streak used to lie on the far side,
// toward where you were heading, so the motes seemed to rush at you.) (Some used
// to trail thin lines of light along their wind drift; far off, the dot was
// too faint to see and the line read as a stray streak across the view.)
const COUNT = 400; // particles: a scattering of fine motes through the air, never a snowfall
const BOX = 60; // metres across: wide, so they are well spread out
const HEIGHT = 12;
const STREAK = 0.08; // seconds of your motion each streak spans

export class Motes {
  constructor({ wind, sun }) {
    this.wind = wind;
    const random = mulberry32(5);
    const positions = new Float32Array(COUNT * 3);
    const seeds = new Float32Array(COUNT * 4);
    const paces = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = (random() - 0.5) * BOX;
      positions[i * 3 + 1] = random() * HEIGHT;
      positions[i * 3 + 2] = (random() - 0.5) * BOX;
      const kind = random();
      // Mostly fine specks, some medium motes, and a rare large one: the
      // extra motes are all specks (as many medium and large as before,
      // about 16 and 4), and the finest specks finer.
      const tier = random();
      const size = tier < 0.9 ? 0.05 + random() * 0.24 : tier < 0.985 ? 0.4 + random() * 0.25 : 0.75 + random() * 0.3;
      seeds.set([random(), size, kind, random()], i * 4);
      paces[i] = 0.75 + random() * 0.5; // alike, a touch faster or slower
    }
    this.paces = paces;
    this.random = random;
    this.offsets = positions;
    this.prevPos = null;
    this.velocity = new THREE.Vector3(); // yours, smoothed
    this.drift = new THREE.Vector3();

    // One quad per mote, drawn as a glowing dot that stretches along the
    // streak on screen.
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('corner', new THREE.Float32BufferAttribute([0, -1, 1, -1, 1, 1, 0, 1], 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    this.posAttr = new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 3), 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aPos', this.posAttr);
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geometry.instanceCount = COUNT;
    const uniforms = {
      uTime: { value: 0 },
      uPixelScale: { value: 1 },
      uSunDir: { value: sun.direction },
      uSunColor: { value: sun.color },
      uNight: { value: 0 },
      uLight: { value: 1 },
      uStreak: { value: new THREE.Vector3() },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        attribute vec2 corner;
        attribute vec3 aPos;
        attribute vec4 aSeed;
        uniform float uTime;
        uniform float uPixelScale;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform float uNight;
        uniform float uLight;
        uniform vec3 uStreak;
        varying float vAlpha;
        varying vec3 vColor;
        varying float vCore;
        varying vec2 vLocal;
        varying float vLen;
        varying float vR;
        void main() {
          vec4 head = viewMatrix * vec4( aPos, 1.0 );
          float d = -head.z;
          // How bright: it glints between you and the sun, twinkles, and fades
          // out close to the eye and far away.
          float spark = step( aSeed.z, 0.08 );
          vec3 toCam = normalize( aPos - cameraPosition );
          float back = pow( max( dot( toCam, uSunDir ), 0.0 ), 3.0 );
          float twinkle = 0.65 + 0.35 * sin( uTime * ( 0.8 + aSeed.w * 1.6 ) + aSeed.x * 6.283 );
          float mote = ( 0.45 + 0.8 * back ) * twinkle * ( 1.0 - uNight * 0.45 );
          // Three kinds, at random: as bright as any, a medium, and very faint.
          float kindOf = fract( aSeed.x * 23.0 );
          mote *= kindOf < 0.333 ? 1.0 : kindOf < 0.667 ? 0.5 : 0.18;
          // A few always rest, and over half of them by moonlight.
          mote *= step( fract( aSeed.w * 29.0 ), 0.78 ) * ( 1.0 - uNight * step( 0.45, fract( aSeed.w * 17.0 ) ) );
          vAlpha = mix( mote, twinkle * uNight * step( fract( aSeed.x * 13.0 ), 0.4 ), spark ) * smoothstep( 1.0, 3.0, d ) * ( 1.0 - smoothstep( 14.0, 26.0, d ) );
          vec3 dust = mix( vec3( 1.0, 0.92, 0.7 ), uSunColor / max( 0.001, length( uSunColor ) ), 0.4 ) * ( 0.45 + 0.75 * uLight );
          vColor = mix( dust, vec3( 1.0, 0.8, 0.45 ), spark );
          // The glow is drawn several times the mote's size; vCore is the hot
          // core's share of it.
          // Small: the nearest were drawn fat, so the sizes are about half
          // what they were and the glow never spreads past a dozen pixels.
          float size = ( 0.0035 + 0.009 * aSeed.y ) * mix( 1.0, 1.5, spark );
          float sprite = clamp( size * 7.0 * uPixelScale / d, 4.0, 13.0 );
          vCore = clamp( size * uPixelScale / d / sprite, 0.06, 0.5 );
          // The streak: from the mote back toward you, against the way you
          // are going, a moment's worth of your motion. Measured on screen,
          // in pixels.
          vec4 tail = viewMatrix * vec4( aPos - uStreak, 1.0 );
          if ( tail.z > -0.2 ) tail = head;
          vec4 ch = projectionMatrix * head;
          vec4 ct = projectionMatrix * tail;
          // The viewport in pixels, from the pixel scale (height / 2 tan(fov/2)).
          vec2 view = 2.0 * uPixelScale / vec2( projectionMatrix[ 0 ][ 0 ], projectionMatrix[ 1 ][ 1 ] );
          vec2 sh = ch.xy / ch.w * view * 0.5;
          vec2 st = ct.xy / ct.w * view * 0.5;
          vec2 dir = st - sh;
          float len = length( dir );
          vec2 axis = len > 1e-3 ? dir / len : vec2( 1.0, 0.0 );
          vec2 perp = vec2( -axis.y, axis.x );
          float r = sprite * 0.5;
          float s = mix( -r, len + r, corner.x );
          float t = corner.y * r;
          vLocal = vec2( s, t );
          vLen = len;
          vR = r;
          vec2 p = sh + axis * s + perp * t;
          gl_Position = vec4( p / ( view * 0.5 ) * ch.w, ch.z, ch.w );
          // A longer streak spreads the same light thinner.
          vAlpha /= pow( 1.0 + len / ( 3.0 * r ), 0.8 );
          // And a streak is fainter than the still mote it was.
          vAlpha *= mix( 1.0, 0.75, smoothstep( 0.0, 2.0 * r, len ) );
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        varying vec3 vColor;
        varying float vCore;
        varying vec2 vLocal;
        varying float vLen;
        varying float vR;
        void main() {
          // Distance from the streak's spine (a dot when it has no length),
          // brightest at the mote and fading back along the streak.
          float along = clamp( vLocal.x, 0.0, vLen );
          float rr = length( vec2( vLocal.x - along, vLocal.y ) ) / vR;
          float back = vLen > 0.5 ? along / vLen : 0.0;
          float core = exp( -pow( rr / vCore, 2.0 ) * 1.5 ) * ( 1.0 - 0.7 * back );
          float glow = exp( -rr * rr * 4.0 ) * 0.6 * ( 1.0 - 0.85 * back );
          float a = ( core + glow ) * vAlpha;
          if ( a < 0.004 ) discard;
          vec3 c = vColor * ( 1.0 + core * 0.8 );
          // Never as bright as the bloom threshold (4), even over sunlit
          // grass: a backlit mote's core reached about 4.3, and hovering at
          // the threshold its halo popped on and off for a frame or two.
          gl_FragColor = vec4( c, min( a, 1.2 / max( c.r, max( c.g, c.b ) ) ) );
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Mesh(geometry, this.material);
    this.points.frustumCulled = false;
    this.time = 0;
  }

  setViewport(heightPx, fovDeg) {
    this.material.uniforms.uPixelScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  update(dt, playerPos, terrain, night, light) {
    this.time += dt;
    // Your velocity, smoothed, from how far you moved (a jump across the map
    // counts as standing still).
    if (this.prevPos && dt > 0) {
      const vx = (playerPos.x - this.prevPos.x) / dt;
      const vy = (playerPos.y - this.prevPos.y) / dt;
      const vz = (playerPos.z - this.prevPos.z) / dt;
      const fast = Math.hypot(vx, vy, vz) > 25;
      const k = 1 - Math.exp(-dt / 0.12);
      this.velocity.x += ((fast ? 0 : vx) - this.velocity.x) * k;
      this.velocity.y += ((fast ? 0 : vy) - this.velocity.y) * k;
      this.velocity.z += ((fast ? 0 : vz) - this.velocity.z) * k;
    }
    (this.prevPos ||= new THREE.Vector3()).copy(playerPos);
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const moving = THREE.MathUtils.smoothstep(speed, 0.6, 2.5);

    // The drift: a little with the wind, a little the way you are going.
    const w = this.wind;
    const strength = w.strengthAt ? w.strengthAt(playerPos.x, playerPos.z) : w.uniforms.uWindStrength.value;
    const windPace = 0.12 + 0.3 * strength;
    const hx = speed > 0.1 ? this.velocity.x / speed : 0;
    const hz = speed > 0.1 ? this.velocity.z / speed : 0;
    this.drift.set(w.direction.x * windPace + hx * 0.18 * moving, 0, w.direction.y * windPace + hz * 0.18 * moving);
    // The streak each mote trails while you move: set by your motion
    // against the drift, not the wind's (drawn behind the mote, against
    // your way).
    this.material.uniforms.uStreak.value.set(this.velocity.x - this.drift.x, (this.velocity.y - this.drift.y) * 0.5, this.velocity.z - this.drift.z).multiplyScalar(STREAK * moving);

    const arr = this.posAttr.array;
    const off = this.offsets;
    const cx = playerPos.x;
    const cz = playerPos.z;
    const baseY = playerPos.y;
    const half = BOX / 2;
    const pace = this.paces;
    for (let i = 0; i < COUNT; i++) {
      const k = i * 3;
      const p = pace[i];
      off[k] += (this.drift.x * p + Math.sin(this.time * 0.5 * p + i) * 0.06) * dt;
      off[k + 2] += (this.drift.z * p + Math.cos(this.time * 0.45 * p + i * 1.3) * 0.06) * dt;
      // Sinking slowly (0.06-0.16 m/s); one that reaches the ground is
      // replaced by a new one up high, somewhere else about you.
      off[k + 1] -= (0.06 + 0.1 * (p - 0.75) * 2) * dt;
      if (off[k + 1] < 0) {
        off[k + 1] += HEIGHT;
        off[k] = cx + (this.random() - 0.5) * BOX;
        off[k + 2] = cz + (this.random() - 0.5) * BOX;
      }
      const rx = off[k] - cx;
      const rz = off[k + 2] - cz;
      if (rx > half || rx < -half) off[k] = cx + ((((rx + half) % BOX) + BOX) % BOX) - half;
      if (rz > half || rz < -half) off[k + 2] = cz + ((((rz + half) % BOX) + BOX) % BOX) - half;
      const x = off[k];
      const z = off[k + 2];
      // Sit above the local ground, not the player's height, so motes follow slopes.
      const ground = i % 3 === 0 ? terrain.heightAt(x, z) : baseY;
      arr[k] = x;
      arr[k + 1] = Math.max(ground, baseY - 3) + 0.2 + off[k + 1];
      arr[k + 2] = z;
    }
    this.posAttr.needsUpdate = true;
    this.material.uniforms.uTime.value = this.time;
    this.material.uniforms.uNight.value = night;
    this.material.uniforms.uLight.value = light;
  }
}
