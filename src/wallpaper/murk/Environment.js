// Adapted from murk3d (github.com/anuvgupta/murk3d), src/world/Environment.js.
// Copied as written, less the realms (their palettes, held suns and skies)
// and the sun's shadow map. Time of day is set from outside (setTime) rather
// than running on the game's own day clock, and the clouds are the painterly
// style.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { smoothstep, mulberry32 } from './noise.js';
import { applyCloudStyle, CLOUD_BANKS_GLSL } from './clouds.js';
import { SUNRISE, SUNSET, DAY_LENGTH } from '../sun.js';

const LATITUDE_TILT = 0.6; // radians; noon sun sits ~56° up in the south (+z)

// The moon the viewer sees keeps to the right of the westward view (the sun
// keeps to the left): it climbs out from behind the hills there once dusk has
// deepened, arcs a little way up and sinks behind them again before dawn.
const MOONRISE = SUNSET + 0.4;
const MOONSET = SUNRISE - 0.9;
const MOON_LOW = -0.14; // radians; well under the hills' skyline, so it rises and sets behind them
const MOON_HIGH = 0.2; // radians; its highest, about a quarter down from the top of the frame
const MOON_YAW_RISE = 0.38; // radians right of straight ahead
const MOON_YAW_SET = 0.2;
// Cloud cover by day: scattered banks with plenty of open sky.
const DAY_CLOUDS = 0.36;

// The sky's final output: soft-clip the in-scatter so a low sun grades into
// a glow rather than a white-out, and cap it so bloom never runs away. Goes
// on after the cloud style is spliced in (the splice replaces the tail).
function finishSkyFragment(fragment) {
  return fragment.replace(
    'gl_FragColor = vec4( texColor, 1.0 );',
    `{
      // Hue-preserving soft clip: compress luminance, keep the colour ratio,
      // so a bright noon sky stays blue instead of bleaching to white.
      float l = dot( texColor, vec3( 0.2126, 0.7152, 0.0722 ) );
      texColor *= ( l / ( 1.0 + l * 0.7 ) ) / max( l, 1e-4 );
    }
    {
      // By day the sky deepens to a saturated blue away from the horizon.
      float dayF = smoothstep( 0.1, 0.4, vSunDirection.y );
      // (Strong, because the sun's corona and the tone map wash it back toward white.)
      float up = smoothstep( 0.0, 0.4, direction.y );
      // Only on the open sky: tinted too, the clouds went a dim lavender.
      float clear = 1.0 - smoothstep( 0.0, 0.45, skyCloudA );
      texColor = mix( texColor, texColor * vec3( 0.32, 0.54, 1.05 ), dayF * up * clear );
    }
    {
      // Golden hour: the whole horizon warms, not just the sun's side.
      float g = ( 1.0 - smoothstep( 0.02, 0.45, vSunDirection.y ) ) * smoothstep( -0.16, 0.0, vSunDirection.y );
      float hz = 1.0 - smoothstep( 0.0, 0.28, direction.y );
      texColor = mix( texColor, texColor * vec3( 1.2, 0.92, 0.78 ) + vec3( 0.16, 0.07, 0.03 ), g * hz * 0.75 );
    }
    {
      // Afterglow: for a while after sunset (and before sunrise) the horizon
      // around the sun keeps a band of apricot that fades up through rose to
      // violet, so dusk lingers instead of dropping straight to night.
      float below = smoothstep( 0.03, -0.05, vSunDirection.y ) * ( 1.0 - smoothstep( -0.14, -0.3, vSunDirection.y ) );
      vec2 sunH = normalize( vSunDirection.xz + vec2( 1e-5, 0.0 ) );
      vec2 dirH = normalize( direction.xz + vec2( 1e-5, 0.0 ) );
      // Straight away from the sun the dot rounds a hair below -1; pow() of
      // that negative is NaN on real GPUs, which painted a navy line down the
      // anti-sun meridian. Clamp, and cube by hand.
      float toward = clamp( 0.5 + 0.5 * dot( sunH, dirH ), 0.0, 1.0 );
      float band = exp( -max( direction.y, 0.0 ) * ( 5.0 + 9.0 * ( 1.0 - toward ) ) ) * smoothstep( -0.06, 0.01, direction.y );
      float hgt = clamp( direction.y * 6.0, 0.0, 1.0 );
      vec3 glowC = mix( vec3( 1.0, 0.52, 0.22 ), vec3( 0.62, 0.32, 0.55 ), hgt );
      float strength = below * band * ( 0.1 + 0.9 * toward * toward * toward );
      texColor += glowC * strength * 0.55;
    }
    // Guard before the clamp: clamp() turns NaN into 0, which would let the
    // navy floor below show through instead of tripping the guard.
    if ( any( isnan( texColor ) ) || any( isinf( texColor ) ) ) texColor = vec3( 0.5, 0.6, 0.7 );
    texColor = clamp( texColor, vec3( 0.0 ), vec3( 1.6 ) );
    // Night sky is deep navy, never pure black.
    texColor = max( texColor, vec3( 0.006, 0.009, 0.02 ) );
    gl_FragColor = vec4( texColor, 1.0 );`
  );
}

