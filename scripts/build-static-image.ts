// Render the static r/dataisbeautiful poster.
//
// Usage:
//   1. Build + serve:  npm run build && npm run preview &
//   2. Run script:     npm run poster
//   3. Output:         poster.png in repo root (1600 × 2400 @ 2× DPI = 3200 × 4800)
//
// The script loads the live preview at /?poster=1, which switches App into the
// `<PosterPage>` static layout (no controls, no tooltip, no header chrome).
// We wait for fonts and SVG layout to settle before screenshotting.

import puppeteer from 'puppeteer';
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';

const POSTER_W = 1600;
const POSTER_H = 2400;
const SCALE = 2;
const PREVIEW_HOST = process.env.POSTER_HOST ?? 'http://localhost:4173';
const POSTER_PATH = '/state_tax_visualization/?poster=1';

async function main() {
  const url = `${PREVIEW_HOST}${POSTER_PATH}`;
  console.log(`Loading ${url}`);

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: {
      width: POSTER_W,
      height: POSTER_H,
      deviceScaleFactor: SCALE,
    },
  });

  try {
    const page = await browser.newPage();

    // Forward console errors so we see issues in the page.
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error('[page error]', msg.text());
      }
    });
    page.on('pageerror', (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[page exception]', msg);
    });

    const resp = await page.goto(url, { waitUntil: 'networkidle0', timeout: 30_000 });
    if (!resp || !resp.ok()) {
      throw new Error(`Failed to load ${url} — ${resp?.status() ?? 'no response'}`);
    }

    // Make sure the poster root is in the DOM (PosterPage rendered, not main app).
    // The functions passed to page.waitForFunction / page.evaluate run inside the
    // browser context (DOM types), but the `tsconfig.node.json` only knows Node
    // types — using `Function` keeps the script's compile clean.
    const checkPoster: () => boolean = new Function(
      'return document.body.innerText.includes("Where the dollars actually go")',
    ) as () => boolean;
    await page.waitForFunction(checkPoster, { timeout: 10_000 });

    // Wait for web fonts to settle (avoids glyph reflow during screenshot).
    const waitFonts: () => Promise<void> = new Function(
      `return (async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; })()`,
    ) as () => Promise<void>;
    await page.evaluate(waitFonts);

    // Tiny additional settle to let any d3 paths finish.
    await new Promise((r) => setTimeout(r, 250));

    // Write into public/ so it ships with the Vite build and is accessible at
    // https://jasonly35.github.io/state_tax_visualization/poster.png after deploy.
    const out = resolve(process.cwd(), 'public', 'poster.png');
    const buf = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: POSTER_W, height: POSTER_H },
    });
    await fs.writeFile(out, buf);
    const stat = await fs.stat(out);
    console.log(
      `Wrote ${out}  (${(stat.size / 1024).toFixed(1)} KB,  ${POSTER_W * SCALE}×${POSTER_H * SCALE} px)`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
