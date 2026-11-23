# anuvgupta.github.io

Personal site styled as a Windows XP desktop. Plain HTML/CSS/JS with no build step, deployed to GitHub Pages by `.github/workflows/pages.yml` on every push to `main`.

## Editing content

- **Projects:** `data/projects.json`. Each entry:

  ```json
  {
    "name": "Project name",
    "description": "One or two sentences.",
    "screenshots": [{ "src": "img/projects/shot.png", "alt": "What it shows" }],
    "github": ["https://github.com/anuvgupta/repo"],
    "links": [{ "label": "Live demo", "url": "https://example.com" }]
  }
  ```

  Every field except `name` is optional. Up to 3 screenshots are shown; `screenshots`, `github` and `links` also accept plain URL strings. Put images in `img/projects/`.

- **About:** `data/about.json` (name, tagline, links).
- **Wallpaper:** `img/wallpaper.svg`. To use a photo instead, add the file and change the `background` URL on `body` in `css/style.css`.

## Adding a page

Add an entry to `PAGES` at the top of `js/app.js` with an `id`, `title`, `icon`, `blurb` and a `render(body)` function. It automatically gets a desktop icon, a Start menu entry, a window and a `#id` link.

## Running locally

```bash
python3 -m http.server
```

Then open http://localhost:8000. Opening `index.html` directly from disk won't work, because the JSON files are loaded with `fetch`.
