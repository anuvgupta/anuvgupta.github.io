// Adapted from murk3d (github.com/anuvgupta/murk3d), src/world/AtmospherePass.js.
// Copied as written, less what only the game's realms and buildings use: realm
// veils, haze walls and casts, cloud volumes, the rainbow, window shafts and
// the shadow-map light beams, and the underwater view.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Atmosphere and grade, in one screen pass after the scene renders:
//
//   1. Aerial perspective: distance and height fog from the depth buffer,
//      coloured by the sky (bluish away from the sun, warm toward it), so far
//      hills soften into haze the way the references do.
//   2. Sun glow and light shafts: a radial blur of an occlusion mask (sky
//      pixels that are near the sun) toward the sun's screen position, which
//      gives crepuscular rays through trees and a soft halo round the sun.
//   3. Grade: slight warm lift of the shadows, a little saturation, a soft
//      vignette, so the image reads as film rather than raw render.
//
// Everything here is cheap: one full-screen fragment with a 40-tap radial
// loop at half resolution for the shafts.

const occlusionShader = {
  uniforms: {
    tDepth: { value: null },
    uSunScreen: { value: new THREE.Vector2(0.5, 0.5) },
    uSunVisible: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4( position.xy, 0.0, 1.0 );
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDepth;
    uniform vec2 uSunScreen;
    uniform float uSunVisible;
    uniform float uAspect;
    varying vec2 vUv;
    void main() {
      float d = texture2D( tDepth, vUv ).r;
      float sky = step( 0.9999995, d );
      vec2 off = ( vUv - uSunScreen ) * vec2( uAspect, 1.0 );
      float r = length( off );
      // A soft disc round the sun; only sky counts, so trees and hills cut shafts.
      float disc = smoothstep( 0.42, 0.0, r );
      gl_FragColor = vec4( vec3( disc * sky * uSunVisible ), 1.0 );
    }
  `,
};

const compositeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    tOcclusion: { value: null },
    uSunScreen: { value: new THREE.Vector2(0.5, 0.5) },
    uSunVisible: { value: 0 },
    uSunColor: { value: new THREE.Color(1, 0.9, 0.7) },
    uShaftStrength: { value: 0 },
    uGlowStrength: { value: 0 },
    uDiscStrength: { value: 0 },
    uMoon: { value: 0 },
    uDayHours: { value: 0 },
    uSunRadius: { value: 0.016 },
    uAspect: { value: 1 },
    uCameraNear: { value: 0.1 },
    uCameraFar: { value: 1000 },
    uInvProjection: { value: new THREE.Matrix4() },
    uCameraWorld: { value: new THREE.Matrix4() },
    uCameraPos: { value: new THREE.Vector3() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uFogColor: { value: new THREE.Color(0.7, 0.75, 0.8) },
    uFogSunColor: { value: new THREE.Color(1, 0.85, 0.65) },
    uFogDensity: { value: 0.0012 },
    uFogHeight: { value: 0.0 },
    uFogFalloff: { value: 0.02 },
    uGroundMist: { value: 0 },
    uMistFill: { value: 0 },
    uMistColor: { value: new THREE.Color() },
    uMistOwn: { value: 0 },
    uNoise: { value: null },
    uWindDir: { value: new THREE.Vector2(1, 0) },
    uWindTravel: { value: 0 },
    uWindOffset: { value: new THREE.Vector2() },
    uTime: { value: 0 },
    uSaturation: { value: 1.08 },
    uLift: { value: new THREE.Color(0.02, 0.015, 0.01) },
    uVignette: { value: 0.25 },
    uContrast: { value: 1.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4( position.xy, 0.0, 1.0 );
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform sampler2D tOcclusion;
    uniform vec2 uSunScreen;
    uniform float uSunVisible;
    uniform vec3 uSunColor;
    uniform float uShaftStrength;
    uniform float uGlowStrength;
    uniform float uDiscStrength;
    uniform float uMoon;
    uniform float uDayHours;
    uniform float uSunRadius;
    uniform float uAspect;
    uniform float uCameraNear;
    uniform float uCameraFar;
    uniform mat4 uInvProjection;
    uniform mat4 uCameraWorld;
    uniform vec3 uCameraPos;
    uniform vec3 uSunDir;
    uniform vec3 uFogColor;
    uniform vec3 uFogSunColor;
    uniform float uFogDensity;
    uniform float uFogHeight;
    uniform float uFogFalloff;
    uniform float uGroundMist;
    uniform float uMistFill;
    uniform vec3 uMistColor;
    uniform float uMistOwn;
    uniform sampler2D uNoise;
    uniform vec2 uWindDir;
    uniform float uWindTravel;
    uniform vec2 uWindOffset;
    uniform float uTime;
    uniform float uSaturation;
    uniform vec3 uLift;
    uniform float uVignette;
    uniform float uContrast;
    varying vec2 vUv;

    vec3 worldPosition( vec2 uv, float depth ) {
      vec4 clip = vec4( uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0 );
      vec4 view = uInvProjection * clip;
      view /= view.w;
      return ( uCameraWorld * view ).xyz;
    }

    void main() {
      vec4 src = texture2D( tDiffuse, vUv );
      vec3 color = src.rgb;
      float depth = texture2D( tDepth, vUv ).r;
      bool isSky = depth >= 0.9999995;

      // ---- Aerial perspective.
      vec3 wp = worldPosition( vUv, min( depth, 0.9999995 ) );
      vec3 ray = wp - uCameraPos;
      float dist = length( ray );
      vec3 dir = ray / max( dist, 1e-4 );
      if ( !isSky ) {
        // Height fog: denser below uFogHeight, integrated along the ray.
        float f = uFogFalloff;
        float h0 = uCameraPos.y - uFogHeight;
        float h1 = wp.y - uFogHeight;
        float dy = h1 - h0;
        float integral = abs( dy ) > 0.01
          ? ( exp( -f * h0 ) - exp( -f * h1 ) ) / ( f * dy )
          : exp( -f * h0 );
        // Mostly distance haze, a little thicker in the low ground: high
        // peaks must not come out crisp while the slopes beneath them vanish.
        float density = uFogDensity * ( 0.7 + 0.3 * clamp( integral, 0.0, 3.0 ) );
        float fog = 1.0 - exp( -density * dist );
        fog = min( fog, 0.82 );
        // Low-lying mist pools in hollows and drifts downwind as banks and
        // wisps: sampled at a few points along the ray so it has shape.
        float mist = 0.0;
        if ( uGroundMist > 0.001 ) {
          float mistTop = uFogHeight + 9.0;
          for ( int i = 1; i <= 6; i++ ) {
            float t = float( i ) / 6.0;
            vec3 sp = uCameraPos + ray * ( t * t );
            float hgt = 1.0 - smoothstep( uFogHeight - 4.0, mistTop, sp.y );
            vec2 q = sp.xz - uWindOffset * 2.2; // banks drift with the wind, they don't race
            float bank = texture2D( uNoise, q * 0.004 + vec2( 0.0, uTime * 0.0045 ) ).r;
            float wisp = texture2D( uNoise, q * 0.02 + vec2( uTime * 0.022, 0.0 ) ).g;
            // (Banks with edges: clear air between them, so they read as
            // mist lying in the hollows, not an even haze.)
            float dens = max( smoothstep( 0.42, 0.68, bank * 0.7 + wisp * 0.45 ), uMistFill * ( 0.7 + 0.3 * bank ) ) * hgt;
            mist += dens * ( 1.0 - exp( -dist * 0.5 * t * 0.02 ) );
          }
          mist = uGroundMist * clamp( mist / 3.0, 0.0, 1.0 );
        }
        fog = clamp( fog + mist, 0.0, 0.97 );
        // Haze takes the sun's colour when looking toward it.
        float toward = pow( max( dot( dir, uSunDir ), 0.0 ), 6.0 );
        vec3 fogCol = mix( uFogColor, uFogSunColor, toward * 0.85 );
        // The mist has a colour of its own when the sun isn't low (the haze's
        // is nearly the colour of the view behind it, by day and by night,
        // so mist drawn in it can't be seen): pale by day, moonlit at night.
        fogCol = mix( fogCol, uMistColor, uMistOwn * mist / max( fog, 0.001 ) );
        color = mix( color, fogCol, fog );
      }
      // ---- The sun: disc, corona and light shafts.
      if ( uSunVisible > 0.0 ) {
        // Never quite still: its light breathes on a few slow, unrelated
        // waves (a candle in a draught, but far subtler), easing down a
        // touch and back every second or so, never out; the rays' centre
        // wanders a hair, their streaks shift about the disc, the glare
        // drifts and changes its tint.
        float st = uTime;
        float b1 = sin( st * 1.9 ) * 0.5 + sin( st * 3.1 + 1.3 ) * 0.3 + sin( st * 0.7 + 2.1 ) * 0.2;
        float b2 = sin( st * 2.6 + 0.4 ) * 0.5 + sin( st * 1.3 + 2.7 ) * 0.3 + sin( st * 4.3 + 0.9 ) * 0.2;
        float b3 = sin( st * 1.1 + 4.0 ) * 0.6 + sin( st * 2.3 + 0.2 ) * 0.4;
        vec2 sunJ = uSunScreen + vec2( sin( st * 0.83 ) + 0.5 * sin( st * 2.1 + 1.0 ), sin( st * 0.67 + 2.0 ) + 0.5 * sin( st * 1.7 + 0.3 ) ) * 0.0016 * vec2( 1.0 / uAspect, 1.0 );
        vec2 delta = ( sunJ - vUv );
        vec2 stp = delta / 40.0;
        vec2 p = vUv;
        float illum = 1.0;
        float shaft = 0.0;
        for ( int i = 0; i < 40; i++ ) {
          p += stp;
          shaft += texture2D( tOcclusion, p ).r * illum;
          illum *= 0.972;
        }
        shaft /= 40.0;
        // Sharpen so the rays read as streaks between the leaves, not a general haze.
        shaft = pow( shaft, 1.35 ) * 1.6;
        vec2 off = ( vUv - uSunScreen ) * vec2( uAspect, 1.0 );
        float r = length( off );
        float sAng = atan( off.y, off.x );
        shaft *= ( 1.0 + 0.13 * b1 ) * ( 1.0 + 0.2 * sin( sAng * 9.0 + st * 0.9 ) * sin( sAng * 4.0 - st * 1.4 + 1.0 ) );
        // How much of the sun's neighbourhood is open sky (a mountain in front dims the halo).
        float open = 0.0;
        for ( int i = 0; i < 8; i++ ) {
          float a = float( i ) * 0.7854;
          open += texture2D( tOcclusion, uSunScreen + vec2( cos( a ) / uAspect, sin( a ) ) * uSunRadius * 1.5 ).r;
        }
        open = max( open / 8.0, texture2D( tOcclusion, uSunScreen ).r );
        // Disc: white-hot core with a soft limb, only where the sky shows;
        // the limb shimmers a little, as through warm air.
        float limbW = 1.0 + ( 0.012 * sin( sAng * 7.0 + st * 2.4 ) + 0.008 * sin( sAng * 13.0 - st * 3.1 ) ) * ( 1.0 - uMoon );
        float disc = smoothstep( uSunRadius * 1.15, uSunRadius * 0.75, r / limbW ) * float( isSky );
        float sunFace = 0.0;
        float sunSpot = 0.0;
        if ( uMoon > 0.5 ) {
          // The moon: a crisp, slightly irregular limb, dark maria, a few
          // craters with bright rims, and a soft terminator a little short
          // of full so it is never a perfect disc.
          vec2 m = off / ( uSunRadius * 2.0 ); // the moon is drawn twice the sun's size, as games do
          float wob = ( texture2D( uNoise, m * 0.9 + 0.37 ).g - 0.5 ) * 0.05;
          float limb = 1.0 - smoothstep( 0.93 + wob, 1.0 + wob, length( m ) );
          float maria = smoothstep( 0.35, 0.75, texture2D( uNoise, m * 0.42 + vec2( 0.21, 0.63 ) ).r );
          vec2 cm = m * 3.3;
          vec2 ci = floor( cm );
          vec2 cf = fract( cm ) - 0.5;
          float ch = fract( sin( dot( ci, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
          vec2 cc = cf - ( vec2( fract( ch * 7.0 ), fract( ch * 13.0 ) ) - 0.5 ) * 0.5;
          float cr = 0.12 + 0.2 * fract( ch * 3.3 );
          float crater = step( 0.45, ch ) * ( 1.0 - smoothstep( cr * 0.8, cr, length( cc ) ) );
          float rim = step( 0.45, ch ) * smoothstep( cr * 0.7, cr * 0.95, length( cc ) ) * ( 1.0 - smoothstep( cr, cr * 1.25, length( cc ) ) );
          float terminator = smoothstep( -0.25, 0.2, dot( m, vec2( 0.86, 0.5 ) ) + 0.72 );
          float shade = ( 1.0 - 0.38 * maria ) * ( 1.0 - 0.35 * crater ) * ( 1.0 + 0.25 * rim );
          shade *= mix( 0.08, 1.0, terminator ) * ( 0.85 + 0.15 * ( 1.0 - length( m ) ) );
          disc = limb * shade * float( isSky );
        }
        else {
          // The sun's face: white-gold, darkening and warming toward the limb,
          // finely mottled, with faint markings of warmer gold drifting slowly
          // across it: dimmer and warmer than the face, but light (they were
          // six to eight times darker, and came out brown; much less than this
          // and they vanish in the glare). The markings are small squiggles,
          // thin wandering threads along a contour of warped noise, with a few
          // small flecks, rather than broad blotches.
          vec2 sm = off / uSunRadius;
          float mu = sqrt( max( 0.0, 1.0 - min( dot( sm, sm ), 1.0 ) ) );
          float gran = texture2D( uNoise, sm * 1.4 + vec2( uTime * 0.004, 0.0 ) ).g;
          // They drift and writhe slowly, a visible creep across the face
          // over ten seconds or so (they were nearly still).
          // The markings, as the potions' liquid murmurs: slow domain-warped
          // ribbons curling across the face, thick swirls and wavy lines
          // with a few closed rings, in a slightly darker orange-brown on
          // the sun's own colour. Dark enough to show once the face is
          // tone-mapped (the old threads sat at a third of the face's
          // brightness, which still clips to white, so they never showed).
          // Broad, low-frequency noise: the disc is only a few dozen pixels
          // across, and finer noise broke the markings into blocky speckle.
          vec2 sq = sm * 0.14;
          float ts = uTime * 0.01;
          vec2 warp = ( vec2( texture2D( uNoise, sq + vec2( 0.11 + ts, 0.37 - ts * 0.8 ) ).r, texture2D( uNoise, sq * 1.3 + vec2( 0.61 - ts * 0.6, 0.23 + ts ) ).g ) - 0.5 ) * 1.4;
          float nn = texture2D( uNoise, sq * 1.1 + warp * 0.5 + vec2( 0.29 + ts * 1.2, 0.73 ) ).r;
          float wisp = smoothstep( 0.3, 1.0, 1.0 - abs( nn * 2.0 - 1.0 ) );
          float ring = 1.0 - smoothstep( 0.02, 0.18, abs( texture2D( uNoise, sq * 0.9 - warp * 0.3 + vec2( 0.47, 0.19 - ts * 0.7 ) ).r - 0.5 ) );
          // Feathered: soft edges, and fading out toward the limb.
          float mark = max( wisp * 0.6, ring * 0.45 ) * smoothstep( 0.0, 0.6, mu );
          float spotA = mark;
          float spotB = 0.0;
          vec3 surf = vec3( 1.0, 0.96, 0.86 ) * 9.0;
          surf = mix( surf, vec3( 1.0, 0.74, 0.48 ) * 3.6, mark );
          surf *= ( 0.93 + 0.14 * gran ) * ( 0.62 + 0.38 * mu );
          surf *= mix( vec3( 1.0, 0.86, 0.6 ), vec3( 1.0 ), mu );
          surf *= 1.0 + 0.03 * b3;
          // Replace the sky behind the disc rather than add to it, so the
          // markings keep their colour; uDiscStrength scales as before.
          color = mix( color, uSunColor * surf * ( uDiscStrength / 9.0 ), disc );
          sunFace = disc;
          sunSpot = max( spotA, spotB );
          disc = 0.0;
        }
        // Corona: a bright inner halo and a wide soft skirt.
        float corona = exp( -r * r / ( uSunRadius * uSunRadius * 12.0 ) ) * 0.55 + exp( -r / ( uSunRadius * 14.0 ) ) * 0.45;
        // Off the sun's face, so its markings aren't washed white.
        corona *= ( 1.0 - 0.3 * sunFace * sunSpot ) * ( 1.0 + 0.08 * b2 * ( 1.0 - uMoon ) );
        float headroom = 1.0 - smoothstep( 0.6, 1.6, dot( color, vec3( 0.33 ) ) );
        // A sun just behind a ridge or a crown still floods over the edge,
        // but behind the solid of a crown or a wall its halo and glare fall
        // to a fraction: a glimmer, well under what thin branches let through.
        // (Not the moon: its faint halo shouldn't glow on the hill it has set behind.)
        float openG = uMoon > 0.5 ? open : max( open, 0.075 );
        float coronaK = 0.3 + 0.7 * openG;
        // The land in front of a hidden sun takes none of its glow: the halo
        // and shafts land on the ground only as far as the disc is in view,
        // so a sun behind the hill leaves no pale column down its face.
        float onLand = isSky ? 1.0 : open * open;
        color += uSunColor * disc * uDiscStrength;
        color += uSunColor * corona * uGlowStrength * coronaK * onLand * ( 0.7 + 0.3 * headroom );
        color += uSunColor * shaft * uShaftStrength * onLand * ( 0.7 + 0.3 * headroom );
        // Lens glare: looking near the sun, a few faint ghosts along the line
        // through the frame's centre and a thin horizontal streak. Subtle.
        if ( uMoon < 0.5 ) {
          vec2 c = ( sunJ - 0.5 ) * vec2( uAspect, 1.0 );
          vec2 pv = ( vUv - 0.5 ) * vec2( uAspect, 1.0 );
          float facing = 1.0 - smoothstep( 0.2, 0.8, length( c ) );
          vec3 ghosts = vec3( 0.0 );
          for ( int i = 0; i < 5; i++ ) {
            float fi = float( i );
            float k = fi * 0.5 - 0.9; // positions along the sun->centre axis
            float gr = ( 0.035 + 0.03 * fi ) * ( 1.0 + 0.05 * sin( st * ( 0.7 + 0.2 * fi ) + fi * 1.9 ) );
            vec2 gdrift = vec2( sin( st * 0.5 + fi * 2.3 ), cos( st * 0.43 + fi * 1.7 ) ) * 0.004;
            float gd = length( pv - c * k - gdrift ) / gr;
            // Hollow rings with a bright rim, warm near the sun and cooler past
            // the centre, each drifting slowly between gold and a cool tint.
            vec3 tint = mix( vec3( 1.08, 0.94, 0.78 ), vec3( 0.86, 0.96, 1.08 ), 0.5 + 0.5 * sin( st * 0.35 + fi * 1.3 ) );
            ghosts += tint * ( 1.0 - smoothstep( 0.7, 1.0, gd ) ) * ( 0.35 + 0.65 * smoothstep( 0.2, 0.85, gd ) ) * 0.16;
          }
          ghosts *= 1.0 + 0.15 * b2;
          // Anamorphic streak: a thin horizontal line through the sun, long and soft.
          float streak = exp( -abs( pv.y - c.y ) * 90.0 ) * exp( -abs( pv.x - c.x ) * 1.6 ) * 0.34 * ( 1.0 + 0.1 * b1 );
          // A star of thin spokes right around the disc, turning a little to
          // and fro. Four to seven of them, the count drifting through the
          // day; spaced about evenly but each a little off its place, so
          // they never make a perfect hexagon. A spoke that comes or goes
          // buds off the first one and slides round to its place, or back,
          // fading as it does, too slowly to catch.
          float ang = atan( pv.y - c.y, pv.x - c.x ) + 0.04 * sin( st * 0.6 );
          float hrs = uDayHours;
          float nRays = 5.5 + 1.5 * sin( hrs * 0.35 + 0.8 * sin( hrs * 0.11 ) + 1.0 );
          float spacing = 6.2832 / nRays;
          float turn = 0.3 * sin( hrs * 0.13 + 0.8 );
          float spokes = 0.0;
          for ( int i = 0; i < 7; i++ ) {
            float fi = float( i );
            float w = clamp( nRays - fi, 0.0, 1.0 );
            float a = fi * spacing + turn + 0.13 * sin( hrs * ( 0.31 + 0.07 * fi ) + fi * 2.4 ) + 0.07 * sin( hrs * 0.9 + fi * 1.1 );
            // Not all alike: at any hour some spokes are at full strength
            // and others dimmer, each on its own slow curve through the day.
            float bri = 0.3 + 0.7 * smoothstep( -0.6, 0.8, sin( hrs * ( 0.19 + 0.06 * fi ) + fi * 2.9 ) );
            float d = ang - a;
            d -= 6.2832 * floor( d / 6.2832 + 0.5 );
            spokes += w * bri * exp( -d * d / 0.0092 );
          }
          spokes *= exp( -length( pv - c ) * 9.0 ) * 0.5 * ( 1.0 + 0.1 * b3 );
          color += uSunColor * ( ghosts + streak + spokes ) * facing * openG * uSunVisible * ( 0.6 + 0.4 * headroom );
        }
      }

      // ---- Grade.
      // Contrast about mid grey (scene-linear), then saturation.
      color = max( ( color - 0.18 ) * uContrast + 0.18, 0.0 );
      float lum = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
      color = mix( vec3( lum ), color, uSaturation );
      color += uLift * ( 1.0 - smoothstep( 0.0, 0.5, lum ) );
      vec2 v = ( vUv - 0.5 ) * vec2( uAspect, 1.0 );
      color *= 1.0 - uVignette * smoothstep( 0.45, 1.1, length( v ) );

      if ( any( isnan( color ) ) || any( isinf( color ) ) ) color = vec3( 0.0 );
      gl_FragColor = vec4( max( color, vec3( 0.0 ) ), src.a );
    }
  `,
};

export class AtmospherePass extends Pass {
  constructor(camera) {
    super();
    this.camera = camera;
    this.occlusionMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(occlusionShader.uniforms),
      vertexShader: occlusionShader.vertexShader,
      fragmentShader: occlusionShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(compositeShader.uniforms),
      vertexShader: compositeShader.vertexShader,
      fragmentShader: compositeShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
    this.occlusionQuad = new FullScreenQuad(this.occlusionMaterial);
    this.occlusionTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.occlusionTarget.texture.minFilter = THREE.LinearFilter;
    this.sunScreen = new THREE.Vector2();
    this._v = new THREE.Vector3();
    this.depthTexture = null;
  }

  setSize(width, height) {
    this.occlusionTarget.setSize(Math.ceil(width / 2), Math.ceil(height / 2));
    this.material.uniforms.uAspect.value = width / height;
    this.occlusionMaterial.uniforms.uAspect.value = width / height;
  }

  update({ sunDir, sunColor, sunVisible, fogColor, fogSunColor, fogDensity, fogHeight, fogFalloff, groundMist, mistColor, mistOwn, mistFill, shaft, glow, disc, moon, dayHours, saturation, lift, vignette, contrast }, wind, noise, time) {
    const u = this.material.uniforms;
    if (wind) {
      u.uWindDir.value.copy(wind.direction);
      u.uWindTravel.value = wind.travel;
      u.uWindOffset.value.copy(wind.fogOffset);
      u.uTime.value = time;
    }
    if (noise) u.uNoise.value = noise;
    u.uDiscStrength.value = disc;
    u.uMoon.value = moon || 0;
    u.uDayHours.value = dayHours || 0;
    // Angular radius of the drawn sun, in screen height units.
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    u.uSunRadius.value = Math.tan(THREE.MathUtils.degToRad(1.3)) / Math.tan(halfFov) * 0.5;
    u.uSunDir.value.copy(sunDir);
    u.uSunColor.value.copy(sunColor);
    u.uFogColor.value.copy(fogColor);
    u.uFogSunColor.value.copy(fogSunColor);
    u.uFogDensity.value = fogDensity;
    u.uFogHeight.value = fogHeight;
    u.uFogFalloff.value = fogFalloff;
    u.uGroundMist.value = groundMist;
    u.uMistColor.value.copy(mistColor);
    u.uMistOwn.value = mistOwn;
    u.uMistFill.value = mistFill || 0;
    u.uShaftStrength.value = shaft;
    u.uGlowStrength.value = glow;
    u.uSaturation.value = saturation;
    u.uLift.value.copy(lift);
    u.uVignette.value = vignette;
    u.uContrast.value = contrast || 1;

    // Sun's screen position; shafts only when it's in front of the camera.
    // The camera has usually moved since the last render, so refresh its matrices.
    const cam = this.camera;
    cam.updateMatrixWorld();
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const p = this._v.copy(sunDir).multiplyScalar(1000).add(cam.position).project(cam);
    const inFront = this._v.z < 1;
    this.sunScreen.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    const onScreen = inFront && this.sunScreen.x > -0.5 && this.sunScreen.x < 1.5 && this.sunScreen.y > -0.5 && this.sunScreen.y < 1.5;
    // Fade the sun terms out as the disc leaves the frame.
    const margin = Math.max(0, Math.max(-this.sunScreen.x, this.sunScreen.x - 1, -this.sunScreen.y, this.sunScreen.y - 1));
    const vis = onScreen ? sunVisible * Math.max(0, 1 - margin / 0.35) : 0;
    u.uSunScreen.value.copy(this.sunScreen);
    u.uSunVisible.value = vis;
    this.occlusionMaterial.uniforms.uSunScreen.value.copy(this.sunScreen);
    this.occlusionMaterial.uniforms.uSunVisible.value = vis;
  }

  render(renderer, writeBuffer, readBuffer) {
    const cam = this.camera;
    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = readBuffer.depthTexture;
    u.uCameraNear.value = cam.near;
    u.uCameraFar.value = cam.far;
    u.uInvProjection.value.copy(cam.projectionMatrixInverse);
    u.uCameraWorld.value.copy(cam.matrixWorld);
    u.uCameraPos.value.copy(cam.position);

    if (u.uSunVisible.value > 0) {
      this.occlusionMaterial.uniforms.tDepth.value = readBuffer.depthTexture;
      renderer.setRenderTarget(this.occlusionTarget);
      this.occlusionQuad.render(renderer);
    }
    u.tOcclusion.value = this.occlusionTarget.texture;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this.fsQuad.render(renderer);
  }

  dispose() {
    this.material.dispose();
    this.occlusionMaterial.dispose();
    this.fsQuad.dispose();
    this.occlusionQuad.dispose();
    this.occlusionTarget.dispose();
  }
}
