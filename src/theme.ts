/** Theme-level mappings: which page types exist and which icon each page type and link uses. */

export const PAGE_TYPES = {
  projects: { icon: '/img/icons/projects.svg' },
  about: { icon: '/img/icons/about.svg' },
} as const;

export const LINK_ICONS = {
  github: '/img/icons/github.svg',
  linkedin: '/img/icons/linkedin.svg',
  link: '/img/icons/link.svg',
} as const;

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
