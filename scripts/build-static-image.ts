// Reddit poster builder. Loads the live app at a canonical URL, hides the
// editor pane, and screenshots a 1600×2400 PNG at 2× DPI.
//
// Run:  npm run poster
// Requires:  the dev server running on :5173, OR a built `dist/` served via
//            `npm run preview`.
//
// Stub: this script is wired but Puppeteer is not yet a dependency. Add
// puppeteer to devDependencies when you're ready to run it.

const TARGET_URL =
  process.env.POSTER_URL ?? 'http://localhost:4173/state_tax_visualization/?p=v1|aaaa|...';

async function main() {
  // Resolved at runtime so TS doesn't require @types/puppeteer at typecheck time.
  const moduleName = 'puppeteer';
  const puppeteer = await import(moduleName).catch(() => null) as
    | { launch: (opts?: unknown) => Promise<{ newPage: () => Promise<unknown>; close: () => Promise<void> }> }
    | null;
  if (!puppeteer) {
    console.error(
      'puppeteer is not installed. Add it as a devDependency before running this script:\n' +
      '  npm i -D puppeteer',
    );
    process.exit(1);
  }

  const browser: any = await puppeteer.launch({ defaultViewport: { width: 1600, height: 2400, deviceScaleFactor: 2 } });
  const page = await browser.newPage();
  await page.goto(TARGET_URL, { waitUntil: 'networkidle0' });
  // Hide the editor pane on the printed output.
  await page.addStyleTag({ content: 'aside, header button, footer { display: none !important; }' });
  await page.screenshot({ path: 'poster.png', fullPage: true });
  await browser.close();
  console.log('Wrote poster.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
