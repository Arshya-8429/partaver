import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';

const origin = 'http://127.0.0.1:4173/app';
const version = '5223b7729f85e7657129cfbad7db83910c827e4ec4e6668e1919be9bebd05480-s1-n1-r1';
const fakeVersion = `${'a'.repeat(64)}-s1-n1-r1`;
const oldFixtureVersion = `${'b'.repeat(64)}-s1-n1-r1`;
const fixtureSourceSha = 'd'.repeat(64);
const snapshotTables = [
  'partNames', 'parts', 'entries', 'models', 'entryModels', 'friendlyLabels', 'aliases', 'replacements',
  'vehicleOptions', 'optionModels', 'presetFamilies', 'presetFamilyOptions', 'searchDocuments', 'entrySearchDocuments',
] as const;
let context: BrowserContext;
let page: Page;
let fullInstallMs = 0;
let threeCharacterSearchMs = 0;
let paginationPageMs = 0;
let storageEstimate: StorageEstimate | null = null;
let reportBase: Record<string, unknown> | null = null;

test.describe.configure({ mode: 'serial' });
test.setTimeout(12 * 60 * 1000);

async function replicaState(target: Page, failedVersion = fakeVersion): Promise<{ activeVersion: string | null; entryCount: number; failedStatus: string | null }> {
  return target.evaluate((versionToInspect) => new Promise((resolve, reject) => {
    const request = indexedDB.open('PartsFinderCatalogue');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['meta', 'entries', 'catalogVersions'], 'readonly');
      const activeRequest = transaction.objectStore('meta').get('activeCatalogVersion');
      const countRequest = transaction.objectStore('entries').count();
      const failedRequest = transaction.objectStore('catalogVersions').get(versionToInspect);
      transaction.oncomplete = () => {
        resolve({
          activeVersion: activeRequest.result?.value?.toString() ?? null,
          entryCount: countRequest.result,
          failedStatus: failedRequest.result?.status ?? null,
        });
        db.close();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  }), failedVersion);
}

async function waitForInstalled(target: Page, rowCount = 36_569): Promise<void> {
  await expect(target.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'ready', { timeout: 10 * 60 * 1000 });
  await expect(target.locator('#dbCount')).toHaveText(rowCount.toLocaleString('fa-IR'));
}

