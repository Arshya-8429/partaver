import { expect, test, webkit, type Page, type TestInfo } from '@playwright/test';
import type { AxeResults } from 'axe-core';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import ExcelJS from 'exceljs';

const require = createRequire(import.meta.url);
const evidenceDir = resolve('reports/release-2026-10-28/browser');
const widths = [320, 360, 390, 430, 768, 1024, 1440];
const publicRoutes = ['/', '/product', '/features', '/offline-data', '/support', '/contact'];
type SearchMeasurement = { query: string; mode: string; durationMs: number; resultCount: string | null };
type LongTaskMeasurement = { startTime: number; duration: number };
type BrowserMeasurements = { search: SearchMeasurement[]; longTasks: LongTaskMeasurement[]; longTaskSupported: boolean };

async function observePerformance(page: Page, search = false): Promise<void> {
  await page.evaluate(measureSearch => {
    const measurements: BrowserMeasurements = { search: [], longTasks: [], longTaskSupported: PerformanceObserver.supportedEntryTypes.includes('longtask') };
    (window as unknown as { releaseMeasurements: BrowserMeasurements }).releaseMeasurements = measurements;
    if (measurements.longTaskSupported) new PerformanceObserver(list => {
      measurements.longTasks.push(...list.getEntries().map(entry => ({ startTime: entry.startTime, duration: entry.duration })));
    }).observe({ type: 'longtask' });
    if (!measureSearch) return;
    let pending: { query: string; mode: string; started: number } | null = null;
    document.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement) || !['codeQuery', 'partQuery'].includes(event.target.id)) return;
      pending = { query: event.target.value, mode: event.target.id === 'codeQuery' ? 'global' : 'vehiclePart', started: performance.now() };
    }, true);
    const results = document.getElementById('results')!;
    new MutationObserver(() => {
      if (!pending || results.hasAttribute('aria-busy')) return;
      measurements.search.push({ query: pending.query, mode: pending.mode, durationMs: performance.now() - pending.started, resultCount: document.getElementById('resultCount')?.textContent ?? null });
      pending = null;
    }).observe(results, { attributes: true, attributeFilter: ['aria-busy'] });
  }, search);
}

async function performanceMeasurements(page: Page): Promise<BrowserMeasurements> {
  return page.evaluate(() => (window as unknown as { releaseMeasurements: BrowserMeasurements }).releaseMeasurements);
}

async function evidence(testInfo: TestInfo, name: string, value: unknown): Promise<void> {
  await mkdir(evidenceDir, { recursive: true });
  const path = resolve(evidenceDir, `${testInfo.project.name}-${name}.json`);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  await testInfo.attach(name, { path, contentType: 'application/json' });
}

