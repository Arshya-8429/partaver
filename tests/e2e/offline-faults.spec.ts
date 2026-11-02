import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';

const appUrl = 'http://127.0.0.1:4173/app/';
const sourceSha = 'd'.repeat(64);
const oldVersion = `${'b'.repeat(64)}-s1-n1-r1`;
const corruptVersion = `${'c'.repeat(64)}-s1-n1-r1`;
const concurrentVersion = `${'e'.repeat(64)}-s1-n1-r1`;
const restartVersion = `${'f'.repeat(64)}-s1-n1-r1`;
const quotaVersion = `${'9'.repeat(64)}-s1-n1-r1`;

const snapshotTables = [
  'partNames', 'parts', 'entries', 'models', 'entryModels', 'friendlyLabels', 'aliases', 'replacements',
  'vehicleOptions', 'optionModels', 'presetFamilies', 'presetFamilyOptions', 'searchDocuments', 'entrySearchDocuments',
] as const;

type TableName = typeof snapshotTables[number];
type FixtureRows = Partial<Record<TableName, Array<Record<string, unknown>>>>;
type FixtureBundle = {
  active: Record<string, unknown>;
  snapshot: Record<string, unknown> & { catalogVersion: string; totalDecodedBytes: number; chunks: Array<{ id: string; table: string; sha256: string; recordCount: number; decodedBytes: number }> };
  bodies: Map<string, Buffer>;
};
type RouteControl = {
  getActive: () => FixtureBundle;
  bundles: FixtureBundle[];
  gateVersion?: string;
  gate?: Promise<void>;
  releaseGate?: () => void;
  onGatedChunk?: () => void;
  corruptVersion?: string;
  onGatedChunkSettled?: () => void;
};

const caseResults: Array<{ name: string; status: string; details?: Record<string, unknown> }> = [];
const caseDetails = new Map<string, Record<string, unknown>>();
let chromeVersion = 'unknown';

function fixtureRows(version: string, logisticsCode: string, basePrice: string): FixtureRows {
  return {
    partNames: [{ version, id: 1, nameRaw: 'Fixture part', nameNorm: 'fixture part', sortRank: 0 }],
    parts: [{ version, id: 1, nameId: 1, techRaw: `TECH-${logisticsCode}`, techNorm: `TECH-${logisticsCode}`, sortRank: 0, familyRoot: `TECH-${logisticsCode}`, familyVariant: 'BASE' }],
    entries: [{ version, id: 1, partId: 1, logRaw: logisticsCode, logNorm: logisticsCode, basePrice, replacementRaw: '', sourceRowOrdinal: 1, sourceRowSha256: sourceSha, suffix01Rank: 0 }],
  };
}

