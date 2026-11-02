import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

/** A suspended but still-live installer must never downgrade a successor's activated version. */
test('expired living installer cannot downgrade the version activated by another tab', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const a = await context.newPage(), b = await context.newPage();
  const version = `${'7'.repeat(64)}-s1-n1-r1`, sourceSha256 = '7'.repeat(64);
  const tables = ['partNames', 'parts', 'entries', 'models', 'entryModels', 'friendlyLabels', 'aliases', 'replacements', 'vehicleOptions', 'optionModels', 'presetFamilies', 'presetFamilyOptions', 'searchDocuments', 'entrySearchDocuments'];
  const rows: Record<string, Array<Record<string, unknown>>> = {
    partNames: [{ version, id: 1, nameRaw: 'Lease fixture only', nameNorm: 'lease fixture only', sortRank: 0 }],
    parts: [{ version, id: 1, nameId: 1, techRaw: 'LEASE-TECH', techNorm: 'LEASE-TECH', sortRank: 0, familyRoot: 'LEASE', familyVariant: 'TECH' }],
    entries: [{ version, id: 1, partId: 1, logRaw: 'LEASE-LOG-01', logNorm: 'LEASE-LOG-01', basePrice: '1001', replacementRaw: '', sourceRowOrdinal: 0, sourceRowSha256: sourceSha256, suffix01Rank: 1 }],
  };
  const bodies = new Map<string, Buffer>();
  const counts = Object.fromEntries(tables.map(table => [table, rows[table]?.length ?? 0]));
  const chunks = Object.entries(rows).map(([table, records]) => {
    const body = Buffer.from(records.map(record => JSON.stringify(record)).join('\n') + '\n');
    const sha256 = createHash('sha256').update(body).digest('hex'), id = `${table}-00000-${sha256.slice(0, 16)}`;
    bodies.set(id, body);
    return { id, path: `/api/v1/catalog/${version}/snapshot/chunks/${id}`, table, ordinal: 0, recordCount: records.length, decodedBytes: body.byteLength, sha256 };
  });
  const common = { catalogVersion: version, schemaVersion: 1, normalizationVersion: 1, rulesVersion: 1, indexFormatVersion: 1, sourceSha256, currencyUnit: 'UNKNOWN', priceEffectiveAt: null, createdAt: '2026-10-28T00:00:00.000Z', counts, rowCount: 1 };
  const snapshot = { ...common, totalDecodedBytes: chunks.reduce((n, chunk) => n + chunk.decodedBytes, 0), chunks };
  const active = { ...common, snapshotManifestPath: `/api/v1/catalog/${version}/snapshot/manifest` };
  let release!: () => void, requested!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const suspended = new Promise<void>(resolve => { requested = resolve; });
  let gated = false;
  await context.route('**/api/v1/catalog/manifest', route => route.fulfill({ json: active }));
  await context.route('**/api/v1/catalog/*/snapshot/manifest', route => route.fulfill({ json: snapshot }));
  await context.route('**/api/v1/catalog/*/snapshot/chunks/*', route => route.fulfill({ contentType: 'application/x-ndjson', body: bodies.get(new URL(route.request().url()).pathname.split('/').at(-1)!)! }));
  await a.route('**/api/v1/catalog/*/snapshot/chunks/*', async route => {
    if (!gated) { gated = true; requested(); await gate; }
    await route.fulfill({ contentType: 'application/x-ndjson', body: bodies.get(new URL(route.request().url()).pathname.split('/').at(-1)!)! });
  });
  try {
    await Promise.all([a.goto('/app/'), b.goto('/app/')]);
    await expect(a.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'online');
    await expect(b.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'online');
    await a.locator('#catalogueInfo').evaluate((element: HTMLDetailsElement) => { element.open = true; });
    await a.locator('#catalogueUpdateButton').click(); await suspended;
    // Advance only the lease state, deterministically modeling a sleeping/stalled tab past its 30s lease.
    await b.evaluate(() => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('PartsFinderCatalogue'); request.onerror = () => reject(request.error);
      request.onsuccess = () => { const db = request.result, tx = db.transaction('installerLease', 'readwrite'), store = tx.objectStore('installerLease'), lease = store.get('catalogue-installer');
        lease.onsuccess = () => { store.put({ ...lease.result, expiresAt: Date.now() - 1 }); };
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
    }));
    await b.locator('#catalogueInfo').evaluate((element: HTMLDetailsElement) => { element.open = true; });
    await b.locator('#catalogueUpdateButton').click();
    await expect(b.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'ready');
    release();
    await expect(a.locator('#catalogueCancelButton')).toBeHidden();
    const state = await b.evaluate(version => new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = indexedDB.open('PartsFinderCatalogue'); request.onerror = () => reject(request.error);
      request.onsuccess = () => { const db = request.result, tx = db.transaction(['meta', 'catalogVersions'], 'readonly'), active = tx.objectStore('meta').get('activeCatalogVersion'), record = tx.objectStore('catalogVersions').get(version);
        tx.oncomplete = () => { const result = { activeVersion: active.result?.value, status: record.result?.status, failure: record.result?.failure ?? null }; db.close(); resolve(result); }; tx.onerror = () => reject(tx.error);
      };
    }), version);
    await mkdir('reports/release-2026-10-28', { recursive: true });
    await writeFile('reports/release-2026-10-28/lease-race-state.json', JSON.stringify({ fixture: 'synthetic disposable browser IndexedDB; production SQLite untouched', ...state }, null, 2));
    expect(state).toEqual({ activeVersion: version, status: 'ready', failure: null });
    await b.reload();
    await expect(b.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'ready');
  } finally { release(); await context.close(); }
});
