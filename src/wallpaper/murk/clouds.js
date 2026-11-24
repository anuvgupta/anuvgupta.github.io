// Copied from murk3d (github.com/anuvgupta/murk3d).
// Three cloud styles for the sky dome, swapped into the Sky shader in place of
// its stock cloud block. All are 2D noise on a cloud plane, lit by the sky's
// own radiance, so they cost nothing beyond the sky's one draw.
//
//   realistic  two decks of cumulus with cauliflower edges, sun-lit tops,
//              shaded undersides and silver linings, under a combed cirrus veil
//   ghibli     towering cauliflower cumulus: domain-warped lobes stacked big
//              to small, opaque, bright crowns and blue-grey flanks, churning
//              slowly as they drift
//   painterly  brushed cirrus streaks and soft banks, like a painted backdrop
//
// Every style runs on one cloud clock T (sky time × cloudSpeed × 600: a lobe
// takes a minute or so to roll over in a breeze) and passes its cloud plane
// through churn(): a rotational domain warp, so the masses roll, curl and tear
// as they drift rather than sliding across the sky as a stamp.

export const CLOUD_STYLES = ['realistic', 'ghibli', 'painterly'];
// Where the chosen style is kept. (Renamed when painterly became the
// default, so a style picked before then no longer overrides it.)
const KEY = 'murk.clouds.v2';

export function readCloudStyle() {
  const q = new URLSearchParams(location.search).get('clouds');
  if (CLOUD_STYLES.includes(q)) return q;
  try {
    const saved = localStorage.getItem(KEY);
    if (CLOUD_STYLES.includes(saved)) return saved;
  } catch {
    // storage blocked
  }
  return 'painterly';
}

export function saveCloudStyle(style) {
  try {
    localStorage.setItem(KEY, style);
  } catch {
    // storage blocked
  }
}

// Helpers shared by all styles. Needs the Sky shader's noise()/fbm().
// cloudNightCol: the moonlit colour of a cloud by night (blue- or
// violet-grey, brighter while the moon is up); cloudMoonDir: toward the moon.
const COMMON = /* glsl */ `
  uniform vec3 cloudNightCol;
  uniform vec3 cloudMoonDir;
  // Worley-ish billow: distance to jittered cell centres gives cauliflower lobes.
  float billow( vec2 p ) {
    vec2 i = floor( p );
    vec2 f = fract( p );
    float d = 8.0;
    for ( int y = -1; y <= 1; y++ ) {
      for ( int x = -1; x <= 1; x++ ) {
        vec2 g = vec2( float( x ), float( y ) );
        vec2 o = fract( sin( vec2( dot( i + g, vec2( 127.1, 311.7 ) ), dot( i + g, vec2( 269.5, 183.3 ) ) ) ) * 43758.5453 );
        vec2 r = g + o - f;
        d = min( d, dot( r, r ) );
      }
    }
    return 1.0 - sqrt( d );
  }

  // Churn: a slow rotational domain warp. Masses roll, curl and tear instead
  // of sliding across the sky as one stamp. T is the cloud clock.
  vec2 churn( vec2 uv, float T, float amp ) {
    vec2 g = vec2( fbm( uv * 0.22 + vec2( T * 0.6, 1.7 ), T * 0.2 ), fbm( uv * 0.22 + vec2( 5.3, -T * 0.5 ), T * 0.2 ) );
    vec2 h = vec2( noise( uv * 0.7 + vec2( -T * 0.9, 2.2 ) ), noise( uv * 0.7 + vec2( 8.1, T * 0.8 ) ) );
    return uv + vec2( -g.y, g.x ) * amp + h * amp * 0.35;
  }
`;