const C = (hex) => new THREE.Color(hex);
const PALETTE = {
  sunHigh: C(0xfff1d6),
  sunLow: C(0xff7a2e),
  moon: C(0x8fa8ea),
  dusk: C(0xff6a6a),
  fogDay: C(0xb9cde4),
  fogGolden: C(0xe2a383),
  fogNight: C(0x0b0f19),
  hemiSkyDay: C(0xc4d2e4), // the open sky is blue: shade under a noon sun is cool, not grey-brown
  hemiSkyGolden: C(0xf0b08a),
  hemiSkyNight: C(0x5a6fa8),
  hemiGround: C(0x7e8660), // bounce off a meadow is olive-green, not brown: shaded slopes stay grass
  hemiGroundNight: C(0x2a3250),
};

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;

    this.timeOfDay = 17.0; // hours; begin in the late-afternoon light
    // Whole days gone by, and this visit's own throw for which nights are
    // clouded (about half of them).
    this.dayCount = 0;
    this.nightSeed = Math.random() * 1000;
    this.timeScale = 0; // the hour is set from outside
    this.paused = true;

    this.sunDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3();
    this.nightFactor = 0;
    this.lightLevel = 1;
    this.exposure = 0.55;
    this.focusHeight = 0;
    this._tmpColor = new THREE.Color();
    this._tmpColor2 = new THREE.Color();
    this.atmosphere = {
      sunDir: new THREE.Vector3(0, 1, 0),
      sunColor: new THREE.Color(),
      sunVisible: 0,
      fogColor: new THREE.Color(),
      fogSunColor: new THREE.Color(),
      fogDensity: 0.001,
      fogHeight: 0,
      fogFalloff: 0.02,
      groundMist: 0,
      mistColor: new THREE.Color(),
      mistOwn: 0,
      mistFill: 0,
      contrast: 1,
      shaft: 0,
      glow: 0,
      disc: 0,
      saturation: 1,
      lift: new THREE.Color(),
      vignette: 0,
    };

    // Sky dome with built-in clouds.
    this.sky = new Sky();
    this.sky.scale.setScalar(9000);
    // The stock disc is a hard 0.5° dot; make it a soft 2.5° orb with a corona.
    this.sky.material.fragmentShader = this.sky.material.fragmentShader
      .replace(
        'float sundisc = clamp( ( cosTheta - sunAngularDiameterCos ) * 50000.0, 0.0, 1.0 ) * showSunDisc;',
        `float sunAngle = acos( clamp( cosTheta, -1.0, 1.0 ) );
        float sundisc = ( smoothstep( 0.024, 0.012, sunAngle ) * 0.8 + exp( -sunAngle * 60.0 ) * 0.5 ) * showSunDisc;`
      )
      .replace(
        'vec3 sundiscColor = ( 760.0 * sundisc ) * min( vSunE * Fex, 80.0 );',
        'vec3 sundiscColor = ( 520.0 * sundisc ) * min( vSunE * Fex, 80.0 );'
      )
      ;
    this.cloudStyle = 'painterly';
    this.baseSkyFragment = this.sky.material.fragmentShader;
    this.sky.material.fragmentShader = finishSkyFragment(applyCloudStyle(this.baseSkyFragment, this.cloudStyle));
    this.sky.material.needsUpdate = true;
    scene.add(this.sky);
    const u = this.sky.material.uniforms;
    u.mieDirectionalG.value = 0.8;
    if (u.showSunDisc) u.showSunDisc.value = 0;
    if (u.cloudCoverage) {
      u.cloudCoverage.value = DAY_CLOUDS;
      u.cloudDensity.value = 0.5;
      u.cloudScale.value = 0.00028;
    }
    u.cloudNightCol = { value: new THREE.Vector3() };
    u.cloudMoonDir = { value: new THREE.Vector3(0, 1, 0) };

    // A second sky in its own scene, rendered into the image-based lighting.
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.material = this.sky.material;
    this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envTarget = null;
    this.envTimer = 0;
    this.lastEnvSunDir = new THREE.Vector3(0, -2, 0);

    // Sun (or moon, at night).
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
    scene.add(this.hemi);


    this.stars = createStars((h, t) => this.moonDirection(h, t));
    scene.add(this.stars);

    this._tmp = new THREE.Vector3();
    this._color = new THREE.Color();

    this.update(0, new THREE.Vector3());
    this.refreshEnvironment();
  }

  setTime(hours) {
    this.timeOfDay = ((hours % 24) + 24) % 24;
  }

  // Where the moon stands at `hours`. Its path rides a little higher than
  // the sun's opposite, so at dawn it is still above the hills in the west as
  // it fades.
  moonDirection(hours, target) {
    this.computeSunDirection(hours, target).negate();
    target.y += 0.28;
    return target.normalize();
  }

  // Where the drawn moon stands at `hours` (see MOONRISE). Under the hills by
  // day; moonDirection is still the sky's true turn, which the stars follow.
  viewMoonDirection(hours, target) {
    const span = (MOONSET - MOONRISE + 24) % 24;
    const t = (hours - MOONRISE + 24) % 24;
    const p = t < span ? t / span : 0;
    const elev = MOON_LOW + (MOON_HIGH - MOON_LOW) * Math.pow(Math.sin(Math.PI * p), 0.6);
    const yaw = THREE.MathUtils.lerp(MOON_YAW_RISE, MOON_YAW_SET, p);
    // The view looks down -x with +z on its left.
    return target.set(-Math.cos(yaw) * Math.cos(elev), Math.sin(elev), -Math.sin(yaw) * Math.cos(elev));
  }

  computeSunDirection(hours, target) {
    // Rises due east (+x) at SUNRISE, sets due west (-x) DAY_LENGTH hours later.
    const theta = ((hours - SUNRISE) / DAY_LENGTH) * Math.PI;
    return target
      .set(Math.cos(theta), Math.sin(theta) * Math.cos(LATITUDE_TILT), Math.sin(theta) * Math.sin(LATITUDE_TILT))
      .normalize();
  }

  // The scene's image-based light. The sky probe is rendered without the sun
  // disc and with the haze (mie) turned down, so it carries sky colour and not
  // a second, blurred sun; the directional light is the sun.
  refreshEnvironment() {
    const u = this.sky.material.uniforms;
    const disc = u.showSunDisc;
    const mie = u.mieCoefficient.value;
    const mieG = u.mieDirectionalG.value;
    if (disc) disc.value = false;
    u.mieCoefficient.value = 0.0008;
    u.mieDirectionalG.value = 0.3;
    const skyU = this.sky.material.uniforms;
    const cov = skyU.cloudCoverage ? skyU.cloudCoverage.value : 0;
    if (skyU.cloudCoverage) skyU.cloudCoverage.value = 0; // the probe wants the light, not the clouds
    const target = this.pmrem.fromScene(this.envScene, 0.04, 0.1, 5000);
    if (skyU.cloudCoverage) skyU.cloudCoverage.value = cov;
    if (disc) disc.value = true;
    u.mieCoefficient.value = mie;
    u.mieDirectionalG.value = mieG;
    if (this.envTarget) this.envTarget.dispose();
    this.envTarget = target;
    this.scene.environment = target.texture;
    this.envTexture = target.texture;
    this.lastEnvSunDir.copy(this.sunDir);
  }

  update(dt, focus, wind = null) {
    if (!this.paused) {
      if (this.timeOfDay + dt * this.timeScale >= 24) this.dayCount++;
      this.setTime(this.timeOfDay + dt * this.timeScale);
    }
    // Clouds move with the wind, a little faster in gusts (never a timelapse).
    this.skyTime = (this.skyTime || 0) + dt * (0.5 + (wind ? wind.uniforms.uWindStrength.value * 0.6 : 0.5));
    this.starTime = (this.starTime || 0) + dt;
    this.focusHeight = focus.y;

    const sunTime = this.timeOfDay;
    const sunDir = this.computeSunDirection(sunTime, this.sunDir);
    // The view looks west, so mirror the morning half of the sun's path onto
    // the west as well: it rises over the hill just as it sets there. The two
    // halves meet at noon, overhead and out of frame. (The moon and stars keep
    // the true path, through computeSunDirection.)
    sunDir.x = -Math.abs(sunDir.x);
    const elev = sunDir.y;
    if (this.sky.material.uniforms.time) this.sky.material.uniforms.time.value = this.skyTime || 0;

    // A long twilight: the light fails slowly after the sun has set.
    const day = smoothstep(-0.2, 0.1, elev);
    // Golden hour runs from a fair way up the sky down to the horizon.
    const golden = (1 - smoothstep(0.02, 0.45, elev)) * smoothstep(-0.14, 0.0, elev);
    this.nightFactor = 1 - smoothstep(-0.2, 0.02, elev);

    // Some nights are clouded in scattered banks with clear sky between
    // (they used to cover nearly all of it), some clear (each night's own
    // throw, noon to noon); the moon lights the clouds blue- or violet-grey.
    {
      const night = Math.floor((this.dayCount * 24 + this.timeOfDay - 12) / 24);
      const hash = (k) => {
        const s = Math.sin((night + this.nightSeed) * 127.1 + k * 311.7) * 43758.5453;
        return s - Math.floor(s);
      };
      const cloudy = this.nightClouds !== undefined ? this.nightClouds : hash(1) < 0.5 ? 1 : 0;
      const su = this.sky.material.uniforms;
      if (su.cloudCoverage) su.cloudCoverage.value = THREE.MathUtils.lerp(DAY_CLOUDS, cloudy ? 0.42 : 0.05, this.nightFactor);
      const moon = this.viewMoonDirection(sunTime, this._cloudMoon || (this._cloudMoon = new THREE.Vector3()));
      su.cloudMoonDir.value.copy(moon);
      const lit = 0.35 + 0.65 * smoothstep(-0.05, 0.25, moon.y);
      const hue = hash(2);
      su.cloudNightCol.value.set(THREE.MathUtils.lerp(0.033, 0.042, hue), THREE.MathUtils.lerp(0.037, 0.033, hue), 0.056).multiplyScalar(lit);
    }

    // Sky scattering: hazier and redder as the sun nears the horizon.
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(sunDir).multiplyScalar(450000);
    // Clear, deep-blue zenith by day; hazier and redder toward the horizon at low sun.
    u.turbidity.value = THREE.MathUtils.lerp(2.0, 5.0, golden);
    u.rayleigh.value = THREE.MathUtils.lerp(1.9, 2.8, golden);
    u.mieCoefficient.value = THREE.MathUtils.lerp(0.0022, 0.0048, golden);

    // Direct light: the sun by day, a dim cool moon by night. Their intensities
    // both pass through ~0 around the horizon, hiding the swap in direction.
    const sunI = 4.4 * smoothstep(-0.03, 0.14, elev) * (0.72 + 0.28 * smoothstep(0.1, 0.5, elev));
    // Civil twilight: with the sun just under the horizon the sky on that side
    // still lights the land, a dim rose rim light from low in the west (or
    // east), so dusk and dawn are not a flat window between sun and moon.
    const duskI = 1.1 * smoothstep(-0.17, -0.06, elev) * (1 - smoothstep(-0.06, 0.0, elev));
    const moonI = 2.0 * smoothstep(-0.1, -0.2, elev);
    if (sunI + duskI > moonI || moonI <= 0.0001) {
      this.lightDir.copy(sunDir);
      if (this.lightDir.y < 0.1) {
        this.lightDir.y = 0.1;
        this.lightDir.normalize();
      }
      this.sun.color.copy(PALETTE.sunLow).lerp(PALETTE.sunHigh, smoothstep(0.04, 0.6, elev));
      this.sun.color.lerp(PALETTE.dusk, duskI / (sunI + duskI + 1e-6));
      this.sun.intensity = sunI + duskI;
    } else {
      this.lightDir.copy(sunDir).negate();
      this.lightDir.y = Math.max(this.lightDir.y, 0.25);
      this.lightDir.normalize();
      this.sun.color.copy(PALETTE.moon);
      this.sun.intensity = moonI;
    }
    // The light sits out along its direction from the focus.
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.lightDir, 400);
    this.sun.target.updateMatrixWorld();

    // Ambient terms.
    const c = this._color;
    c.copy(PALETTE.hemiSkyDay).lerp(PALETTE.hemiSkyGolden, golden * 0.7);
    this.hemi.color.copy(PALETTE.hemiSkyNight).lerp(c, day);
    // By night the ground bounce is moonlit blue-grey, so grass and stone go
    // cool and silver instead of khaki.
    this.hemi.groundColor.copy(PALETTE.hemiGroundNight).lerp(this._tmpColor.copy(PALETTE.hemiGround), day);
    // Twilight keeps a fair amount of sky light so dusk reads as dusk, not black.
    const twilight = smoothstep(-0.2, 0.0, elev) * (1 - day);
    // Moonlit stone in the moon's shadow still reads pale: a little more sky light by night.
    this.hemi.intensity = 0.56 + 0.16 * day + 0.45 * twilight + 0.14 * (1 - day);
    this.scene.environmentIntensity = 0.1 + 0.26 * day;

    // Atmosphere pass settings for this time of day.
    const a = this.atmosphere;
    const low = 1 - smoothstep(0.05, 0.45, elev); // sun near the horizon
    // The glow sits on the true sun, not the clamped twilight light direction.
    a.sunDir.copy(sunDir);
    // The glow goes with the disc: once the sun is under the horizon the sky
    // dome's afterglow takes over (a screen-space glow would sit on the grass).
    a.sunVisible = smoothstep(-0.03, 0.02, elev);
    // Glow colour: white-gold high, apricot low. In the afternoon, as the
    // sun goes down, it deepens to orange (from well before it's low, so the
    // glow, rays and beams warm through the late afternoon into a sunset
    // orange); the morning keeps its bright gold.
    a.sunColor.setRGB(1.0, 0.93, 0.8).lerp(this._tmpColor.setRGB(1.0, 0.72, 0.45), low);
    // (A touch dimmer as it turns, or so bright a glow tone-maps back to a
    // golden white whatever its colour.)
    // (From about four in the afternoon, deepening steadily to sunset.)
    const eve = this.timeOfDay > 12 ? smoothstep(15.85, 19.0, this.timeOfDay) : 0;
    a.sunColor.lerp(this._tmpColor.setRGB(1.0, 0.38, 0.07), eve);
    a.shaft = (0.25 + 0.85 * low) * (1 - 0.2 * eve); // god rays: strongest at a low sun, where trees and roofs cut them
    a.glow = (0.5 + 1.1 * low) * (1 - 0.25 * eve);
    a.disc = 9.0;
    // Haze: pale blue-white by day, warm amber-rose at low sun, deep blue at night.
    // The haze darkens faster than the light does, so at twilight the far hills
    // are not a pale pink wall brighter than the sky above them; toward the
    // set sun it carries a little of the afterglow's rose.
    const dayFog = smoothstep(-0.04, 0.08, elev);
    a.fogColor.copy(PALETTE.fogNight).lerp(this._tmpColor.copy(PALETTE.fogDay).lerp(PALETTE.fogGolden, golden * 0.85), dayFog);
    a.fogSunColor.copy(PALETTE.fogNight).lerp(this._tmpColor2.setRGB(0.3, 0.14, 0.2), duskI / 1.1);
    a.fogSunColor.lerp(this._tmpColor.setRGB(0.86, 0.84, 0.78).lerp(this._tmpColor2.setRGB(0.82, 0.58, 0.4), low), dayFog);
    // Clear air at midday (Bliss-clear, so the hills keep their green);
    // haze thickens as the sun drops.
    const clear = day * (1 - low);
    a.fogDensity = 0.00075 * (1 - 0.6 * clear) + 0.0011 * low * dayFog + 0.0003 * (1 - day);
    a.fogHeight = this.focusHeight - 6;
    a.fogFalloff = 0.015;
    // Mist lies in the valley at dawn and dusk and thins through the day,
    // but never quite goes: its banks drifting slowly in the hollows and the
    // distance are part of the Vale (at a fifth of this by day, it read as
    // gone).
    a.groundMist = (0.19 + 0.09 * low * day + 0.07 * (1 - day)) * (1 - 0.8 * clear);
    a.mistColor.setRGB(0.2, 0.25, 0.36).lerp(this._tmpColor.setRGB(0.92, 0.93, 0.92), dayFog);
    a.mistOwn = (1 - low * day) * (1 - Math.min(1, duskI));
    a.mistFill = 0;
    a.saturation = THREE.MathUtils.lerp(0.98, 1.12 + 0.06 * day + 0.1 * golden, day);
    // Shadows lift warm by day and blue by night (a warm lift browned the night sky).
    this._tmpColor2.setRGB(0.012, 0.009, 0.006).lerp(this._tmpColor.setRGB(0.03, 0.018, 0.01), low);
    a.lift.setRGB(0.004, 0.008, 0.022).lerp(this._tmpColor2, day);
    a.vignette = 0.22;
    a.moon = 0;
    // A clock the slow changes in the sun's star keep: hours, running on through the days.
    a.dayHours = this.dayCount * 24 + this.timeOfDay;
    // Punchier by day; flat light at dusk and night stays soft.
    a.contrast = 1.0 + 0.14 * day * (1 - 0.5 * golden) + 0.06 * (1 - day);
    // While the sun is down the pass draws the moon instead: a small pale
    // disc, faint halo, on its own path through the right of the view. The
    // hills hide it as it rises and sets (the pass draws it only on sky), so
    // it is not faded by height; it sets before the dawn light comes up.
    const moonDir = this.viewMoonDirection(sunTime, this._tmp2 || (this._tmp2 = new THREE.Vector3()));
    const moonVis = smoothstep(MOON_LOW, MOON_LOW + 0.02, moonDir.y) * (1 - smoothstep(-0.13, -0.015, elev));
    if (elev < -0.015 && moonVis > 0.001) {
      a.sunDir.copy(moonDir);
      a.sunVisible = moonVis;
      a.sunColor.setRGB(0.8, 0.86, 0.98);
      a.disc = 0.75; // below clipping, so the maria and craters read
      a.moon = 1;
      a.glow = 0.07;
      a.shaft = 0.03;
    }

    this.lightLevel = 0.12 + 0.88 * day;

    // Eye adaptation: open up the exposure as the light fails.
    const dayExposure = THREE.MathUtils.lerp(0.8, 0.6, smoothstep(0.0, 0.3, elev));
    this.exposure = THREE.MathUtils.lerp(1.45, dayExposure, smoothstep(-0.18, -0.02, elev));

    const starFactor = smoothstep(-0.04, -0.2, elev) * 0.85;
    // The stars go behind the clouds: they read the sky's own cloud state.
    if (this.stars.material.userData.shader) {
      const ss = this.stars.material.userData.shader.uniforms;
      const su = this.sky.material.uniforms;
      for (const k of ['time', 'cloudSpeed', 'cloudScale', 'cloudCoverage', 'cloudDensity']) if (su[k]) ss[k].value = su[k].value;
    }
    this.stars.material.opacity = starFactor;
    if (this.stars.material.userData.shader) this.stars.material.userData.shader.uniforms.uTime.value = this.starTime || 0;
    this.stars.visible = starFactor > 0.01;
    // The sky turns once a day about its pole: constellations rise, wheel over and set.
    this.stars.quaternion.setFromAxisAngle(STAR_POLE, (this.timeOfDay / 24) * Math.PI * 2);
    this.stars.position.copy(focus);
    this.sky.position.copy(focus);

    // Re-render the lighting probe as the sun moves.
    this.envTimer -= dt;
    if (this.envTimer <= 0 && this.lastEnvSunDir.distanceToSquared(sunDir) > 1e-5) {
      this.envTimer = 0.5;
      this.refreshEnvironment();
    }
  }

  timeLabel() {
    const t = this.timeOfDay;
    const h = Math.floor(t);
    const m = Math.floor((t - h) * 60);
    const clock = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    let name;
    if (t < 4.5) name = 'Deep Night';
    else if (t < 6.5) name = 'Dawn';
    else if (t < 11) name = 'Morning';
    else if (t < 14) name = 'Midday';
    else if (t < 17.5) name = 'Afternoon';
    else if (t < 19) name = 'Dusk';
    else if (t < 22) name = 'Evening';
    else name = 'Deep Night';
    return `${name} · ${clock}${this.paused ? ' · paused' : ''}`;
  }
}

