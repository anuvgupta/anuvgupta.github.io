# anuvgupta.github.io

Personal site styled as a Windows XP desktop, built with [Astro](https://astro.build). All content lives in one manifest, `site.json`, and is baked into static HTML at build time, so every word (including the full project list) is in the page source with nothing loaded at runtime. GitHub Actions builds and deploys it to GitHub Pages on every push to `main`.

## Layout

| Path | What it is |
| --- | --- |
| `site.json` | **All content:** name, tagline, description, links, pages, projects |
| `content/` | Content images (project screenshots), referenced from `site.json` |
| `src/` | The theme: page template, components, styles, desktop script |
| `public/` | Theme images (icons, wallpaper) and `CNAME`, copied as-is |

## Editing content

Everything goes in `site.json`:

```jsonc
{
  "name": "Anuv Gupta",                       // tab title, Start menu, About page
  "tagline": "engineer and artist",           // About page
  "description": "…",                         // search engine and link-preview text
  "links": [                                   // About page buttons
    { "label": "GitHub", "url": "https://github.com/anuvgupta", "icon": "github" } // icon: github | linkedin | link
  ],
  "openOnLoad": "projects",                   // page open on first visit (or null)
  "pages": [                                   // desktop icons + Start menu, in this order
    { "id": "projects", "type": "projects", "title": "Projects", "subtitle": "Things I have built" }
  ],
  "projects": [
    {
      "name": "Project name",
      "description": "One or two sentences.",
      "screenshots": [{ "src": "content/projects/shot.png", "alt": "What it shows" }], // up to 3
      "github": ["https://github.com/anuvgupta/repo"],
      "links": [{ "label": "Live demo", "url": "https://example.com" }]
    }
  ]
}
```

- Only `name` is required for a project. `screenshots` and `github` entries can also be plain strings.
- Put screenshots in `content/` (PNG, JPG, WebP, AVIF, GIF or SVG). The build resizes raster images and converts them to WebP.
- Each page's `id` becomes its link, e.g. `github.anuv.me/#about`. Page `type` is `projects` or `about`.

The build checks `site.json` and fails with a pointer to the exact field for a typo'd key, a URL that isn't `https://`, a missing image, a duplicate page id and so on, so a broken manifest never deploys.

## Running locally

Needs Node 22.23.4 or newer.

```bash
npm install
npm run dev        # live-reloading dev server at http://localhost:4321
npm run build      # production build into dist/
npm run preview    # serve the production build
```

## Changing the theme

- **Wallpaper:** the live scene is in `src/wallpaper/`. The plain blue desktop behind it (shown without JavaScript, while it loads, and when it's switched off) is `--desktop-bg` in `src/styles/xp.css`.
- **New page type:** add it to `PAGE_TYPES` in `src/theme.ts`, write a component for it in `src/components/`, and render it for that type in `src/pages/index.astro`.
