/**
 * Loads and validates site.json, the single manifest for all site content.
 * Anything wrong in it (typo'd key, bad URL, missing image) fails the build
 * with a message pointing at the exact field.
 */
import type { ImageMetadata } from 'astro';
import { z } from 'astro/zod';
import raw from '../site.json';
import { PAGE_TYPES, LINK_ICONS } from './theme';

// Every image under content/ can be referenced from the manifest by its path from the repo root.
const imageModules = import.meta.glob<{ default: ImageMetadata }>(
  '/content/**/*.{png,jpg,jpeg,webp,avif,gif,svg}',
  { eager: true }
);
const images = new Map(
  Object.entries(imageModules).map(([path, mod]) => [path.replace(/^\//, ''), mod.default])
);
const normalizePath = (p: string) => p.trim().replace(/^\.?\//, '');

const url = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    let ok = false;
    try {
      ok = ['http:', 'https:', 'mailto:'].includes(new URL(value).protocol);
    } catch {}
    if (!ok) ctx.addIssue({ code: 'custom', message: `Must be a full https:// (or mailto:) URL, got "${value}"` });
  });

const image = z
  .string()
  .superRefine((value, ctx) => {
    if (!images.has(normalizePath(value))) {
      ctx.addIssue({
        code: 'custom',
        message: `Image not found: "${value}". Put it under content/ and use its path from the repo root, e.g. "content/projects/shot.png".`,
      });
    }
  })
  .transform((value) => images.get(normalizePath(value))!);

const linkIcon = z.enum(Object.keys(LINK_ICONS) as [keyof typeof LINK_ICONS, ...(keyof typeof LINK_ICONS)[]]);

const link = z.strictObject({
  label: z.string().min(1),
  url,
  icon: linkIcon.optional(),
});

// A bare string is shorthand for { src } / { url }. Normalizing first (instead of a union)
// keeps validation errors specific, e.g. "Image not found" rather than "Invalid input".
const shorthand = (key: string) => (v: unknown) => (typeof v === 'string' ? { [key]: v } : v);

const screenshot = z.preprocess(
  shorthand('src'),
  z.strictObject({ src: image, alt: z.string().optional() }).transform(({ src, alt }) => ({ image: src, alt }))
);

const repo = z.preprocess(shorthand('url'), z.strictObject({ url, label: z.string().min(1).optional() }));

const project = z.strictObject({
  // Consecutive projects with the same section are listed under one heading.
  section: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  screenshots: z.array(screenshot).max(3, 'At most 3 screenshots per project').default([]),
  github: z.array(repo).default([]),
  links: z.array(link.omit({ icon: true })).default([]),
});

const pageType = z.enum(Object.keys(PAGE_TYPES) as [keyof typeof PAGE_TYPES, ...(keyof typeof PAGE_TYPES)[]]);

const page = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/, 'Use lowercase letters, digits and dashes (it becomes the #link)'),
  type: pageType,
  title: z.string().min(1),
  subtitle: z.string().optional(),
});

const siteSchema = z
  .strictObject({
    name: z.string().min(1),
    // Shown in the browser tab, link previews, the Start menu header and the About heading; defaults to name.
    title: z.string().min(1).optional(),
    tagline: z.string().optional(),
    description: z.string().optional(),
    links: z.array(link).default([]),
    openOnLoad: z.string().nullable().optional(),
    pages: z.array(page).min(1, 'Add at least one page'),
    projects: z.array(project).default([]),
  })
  .superRefine((s, ctx) => {
    const ids = s.pages.map((p) => p.id);
    ids.forEach((id, i) => {
      if (ids.indexOf(id) !== i) ctx.addIssue({ code: 'custom', path: ['pages', i, 'id'], message: `Duplicate page id "${id}"` });
    });
    if (s.openOnLoad && !ids.includes(s.openOnLoad)) {
      ctx.addIssue({ code: 'custom', path: ['openOnLoad'], message: `"${s.openOnLoad}" is not a page id (${ids.join(', ')})` });
    }
  });

const result = siteSchema.safeParse(raw);
if (!result.success) {
  throw new Error(`site.json is invalid:\n${z.prettifyError(result.error)}`);
}

export const site = { ...result.data, title: result.data.title ?? result.data.name };
export type Site = typeof site;
export type Page = Site['pages'][number];
export type Project = Site['projects'][number];