// The celestial pole the sky turns about, once a day: tilted toward the
// north, so stars near it circle and the rest rise in the east and set in the
// west through the night.
const STAR_POLE = new THREE.Vector3(0, 0.72, -0.69).normalize();

// The night sky: a sparse field of faint stars over the whole sphere, a pale
// band of the galaxy thick with fainter ones, a few tight clusters, and
// constellations of brighter stars in shapes you can learn and find again.
// Per star: colour, and (size, twinkle phase, twinkle rate).
function createStars(moonAt) {
  const random = mulberry32(42);
  const pos = [];
  const col = [];
  const st = [];
  const v = new THREE.Vector3();
  const add = (dir, size, bright) => {
    v.copy(dir).normalize().multiplyScalar(8000);
    pos.push(v.x, v.y, v.z);
    const warm = random();
    col.push(bright * (0.85 + warm * 0.15), bright * 0.9, bright * (1 - warm * 0.15));
    st.push(size, random() * 6.2832, 0.15 + random() * 0.35);
  };
  const randomDir = () => {
    for (;;) {
      v.set(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1);
      const l = v.lengthSq();
      if (l <= 1 && l > 0.01) return v.clone().normalize();
    }
  };
  // The field: sparse, mostly faint.
  for (let i = 0; i < 1500; i++) {
    const r = random();
    add(randomDir(), r < 0.012 ? 1.9 + random() * 0.3 : r < 0.15 ? 1.5 + random() * 0.25 : 1.2 + random() * 0.3, 0.3 + random() * 0.45);
  }
  // The galaxy: a band round a great circle, faint stars crowding its middle.
  const bandN = new THREE.Vector3(0.5, 0.3, 0.81).normalize();
  const bandU = new THREE.Vector3().crossVectors(bandN, new THREE.Vector3(0, 1, 0)).normalize();
  const bandV = new THREE.Vector3().crossVectors(bandN, bandU).normalize();
  for (let i = 0; i < 1500; i++) {
    const a = random() * Math.PI * 2;
    const off = (random() + random() + random() - 1.5) * 0.16;
    const d = bandU.clone().multiplyScalar(Math.cos(a)).addScaledVector(bandV, Math.sin(a)).addScaledVector(bandN, off);
    add(d, 1.2 + random() * 0.35, 0.25 + random() * 0.35);
  }
  // Clusters: a few loose knots of stars. Every third of the old knots' stars
  // is left out, the rest spread about twice as wide (still reading as
  // packed), and many of them dimmer, the brightest few still bright; the
  // stars themselves no bigger. The draws are all still taken, so every
  // other star stays put.
  for (let c = 0; c < 5; c++) {
    const centre = randomDir();
    const n = 14 + Math.floor(random() * 12);
    for (let i = 0; i < n; i++) {
      const p = centre.clone().add(new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(0.15 * Math.pow(random(), 0.7)));
      const size = 1.4 + random() * 0.6;
      const b = random();
      const bright = b < 0.25 ? 0.6 + b * 1.4 : 0.22 + (b - 0.25) * 0.4;
      if (i % 3 !== 1) add(p, size, bright);
    }
  }
  // Constellations: the Vale's own figures, simplified the way real ones are,
  // in units of about 5 degrees (x across, y up). Each is set where the
  // night sky shows it, well clear of the moon's track across the stars and
  // of the other figures. Their stars are bright, not huge.
  const FIGURES = [
    // The Serpent, rearing: its tail lying in low waves, its body rising in
    // a curve to an upright neck, the head turned aside at the top. Its stars
    // evenly spaced, no knot of them at either end (a little clustered head
    // on a long thin tail read as something else entirely).
    [[4.0, -1.2], [3.25, -0.75], [2.45, -0.95], [1.65, -1.45], [0.8, -1.55], [0.0, -1.05], [-0.55, -0.3], [-0.7, 0.6], [-0.45, 1.45], [-0.6, 2.3], [-1.3, 2.75], [-2.1, 2.6]],
    // The Crab: a round shell, two raised claws, legs below.
    [[0, 0], [0.7, 0.3], [-0.7, 0.3], [1.5, 1.1], [1.2, 1.7], [-1.5, 1.1], [-1.2, 1.7], [1.1, -0.7], [-1.1, -0.7]],
    // The Clef: a spiral round a tall stroke, a hook on top and a tail below.
    [[0, 2.4], [0.5, 1.9], [0.1, 1.2], [-0.5, 0.5], [-0.4, -0.3], [0.3, -0.5], [0.6, 0.1], [0, 0.3], [0.05, -1.2], [-0.4, -1.6]],
    // The Crown: a big arc of seven, as the sky first had it.
    [[-2.1, 0], [-1.6, -0.8], [-0.8, -1.25], [0, -1.4], [0.8, -1.25], [1.6, -0.8], [2.1, 0]],
    // The Sword: a long blade, a crossguard, the pommel.
    [[0, 2.6], [0, 1.6], [0, 0.6], [-0.9, 0], [0.9, 0], [0, -0.5], [0, -1.1]],
    // The Bow: an arc and its string, an arrow drawn across it.
    [[-0.8, 1.8], [0.1, 1.1], [0.4, 0], [0.1, -1.1], [-0.8, -1.8], [-0.8, 0], [1.6, 0], [2.3, 0.2]],
  ];
  // The moon's track across the star sphere through the night, in the
  // stars' own frame (it moves against them as the night goes on).
  const track = [];
  const q = new THREE.Quaternion();
  for (let h = 18; h <= 30; h += 0.5) {
    const d = moonAt(h % 24, new THREE.Vector3());
    if (d.y < -0.05) continue;
    q.setFromAxisAngle(STAR_POLE, -((h % 24) / 24) * Math.PI * 2);
    track.push(d.applyQuaternion(q));
  }
  // Candidate centres spread evenly over the sphere; take, for each figure
  // in turn, the first that midnight shows up the sky, at least 35 degrees
  // from the moon's track and 26 from any figure already placed.
  // (At midnight the stars stand as laid out here.)
  const cands = [];
  for (let i = 0; i < 400; i++) {
    const y = 1 - (2 * (i + 0.5)) / 400;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.39996;
    cands.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  const placed = [];
  const far = (c, list, deg) => list.every((p) => c.angleTo(p) > (deg * Math.PI) / 180);
  for (let fi = 0; fi < FIGURES.length; fi++) {
    // Each figure walks the candidates in its own order, so they spread out.
    let at = null;
    for (let k = 0; k < cands.length && !at; k++) {
      const cc = cands[(k * 37 + fi * 61) % cands.length];
      if (cc.y > 0.2 && far(cc, track, 35) && far(cc, placed, 26)) at = cc;
    }
    if (!at) continue;
    placed.push(at);
    const ex = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), at);
    if (ex.lengthSq() < 1e-4) ex.set(1, 0, 0);
    ex.normalize();
    const ey = new THREE.Vector3().crossVectors(at, ex).normalize();
    for (const [x, y] of FIGURES[fi]) add(at.clone().addScaledVector(ex, x * 0.085).addScaledVector(ey, y * 0.085), 3.3 + random() * 0.5, 1.3);
  }
  const positions = new Float32Array(pos);
  const colors = new Float32Array(col);
  const star = new Float32Array(st);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('aStar', new THREE.BufferAttribute(star, 3));
  const m = new THREE.PointsMaterial({
    size: 2.4,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  // Soft round sprites (a hard 1-2 px point shimmers as the view moves), dim
  // toward the horizon where the air is thickest, and a twinkle: a sparkle
  // that many stars are partway through at any moment, and about three in
  // five of them wavering a little between dim and bright as well, on two
  // unrelated waves so it never reads as a beat. Only rarely does a star go
  // nearly out for a second or two: when two slow waves of its own happen to
  // peak together. (It used to dip most of them to a quarter for seconds at
  // a time, so the sky was always blinking.) (On their own steady clock: on
  // the clouds' it ran at half speed and changed with the wind.)
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    for (const k of ['time', 'cloudSpeed', 'cloudScale', 'cloudCoverage', 'cloudDensity']) shader.uniforms[k] = { value: 0 };
    m.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aStar;\nuniform float uTime;\nvarying float vElev;\nvarying float vTwinkle;\nvarying float vFlick;\nvarying float vOut;\nvarying float vCloud;\n' + CLOUD_BANKS_GLSL)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCloud = cloudBanks( normalize( ( modelMatrix * vec4( position, 1.0 ) ).xyz - cameraPosition ) );\nvElev = normalize( ( modelMatrix * vec4( position, 0.0 ) ).xyz ).y;\nvTwinkle = smoothstep( 0.35, 1.0, sin( uTime * aStar.z * 4.2 + aStar.y ) );\nvFlick = fract( aStar.y * 7.31 ) < 0.62 ? 0.5 + 0.3 * sin( uTime * aStar.z * 3.5 + aStar.y * 3.0 ) + 0.2 * sin( uTime * aStar.z * 5.3 + aStar.y * 8.0 ) : 1.0;\nvOut = smoothstep( 0.93, 0.99, sin( uTime * ( 0.31 + 0.2 * aStar.z ) + aStar.y * 4.0 ) * sin( uTime * ( 0.23 + 0.15 * aStar.z ) + aStar.y * 9.0 ) );')
      .replace('gl_PointSize = size;', 'gl_PointSize = aStar.x * ( 1.0 + 0.45 * vTwinkle );');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vElev;\nvarying float vTwinkle;\nvarying float vFlick;\nvarying float vOut;\nvarying float vCloud;')
      .replace(
        '#include <opaque_fragment>',
        `{
          float rr = length( gl_PointCoord - 0.5 ) * 2.0;
          diffuseColor.a *= exp( -rr * rr * 3.2 ) * smoothstep( 0.02, 0.35, vElev ) * ( 0.75 + 0.55 * vTwinkle ) * mix( 0.7, 1.0, vFlick ) * ( 1.0 - 0.9 * vOut ) * ( 1.0 - min( 1.0, vCloud * 1.35 ) );
        }
        #include <opaque_fragment>`
      );
  };
  const points = new THREE.Points(g, m);
  points.frustumCulled = false;
  points.renderOrder = -1;
  return points;
}
