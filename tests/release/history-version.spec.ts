import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import type { OperationalDocument } from '../../packages/domain/src/documents.js';
import type { PriceHistorySummaryDto } from '../../packages/contracts/src/price-history.js';

const retainedVersion = `${'b'.repeat(64)}-s1-n1-r1`;
test.use({ serviceWorkers: 'block' });

test('retained document history cannot recolor a current catalogue entry with the same numeric ID', async ({ page }, testInfo) => {
  await page.route('**/api/v1/price-history/summary?*', async route => {
    const url = new URL(route.request().url());
    const version = url.searchParams.get('version')!;
    const retained = version === retainedVersion;
    const dto: PriceHistorySummaryDto = {
      catalogVersion: version, revision: 1,
      settings: { strategy: 'threshold', mediumBps: 1000, highBps: 3000, mediumPercentileBps: 3333, highPercentileBps: 6667, minimumObservations: 2 },
      items: (url.searchParams.get('ids') ?? '').split(',').map(Number).map(entryId => ({
        entryId, earliestPrice: retained ? '100' : null, latestPrice: retained ? '200' : null,
        absoluteChange: retained ? '100' : null, cumulativeChangeBps: retained ? '10000' : null,
        previousChangeBps: retained ? '10000' : null, observationCount: retained ? 2 : 0,
        evidenceCount: retained ? 2 : 0, undatedCount: 0, conflictDateCount: 0, ambiguousCount: 0,
        minPrice: retained ? '100' : null, maxPrice: retained ? '200' : null,
        firstDate: retained ? '2025-01-01' : null, lastDate: retained ? '2025-02-01' : null,
        currencyUnit: 'IRR', percentileBps: null,
        neutralReason: retained ? null : 'insufficient_history', classification: retained ? 'high' : 'neutral',
      })),
    };
    await route.fulfill({ json: dto });
  });
  await page.goto('/app/');
  await expect(page.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'online');
  const response = await page.request.get('/api/v1/catalog/manifest');
  const currentVersion = (await response.json() as { catalogVersion: string }).catalogVersion;
  await page.locator('#codeTab').click();
  await page.locator('#codeQuery').fill('111100001AA');
  await page.locator('#codeQuery').press('Enter');
  const card = page.locator('#cards .resultCard').first();
  const currentBadge = card.locator('.historyBadge');
  await expect(currentBadge).toHaveAttribute('aria-label', /سابقه ناکافی/);
  const entryId = Number(await card.getAttribute('data-entry-id'));
  await card.locator('.packageAction').click();
  await expect(page.locator('#toast')).toContainText('افزوده شد');

  // A saved document keeps its historical version and can outlive a catalogue update.
  // Only this isolated test browser's mutable draft is changed; no catalogue or company history is written.
  await page.evaluate(oldVersion => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('PartAvarOperations');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('documents', 'readwrite');
      const store = transaction.objectStore('documents');
      const draft = store.get('draft-package');
      draft.onsuccess = () => {
        const document = draft.result as OperationalDocument;
        if (!document?.lines[0]) { transaction.abort(); return; }
        document.lines[0].catalogueVersion = oldVersion;
        document.lines[0].partName = 'TEST retained-version snapshot; not company history';
        document.lines[0].logisticsCode = 'TEST-OLD-LOGISTICS';
        document.sourceVersions = [oldVersion];
        store.put(document);
      };
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => { database.close(); reject(transaction.error); };
      transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('No package draft found')); };
    };
  }), retainedVersion);
  await page.locator('[data-area="packages"]').click();
  const retainedBadge = page.locator('#documentRoot .docLine .historyBadge').first();
  await expect(retainedBadge).toHaveClass(/\bhigh\b/);
  await expect(retainedBadge).toHaveAttribute('data-history-version', retainedVersion);
  await page.locator('[data-area="search"]').click();
  await expect(card).toBeVisible();
  await expect(currentBadge).toHaveClass(/\bneutral\b/);
  await expect(currentBadge).toHaveAttribute('data-history-version', currentVersion);

  // Lazy family cards use the same renderer and must carry the page's exact catalogue version.
  await card.locator('.familySearchButton').click();
  await expect(page.locator('.variantToggle').first()).toBeVisible();
  await page.locator('.variantToggle').first().click();
  const familyBadge = page.locator('.variantEntries .historyBadge').first();
  await expect(familyBadge).toBeVisible();
  await expect(familyBadge).toHaveAttribute('data-history-version', currentVersion);
  await mkdir('reports/release-2026-10-28/browser', { recursive: true });
  await writeFile(`reports/release-2026-10-28/browser/${testInfo.project.name}-history-version.json`, `${JSON.stringify({
    status: 'passed', syntheticFixture: true, companyHistoryWritten: false,
    currentVersion, retainedVersion, reusedEntryId: entryId,
    retainedDocumentClassification: 'high', currentCatalogueClassification: 'neutral', familyCardVersionPinned: true,
  }, null, 2)}\n`);
});
