/** Theme-level mappings: which page types exist and which icon each page type and link uses. */

// fit: the window sizes itself to its content instead of filling most of the desktop.
export const PAGE_TYPES = {
  projects: { icon: '/img/icons/projects.svg', fit: false },
  resume: { icon: '/img/icons/resume.svg', fit: true },
  about: { icon: '/img/icons/about.svg', fit: true },
} as const;

export const LINK_ICONS = {
  github: '/img/icons/github.svg',
  linkedin: '/img/icons/linkedin.svg',
  link: '/img/icons/link.svg',
} as const;

/** The UI is Windows XP from DAY_START to DAY_END (hours, local time) and Windows 98 the rest of the night. */
export const UI_DAY_START = 6;
export const UI_DAY_END = 19;

/** The user picture in the Start menu header and on the About page. */
export const USER_PICTURE = '/img/icons/circuit.svg';

export function repoName(url: string) {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\/+|\/+$/g, '') || u.hostname;
  } catch {
    return url;
  }
}
