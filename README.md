# CEOS Boca MVP

Browser-based front end for quickly viewing CEOS member data. The MVP reads
from a Google Sheet; the data layer is isolated behind a single module so it
can be swapped for a SQL backend later without touching the UI.

Visual style is modeled on the Apple Stocks app: dark theme, soft type,
rounded cards stacked vertically.

## Quick start

The app uses native ES modules, so it must be served over HTTP — opening
`index.html` via `file://` will fail with CORS errors.

```bash
cd CEOS-BocaMVP
python3 -m http.server 8000
# then open http://localhost:8000
```

The Google Sheet must be shared as **Anyone with the link — Viewer** for the
browser to fetch it.

## Project structure

```
index.html                  Page shell + card slots
css/styles.css              All styling
js/
  app.js                    Entry point; wires cards together
  config.js                 Sheet ID + tab names (one place to change for SQL)
  sheets.js                 gviz CSV fetch + parser (data-access seam)
  components/
    member-select.js        Searchable member dropdown card
docs/
  architecture.md           Card pattern + SQL-migration notes
```

## Adding a new card

1. Create `js/components/<name>.js` exporting a `mount<Name>(mountEl, ...)`
   function. The component owns its DOM and its data fetch.
2. Add an `<article class="card">` slot in `index.html` with a `data-id`
   you can target.
3. In `js/app.js`, import and mount it. If it depends on the selected
   member, subscribe inside the `mountMemberSelect` callback.

See `js/components/member-select.js` for the reference shape.

## Deploying to GitHub Pages

After pushing to GitHub:

1. Repo → **Settings → Pages**
2. Source: **Deploy from a branch**, branch `main`, folder `/ (root)`
3. The site will be at `https://<user>.github.io/<repo>/`

No build step is required — everything is static.

## Roadmap

- Detail cards for each data dimension on a member (profile, activity, etc.)
- Move data layer from Google Sheets → SQL behind the same `sheets.js`-shaped
  API. Only `config.js` and `sheets.js` should need to change.
