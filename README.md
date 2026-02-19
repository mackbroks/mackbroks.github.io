# Portfolio

Simple one-page portfolio (HTML, CSS, JS) for GitHub Pages.

## Background

- The site uses **`images/rainy_forest_rain.gif`** as the full-page animated background.

## Deploy on GitHub Pages

1. Create a repo named **`your-username.github.io`** (public).
2. Push this folder (e.g. `git add .` → `git commit -m "Initial commit"` → `git push -u origin main`).
3. In the repo: **Settings → Pages → Source**: choose branch **main** (or **master**) → Save.
4. Open **https://your-username.github.io** after a few minutes.

## Adding more demos

- Duplicate the `<article class="project-block">...</article>` block in **`index.html`**.
- Give each block a **`data-date="YYYY-MM-DD"`** (e.g. `2026-03-01`). Blocks are sorted by this date **ascending** (oldest first).
- Put your media (image/video) in the `.media-box` and your text in the `.text-box`.
