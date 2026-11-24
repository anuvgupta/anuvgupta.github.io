/**
 * Day and night UI: Windows XP by day, Windows 98 at night (html.ui-98, styled in win98.css).
 * The page's inline head script sets the class before first paint; this keeps it current. It
 * follows the local clock, or the wallpaper's time of day while that is set by hand.
 */
import { UI_DAY_START, UI_DAY_END } from '../theme';

const root = document.documentElement;
let shownHour: number | null = null; // the wallpaper's hand-set time, or null to follow the clock

function apply() {
  const now = new Date();
  const h = shownHour ?? now.getHours() + now.getMinutes() / 60;
  root.classList.toggle('ui-98', h < UI_DAY_START || h >= UI_DAY_END);
}

/** Follow a hand-set hour (0–24), or the clock again with null. */
export function setUiHour(h: number | null) {
  shownHour = h;
  apply();
}

apply();
setInterval(apply, 30_000);
