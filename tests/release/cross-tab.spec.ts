import { createHash } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const oldVersion = `${'c'.repeat(64)}-s1-n1-r1`;
const newVersion = `${'d'.repeat(64)}-s1-n1-r1`;
test.use({ serviceWorkers: 'block' });
const tables = ['partNames', 'parts', 'entries', 'models', 'entryModels', 'friendlyLabels', 'aliases', 'replacements', 'vehicleOptions', 'optionModels', 'presetFamilies', 'presetFamilyOptions', 'searchDocuments', 'entrySearchDocuments'] as const;

function bundle(version: string, logistics: string, price: string) {
  const sourceSha256 = 'f'.repeat(64);
  const rows: Partial<Record<typeof tables[number], Array<Record<string, unknown>>>> = {
    partNames: [{ version, id: 1, nameRaw: 'Release synthetic fixture', nameNorm: 'release synthetic fixture', sortRank: 0 }],
    parts: [{ version, id: 1, nameId: 1, techRaw: 'RELEASE-CODE', techNorm: 'release-code', sortRank: 0, familyRoot: 'RELEASE-CODE', familyVariant: 'BASE' }],
    entries: [{ version, id: 1, partId: 1, logRaw: logistics, logNorm: logistics.toLowerCase(), basePrice: price, replacementRaw: '', sourceRowOrdinal: 1, sourceRowSha256: sourceSha256, suffix01Rank: 0 }],
    searchDocuments: [{ version, id: 1, kind: 'tech', rawValue: 'RELEASE-CODE', normalizedValue: 'release-code' }],
    entrySearchDocuments: [{ version, entryId: 1, docId: 1 }],
  };
  const bodies = new Map<string, Buffer>();
  const chunks = tables.flatMap(table => {
    const records = rows[table] ?? [];
    if (!records.length) return [];
    const body = Buffer.from(`${records.map(record => JSON.stringify(record)).join('\n')}\n`);
    const sha256 = createHash('sha256').update(body).digest('hex');
    const id = `${table}-00000-${sha256.slice(0, 16)}`;
    bodies.set(id, body);
    return [{ id, path: `/api/v1/catalog/${version}/snapshot/chunks/${id}`, table, ordinal: 0, recordCount: records.length, decodedBytes: body.length, sha256 }];
  });
  const counts = Object.fromEntries(tables.map(table => [table, rows[table]?.length ?? 0]));
  const base = { catalogVersion: version, schemaVersion: 1, normalizationVersion: 1, rulesVersion: 1, indexFormatVersion: 1, sourceSha256, currencyUnit: 'UNKNOWN', priceEffectiveAt: null, createdAt: '2026-10-28T00:00:00.000Z', rowCount: 1 };
  return {
    active: { ...base, publishedAt: base.createdAt, counts: { ...counts, rows: 1 }, snapshotManifestPath: `/api/v1/catalog/${version}/snapshot/manifest` },
    snapshot: { ...base, counts, totalDecodedBytes: chunks.reduce((sum, chunk) => sum + chunk.decodedBytes, 0), chunks },
    bodies,
  };
}

async function routes(context: BrowserContext, active: () => ReturnType<typeof bundle>, bundles: ReturnType<typeof bundle>[]): Promise<void> {
  await context.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/v1/catalog/manifest') {
      await route.fulfill({ json: active().active, headers: { etag: `"${active().active.catalogVersion}"` } });
      return;
    }
    const selected = bundles.find(item => url.pathname.includes(item.snapshot.catalogVersion));
    if (url.pathname.endsWith('/snapshot/manifest') && selected) { await route.fulfill({ json: selected.snapshot }); return; }
    if (url.pathname.includes('/snapshot/chunks/') && selected) {
      const body = selected.bodies.get(url.pathname.split('/').at(-1)!);
      if (!body) { await route.abort(); return; }
      await route.fulfill({ body, contentType: 'application/x-ndjson' }); return;
    }
    if (url.pathname === '/api/v1/vehicles' || url.pathname === '/api/v1/presets') { await route.fulfill({ json: [] }); return; }
    if (url.pathname === '/api/v1/price-history/summary') {
      await route.fulfill({ json: { catalogVersion: url.searchParams.get('version'), revision: 0, items: [] } }); return;
    }
    await route.continue();
  });
}

async function install(page: Page, version: string): Promise<void> {
  if (!await page.locator('#catalogueInfo').evaluate(element => (element as HTMLDetailsElement).open)) await page.locator('#catalogueInfo summary').click();
  await page.locator('#catalogueUpdateButton').click();
  await page.waitForFunction(() => {
    const state = document.getElementById('catalogueStatusText')?.dataset.state;
    return state === 'ready' || (state === 'online' && (document.getElementById('catalogueCancelButton') as HTMLButtonElement).hidden);
  });
  if (await page.locator('#catalogueStatusText').getAttribute('data-state') !== 'ready') throw new Error(await page.locator('#catalogueStatusMeta').innerText());
  await expect(page.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#catalogueVersion')).toContainText(version);
}

for (const notification of ['broadcast', 'focus', 'visibility'] as const) {
  test(`another tab activation refreshes the local version via ${notification} and clears stale catalogue rows`, async ({ context }, testInfo) => {
    if (notification !== 'broadcast') await context.addInitScript(() => { Object.defineProperty(window, 'BroadcastChannel', { value: undefined }); });
    const previous = bundle(oldVersion, 'TEST-OLD-LOG', '10');
    const next = bundle(newVersion, 'TEST-NEW-LOG', '20');
    let active = previous;
    await routes(context, () => active, [previous, next]);
    const first = await context.newPage();
    await first.goto('/app/');
    await expect(first.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'online');
    await install(first, oldVersion);
    await first.locator('#codeTab').click();
    await first.locator('#codeQuery').fill('RELEASE-CODE');
    await first.locator('#codeQuery').press('Enter');
    await expect(first.locator('#cards .resultCard')).toContainText('TEST-OLD-LOG');
    const second = await context.newPage();
    await second.goto('/app/');
    await expect(second.locator('#catalogueVersion')).toContainText(oldVersion);
    active = next;
    await install(second, newVersion);
    if (notification === 'focus') await first.evaluate(() => window.dispatchEvent(new Event('focus')));
    if (notification === 'visibility') {
      await first.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    }
    await expect(first.locator('#catalogueVersion')).toContainText(newVersion);
    await expect(first.locator('#cards .resultCard')).toHaveCount(0);
    await expect(first.locator('#codeQuery')).toHaveValue('RELEASE-CODE');
    await first.locator('#codeQuery').press('Enter');
    await expect(first.locator('#cards .resultCard')).toContainText('TEST-NEW-LOG');
    await expect(first.locator('#cards .resultCard')).not.toContainText('TEST-OLD-LOG');
    await mkdir('reports/release-2026-10-28/browser', { recursive: true });
    await writeFile(`reports/release-2026-10-28/browser/${testInfo.project.name}-cross-tab-${notification}.json`, `${JSON.stringify({
      status: 'passed', notification, oldVersion, newVersion, rowsPerFixture: 1,
      syntheticFixture: true, catalogueWritten: 'isolated browser IndexedDB only',
      staleRowsCleared: true, queryTextPreserved: true, freshSearchUsesNewVersion: true,
      notificationScope: notification === 'broadcast' ? 'real installer BroadcastChannel notification' : 'BroadcastChannel disabled in window; actual event handler exercised by synthetic lifecycle event',
    }, null, 2)}\n`);
  });
}
