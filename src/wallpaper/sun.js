// When the sun rises and how long it is up, in hours: murk3d's Environment
// constants, shared with the page's time-of-day widget (which must not load
// three.js to read them).
export const SUNRISE = 5.5; // the sun is up for 14 hours, so evenings linger
export const DAY_LENGTH = 14;
export const SUNSET = SUNRISE + DAY_LENGTH;
export const NOON = SUNRISE + DAY_LENGTH / 2;