function makeSnapshotBundle(
  catalogVersion: string,
  sourceSha256: string,
  rows: Partial<Record<typeof snapshotTables[number], Array<Record<string, unknown>>>>,
) {
  const counts = Object.fromEntries(snapshotTables.map((table) => [table, rows[table]?.length ?? 0]));
  const chunks: Array<{ id: string; path: string; table: string; ordinal: number; recordCount: number; decodedBytes: number; sha256: string }> = [];
  const bodies = new Map<string, Buffer>();
  for (const table of snapshotTables) {
    const tableRows = rows[table] ?? [];
    if (!tableRows.length) continue;
    const body = Buffer.from(`${tableRows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
    const sha256 = createHash('sha256').update(body).digest('hex');
    const id = `${table}-00000-${sha256.slice(0, 16)}`;
    const path = `/api/v1/catalog/${catalogVersion}/snapshot/chunks/${id}`;
    chunks.push({ id, path, table, ordinal: 0, recordCount: tableRows.length, decodedBytes: body.byteLength, sha256 });
    bodies.set(id, body);
  }
  const rowCount = counts.entries ?? 0;
  const createdAt = new Date().toISOString();
  const snapshot = {
    catalogVersion, schemaVersion: 1, normalizationVersion: 1, rulesVersion: 1, indexFormatVersion: 1,
    sourceSha256, currencyUnit: 'UNKNOWN' as const, priceEffectiveAt: null, createdAt,
    counts, rowCount, totalDecodedBytes: chunks.reduce((sum, chunk) => sum + chunk.decodedBytes, 0), chunks,
  };
  const active = {
    catalogVersion, schemaVersion: 1, normalizationVersion: 1, rulesVersion: 1, indexFormatVersion: 1,
    sourceSha256, currencyUnit: 'UNKNOWN' as const, priceEffectiveAt: null, createdAt, publishedAt: createdAt,
    counts: { ...counts, rows: rowCount },
    snapshotManifestPath: `/api/v1/catalog/${catalogVersion}/snapshot/manifest`, rowCount,
  };
  return { active, snapshot, bodies };
}

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ serviceWorkers: 'allow' });
  page = await context.newPage();
  page.setDefaultTimeout(45_000);
});

test.afterAll(async () => { await context?.close(); });

test('preserves original workflows, installs the full catalogue, and searches after offline relaunch', async () => {
  const appErrors: string[] = [];
  page.on('pageerror', (error) => appErrors.push(error.message));
  let holdFirstChunk = true;
  let releaseFirstChunk!: () => void;
  let notifyFirstChunk!: () => void;
  const firstChunkRequested = new Promise<void>((resolveChunk) => { notifyFirstChunk = resolveChunk; });
  const firstChunkGate = new Promise<void>((resolveChunk) => { releaseFirstChunk = resolveChunk; });
  await context.route('**/api/v1/catalog/*/snapshot/chunks/*', async (route) => {
    if (!holdFirstChunk) {
      await route.continue();
      return;
    }
    holdFirstChunk = false;
    try {
      const response = await route.fetch();
      notifyFirstChunk();
      await firstChunkGate;
      await route.fulfill({ response });
    } catch {
      try { await route.abort(); } catch { /* Cancellation can close the intercepted request first. */ }
    }
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'online');
  await page.locator('#catalogueInfo summary').click();
  await page.locator('#catalogueUpdateButton').click();
  await expect(page.locator('#catalogueCancelButton')).toBeVisible({ timeout: 60_000 });
  await firstChunkRequested;
  await page.locator('#catalogueCancelButton').click();
  await expect(page.locator('#catalogueStatusMeta')).toContainText(/لغو/i, { timeout: 15_000 });
  releaseFirstChunk();
  expect((await replicaState(page)).activeVersion).toBeNull();

  const installationStart = Date.now();
  await page.locator('#catalogueUpdateButton').click();
  await waitForInstalled(page);
  fullInstallMs = Date.now() - installationStart;
  const installed = await replicaState(page);
  expect(installed).toMatchObject({ activeVersion: version, entryCount: 36_569 });
  storageEstimate = await page.evaluate(async () => navigator.storage.estimate());

  // Both original search tabs, the model picker and the quick trim selector remain available.
  await expect(page.locator('.tab[data-mode="partMode"]')).toBeVisible();
  await expect(page.locator('.tab[data-mode="codeMode"]')).toBeVisible();
  await page.locator('#vehiclePresets summary').click();
  await expect(page.locator('.presetFamily').first()).toBeVisible();
  await page.locator('.presetFamily').first().click();
  await expect(page.locator('#presetDrawer')).toBeVisible();
  const preset = page.locator('.presetVariant').first();
  const presetLabel = await preset.textContent();
  await preset.click();
  await expect(page.locator('#vehicle')).toHaveValue(presetLabel ?? '');
  await expect(page.locator('#vehicle')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#catalogueUpdateButton').click();
  await expect(page.locator('#catalogueUpdateButton')).toBeEnabled();
  await expect(page.locator('#catalogueStatusMeta')).toContainText('کاتالوگ محلی به‌روز است');
  await expect(page.locator('#vehicle')).toHaveValue(presetLabel ?? '');

  await page.locator('[data-mode="codeMode"]').click();
  await page.locator('#codeQuery').fill('0CF25BE-1500011BA');
  await page.locator('#codeSearchBtn').click();
  await expect(page.locator('#resultCount')).toContainText('۱۱ ردیف');
  await expect(page.locator('#cards .resultCard')).toHaveCount(11);
  const firstCard = page.locator('#cards .resultCard').first();
  await expect(firstCard).toContainText('کد فنی');
  await expect(firstCard).toContainText('کد لجستیکی');
  await expect(firstCard).toContainText('۳٬۶۴۹٬۶۴۴٬۳۲۱');
  await firstCard.locator('.detailToggle').click();
  await expect(page.locator('#detailDialog .entryDetail')).toContainText('TIGGO7 PRO Excellent');
  await expect(page.locator('#detailDialog .entryDetail')).toContainText('نام‌های جایگزین');
  await page.keyboard.press('Escape');
  await expect(page.locator('#detailDialog')).not.toBeVisible();

  // Search pages replace the current DOM; family logistics entries remain distinct cards.
  await page.locator('#codeQuery').fill('150');
  const threeCharacterSearchStart = Date.now();
  await page.locator('#codeSearchBtn').click();
  await expect(page.locator('#resultCount')).toContainText('۱٬۲۷۴ ردیف', { timeout: 30_000 });
  threeCharacterSearchMs = Date.now() - threeCharacterSearchStart;
  await expect(page.locator('#cards .resultCard')).toHaveCount(20);
  const paginationStart = Date.now();
  await page.locator('#pagination .pageButton').last().click();
  await expect(page.locator('#cards .resultCard')).toHaveCount(20, { timeout: 30_000 });
  paginationPageMs = Date.now() - paginationStart;
  await expect(page.locator('#pagination .pageLabel')).toContainText('صفحهٔ ۲');
  await page.locator('#pagination .pageButton').first().click();
  await expect(page.locator('#pagination .pageLabel')).toContainText('صفحهٔ ۱', { timeout: 30_000 });

  // Rapid repeated query replacement must not accumulate result cards or stale pages.
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('#codeQuery')!;
    const search = document.querySelector<HTMLButtonElement>('#codeSearchBtn')!;
    for (let index = 0; index < 100; index++) {
      input.value = index % 2 ? '150' : '0CF25BE-1500011BA';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      search.click();
    }
    input.value = '0CF25BE-1500011BA';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    search.click();
  });
  await expect(page.locator('#resultCount')).toContainText('۱۱ ردیف');
  await expect(page.locator('#cards .resultCard')).toHaveCount(11);
  expect(await page.locator('#cards .resultCard').count()).toBeLessThanOrEqual(20);
  expect(await page.locator('#cards').evaluate((node) => node.children.length)).toBeLessThanOrEqual(21);

  const screenshots = resolve('reports/screenshots');
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: resolve(screenshots, 'desktop-light.png'), fullPage: true });
  await page.locator('#themeToggle').click();
  await expect(page.locator('body')).toHaveClass(/dark/);
  await page.screenshot({ path: resolve(screenshots, 'desktop-dark.png'), fullPage: true });
  await page.locator('#themeToggle').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(screenshots, 'mobile-light.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });

  // A real relaunch uses only the cached app shell and IndexedDB; the API is unavailable.
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 30_000 });
  const cachedShell = await page.evaluate(async () => {
    const key = (await caches.keys()).find(key => key.startsWith('partavar-shell-'));
    if (!key) throw new Error('No verified application shell cache.');
    const cache = await caches.open(key);
    const assets = [...document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[rel="stylesheet"]')]
      .map((asset) => new URL(asset instanceof HTMLScriptElement ? asset.src : asset.href).pathname);
    const cached = await Promise.all(assets.map(async (path) => Boolean(await cache.match(path))));
    return { assets, cached, allCached: cached.every(Boolean) };
  });
  expect(cachedShell.allCached).toBe(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  expect(await replicaState(page)).toMatchObject({ activeVersion: version, entryCount: 36_569 });
  const offlineDiagnostics = await page.evaluate(async () => ({
    online: navigator.onLine,
    controller: Boolean(navigator.serviceWorker.controller),
    serviceWorkers: (await navigator.serviceWorker.getRegistrations()).map((registration) => registration.active?.state ?? 'inactive'),
    stylesheetLinks: [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((link) => link.href),
    loadedStylesheets: document.styleSheets.length,
    bodyFont: getComputedStyle(document.body).fontFamily,
    resources: performance.getEntriesByType('resource').map((entry) => entry as PerformanceResourceTiming)
      .filter((entry) => entry.initiatorType === 'script' || entry.initiatorType === 'link')
      .map((entry) => ({ name: entry.name, duration: entry.duration, transferSize: entry.transferSize })),
    status: document.querySelector('#catalogueStatusText')?.textContent,
  }));
  console.log('OFFLINE_DIAGNOSTICS', JSON.stringify(offlineDiagnostics));
  expect(offlineDiagnostics.online).toBe(false);
  expect(offlineDiagnostics.controller).toBe(true);
  expect(offlineDiagnostics.loadedStylesheets).toBeGreaterThan(0);
  expect(offlineDiagnostics.bodyFont).not.toBe('Times');
  await expect(page.locator('#catalogueVersion')).toContainText(version.slice(0, 12), { timeout: 30_000 });
  await expect(page.locator('#dbCount')).toHaveText('۳۶٬۵۶۹');
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.locator('[data-mode="codeMode"]').click();
  await page.locator('#codeQuery').fill('0CF25BE-1500011BA');
  await page.locator('#codeSearchBtn').click();
  await expect(page.locator('#resultCount')).toContainText('۱۱ ردیف');
  await expect(page.locator('#cards .resultCard')).toHaveCount(11);

  // Real offline family with 18 technical variants: page 10 + page 8.
  await page.locator('#codeQuery').fill('019CHA-1502503');
  await page.locator('#codeSearchBtn').click();
  await expect(page.locator('#cards .resultCard').first()).toContainText('019CHA-1502503');
  await page.locator('#cards .familySearchButton').first().click();
  await expect(page.locator('.variantRow')).toHaveCount(10);
  await expect(page.locator('.variantEntries .resultCard')).toHaveCount(0);
  await page.getByRole('button', { name: 'گونه‌های بعدی' }).click();
  await expect(page.locator('.variantRow')).toHaveCount(8);
  await page.getByRole('button', { name: 'گونه‌های قبلی' }).click();
  await expect(page.locator('.variantRow')).toHaveCount(10);
  await page.keyboard.press('Escape');
  await page.locator('#codeQuery').fill('0CF25BE-1500011BA');
  await page.locator('#codeSearchBtn').click();
  await expect(page.locator('#resultCount')).toContainText('۱۱ ردیف');

  reportBase = {
    browser: await page.evaluate(() => ({ userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight } })),
    offlineInstallMs: fullInstallMs,
    threeCharacterSearchMs,
    paginationPageMs,
    storageEstimate,
    offlineRelaunch: {
      online: offlineDiagnostics.online,
      serviceWorkerControlled: offlineDiagnostics.controller,
      cachedShellAssets: cachedShell.assets,
      cachedStylesheetFont: offlineDiagnostics.bodyFont,
      activeVersion: (await replicaState(page)).activeVersion,
      entryCount: (await replicaState(page)).entryCount,
      searchResultCount: 11,
    },
    repeatedQueries: 100,
    maximumRenderedCards: 20,
    screenshotFiles: ['reports/screenshots/desktop-light.png', 'reports/screenshots/desktop-dark.png', 'reports/screenshots/mobile-light.png'],
    pageErrors: appErrors,
  };
  expect(appErrors).toEqual([]);
});

test('cancels a staged update at a chunk boundary and keeps the prior offline catalogue active', async ({ browser }) => {
  const updateContext = await browser.newContext({ serviceWorkers: 'block' });
  const updatePage = await updateContext.newPage();
  updatePage.setDefaultTimeout(30_000);
  let servingUpdate = false;

  const oldRows = {
    partNames: [{ version: oldFixtureVersion, id: 1, nameRaw: 'Fixture part', nameNorm: 'fixture part', sortRank: 0 }],
    parts: [{ version: oldFixtureVersion, id: 1, nameId: 1, techRaw: 'TECH-OLD', techNorm: 'TECH-OLD', sortRank: 0, familyRoot: 'TECH-OLD', familyVariant: 'BASE' }],
    entries: [{ version: oldFixtureVersion, id: 1, partId: 1, logRaw: 'LOG-OLD', logNorm: 'LOG-OLD', basePrice: '10', replacementRaw: '', sourceRowOrdinal: 1, sourceRowSha256: fixtureSourceSha, suffix01Rank: 0 }],
  };
  const newRows = {
    entries: [{ version: fakeVersion, id: 1, partId: 1, logRaw: 'LOG-NEW', logNorm: 'LOG-NEW', basePrice: '20', replacementRaw: '', sourceRowOrdinal: 1, sourceRowSha256: fixtureSourceSha, suffix01Rank: 0 }],
  };
  const oldBundle = makeSnapshotBundle(oldFixtureVersion, fixtureSourceSha, oldRows);
  const newBundle = makeSnapshotBundle(fakeVersion, fixtureSourceSha, newRows);
  let releaseNewChunk!: () => void;
  let notifyNewChunkRequested!: () => void;
  const newChunkRequested = new Promise<void>((resolveChunk) => { notifyNewChunkRequested = resolveChunk; });
  const newChunkGate = new Promise<void>((resolveChunk) => { releaseNewChunk = resolveChunk; });

  await updateContext.route('**/api/v1/catalog/manifest', (route) => route.fulfill({
    status: 200,
    headers: { etag: servingUpdate ? '"fixture-new-version"' : '"fixture-old-version"' },
    json: servingUpdate ? newBundle.active : oldBundle.active,
  }));
  await updateContext.route('**/api/v1/catalog/*/snapshot/manifest', async (route) => {
    const bundle = route.request().url().includes(fakeVersion) ? newBundle : oldBundle;
    await route.fulfill({ status: 200, headers: { etag: `"${bundle.snapshot.catalogVersion}"` }, json: bundle.snapshot });
  });
  await updateContext.route('**/api/v1/catalog/*/snapshot/chunks/*', async (route) => {
    const bundle = route.request().url().includes(fakeVersion) ? newBundle : oldBundle;
    const chunk = bundle.snapshot.chunks.find((item) => route.request().url().endsWith(item.id));
    if (!chunk) { await route.abort(); return; }
    const body = bundle.bodies.get(chunk.id);
    if (!body) { await route.abort(); return; }
    if (bundle === newBundle) {
      notifyNewChunkRequested();
      await newChunkGate;
    }
    try { await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body }); }
    catch { try { await route.abort(); } catch { /* Cancellation may have closed the intercepted request. */ } }
  });

  try {
    await updatePage.goto(origin, { waitUntil: 'domcontentloaded' });
    await expect(updatePage.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'online');
    await updatePage.locator('#catalogueInfo summary').click();
    await updatePage.locator('#catalogueUpdateButton').click();
    await waitForInstalled(updatePage, 1);
    expect(await replicaState(updatePage, fakeVersion)).toMatchObject({ activeVersion: oldFixtureVersion, entryCount: 1, failedStatus: null });

    servingUpdate = true;
    await updatePage.locator('#catalogueUpdateButton').click();
    let updateTimer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      newChunkRequested,
      new Promise<void>((_, reject) => { updateTimer = setTimeout(() => reject(new Error('The test update did not request its snapshot chunk.')), 30_000); }),
    ]).finally(() => clearTimeout(updateTimer));
    await updatePage.locator('#catalogueCancelButton').click();
    await expect(updatePage.locator('#catalogueStatusMeta')).toContainText('به‌روزرسانی لغو شد', { timeout: 30_000 });
    releaseNewChunk();
    const recovered = await replicaState(updatePage, fakeVersion);
    expect(recovered).toMatchObject({ activeVersion: oldFixtureVersion, entryCount: 1, failedStatus: 'failed' });

    if (!reportBase) throw new Error('The full-catalogue browser workflow did not produce a report.');
    const report = {
      ...reportBase,
      interruptedUpdate: {
        oldVersion: oldFixtureVersion,
        attemptedVersion: fakeVersion,
        cancelledDuringChunkFetch: true,
        previousVersionRemainedActive: recovered.activeVersion === oldFixtureVersion,
        stagedVersionStatus: recovered.failedStatus,
        entryCountAfterRollback: recovered.entryCount,
      },
      result: 'passed',
    };
    await mkdir('reports', { recursive: true });
    await writeFile(resolve('reports/e2e-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  } finally {
    releaseNewChunk();
    await updateContext.close();
  }
});