function makeBundle(version: string, logisticsCode: string, basePrice: string): FixtureBundle {
  const rows = fixtureRows(version, logisticsCode, basePrice);
  const counts = Object.fromEntries(snapshotTables.map((table) => [table, rows[table]?.length ?? 0]));
  const chunks: Array<{ id: string; path: string; table: string; ordinal: number; recordCount: number; decodedBytes: number; sha256: string }> = [];
  const bodies = new Map<string, Buffer>();
  for (const table of snapshotTables) {
    const tableRows = rows[table] ?? [];
    if (tableRows.length === 0) continue;
    const body = Buffer.from(`${tableRows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
    const sha256 = createHash('sha256').update(body).digest('hex');
    const id = `${table}-00000-${sha256.slice(0, 16)}`;
    chunks.push({ id, path: `/api/v1/catalog/${version}/snapshot/chunks/${id}`, table, ordinal: 0, recordCount: tableRows.length, decodedBytes: body.byteLength, sha256 });
    bodies.set(id, body);
  }
  const rowCount = counts.entries ?? 0;
  const createdAt = '2026-10-27T00:00:00.000Z';
  const snapshot = {
    catalogVersion: version, schemaVersion: 1, normalizationVersion: 1, rulesVersion: 1, indexFormatVersion: 1,
    sourceSha256: sourceSha, currencyUnit: 'UNKNOWN', priceEffectiveAt: null, createdAt,
    counts, rowCount, totalDecodedBytes: chunks.reduce((total, chunk) => total + chunk.decodedBytes, 0), chunks,
  };
  const active = {
    catalogVersion: version, schemaVersion: 1, normalizationVersion: 1, rulesVersion: 1, indexFormatVersion: 1,
    sourceSha256: sourceSha, currencyUnit: 'UNKNOWN', priceEffectiveAt: null, createdAt, publishedAt: createdAt,
    counts: { ...counts, rows: rowCount },
    snapshotManifestPath: `/api/v1/catalog/${version}/snapshot/manifest`, rowCount,
  };
  return { active, snapshot, bodies };
}

async function fulfillJson(route: Route, value: unknown, etag: string): Promise<void> {
  await route.fulfill({ status: 200, headers: { 'content-type': 'application/json; charset=utf-8', etag }, body: JSON.stringify(value) });
}

async function installFixtureRoutes(context: BrowserContext, control: RouteControl): Promise<void> {
  const byVersion = new Map(control.bundles.map((bundle) => [bundle.snapshot.catalogVersion, bundle]));
  await context.route('**/api/v1/catalog/manifest', async (route) => {
    const active = control.getActive();
    await fulfillJson(route, active.active, `"partavar-${active.snapshot.catalogVersion}"`);
  });
  await context.route('**/api/v1/catalog/*/snapshot/manifest', async (route) => {
    const version = versionInPath(route.request().url());
    const bundle = byVersion.get(version);
    if (!bundle) { await route.abort(); return; }
    await fulfillJson(route, bundle.snapshot, `"partavar-snapshot-${version}"`);
  });
  await context.route('**/api/v1/catalog/*/snapshot/chunks/*', async (route) => {
    const url = new URL(route.request().url());
    const version = versionInPath(url.pathname);
    const bundle = byVersion.get(version);
    const chunkId = url.pathname.split('/').at(-1) ?? '';
    const declaredChunk = bundle?.snapshot.chunks.find((chunk) => chunk.id === chunkId);
    const body = bundle?.bodies.get(chunkId);
    if (!bundle || !declaredChunk || !body) { await route.abort(); return; }

    let responseBody = body;
    if (control.corruptVersion === version && declaredChunk.table === 'entries') {
      responseBody = Buffer.from(body);
      const priceToken = Buffer.from('"basePrice":"');
      const priceOffset = responseBody.indexOf(priceToken);
      if (priceOffset < 0) throw new Error('Corruption fixture could not find the basePrice field.');
      const digitOffset = priceOffset + priceToken.byteLength;
      const digit = responseBody[digitOffset];
      if (digit === undefined) throw new Error('Corruption fixture could not locate a price digit.');
      responseBody[digitOffset] = digit === 0x39 ? 0x38 : digit + 1;
      if (responseBody.byteLength !== body.byteLength) throw new Error('Corruption fixture unexpectedly changed the chunk length.');
    }

    const shouldGate = control.gateVersion === version && control.gate !== undefined;
    if (shouldGate) control.onGatedChunk?.();
    try {
      if (shouldGate) await control.gate;
      await route.fulfill({ status: 200, headers: { 'content-type': 'application/x-ndjson' }, body: responseBody });
    } catch {
      try { await route.abort(); } catch { /* Closing a page or browser cancels its intercepted request. */ }
    } finally {
      if (shouldGate) control.onGatedChunkSettled?.();
    }
  });
}

function versionInPath(path: string): string {
  const match = /\/api\/v1\/catalog\/([a-f0-9]{64}-s\d+-n\d+-r\d+)\//.exec(path);
  return match?.[1] ?? '';
}

async function openApp(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#catalogueStatusText')).toHaveAttribute('data-state', /^(online|ready)$/);
  return page;
}

async function openCatalogueControls(page: Page): Promise<void> {
  if (!(await page.locator('#catalogueInfo').evaluate((element) => (element as HTMLDetailsElement).open))) {
    await page.locator('#catalogueInfo summary').click();
  }
}

async function waitForReady(page: Page, count = 1): Promise<void> {
  await expect(page.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(page.locator('#dbCount')).toHaveText(count.toLocaleString('fa-IR'));
}

async function installOldFixture(page: Page): Promise<void> {
  await openCatalogueControls(page);
  await page.locator('#catalogueUpdateButton').click();
  await waitForReady(page);
}

async function replicaState(page: Page, targetVersion: string): Promise<{
  activeVersion: string | null;
  activeEntry?: Record<string, unknown>;
  targetStatus: string | null;
  targetFailure: string | null;
  targetEntryCount: number;
  oldEntryCount: number;
  leaseExpiresAt: number | null;
}> {
  return page.evaluate(({ target, old }) => new Promise((resolve, reject) => {
    const request = indexedDB.open('PartsFinderCatalogue');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['meta', 'entries', 'catalogVersions', 'installerLease'], 'readonly');
      const active = transaction.objectStore('meta').get('activeCatalogVersion');
      const versions = transaction.objectStore('catalogVersions');
      const targetRecord = versions.get(target);
      const allEntries = transaction.objectStore('entries');
      const lease = transaction.objectStore('installerLease').get('catalogue-installer');
      const targetCount = allEntries.index('version').count(target);
      const oldCount = allEntries.index('version').count(old);
      let activeEntryRequest: IDBRequest | null = null;
      active.onsuccess = () => {
        if (active.result?.value !== undefined && active.result?.value !== null) {
          activeEntryRequest = allEntries.get([active.result.value, 1]);
        }
      };
      transaction.oncomplete = () => {
        const activeVersion = active.result?.value?.toString() ?? null;
        resolve({
          activeVersion,
          activeEntry: activeEntryRequest?.result,
          targetStatus: targetRecord.result?.status ?? null,
          targetFailure: targetRecord.result?.failure ?? null,
          targetEntryCount: targetCount.result,
          oldEntryCount: oldCount.result,
          leaseExpiresAt: lease.result?.expiresAt ?? null,
        });
        db.close();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  }), { target: targetVersion, old: oldVersion });
}

async function clickUpdateAndWaitForChunk(page: Page, chunkRequested: Promise<void>): Promise<void> {
  await page.locator('#catalogueUpdateButton').click();
  await expect(page.locator('#catalogueCancelButton')).toBeVisible();
  await chunkRequested;
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

test.beforeAll(async ({ browser }) => { chromeVersion = browser.version(); });

test.afterEach(async ({}, testInfo) => {
  const details = caseDetails.get(testInfo.title);
  caseResults.push({ name: testInfo.title, status: testInfo.status ?? 'unknown', ...(details ? { details } : {}) });
});

test.afterAll(async () => {
  await mkdir('reports/partavar', { recursive: true });
  const report = {
    createdAt: new Date().toISOString(),
    browser: { engine: 'Chromium', version: chromeVersion },
    appUrl,
    fixtureScope: 'small synthetic rows only; production SQLite catalogue and imported data are not modified',
    cases: caseResults,
    summary: {
      passed: caseResults.filter((result) => result.status === 'passed').length,
      failed: caseResults.filter((result) => result.status !== 'passed').length,
      productionCatalogueChanged: false,
      quotaFailureInjection: 'the dedicated catalogue Worker receives a deterministic navigator.storage.estimate quota stub; browser storage is unchanged',
      persistentRelaunch: 'same temporary Chromium user-data directory closed and reopened',
    },
  };
  await writeFile(resolve('reports/partavar/offline-faults.json'), `${JSON.stringify(report, null, 2)}\n`);
});

test('a corrupt snapshot chunk fails hash verification and leaves the old catalogue active', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const oldBundle = makeBundle(oldVersion, 'LOG-OLD-1', '10');
  const badBundle = makeBundle(corruptVersion, 'LOG-CORRUPT-1', '20');
  let active = oldBundle;
  await installFixtureRoutes(context, { getActive: () => active, bundles: [oldBundle, badBundle], corruptVersion });
  try {
    const page = await openApp(context);
    await installOldFixture(page);
    active = badBundle;
    await page.locator('#catalogueUpdateButton').click();

    await expect.poll(() => replicaState(page, corruptVersion), { timeout: 30_000 }).toMatchObject({
      activeVersion: oldVersion,
      targetStatus: 'failed',
      targetEntryCount: 0,
      oldEntryCount: 1,
    });
    await expect(page.locator('#catalogueStatusMeta')).toContainText('نسخهٔ قبلی همچنان قابل جست‌وجو است');
    const state = await replicaState(page, corruptVersion);
    expect(state.targetFailure).toContain('hash mismatch');
    expect(state.activeEntry).toMatchObject({ logRaw: 'LOG-OLD-1', basePrice: '10' });
    caseDetails.set(testInfo.title, {
      outcome: 'passed',
      rejectedChunk: 'same byte length; body modified after descriptor SHA-256 was calculated',
      activeVersionAfterFailure: state.activeVersion,
      catalogueEntryPreserved: state.activeEntry,
      failedCandidate: state.targetFailure,
    });
  } finally {
    await context.close();
  }
});

test('two tabs share one update lease while the existing version stays searchable', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const oldBundle = makeBundle(oldVersion, 'LOG-OLD-2', '11');
  const nextBundle = makeBundle(concurrentVersion, 'LOG-NEXT-2', '21');
  let active = oldBundle;
  let notifyChunk!: () => void;
  let releaseChunk!: () => void;
  const chunkRequested = new Promise<void>((resolveChunk) => { notifyChunk = resolveChunk; });
  const chunkGate = new Promise<void>((resolveChunk) => { releaseChunk = resolveChunk; });
  await installFixtureRoutes(context, {
    getActive: () => active,
    bundles: [oldBundle, nextBundle],
    gateVersion: concurrentVersion,
    gate: chunkGate,
    onGatedChunk: notifyChunk,
  });
  try {
    const first = await openApp(context);
    await installOldFixture(first);
    const second = await openApp(context);
    active = nextBundle;
    await clickUpdateAndWaitForChunk(first, chunkRequested);

    await openCatalogueControls(second);
    await second.locator('#catalogueUpdateButton').click();
    await expect.poll(() => second.locator('#catalogueStatusMeta').textContent(), { timeout: 15_000 }).toContain('پنجرهٔ دیگری');
    const duringContention = await replicaState(first, concurrentVersion);
    expect(duringContention).toMatchObject({ activeVersion: oldVersion, oldEntryCount: 1, targetEntryCount: 0 });
    expect(duringContention.activeEntry).toMatchObject({ logRaw: 'LOG-OLD-2', basePrice: '11' });

    releaseChunk();
    await waitForReady(first);
    const afterUpdate = await replicaState(first, concurrentVersion);
    expect(afterUpdate).toMatchObject({ activeVersion: concurrentVersion, oldEntryCount: 1, targetEntryCount: 1 });
    expect(afterUpdate.activeEntry).toMatchObject({ logRaw: 'LOG-NEXT-2', basePrice: '21' });
    caseDetails.set(testInfo.title, {
      outcome: 'passed',
      competingTabMessage: 'second tab was refused while the first held the IndexedDB installer lease',
      activeDuringFirstDownload: duringContention.activeVersion,
      activeAfterFirstDownload: afterUpdate.activeVersion,
      oldVersionRetained: afterUpdate.oldEntryCount === 1,
    });
  } finally {
    releaseChunk();
    await context.close();
  }
});

test('browser close during staging relaunches from the same profile and recovers the update', async ({ browser }, testInfo) => {
  const profile = await mkdtemp(resolve(tmpdir(), 'partavar-offline-restart-'));
  const oldBundle = makeBundle(oldVersion, 'LOG-OLD-3', '12');
  const nextBundle = makeBundle(restartVersion, 'LOG-NEXT-3', '22');
  let active = oldBundle;
  let notifyChunk!: () => void;
  let releaseChunk!: () => void;
  let notifySettled!: () => void;
  const chunkRequested = new Promise<void>((resolveChunk) => { notifyChunk = resolveChunk; });
  const chunkGate = new Promise<void>((resolveChunk) => { releaseChunk = resolveChunk; });
  const chunkSettled = new Promise<void>((resolveChunk) => { notifySettled = resolveChunk; });
  let context: BrowserContext | null = null;
  try {
    const browserType = browser.browserType();
    const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    context = await browserType.launchPersistentContext(profile, {
      ...(existsSync(executablePath) ? { executablePath } : {}),
      headless: true,
      serviceWorkers: 'block',
    });
    await installFixtureRoutes(context, {
      getActive: () => active,
      bundles: [oldBundle, nextBundle],
      gateVersion: restartVersion,
      gate: chunkGate,
      onGatedChunk: notifyChunk,
      onGatedChunkSettled: notifySettled,
    });
    const firstRunPage = context.pages()[0] ?? await context.newPage();
    firstRunPage.setDefaultTimeout(15_000);
    await firstRunPage.goto(appUrl, { waitUntil: 'domcontentloaded' });
    await expect(firstRunPage.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'online');
    await installOldFixture(firstRunPage);
    active = nextBundle;

    await clickUpdateAndWaitForChunk(firstRunPage, chunkRequested);
    await expect.poll(() => replicaState(firstRunPage, restartVersion), { timeout: 15_000 }).toMatchObject({
      activeVersion: oldVersion,
      targetStatus: 'downloading',
      oldEntryCount: 1,
    });

    // Closing the page terminates its worker before the snapshot chunk is returned.
    await firstRunPage.close({ runBeforeUnload: false });
    releaseChunk();
    await chunkSettled;
    await context.close();
    context = null;

    // Relaunch Chrome with the exact same user-data directory, retaining IndexedDB.
    context = await browserType.launchPersistentContext(profile, {
      ...(existsSync(executablePath) ? { executablePath } : {}),
      headless: true,
      serviceWorkers: 'block',
    });
    await installFixtureRoutes(context, { getActive: () => active, bundles: [oldBundle, nextBundle] });
    const relaunchPage = context.pages()[0] ?? await context.newPage();
    relaunchPage.setDefaultTimeout(15_000);
    await relaunchPage.goto(appUrl, { waitUntil: 'domcontentloaded' });
    await waitForReady(relaunchPage);
    const recoveredStage = await replicaState(relaunchPage, restartVersion);
    expect(recoveredStage).toMatchObject({ activeVersion: oldVersion, targetStatus: 'downloading', oldEntryCount: 1, targetEntryCount: 0 });

    // A hard browser close cannot run the page's lease cleanup. Wait for the
    // bounded 30-second lease to expire, then the operator can safely retry.
    await expect.poll(async () => {
      const expiry = (await replicaState(relaunchPage, restartVersion)).leaseExpiresAt;
      return expiry === null || expiry <= Date.now();
    }, { timeout: 45_000 }).toBe(true);
    await openCatalogueControls(relaunchPage);
    await relaunchPage.locator('#catalogueUpdateButton').click();
    await expect.poll(async () => (await replicaState(relaunchPage, restartVersion)).activeVersion, { timeout: 30_000 })
      .toBe(restartVersion);
    const recovered = await replicaState(relaunchPage, restartVersion);
    expect(recovered).toMatchObject({ activeVersion: restartVersion, targetStatus: 'ready', oldEntryCount: 1, targetEntryCount: 1 });
    expect(recovered.activeEntry).toMatchObject({ logRaw: 'LOG-NEXT-3', basePrice: '22' });
    caseDetails.set(testInfo.title, {
      outcome: 'passed',
      interruption: 'Chrome page and persistent browser context closed while the candidate snapshot request was held',
      relaunchedWithSameUserDataDirectory: true,
      stagedRecordSurvivedRelaunch: recoveredStage.targetStatus === 'downloading',
      oldVersionAfterRelaunch: recoveredStage.activeVersion,
      activeVersionAfterRecovery: recovered.activeVersion,
      bothVersionRowsRetained: recovered.oldEntryCount === 1 && recovered.targetEntryCount === 1,
    });
  } finally {
    releaseChunk();
    if (context) await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('low browser quota blocks an update before staging and keeps the old offline version', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const oldBundle = makeBundle(oldVersion, 'LOG-OLD-4', '13');
  const candidate = makeBundle(quotaVersion, 'LOG-NEXT-4', '23');
  let active = oldBundle;
  await installFixtureRoutes(context, { getActive: () => active, bundles: [oldBundle, candidate] });
  try {
    const page = await openApp(context);
    await installOldFixture(page);
    await context.route('**/assets/catalogue.worker-*.js', async (route) => {
      const response = await route.fetch();
      const workerSource = await response.text();
      await route.fulfill({ response, body: `Object.defineProperty(navigator.storage,'estimate',{configurable:true,value:async()=>({usage:0,quota:1})});\n${workerSource}` });
    });
    await page.reload();
    await waitForReady(page);
    active = candidate;

    await openCatalogueControls(page);
    await page.locator('#catalogueUpdateButton').click();
    await expect(page.locator('#catalogueStatusMeta')).toContainText('فضای کافی', { timeout: 15_000 });
    const after = await replicaState(page, quotaVersion);
    expect(after).toMatchObject({ activeVersion: oldVersion, targetStatus: null, targetEntryCount: 0, oldEntryCount: 1 });
    expect(after.activeEntry).toMatchObject({ logRaw: 'LOG-OLD-4', basePrice: '13' });
    caseDetails.set(testInfo.title, {
      outcome: 'passed',
      injectedQuotaBytes: 1,
      observedUsageBytes: 0,
      candidateRequiredEstimateBytes: candidate.snapshot.totalDecodedBytes * 18,
      candidateNotStaged: after.targetStatus === null,
      activeVersionAfterQuotaRejection: after.activeVersion,
    });
  } finally {
    await context.close();
  }
});
