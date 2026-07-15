# d1fpc3.com

Static site for d1fpc3.com, hosted on Hostinger (hPanel).

## Structure

- `index.html` — homepage (typographic project index: SeenRank, ORC, D1-VolKit)
- `templates/index.html` — self-contained UI specimen library, reachable only by exact URL (nothing links to it)
- `ai/` — lead-magnet PDFs and landing page
- `call/` — booking page
- `demo/` — demo app build
- `work-showcase/` — screenshot assets
- `.htaccess` — extensionless-URL rewrites
- `styles.css`, `favicon.svg`

## Deploy

Push to `main` → GitHub Actions FTP-syncs the repo to the site web root and
verifies the live pages (see `.github/workflows/deploy.yml`). Secrets:
`FTP_SERVER` / `FTP_USERNAME` / `FTP_PASSWORD`. The FTP account is jailed
directly into the web root, so `server-dir` is `/`.

The templates page is a single self-contained HTML file — all CSS/JS inline, fonts from Google Fonts, SeenRank pixel included.
