// Adapted from murk3d (github.com/anuvgupta/murk3d), src/core/settings.js.
// The graphics presets and the adaptive quality ladder, as written; kept under
// the site's own storage keys. The game's field of view, look sensitivity and
// pixelation settings are left out (the wallpaper has none of them).

const PRESETS = {
  low: { pixelRatio: 1, shadowMapSize: 2048, grassDensity: 200, grassFullDetail: 8, grassDrawDistance: 85, bloom: false },
  medium: { pixelRatio: 1.25, shadowMapSize: 2048, grassDensity: 335, grassFullDetail: 10, grassDrawDistance: 120, bloom: true },
  high: { pixelRatio: 1.5, shadowMapSize: 4096, grassDensity: 470, grassFullDetail: 12.5, grassDrawDistance: 155, bloom: true },
};

const KEY_QUALITY = 'wallpaper.quality';
const KEY_ADAPT = 'wallpaper.adapt';

// A preset the adaptive stepper settled on last time is remembered.
let saved = null;
try {
  saved = localStorage.getItem(KEY_QUALITY);
} catch (e) {
  saved = null;
}
// (First visit on a phone or tablet: start on the light preset rather than
// stuttering down the ladder from the top.)
const firstGuess = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'low' : 'high';
const requested = new URLSearchParams(window.location.search).get('quality') || saved || firstGuess;
export const QUALITY = PRESETS[requested] ? requested : 'high';
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
// the preset's), grass reach and bloom, all changeable while running.
export const ADAPT_LADDER = [
  { name: 'full', res: 1, grass: 1, bloom: true },
  { name: 'res 85%', res: 0.85, grass: 1, bloom: true },
  { name: 'res 85%, grass 80%', res: 0.85, grass: 0.8, bloom: true },
  { name: 'res 72%, grass 80%', res: 0.72, grass: 0.8, bloom: true },
  { name: 'res 72%, grass 65%, no bloom', res: 0.72, grass: 0.65, bloom: false },
  { name: 'res 60%, grass 65%, no bloom', res: 0.6, grass: 0.65, bloom: false },
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
