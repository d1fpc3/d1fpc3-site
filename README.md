# d1fpc3.com

Static site for d1fpc3.com, hosted on Hostinger (hPanel).

## Structure

- `index.html` — homepage (minimal landing page)
- `templates/index.html` — self-contained UI specimen library, reachable only by exact URL (nothing links to it)
- `favicon.svg`

## Deploy

Deployed from this repo via hPanel → Advanced → Git into `public_html`.
After connecting the repo once in hPanel, enable the auto-deployment webhook so every push to `main` deploys automatically.

The templates page is a single self-contained HTML file — all CSS/JS inline, fonts from Google Fonts, SeenRank pixel included.