// Lighting shared by the styles: a cloud's colour from its density, the
// density toward the sun (self-shadowing), its edge and the viewing angle.
const LIGHTING = /* glsl */ `
  // Light a cloud sample. dens: 0..1 opacity here; shadow: 0..1 how much
  // denser cloud lies toward the sun; edge: 0..1 near the rim.
  vec3 cloudLight( float dens, float shadow, float edge, vec3 sunCol, vec3 skyAmb, float cosTheta, float dayFactor ) {
    float silver = clamp( 0.51 / pow( 1.49 - cosTheta * 1.4, 1.5 ), 0.0, 3.0 );
    // Lit tops are warm white; bellies take the sky's blue-grey.
    float lit = clamp( 1.0 - shadow * 1.6, 0.0, 1.0 );
    vec3 top = skyAmb * 0.9 + sunCol * 1.25;
    vec3 belly = skyAmb * 1.25 + sunCol * 0.28;
    vec3 c = mix( belly, top, lit );
    c += sunCol * silver * edge * 0.7;
    return c * max( dayFactor, 0.03 );
  }
`;

const STYLES = {
  realistic: /* glsl */ `
    if ( direction.y > 0.0 && cloudCoverage > 0.0 ) {
      float dayFactor = smoothstep( -0.08, 0.3, vSunDirection.y );
      vec3 sunCol = vSunE * Fex * 0.22 * 0.04;
      vec3 skyAmb = Lin * 0.04 + vec3( 0.0, 0.0003, 0.00075 );
      float horizonFade = smoothstep( 0.0, 0.08, direction.y );
      float T = time * cloudSpeed * 600.0;
      vec2 drift = vec2( 0.9, 0.35 );
      vec2 toSun = vSunDirection.xz * 0.06;
      // Two decks: broken cumulus below, a thinner higher layer above.
      for ( int layer = 0; layer < 2; layer++ ) {
        float elev = layer == 0 ? 0.45 : 0.22;
        vec2 uv = direction.xz / ( max( direction.y, 0.02 ) * elev ) * cloudScale * 1000.0;
        uv += drift * T * ( layer == 0 ? 1.0 : 1.6 ) + float( layer ) * 37.0;
        float Tl = T * ( layer == 0 ? 1.0 : 0.7 );
        vec2 q = churn( uv, Tl, layer == 0 ? 0.9 : 0.6 );
        float region = noise( q * 0.12 + 5.0 ) * 0.5 + 0.5;
        float cov = clamp( cloudCoverage * ( layer == 0 ? 0.72 : 0.4 ) + ( region - 0.5 ) * 1.0, 0.0, 1.0 );
        float th = 1.0 - cov;
        // Base shape eroded by cauliflower billows that roll as they drift.
        float base = fbm( q * 0.5, Tl * 0.4 ) * 0.5 + 0.5;
        float lobes = billow( q * 2.2 + Tl * 0.3 ) * 0.55 + billow( q * 5.5 + 3.0 - Tl * 0.5 ) * 0.3 + billow( q * 12.0 + Tl ) * 0.15;
        float field = base * 0.75 + lobes * 0.5;
        float depth = max( 0.0, field - th );
        float dens = 1.0 - exp( -depth * ( layer == 0 ? 16.0 : 9.0 ) * cloudDensity );
        // Self-shadow: how much denser the cloud is toward the sun.
        vec2 qs = q - toSun;
        float fieldS = ( fbm( qs * 0.5, Tl * 0.4 ) * 0.5 + 0.5 ) * 0.75 + ( billow( qs * 2.2 + Tl * 0.3 ) * 0.55 + billow( qs * 5.5 + 3.0 - Tl * 0.5 ) * 0.3 + billow( qs * 12.0 + Tl ) * 0.15 ) * 0.5;
        float shadow = clamp( ( fieldS - field ) * 3.0 + depth * 1.5, 0.0, 1.0 );
        // Low on the sky we see the bellies, high up the tops.
        shadow = mix( shadow + 0.35, shadow, smoothstep( 0.05, 0.5, direction.y ) );
        float edge = dens * ( 1.0 - dens ) * 4.0;
        vec3 cloudColor = cloudLight( dens, shadow, edge, sunCol, skyAmb, cosTheta, dayFactor );
        float alpha = dens * horizonFade * 0.82;
        texColor -= L0 * 0.04 * alpha;
        vec3 aerial = mix( texColor, cloudColor, Fex );
        texColor = mix( texColor, aerial, alpha );
      }
      // A high veil of cirrus, combed by the wind and curling at the ends.
      {
        vec2 uvHi = direction.xz / ( max( direction.y, 0.02 ) * 0.16 ) * cloudScale * 1000.0;
        uvHi += drift * T * 1.5;
        vec2 st = churn( uvHi, T * 1.4, 0.55 );
        float streak = fbm( vec2( st.x * 0.6, st.y * 1.9 ) * 1.1, T * 0.5 ) * 0.5 + 0.5;
        float breakup = noise( st * 0.35 + 4.0 ) * 0.5 + 0.5;
        float cirrus = smoothstep( 0.66, 0.84, streak ) * smoothstep( 0.5, 0.74, breakup ) * 0.16;
        vec3 cirrusColor = ( skyAmb * 1.1 + sunCol * 1.1 ) * max( dayFactor, 0.03 );
        texColor = mix( texColor, mix( texColor, cirrusColor, Fex ), cirrus * horizonFade );
      }
    }
  `,
  ghibli: /* glsl */ `
    if ( direction.y > 0.0 && cloudCoverage > 0.0 ) {
      float dayFactor = smoothstep( -0.08, 0.3, vSunDirection.y );
      vec3 sunCol = vSunE * Fex * 0.22 * 0.04;
      vec3 skyAmb = Lin * 0.04 + vec3( 0.0, 0.0003, 0.00075 );
      float horizonFade = smoothstep( 0.0, 0.06, direction.y );
      float T = time * cloudSpeed * 600.0;
      // A middling deck: the towers read as distinct masses with blue sky
      // between them, not one quilt filling the whole dome.
      vec2 uv = direction.xz / ( max( direction.y, 0.02 ) * 0.85 ) * cloudScale * 5600.0;
      uv += vec2( 0.9, 0.35 ) * T * 1.6;
      // The masses churn and roll: lobes bulge, split and swallow each other.
      vec2 q = churn( uv, T * 1.3, 0.9 );
      float region = noise( q * 0.08 ) * 0.5 + 0.5;
      // Coverage pulled down and the regional swing widened: whole stretches
      // of sky stay clear while the towers gather in a few places.
      float cov = clamp( cloudCoverage * 0.62 + ( region - 0.5 ) * 1.1, 0.0, 1.0 );
      float th = 1.0 - cov;
      // Cauliflower: round lobes stacked big to small, each eroding the last.
      float body = fbm( q * 0.3, T * 0.5 ) * 0.5 + 0.5;
      float lobes = billow( q * 0.7 + T * 0.4 ) * 0.5 + billow( q * 1.6 + 5.0 - T * 0.6 ) * 0.3 + billow( q * 3.6 + 11.0 + T * 0.9 ) * 0.2;
      float field = body * 0.7 + lobes * 0.7;
      float depth = max( 0.0, field - th );
      float dens = smoothstep( 0.0, 0.05, depth );   // a definite rim, but not a cut-out
      float thick = smoothstep( 0.0, 0.35, depth );  // how deep into the mass we look
      // Shading from the field's slope toward the sun: each lobe has a lit
      // crown and a shaded flank, painted in broad soft steps.
      vec2 toSun = vSunDirection.xz * 0.08;
      vec2 qs = q - toSun;
      float fieldS = ( fbm( qs * 0.3, T * 0.5 ) * 0.5 + 0.5 ) * 0.7 + ( billow( qs * 0.7 + T * 0.4 ) * 0.5 + billow( qs * 1.6 + 5.0 - T * 0.6 ) * 0.3 + billow( qs * 3.6 + 11.0 + T * 0.9 ) * 0.2 ) * 0.7;
      float slope = ( fieldS - field ) * 6.0;
      float lit = smoothstep( 0.2, 0.8, clamp( 0.5 - slope, 0.0, 1.0 ) );
      // Flat shaded bellies low on the sky; the tops stay bright.
      float belly = 1.0 - smoothstep( 0.04, 0.35, direction.y );
      lit *= 1.0 - 0.6 * belly * thick;
      vec3 top = skyAmb * 0.7 + sunCol * 1.45;
      vec3 shade = skyAmb * 1.2 + sunCol * 0.16;
      vec3 cloudColor = mix( shade, top, lit );
      // The heart of a thick mass, turned from the sun, goes a shade deeper.
      cloudColor *= 1.0 - 0.28 * thick * ( 1.0 - lit );
      // Silver lining toward the sun.
      float silver = clamp( 0.51 / pow( 1.49 - cosTheta * 1.4, 1.5 ), 0.0, 3.0 );
      float edge = dens * ( 1.0 - dens ) * 4.0;
      cloudColor += sunCol * silver * edge * 0.5;
      cloudColor *= max( dayFactor, 0.03 );
      float alpha = dens * horizonFade * clamp( cloudDensity * 1.8, 0.0, 0.88 );
      texColor -= L0 * 0.04 * alpha;
      vec3 aerial = mix( texColor, cloudColor, Fex );
      texColor = mix( texColor, aerial, alpha );
      // Small fast puffs scudding under the towers.
      {
        vec2 uvLo = direction.xz / ( max( direction.y, 0.02 ) * 0.9 ) * cloudScale * 1900.0 + vec2( 0.9, 0.35 ) * T * 1.3 + 23.0;
        vec2 ql = churn( uvLo, T * 1.6, 0.9 );
        float puff = billow( ql * 1.8 + T * 0.5 ) * 0.6 + ( fbm( ql * 0.6, T * 0.4 ) * 0.5 + 0.5 ) * 0.5;
        float pd = smoothstep( 0.78, 0.86, puff ) * ( 1.0 - dens );
        vec3 puffColor = mix( shade, top, 0.8 ) * max( dayFactor, 0.03 );
        texColor = mix( texColor, mix( texColor, puffColor, Fex ), pd * horizonFade * 0.9 );
      }
    }
  `,
  painterly: /* glsl */ `
    if ( direction.y > 0.0 && cloudCoverage > 0.0 ) {
      float dayFactor = smoothstep( -0.08, 0.3, vSunDirection.y );
      vec3 sunCol = vSunE * Fex * 0.22 * 0.04;
      vec3 skyAmb = Lin * 0.04 + vec3( 0.0, 0.0003, 0.00075 );
      float horizonFade = smoothstep( 0.0, 0.06, direction.y );
      float T = time * cloudSpeed * 600.0;
      vec2 drift = vec2( 0.9, 0.35 );
      vec2 toSun = vSunDirection.xz * 0.06;
      // Soft banks, brushed: low-contrast masses with feathered edges that
      // curl and tear as the wind works them.
      // Banks a few hundred metres across, not continents, with whole
      // stretches of clear sky between them and the sky showing through.
      vec2 uvLo = direction.xz / ( max( direction.y, 0.02 ) * 0.42 ) * cloudScale * 2500.0;
      uvLo += drift * T * 1.7;
      vec2 q = churn( uvLo, T, 0.8 );
      float region = noise( q * 0.12 ) * 0.5 + 0.5;
      float cov = clamp( cloudCoverage * 0.8 + ( region - 0.5 ) * 1.0, 0.0, 1.0 );
      float th = 1.0 - cov;
      float bank = fbm( q * 0.45, T * 0.4 ) * 0.5 + 0.5;
      float brush = fbm( vec2( q.x * 1.4, q.y * 0.6 ) * 1.6 + 9.0, T * 0.6 ) * 0.5 + 0.5;
      float field = bank * 0.85 + brush * 0.45;
      float depth = max( 0.0, field - th );
      float dens = smoothstep( 0.0, 0.22, depth );
      vec2 qs = q - toSun;
      float fieldS = ( fbm( qs * 0.45, T * 0.4 ) * 0.5 + 0.5 ) * 0.85 + ( fbm( vec2( qs.x * 1.4, qs.y * 0.6 ) * 1.6 + 9.0, T * 0.6 ) * 0.5 + 0.5 ) * 0.45;
      float shadow = clamp( ( fieldS - field ) * 2.5 + depth * 0.8, 0.0, 1.0 ) * 0.7;
      float edge = dens * ( 1.0 - dens ) * 3.0;
      vec3 bankColor = cloudLight( dens, shadow, edge, sunCol, skyAmb, cosTheta, dayFactor );
      // Warm the whole bank slightly, like a glaze.
      bankColor *= vec3( 1.04, 1.0, 0.95 );
      // After the sun has set the banks keep a rose-apricot glow for a while,
      // strongest on the sun's side, before they darken into night.
      float glowK = smoothstep( 0.05, -0.03, vSunDirection.y ) * smoothstep( -0.22, -0.08, vSunDirection.y );
      float sunSide = clamp( 0.5 + 0.5 * dot( normalize( direction.xz + vec2( 1e-5, 0.0 ) ), normalize( vSunDirection.xz + vec2( 1e-5, 0.0 ) ) ), 0.0, 1.0 );
      bankColor += vec3( 0.06, 0.026, 0.034 ) * glowK * ( 0.3 + 0.7 * sunSide * sunSide ) * ( 1.0 - 0.4 * shadow );
      float aBank = dens * horizonFade * clamp( cloudDensity * 1.5, 0.0, 0.75 );
      texColor -= L0 * 0.04 * aBank;
      texColor = mix( texColor, mix( texColor, bankColor, Fex ), aBank );
      // By night the moon lights them: blue- or violet-grey, a little above
      // the sky, paler on the moon's side and darker in their bellies, their
      // rims silvered near the moon itself. Laid on directly (through the
      // air's extinction above, the blue went and they turned brown).
      float nightK = 1.0 - dayFactor;
      float moonC = clamp( dot( direction, cloudMoonDir ), 0.0, 1.0 );
      vec3 nightCloud = cloudNightCol * ( 1.0 - 0.5 * shadow ) * ( 0.8 + 0.2 * dens ) + cloudNightCol * 3.0 * pow( moonC, 16.0 ) * ( 0.3 + edge );
      texColor = mix( texColor, nightCloud, aBank * nightK );
      // High cirrus: long strokes combed along the wind, their tails curling.
      vec2 uvHi = direction.xz / ( max( direction.y, 0.02 ) * 0.18 ) * cloudScale * 1000.0;
      uvHi += drift * T * 1.6;
      vec2 st = churn( uvHi, T * 1.5, 0.6 );
      float streak = fbm( vec2( st.x * 0.55, st.y * 2.0 ) * 1.2, T * 0.7 ) * 0.5 + 0.5;
      float breakup = noise( st * 0.4 + 4.0 ) * 0.5 + 0.5;
      float cirrus = smoothstep( 0.66, 0.84, streak ) * smoothstep( 0.52, 0.74, breakup ) * 0.2;
      vec3 cirrusColor = ( skyAmb * 1.2 + sunCol * 1.0 ) * max( dayFactor, 0.03 );
      texColor = mix( texColor, mix( texColor, cirrusColor, Fex ), cirrus * horizonFade );
      texColor = mix( texColor, cloudNightCol * 0.8, cirrus * horizonFade * nightK );
      // How much cloud covers this pixel, so the day sky's blue goes on the
      // sky behind the clouds and not on them.
      skyCloudA = max( aBank, cirrus * horizonFade );
    }
  `,
};

