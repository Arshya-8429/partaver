/** Repeatable real-catalogue visual and timing capture. Requires the built app on 4173. */
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { arch, cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
const directory = resolve('reports/uiux/before-current-browser');
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, colorScheme: 'light', serviceWorkers: 'allow' });
const page = await context.newPage(); page.setDefaultTimeout(45000);
const errors: string[] = []; let chunks = 0;
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (request.url().includes('/snapshot/chunks/')) chunks++; });
const screenshots: string[] = [];
async function shot(name: string): Promise<void> { const path = resolve(directory, `${name}.png`); await page.screenshot({ path, animations: 'disabled' }); screenshots.push(path); }
const started = performance.now(); await page.goto('http://127.0.0.1:4174/', { waitUntil: 'domcontentloaded' });
const firstDomReadyMs = performance.now() - started;
// Archived production UI automatically installs; preserve that measured behavior.
await expect(page.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'ready', { timeout: 600000 });
await expect(page.locator('#dbCount')).toHaveText('۳۶٬۵۶۹');
const firstOnlineReadyMs = null, automaticChunkRequests = chunks;
const manualInstallMs = null, installChunkRequests = chunks;
const firstLoadToCatalogueReadyMs = performance.now() - started;
const warmStartupMs: number[] = []; const beforeWarm = chunks;
for (let index = 0; index < 5; index++) {
  const start = performance.now(); await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#dbCount')).toHaveText('۳۶٬۵۶۹');
  await expect(page.locator('#codeSearchBtn')).toBeEnabled(); warmStartupMs.push(performance.now() - start);
}
await page.locator('[data-mode="codeMode"]').click();
async function query(input: string, count: number): Promise<number> {
  await page.locator('#codeQuery').fill(input);
  const start = performance.now(); await page.locator('#codeSearchBtn').click();
  await expect(page.locator('#resultCount')).toHaveText(`${count.toLocaleString('fa-IR')} ردیف`);
  await expect(page.locator('#cards .resultCard')).toHaveCount(Math.min(count, 20));
  return performance.now() - start;
}
const timings = [];
for (const [input, count] of [['0CF25BE-1500011BA', 11], ['گیربکس اتوماتیک', 56]] as const) {
  const firstMs = await query(input, count), warmMs = [];
  for (let repeat = 0; repeat < 5; repeat++) warmMs.push(await query(input, count));
  timings.push({ input, count, firstMs, warmMs });
}
await query('0CF25BE-1500011BA', 11);
const overflow = [];
for (const theme of ['light', 'dark']) {
  if ((await page.locator('body').getAttribute('class') ?? '').includes('dark') !== (theme === 'dark')) await page.locator('#themeToggle').click();
  for (const [device, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]] as const) {
    await page.setViewportSize(viewport); await page.evaluate(() => scrollTo(0, 0));
    await shot(`${device}-${theme}-overview`);
    await page.locator('#results').scrollIntoViewIfNeeded();
    await page.evaluate(() => document.querySelector('#results')!.scrollIntoView({ block: 'start' }));
    await shot(`${device}-${theme}-results`);
  }
  for (const width of [320, 360, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const metrics = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, firstCardHeight: document.querySelector('.resultCard')!.getBoundingClientRect().height, renderedCards: document.querySelectorAll('#cards .resultCard').length, priceClipping: [...document.querySelectorAll<HTMLElement>('#cards .priceValue')].filter(value => value.getBoundingClientRect().width > value.parentElement!.clientWidth).length }));
    overflow.push({ theme, viewport: width, ...metrics });
    expect(metrics.documentWidth).toBeLessThanOrEqual(width); expect(metrics.priceClipping).toBe(0);
  }
}
await page.setViewportSize({ width: 390, height: 844 });
await page.locator('#themeToggle').click(); // light after dark matrix
const variantCount = null, variantEntryCount = null;
await page.locator('[data-mode="partMode"]').click(); await page.locator('#vehicle').fill('X33 Cross');
await expect(page.locator('.vehicleOption')).toHaveCount(3); await shot('mobile-light-vehicle-picker');
await page.locator('#vehicle').press('Enter');
const ambiguousEnterPreserved = await page.locator('#vehicle').inputValue() === 'X33 Cross';
await page.locator('#vehicle').press('Escape');
const storage = await page.evaluate(() => navigator.storage.estimate());
const localReady = await page.locator('#catalogueStatusText').getAttribute('data-offline-ready');
const report = {
  capturedAt: new Date().toISOString(), stage: 'archived-production-before-ui-on-current-browser', datasetVersion: '5223b7729f85e7657129cfbad7db83910c827e4ec4e6668e1919be9bebd05480-s1-n1-r1',
  environment: { node: process.version, os: release(), platform: platform(), architecture: arch(), cpu: cpus()[0]?.model, browserVersion: browser.version(), userAgent: await page.evaluate(() => navigator.userAgent), cpuThrottling: 'none', network: 'loopback; no throttling', deviceScaleFactor: 1 },
  method: { startup: 'navigation to DOMContentLoaded then row-count/search-enabled; 5 warm installed starts', query: 'UI click until expected count and bounded cards; first then 5 warm repeated queries, Worker cache retained', screenshots: 'same real exact query, 11 entries, 1440x1000 / 390x844, both themes, top and results', limits: 'not INP, no physical Android, no network throttling, no statistically significant speedup claim; archived delivered production bundle; 4174 loopback proxy instead of 4173; all 8 baseline source hashes match; original bundle assets unchanged' },
  firstDomReadyMs, firstOnlineReadyMs, firstLoadToCatalogueReadyMs, automaticChunkRequests, manualInstallMs, installChunkRequests,
  warmStartupMs, warmLaunchChunkRequests: chunks - beforeWarm, timings, overflow, storage, localAndShellVerified: localReady === 'true',
  ambiguousEnterPreserved, lazyFamily: { visibleVariants: variantCount, expandedVariantEntries: variantEntryCount }, screenshots, pageErrors: errors,
};
await writeFile(resolve(directory, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
const baseline = JSON.parse(await readFile('reports/uiux/before/baseline.json', 'utf8'));
console.log(JSON.stringify({ firstDomReadyMs, firstOnlineReadyMs, firstLoadToCatalogueReadyMs, manualInstallMs, warmStartupMs, timings, baselineEnvironment: baseline.environment, currentEnvironment: report.environment, errors, screenshots: screenshots.length }));
await browser.close();
