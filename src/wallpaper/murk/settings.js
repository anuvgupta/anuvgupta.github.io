// Adapted from murk3d (github.com/anuvgupta/murk3d), src/core/settings.js.
// The graphics presets and the adaptive quality ladder, as written; kept under
// the site's own storage keys. The game's field of view, look sensitivity and
// pixelation settings are left out (the wallpaper has none of them).

// Grass reaches past the main hill's crest (about 140 m out) at every preset;
// past a few tens of metres it is the sparse, widened far tier, so the extra
// reach costs little.
const PRESETS = {
  low: { pixelRatio: 1, shadowMapSize: 2048, grassDensity: 200, grassFullDetail: 8, grassDrawDistance: 170, bloom: false },
  medium: { pixelRatio: 1, shadowMapSize: 2048, grassDensity: 335, grassFullDetail: 10, grassDrawDistance: 180, bloom: true },
  high: { pixelRatio: 1.5, shadowMapSize: 4096, grassDensity: 470, grassFullDetail: 12.5, grassDrawDistance: 190, bloom: true },
};

// (v3: presets and levels picked before the frame cap and multisampling
// aren't carried over.)
const KEY_QUALITY = 'wallpaper.quality.v3';
const KEY_ADAPT = 'wallpaper.adapt.v3';

// A preset the adaptive stepper settled on last time is remembered.
let saved = null;
try {
  saved = localStorage.getItem(KEY_QUALITY);
} catch (e) {
  saved = null;
}
// Desktops start on medium: the wallpaper sits behind windows, and high's
// extra resolution and grass barely show there but cost a lot of GPU. (First
// visit on a phone or tablet: start on the light preset rather than
// stuttering down the ladder.)
export const DEFAULT_QUALITY = 'medium';
const firstGuess = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'low' : DEFAULT_QUALITY;
const requested = new URLSearchParams(window.location.search).get('quality') || saved || firstGuess;
export const QUALITY = PRESETS[requested] ? requested : DEFAULT_QUALITY;
export const PRESET_ORDER = ['high', 'medium', 'low'];
export function rememberQuality(name) {
  try {
    localStorage.setItem(KEY_QUALITY, name);
  } catch (e) {
    /* private mode */
  }
}
export const settings = PRESETS[QUALITY];

// The adaptive quality ladder, cheapest last: render resolution (a share of
// the preset's) and bloom, both changeable while running. (The game's also
// shortened the grass's reach; in this fixed view that cut the grass off the
// hill's crest in one frame, and the far blades it saved cost little.)
export const ADAPT_LADDER = [
  { name: 'full', res: 1, bloom: true },
  { name: 'res 85%', res: 0.85, bloom: true },
  { name: 'res 72%', res: 0.72, bloom: true },
  { name: 'res 72%, no bloom', res: 0.72, bloom: false },
  { name: 'res 60%, no bloom', res: 0.6, bloom: false },
];
// Where the ladder settled, per preset, for the next visit.
export function loadAdapt() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY_ADAPT) || 'null');
    return d && typeof d.preset === 'string' && Number.isInteger(d.level) ? d : null;
  } catch (e) {
    return null;
  }
}
export function rememberAdapt(preset, level) {
  try {
    localStorage.setItem(KEY_ADAPT, JSON.stringify({ preset, level }));
  } catch (e) {
    /* private mode */
  }
}