async function screenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await mkdir(evidenceDir, { recursive: true });
  const path = resolve(evidenceDir, `${testInfo.project.name}-${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function settleLayout(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

async function clippedValues(page: Page): Promise<Array<string | null>> {
  return page.locator('.priceValue, .codeValue').evaluateAll(elements => elements.filter(element => {
    const rect = element.getBoundingClientRect();
    const parent = element.parentElement!.getBoundingClientRect();
    // Firefox reports a nonzero scrollWidth with clientWidth=0 for normal inline bdi.
    // Its actual text rectangle still detects genuine clipping against the containing cell.
    return (element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1) || rect.left < parent.left - 1 || rect.right > parent.right + 1;
  }).map(element => element.textContent));
}

async function onlineApp(page: Page): Promise<void> {
  await page.goto('/app/');
  await expect(page.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'online');
}

async function codeSearch(page: Page, value = '111100001AA'): Promise<void> {
  await page.locator('#codeTab').click();
  await page.locator('#codeQuery').fill(value);
  await page.locator('#codeQuery').press('Enter');
  await expect(page.locator('#cards .resultCard').first()).toBeVisible();
}

async function audit(page: Page, testInfo: TestInfo, name: string): Promise<AxeResults> {
  if (!await page.evaluate(() => 'axe' in window)) {
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  }
  const result = await page.evaluate(async () => {
    const engine = (window as unknown as { axe: { run(options: Record<string, unknown>): Promise<AxeResults> } }).axe;
    return engine.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } });
  });
  await evidence(testInfo, `axe-${name}`, result);
  return result;
}

test('online catalogue, keyboard selection, details and documents preserve exact identities', async ({ page, browser }, testInfo) => {
  const errors: string[] = [];
  const consoleProblems: string[] = [];
  const chunks: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') consoleProblems.push(message.text()); });
  page.on('request', request => { if (request.url().includes('/snapshot/chunks/')) chunks.push(request.url()); });
  await onlineApp(page);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg');
  const icon = await page.request.get('/favicon.svg');
  expect(icon.status()).toBe(200);
  expect(icon.headers()['content-type']).toContain('image/svg+xml');
  await page.locator('#vehicle').fill('X33 Cross CVT');
  await expect(page.locator('.vehicleOption').first()).toBeVisible();
  await page.locator('#vehicle').press('Enter');
  await expect(page.locator('#vehicle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#vehicle')).toHaveValue(/CVT/);
  await page.locator('#partQuery').fill('سپر');
  await expect(page.locator('#partList [role="option"]').first()).toBeVisible();
  await page.locator('#partQuery').press('ArrowDown');
  await page.locator('#partQuery').press('Enter');
  await expect(page.locator('#cards .resultCard').first()).toBeVisible();
  await codeSearch(page);
  await expect(page.locator('#cards .resultCard')).toHaveCount(2);
  const first = page.locator('#cards .resultCard').first();
  const logistics = await first.locator('.codeValue').nth(1).innerText();
  await first.locator('.detailToggle').click();
  await expect(page.locator('#detailTitle')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(first.locator('.detailToggle')).toBeFocused();
  await first.locator('.packageAction').click();
  await page.locator('[data-area="packages"]').click();
  const line = page.locator('.docLine').first();
  await expect(line).toContainText(logistics);
  const manual = line.locator('[data-doc-key^="price-"]');
  await manual.fill('12345678901234567890');
  await manual.press('Tab');
  const quantity = line.locator('[data-doc-key^="quantity-"]');
  await quantity.fill('3');
  await quantity.press('Tab');
  await expect(line.locator('.docLineTotal')).toContainText('۳۷٬۰۳۷٬۰۳۶٬۷۰۳٬۷۰۳٬۷۰۳٬۶۷۰');
  await page.reload();
  await page.locator('[data-area="packages"]').click();
  await expect(page.locator('[data-doc-key^="price-"]').first()).toHaveValue('12345678901234567890');
  await page.locator('.docActions .primary').first().click();
  await expect(page.locator('.docHistoryItem')).toHaveCount(1);
  await page.locator('.docHistoryItem').getByRole('button', { name: 'افزودن به فاکتور' }).click();
  await expect(page.locator('.docLine')).toHaveCount(1);
  await expect(page.locator('.docLine')).toContainText(logistics);
  await expect(page.locator('[data-doc-key^="price-"]').first()).toHaveValue('12345678901234567890');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'خروجی Excel (.xlsx)' }).click(),
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path!);
  expect(JSON.stringify(workbook.worksheets[0]!.getRow(5).values)).toContain('12345678901234567890');
  expect(JSON.stringify(workbook.worksheets[0]!.getRow(5).values)).toContain(logistics);
  await page.getByRole('button', { name: 'نمای چاپ / PDF' }).click();
  await expect(page.locator('#partavarPrintView')).toContainText(logistics);
  await screenshot(page, testInfo, 'invoice-print-preview');
  expect(chunks).toEqual([]);
  expect(errors).toEqual([]);
  expect(consoleProblems).toEqual([]);
  await evidence(testInfo, 'online-smoke', {
    browserVersion: browser.version(), logistics, errors, consoleProblems,
    catalogueChunksAtStartupAndOnlineSearch: chunks.length,
    manualUnitPrice: '12345678901234567890', quantity: '3',
    xlsxReadBack: true, printScope: 'browser HTML print preview; native OS PDF dialog is not exercised',
  });
});

test('public routes, both themes, seven widths, keyboard and 200 percent enlargement are usable', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const violations: Array<{ route: string; dark: boolean; width: number; kind: string; detail: unknown }> = [];
  const privateRequests: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\/(api\/|snapshot|private-data)/.test(new URL(request.url()).pathname)) privateRequests.push(request.url()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  const robots = await page.request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(robots.headers()['content-type']).toContain('text/plain');
  expect(await robots.text()).toMatch(/User-agent:\s*\*/i);
  expect(await robots.text()).toMatch(/Disallow:\s*\/app/i);
  await page.keyboard.press(testInfo.project.name === 'webkit' ? 'Alt+Tab' : 'Tab');
  await expect(page.locator('.site-skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#site-main')).toBeFocused();
  await page.locator('#site-menu-toggle').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#site-menu-toggle')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#site-navigation a').first().focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#site-menu-toggle')).toBeFocused();
  await expect(page.locator('#site-menu-toggle')).toHaveAttribute('aria-expanded', 'false');
  for (const dark of [false, true]) {
    if (await page.locator('body').evaluate(body => body.classList.contains('dark')) !== dark) await page.locator('#themeToggle').click();
    for (const route of publicRoutes) {
      await page.goto(route);
      await expect(page.locator('main h1')).toHaveCount(1);
      await expect(page.locator('body')).toHaveClass(dark ? /dark/ : /^(?!.*dark)/);
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await settleLayout(page);
        if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) {
          violations.push({ route, dark, width, kind: 'page horizontal overflow', detail: await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth })) });
        }
        const tooSmall = await page.locator('.public-website a:visible, .public-website button:visible, .public-website summary:visible').evaluateAll(elements => elements.map(element => ({ label: element.textContent?.trim() || element.getAttribute('aria-label'), width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })).filter(item => item.width < 43.5 || item.height < 43.5));
        if (tooSmall.length) violations.push({ route, dark, width, kind: 'touch target', detail: tooSmall });
      }
      if (route === '/') await screenshot(page, testInfo, `site-${dark ? 'dark' : 'light'}-1440`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/support');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await screenshot(page, testInfo, 'site-text-200-percent');
  await evidence(testInfo, 'public-layout', { widths, routes: publicRoutes, themes: ['light', 'dark'], violations, privateRequests, errors });
  expect(violations).toEqual([]);
  expect(privateRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('automated WCAG accessibility audit covers app workspaces, dialogs and public pages in both themes', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const failures: Array<{ state: string; violations: AxeResults['violations'] }> = [];
  async function check(name: string): Promise<void> {
    const result = await audit(page, testInfo, name);
    if (result.violations.length) failures.push({ state: name, violations: result.violations });
  }
  for (const dark of [false, true]) {
    const theme = dark ? 'dark' : 'light';
    await page.goto('/');
    if (await page.locator('body').evaluate(body => body.classList.contains('dark')) !== dark) await page.locator('#themeToggle').click();
    for (const route of publicRoutes) {
      await page.goto(route);
      await check(`site-${route.replaceAll('/', '') || 'home'}-${theme}`);
    }
    await onlineApp(page);
    await check(`app-search-${theme}`);
    await page.locator('#vehicle').fill('X33 Cross');
    await expect(page.locator('#vehicleSuggestions')).toBeVisible();
    await check(`vehicle-combobox-${theme}`);
    await page.locator('#vehicle').press('Escape');
    await page.locator('#vehicle').fill('X33 Cross CVT');
    await expect(page.locator('.vehicleOption').first()).toBeVisible();
    await page.locator('#vehicle').press('Enter');
    await page.locator('#partQuery').fill('سپر');
    await expect(page.locator('#partList [role="option"]').first()).toBeVisible();
    await check(`part-combobox-${theme}`);
    await page.locator('#partQuery').press('Escape');
    await codeSearch(page);
    await check(`app-results-${theme}`);
    const first = page.locator('#cards .resultCard').first();
    await first.locator('.detailToggle').click();
    await expect(page.locator('#detailDialog')).toBeVisible();
    await check(`entry-dialog-${theme}`);
    await page.keyboard.press('Escape');
    await first.locator('.invoiceAction').click();
    await expect(page.locator('.docPricePicker')).toBeVisible();
    await check(`invoice-price-dialog-${theme}`);
    await page.keyboard.press('Escape');
    for (const area of ['purchase', 'packages', 'invoices', 'prices', 'settings']) {
      await page.locator(`[data-area="${area}"]`).click();
      await expect(page.locator(area === 'prices' ? '#priceRoot' : '#documentRoot')).toBeVisible();
      await check(`app-${area}-${theme}`);
    }
    const [backup] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'دریافت پشتیبان JSON' }).click(),
    ]);
    const backupPath = await backup.path();
    expect(backupPath).toBeTruthy();
    await page.locator('.docFileInput').setInputFiles(backupPath!);
    await expect(page.locator('.docImportDialog')).toBeVisible();
    await check(`backup-import-dialog-${theme}`);
    await page.keyboard.press('Escape');
  }
  await evidence(testInfo, 'axe-summary', { automatedScope: 'axe-core WCAG 2 A/AA, WCAG 2.1 A/AA and best-practice rules; not screen-reader certification', failures });
  expect(failures).toEqual([]);
});

test('app keyboard, touch targets, reduced motion and 200 percent layout preserve usable content', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await onlineApp(page);
  await page.keyboard.press(testInfo.project.name === 'webkit' ? 'Alt+Tab' : 'Tab');
  await expect(page.locator('.skipLink')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#workspace')).toBeFocused();
  await page.locator('#partTab').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#codeTab')).toBeFocused();
  await expect(page.locator('#codeTab')).toHaveAttribute('aria-selected', 'true');
  await codeSearch(page, '0CF25BE-1500011BA');
  const problems: Array<{ width: number; dark: boolean; kind: string; detail: unknown }> = [];
  for (const dark of [false, true]) {
    if (await page.locator('body').evaluate(body => body.classList.contains('dark')) !== dark) await page.locator('#themeToggle').click();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await settleLayout(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (overflow) problems.push({ width, dark, kind: 'page overflow', detail: true });
      const clipped = await clippedValues(page);
      if (clipped.length) problems.push({ width, dark, kind: 'clipped price/code', detail: clipped });
      const tooSmall = await page.locator('button:visible, .appNav a:visible, summary:visible').evaluateAll(elements => elements.map(element => ({ label: element.textContent?.trim() || element.getAttribute('aria-label'), width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })).filter(item => item.width < 43.5 || item.height < 43.5));
      if (tooSmall.length) problems.push({ width, dark, kind: 'touch target', detail: tooSmall });
      if (width === 390) await screenshot(page, testInfo, `app-results-${dark ? 'dark' : 'light'}-390`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  await settleLayout(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const clippedAtZoom = await clippedValues(page);
  await screenshot(page, testInfo, 'app-zoom-200-percent');
  expect(clippedAtZoom).toEqual([]);
  await page.evaluate(() => { document.documentElement.style.zoom = ''; });
  await page.locator('[data-area="settings"]').click();
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await screenshot(page, testInfo, 'settings-text-200-percent');
  const transition = await page.locator('#themeToggle').evaluate(element => getComputedStyle(element).transitionDuration);
  expect(transition).toBe('0s');
  await evidence(testInfo, 'app-layout', { widths, themes: ['light', 'dark'], problems, clippedAtZoom, transition, errors });
  expect(problems).toEqual([]);
  expect(errors).toEqual([]);
});

test('full catalogue installs and offline shell relaunch preserves search parity in real IndexedDB', async ({ browser, browserName }, testInfo) => {
  test.setTimeout(12 * 60 * 1000);
  // WebKit's ephemeral profile reports a 1GB quota; the complete installed catalogue
  // needs more. A clean persistent profile exercises real disk storage and process restart.
  const profile = browserName === 'webkit' ? await mkdtemp(join(tmpdir(), 'partavar-release-webkit-')) : null;
  let context = profile ? await webkit.launchPersistentContext(profile, { headless: true, serviceWorkers: 'allow' }) : await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  try {
  const errors: string[] = [];
  const consoleProblems: string[] = [];
  let intentionalOffline = false;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (!intentionalOffline && (message.type() === 'warning' || message.type() === 'error')) consoleProblems.push(message.text()); });
  await onlineApp(page);
  await codeSearch(page, '0CF25BE-1500011BA');
  const onlineCards = await page.locator('#cards .resultCard').allTextContents();
  await observePerformance(page);
  await page.locator('#catalogueInfo summary').click();
  const started = Date.now();
  await page.locator('#catalogueUpdateButton').click();
  await page.waitForFunction(() => {
    const state = document.getElementById('catalogueStatusText')?.dataset.state;
    return state === 'ready' || (state === 'online' && (document.getElementById('catalogueCancelButton') as HTMLButtonElement).hidden);
  }, undefined, { timeout: 10 * 60 * 1000 });
  await evidence(testInfo, 'install-outcome', { state: await page.locator('#catalogueStatusText').getAttribute('data-state'), details: await page.locator('#catalogueStatusMeta').innerText(), profile: profile ? 'isolated persistent profile' : 'isolated ephemeral context' });
  await expect(page.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'ready');
  const installMs = Date.now() - started;
  await expect(page.locator('#dbCount')).toHaveText('۳۶٬۵۶۹');
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const storage = await page.evaluate(async () => ({
    estimate: await navigator.storage.estimate(),
    caches: await caches.keys(),
    secureContext: isSecureContext,
    controller: Boolean(navigator.serviceWorker.controller),
  }));
  const installationPerformance = await performanceMeasurements(page);
  intentionalOffline = true;
  if (profile) {
    await context.close();
    context = await webkit.launchPersistentContext(profile, { headless: true, offline: true, serviceWorkers: 'allow' });
  } else {
    await context.setOffline(true);
    await page.close();
  }
  const reopened = await context.newPage();
  reopened.on('pageerror', error => errors.push(error.message));
  await reopened.goto('/app/', { waitUntil: 'domcontentloaded' });
  await expect(reopened.locator('#dbCount')).toHaveText('۳۶٬۵۶۹');
  expect(await reopened.evaluate(() => navigator.onLine)).toBe(false);
  await codeSearch(reopened, '0CF25BE-1500011BA');
  await expect(reopened.locator('#cards .resultCard')).toHaveCount(11);
  expect(await reopened.locator('#cards .resultCard').allTextContents()).toEqual(onlineCards);
  await observePerformance(reopened, true);
  for (const query of ['111100001AA-01', 'واتر پمپ', '150']) {
    for (let trial = 0; trial < 9; trial++) {
      await codeSearch(reopened, query);
      await settleLayout(reopened);
    }
  }
  await reopened.locator('#partTab').click();
  await reopened.locator('#vehicle').fill('X33 Cross CVT');
  await expect(reopened.locator('.vehicleOption').first()).toBeVisible();
  await reopened.locator('#vehicle').press('Enter');
  for (let trial = 0; trial < 9; trial++) {
    await reopened.locator('#partQuery').fill('سپر');
    await reopened.locator('#partQuery').press('Enter');
    await expect(reopened.locator('#cards .resultCard').first()).toBeVisible();
    await settleLayout(reopened);
  }
  const searchPerformance = await performanceMeasurements(reopened);
  const latency = [
    { label: 'exact logistics code', query: '111100001AA-01', mode: 'global', proposedWarmP95TargetMs: 150 },
    { label: 'part phrase', query: 'واتر پمپ', mode: 'global', proposedWarmP95TargetMs: 300 },
    { label: 'broad three-character code', query: '150', mode: 'global', proposedWarmP95TargetMs: null },
    { label: 'vehicle-filtered part', query: 'سپر', mode: 'vehiclePart', proposedWarmP95TargetMs: 300 },
  ].map(({ label, query, mode, proposedWarmP95TargetMs }) => {
    const measurements = searchPerformance.search.filter(sample => sample.query === query && sample.mode === mode);
    expect(measurements).toHaveLength(9);
    const warm = measurements.slice(2).map(sample => sample.durationMs).sort((a, b) => a - b);
    const p95Ms = warm[Math.ceil(warm.length * .95) - 1]!;
    return { label, query, mode, warmupSamples: measurements.slice(0, 2), warmSamplesMs: warm, p95Ms, proposedWarmP95TargetMs, meetsProposedTarget: proposedWarmP95TargetMs === null ? null : p95Ms <= proposedWarmP95TargetMs };
  });
  await evidence(testInfo, 'local-performance', {
    measurementScope: 'actual keydown-to-result DOM update using performance.now and MutationObserver; includes local Worker work and UI rendering, excludes Playwright transport time; seven warm sequential samples after two warmups per query',
    environment: 'single shared macOS host; no controlled mobile/low-end hardware or before/after performance claim',
    browserVersion: browser.version(), latency, installationPerformance, searchPerformance,
  });
  await codeSearch(reopened, '0CF25BE-1500011BA');
  await reopened.setViewportSize({ width: 390, height: 844 });
  await screenshot(reopened, testInfo, 'offline-search-390');
  await evidence(testInfo, 'offline', {
    browserVersion: browser.version(), installMs, storage, rowCount: 36569,
    exactCode: '0CF25BE-1500011BA', onlineOfflineResultCount: 11,
    searchParity: true, shellReopenedWithoutNetwork: true,
    relaunchScope: profile ? 'temporary persistent WebKit profile: full browser process closed and reopened with offline=true before navigation' : 'page closed and new page opened in the same live browser context; full browser process restart is covered separately by existing Chromium tests',
    errors, consoleProblems,
  });
  expect(errors).toEqual([]);
  expect(consoleProblems).toEqual([]);
  } finally {
    await context.close();
    if (profile) await rm(profile, { recursive: true, force: true });
  }
});
