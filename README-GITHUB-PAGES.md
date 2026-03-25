# GitHub Pages preview build

This package is the PM portal rebuilt for GitHub Pages project hosting.

## What was fixed

- All portal routes are included, including `research-core/` and `game-designer/`.
- Root-relative navigation like `/projects/` was converted to relative links so it works under `https://USER.github.io/REPO/`.
- The home page CSS/JS links were converted from `/home/page.css` and `/home/page.js` to GitHub-safe relative paths.
- `.nojekyll` is included.
- `404.html` redirects slashless route entries like `/projects` to `/projects/`.

## Publish on GitHub Pages

1. Create a GitHub repo.
2. Upload the **contents** of this folder to the repo root.
3. In GitHub: **Settings → Pages**.
4. Under **Build and deployment** choose:
   - **Source:** Deploy from a branch
   - **Branch:** `main` (or your default branch)
   - **Folder:** `/(root)`
5. Save and wait for the Pages URL.

## Important note about data-backed pages

Some pages call `/api` in the normal Cloudflare deployment. GitHub Pages is static, so it does not provide that proxy.

If you want live API data while previewing on GitHub Pages, open the site with a query parameter like this:

`https://USER.github.io/REPO/?apiBase=https://YOUR-HOST/api`

That value is saved in local storage for later visits.
