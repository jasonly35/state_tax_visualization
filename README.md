# State Tax Burden Visualization

Interactive map + ranked list comparing total state and local tax burden across all 50 US states for a configurable household profile.

**Live**: https://jasonly35.github.io/state_tax_visualization/

Two deliverables:

1. A web app deployed to GitHub Pages where the user can adjust their scenario and see all 50 states re-rank in real time.
2. A static PNG poster for r/dataisbeautiful built from the live app via Puppeteer.

## Quick start

```bash
npm install
npm test         # vitest — should be all green before any UI work
npm run dev      # localhost:5173
npm run build
npm run preview  # serve the production build locally for the poster script
```

## What's in the box (Phase 1 + early Phase 2)

- `src/lib/tax-calc.ts` — pure functions for state income, property, sales, gas, federal-for-context, and local overlays. Fully unit-tested.
- `src/lib/profile.ts` — `Profile` type + URL serialization (compact base-36 hash for shareable links).
- `src/data/*.json` — eight files seeded with 2024–2025 values from public sources (Tax Foundation, BLS, FHWA, API, ACS-derived). Each file has a `_meta` field with the source and as-of date.
- `src/components/*` — `ProfilePanel`, `RankedList`, `Choropleth`, `AssumptionsDrawer`, `MethodologyPage`.
- `.github/workflows/deploy.yml` — builds and publishes to GitHub Pages on push to `main`.

## Open Phase 1 work

The data structure is correct, but several seed values need direct verification before publishing:

- **Income brackets**: each state's MFJ brackets at $300K should be cross-checked against the state DOR's 2025 instructions or worksheet. The seed values match Tax Foundation's 2025 matrix to my best knowledge; note the recent reforms in IA, MS, NC, ID, GA, KS, MO, OH, ND that may not yet propagate everywhere.
- **Home values (`home-values.json`)**: replace the ZHVI-scaled estimates with direct ACS B25075 5-year pulls.
- **Consumption (`consumption-quintiles.json`)**: currently a flat top-quintile assumption per state with a heuristic taxable share. Replace with category-by-category BLS CEX numbers stripped per each state's exemption list.
- **Per-state rules (`state-rules.json`)**: only the load-bearing exceptions are coded today (CA, NJ, PA, MA, WA, NH, TN). Audit the rest.

## Phase 3 — Reddit poster

`scripts/build-static-image.ts` is wired but not yet runnable — install Puppeteer when ready:

```bash
npm i -D puppeteer
npm run poster
```

The script loads the live app at a canonical URL, hides the editor pane via injected CSS, and screenshots a 2400×1600 image at 2× DPI.

## Methodology

See the `/methodology` page in the app, or `src/components/MethodologyPage.tsx`. Sources are cited per-data-file in the `_meta` field of each JSON file under `src/data/`.

## License

MIT.
