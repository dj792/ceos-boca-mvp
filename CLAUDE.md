# CEOS Boca MVP — Claude Code notes

This file is auto-loaded by Claude Code when working in this repo. Keep it
short and current. Project background and structure live in README.md;
this file only captures conventions and gotchas that affect *how* to make
changes.

## What this is

A static, vanilla-JS, browser-based viewer for member data. The MVP reads
from a Google Sheet via the public `gviz` CSV endpoint. Data will move to
SQL later; the UI should not need to change when that happens.

## Conventions

**Look and feel.** Model the Apple Stocks app: pure-black background,
elevated dark-grey cards (`--bg-elev`), 14px corner radius, SF-style system
font, restrained accent color. Avoid borders where elevation works instead.
Tokens live in `:root` in `css/styles.css` — use them rather than hardcoding
hex.

**Cards are the unit of UI.** Each meaningful chunk of member data is its
own card. Each card has:
  - an `<article class="card">` slot in `index.html`
  - a component module in `js/components/<name>.js` that exports
    `mount<Name>(mountEl, ...)` and owns its DOM, data fetch, and state
  - a mount call in `js/app.js`

Components must not reach across each other's DOM. Coordination happens in
`app.js` (e.g. selected-member changes flow from `mountMemberSelect`'s
`onChange` callback down into other cards' mount functions).

**Data access goes through `js/sheets.js`.** Components should not call
`fetch` directly against Google. When the SQL backend lands, swap the
implementation of `sheets.js` (and `config.js`) and leave the components
untouched. If a component needs a different shape, add a typed accessor to
`sheets.js` rather than parsing CSV inline.

**No build step, no framework, no bundler.** Native ES modules only.
External libraries should be avoided; if one is unavoidable, prefer a single
file from a CDN over npm.

**No browser storage in the UI.** No `localStorage` / `sessionStorage`
for app state — keep state in memory. Persisted user prefs can come later
once we know what's worth persisting.

## Running locally

```bash
python3 -m http.server 8000
```

ES modules require HTTP; `file://` will 404.

## Sheet config

Sheet ID and tab names live in `js/config.js`. The sheet must be shared as
"Anyone with the link — Viewer" for the browser to fetch it.

Current tabs in use:
  - `MemberProfiles` — column A = `ProfileID`, column B = display name.
    Header row is auto-detected and skipped.

## Things to avoid

- Don't introduce a framework (React/Vue/Svelte) without discussing first.
- Don't add build tooling (Vite/Webpack/Parcel) for the MVP.
- Don't hardcode colors, radii, or fonts — use the CSS variables.
- Don't add a card directly in `app.js` — give it its own module under
  `js/components/`.
- Don't commit Google Sheet contents or any member PII into the repo.
