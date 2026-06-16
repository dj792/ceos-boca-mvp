# Architecture

A short narrative of how the pieces fit. Pair with `CLAUDE.md`, which
captures the rules; this file captures the *why*.

## Three layers

```
┌─────────────────────────────────────────────────┐
│ index.html  — page shell with card slots        │
├─────────────────────────────────────────────────┤
│ js/components/*.js  — one module per card       │
│ js/app.js           — wires cards, brokers state│
├─────────────────────────────────────────────────┤
│ js/sheets.js  + js/config.js   — data access    │
└─────────────────────────────────────────────────┘
```

`index.html` declares where each card lives but knows nothing about what
goes inside. `app.js` mounts each card into its slot and forwards the
"selected member" signal between them. Each card module owns its own DOM,
its own fetch, and its own state. The data layer is one module deep, so
swapping Google Sheets for SQL later is a single-file change.

## Why cards as modules

The product is a stack of independent views of the same person. Treating
each one as a self-contained component means:

- a card can be added, removed, or rewritten without touching its
  neighbors;
- failure of one card (e.g. a slow fetch) doesn't break the others;
- the page can degrade gracefully — render the cards we have data for,
  hide the rest.

The contract a card honors:

```js
export async function mountFoo(mountEl, ...inputs) {
  // 1. inject markup into mountEl
  // 2. fetch its own data via js/sheets.js
  // 3. wire its own event handlers
  // 4. (optional) return a small handle: { update(input), destroy() }
}
```

`member-select.js` is the reference implementation — it also takes an
`onChange` callback so it can publish a selection upward.

## The SQL-migration seam

`js/sheets.js` is intentionally narrow. Today it exports `fetchSheetRows`,
which returns `string[][]`. Components that need richer shapes should ask
`sheets.js` for them rather than reaching into a CSV row directly. When the
backend moves to SQL, the implementation behind those accessors changes;
the function signatures don't.

Practical rule: if a component has a `parseCsv` call or a row-index magic
number, that logic belongs in `sheets.js`.

## What's deliberately not here

- **No framework.** The surface area is small. Adding React would multiply
  the build, dependency, and onboarding cost without buying anything the
  card pattern doesn't already give us.
- **No build step.** Native ES modules cover this. Re-evaluate if/when
  TypeScript or bundle-splitting becomes worth the friction.
- **No state library.** `app.js` is the only place that holds shared state
  (the current member). If shared state grows past two or three signals,
  introduce a tiny pub/sub here before reaching for anything heavier.