// The painterly banks' opacity toward a direction, as the sky draws them,
// for things behind the clouds (the stars), with the Sky shader's noise
// copied so the two agree. Reads the sky's own cloud uniforms.
export const CLOUD_BANKS_GLSL = /* glsl */ `
  uniform float time;
  uniform float cloudSpeed;
  uniform float cloudScale;
  uniform float cloudCoverage;
  uniform float cloudDensity;
  vec2 gradient( vec2 i ) {
    vec3 p = fract( i.xyx * vec3( 0.1031, 0.1030, 0.0973 ) );
    p += dot( p, p.yzx + 33.33 );
    return fract( ( p.xx + p.yz ) * p.zy ) * 2.0 - 1.0;
  }
  float noise( vec2 p ) {
    vec2 i = floor( p );
    vec2 f = fract( p );
    vec2 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
    float a = dot( gradient( i ), f );
    float b = dot( gradient( i + vec2( 1.0, 0.0 ) ), f - vec2( 1.0, 0.0 ) );
    float c = dot( gradient( i + vec2( 0.0, 1.0 ) ), f - vec2( 0.0, 1.0 ) );
    float d = dot( gradient( i + vec2( 1.0, 1.0 ) ), f - vec2( 1.0, 1.0 ) );
    return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y ) * 1.6;
  }
  float fbm( vec2 p, float drift ) {
    float result = 0.0;
    float amplitude = 1.0;
    for ( int i = 0; i < 4; i ++ ) {
      result += amplitude * noise( p );
      amplitude *= 0.5;
      p = p * 2.0 + drift;
    }
    return result;
  }
  vec2 churn( vec2 uv, float T, float amp ) {
    vec2 g = vec2( fbm( uv * 0.22 + vec2( T * 0.6, 1.7 ), T * 0.2 ), fbm( uv * 0.22 + vec2( 5.3, -T * 0.5 ), T * 0.2 ) );
    vec2 h = vec2( noise( uv * 0.7 + vec2( -T * 0.9, 2.2 ) ), noise( uv * 0.7 + vec2( 8.1, T * 0.8 ) ) );
    return uv + vec2( -g.y, g.x ) * amp + h * amp * 0.35;
  }
  float cloudBanks( vec3 direction ) {
    if ( direction.y <= 0.0 || cloudCoverage <= 0.0 ) return 0.0;
    float T = time * cloudSpeed * 600.0;
    vec2 uvLo = direction.xz / ( max( direction.y, 0.02 ) * 0.42 ) * cloudScale * 2500.0 + vec2( 0.9, 0.35 ) * T * 1.7;
    vec2 q = churn( uvLo, T, 0.8 );
    float region = noise( q * 0.12 ) * 0.5 + 0.5;
    float th = 1.0 - clamp( cloudCoverage * 0.8 + ( region - 0.5 ) * 1.0, 0.0, 1.0 );
    float field = ( fbm( q * 0.45, T * 0.4 ) * 0.5 + 0.5 ) * 0.85 + ( fbm( vec2( q.x * 1.4, q.y * 0.6 ) * 1.6 + 9.0, T * 0.6 ) * 0.5 + 0.5 ) * 0.45;
    float dens = smoothstep( 0.0, 0.22, max( 0.0, field - th ) );
    return dens * smoothstep( 0.0, 0.06, direction.y ) * clamp( cloudDensity * 1.5, 0.0, 0.75 );
  }
`;

// Replace the stock cloud block in a Sky fragment shader with the given style.
export function applyCloudStyle(fragmentShader, style) {
  const start = fragmentShader.indexOf('// Clouds');
  const end = fragmentShader.indexOf('gl_FragColor = vec4( texColor, 1.0 );');
  if (start < 0 || end < 0) return fragmentShader;
  const body = STYLES[style] || STYLES.realistic;
  let out = fragmentShader.slice(0, start) + '// Clouds (' + style + ')\nfloat skyCloudA = 0.0;\n' + body + '\n' + fragmentShader.slice(end);
  // Helpers go after the Sky's fbm().
  out = out.replace('const float pi = 3.141592653589793238462643383279502884197169;', COMMON + LIGHTING + '\n\t\tconst float pi = 3.141592653589793238462643383279502884197169;');
  return out;
}
