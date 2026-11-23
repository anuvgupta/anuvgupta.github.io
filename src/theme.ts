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

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 2)
    .join('');

export function repoName(url: string) {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\/+|\/+$/g, '') || u.hostname;
  } catch {
    return url;
  }
}
