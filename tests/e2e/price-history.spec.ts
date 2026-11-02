import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';
import Database from 'better-sqlite3';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from '../../apps/api/src/server.js';
import { commitPriceHistory, previewPriceHistory, stagePriceHistory } from '../../packages/importer/src/price-history/index.js';

const productionApi = 'http://127.0.0.1:8787';
const cataloguePath = resolve('private-data/sqlite/catalogue.db');
const operationsFileName = 'PartAvar-TEST-FIXTURE-NOT-COMPANY-history.xlsx';
const mapping = {
  sheet: 'PriceHistory',
  headerRow: 1,
  columns: { technicalCode: 'A', logisticsCode: 'B', price: 'C', effectiveDate: 'D' },
  currencyUnit: 'IRR' as const,
};

interface CatalogueEntry {
  type: 'entry';
  entryId: number;
  techRaw: string;
  logRaw: string;
  partNameRaw: string;
  basePrice: string;
}
interface SearchResponse { items: Array<Record<string, unknown>> }
interface ManifestResponse { catalogVersion: string }
interface HistorySummary {
  catalogVersion: string;
  revision: number;
  items: Array<{
    entryId: number;
    evidenceCount: number;
    observationCount: number;
    cumulativeChangeBps: string | null;
    classification: 'high' | 'medium' | 'low' | 'neutral';
    neutralReason: string | null;
  }>;
}

let temporaryRoot = '';
let operationsPath = '';
let catalogueVersion = '';
let historyOrigin = '';
let historyServer: Awaited<ReturnType<typeof createServer>> | undefined;
let selectedEntries: { high: CatalogueEntry; low: CatalogueEntry; medium: CatalogueEntry; neutral: CatalogueEntry };
let importedBatchId = '';
let importedSourceSha = '';
let correctionSourceSha = '';
let catalogueBasePricesBefore: Record<string, string> = {};
let observedHistoryRouteStatuses: Array<{ path: string; status: number }> = [];
let reportStatus = 'not-run';
let screenshotPath = '';

async function apiJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`API request ${url} returned ${response.status}.`);
  return await response.json() as T;
}

async function searchProductionCode(code: string): Promise<CatalogueEntry[]> {
  const query = new URLSearchParams({ version: catalogueVersion, mode: 'global', kind: 'code', q: code, groupBy: 'entry', limit: '20' });
  const data = await apiJson<SearchResponse>(`${productionApi}/api/v1/search?${query}`);
  return data.items.filter(item => item.type === 'entry')
    .map(item => ({ type: 'entry', entryId: Number(item.entryId), techRaw: String(item.techRaw), logRaw: String(item.logRaw), partNameRaw: String(item.partNameRaw), basePrice: String(item.basePrice) }));
}

function dateAt(dayOffset: number, start = '2025-01-01'): string {
  const [year, month, day] = start.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + dayOffset)).toISOString().slice(0, 10);
}

async function writeWorkbook(path: string, rows: Array<[string, string, string, string]>): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PartAvar E2E test fixture';
  workbook.subject = 'Synthetic test data; not company price history';
  const sheet = workbook.addWorksheet('PriceHistory');
  sheet.addRow(['Technical code', 'Logistics code', 'Price IRR', 'Effective date ISO']);
  for (const row of rows) sheet.addRow(row);
  await workbook.xlsx.writeFile(path);
}

function seedRows(): Array<[string, string, string, string]> {
  const entries = selectedEntries;
  const rows: Array<[string, string, string, string]> = [];
  // This 52-point history forces the real API's bounded 50-row timeline to paginate.
  for (let index = 0; index < 52; index++) {
    rows.push([entries.high.techRaw, entries.high.logRaw, String(100000 + index * 1000), dateAt(index)]);
  }
  rows.push([entries.low.techRaw, entries.low.logRaw, '100000', '2025-01-01']);
  rows.push([entries.low.techRaw, entries.low.logRaw, '90000', '2025-01-05']);
  rows.push([entries.medium.techRaw, entries.medium.logRaw, '100000', '2025-03-01']);
  rows.push([entries.medium.techRaw, entries.medium.logRaw, '120000', '2025-03-02']);
  // One dated observation has a known IRR unit but remains neutral for insufficient history.
  rows.push([entries.neutral.techRaw, entries.neutral.logRaw, '80000', '2025-05-01']);
  return rows;
}

async function readCatalogueBasePrices(): Promise<Record<string, string>> {
  const db = new Database(cataloguePath, { readonly: true, fileMustExist: true });
  try {
    const query = db.prepare('SELECT CAST(base_price AS TEXT) AS basePrice FROM catalog_entries WHERE version_id=? AND id=?');
    return Object.fromEntries(Object.values(selectedEntries).map(entry => {
      const result = query.get(catalogueVersion, entry.entryId) as { basePrice: string } | undefined;
      if (!result) throw new Error(`Catalogue entry ${entry.entryId} disappeared.`);
      return [String(entry.entryId), result.basePrice];
    }));
  } finally { db.close(); }
}

test.setTimeout(120_000);

test.beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'partavar-history-ui-e2e-'));
  operationsPath = join(temporaryRoot, 'operations.db');

  const manifest = await apiJson<ManifestResponse>(`${productionApi}/api/v1/catalog/manifest`);
  catalogueVersion = manifest.catalogVersion;
  const siblings = await searchProductionCode('111100001AA');
  const high = siblings.find(entry => entry.techRaw === '111100001AA' && entry.logRaw.endsWith('-01'));
  const low = siblings.find(entry => entry.techRaw === '111100001AA' && entry.logRaw.endsWith('-02'));
  const medium = (await searchProductionCode('111100012AA')).find(entry => entry.techRaw === '111100012AA');
  const neutral = (await searchProductionCode('111100013AA')).find(entry => entry.techRaw === '111100013AA');
  if (!high || !low || !medium || !neutral) throw new Error('The production API did not return all four fixture catalogue entries.');
  selectedEntries = { high, low, medium, neutral };
  catalogueBasePricesBefore = await readCatalogueBasePrices();

  // This API instance reads the same production catalogue read-only and writes history only
  // to the unique temporary operations database. The browser still uses port 8787 for all
  // normal catalogue requests; only price-history reads are routed to this instance.
  historyServer = await createServer({ databasePath: cataloguePath, operationsPath, logger: false });
  const address = await historyServer.listen({ host: '127.0.0.1', port: 0 });
  historyOrigin = address;

  const sourcePath = join(temporaryRoot, operationsFileName);
  const rows = seedRows();
  await writeWorkbook(sourcePath, rows);
  const staged = await stagePriceHistory({ sourcePath, cataloguePath, operationsPath, catalogueVersion, mapping });
  importedBatchId = staged.batchId;
  importedSourceSha = staged.sourceSha256;
  expect(staged).toMatchObject({ status: 'staged', sourceFileName: operationsFileName, catalogueVersion, rowCount: rows.length, counts: { matched_exact: rows.length } });
  const preview = previewPriceHistory(operationsPath, staged.batchId, 100, 0);
  expect(preview.rows).toHaveLength(rows.length);
  expect(preview.rows.every(row => row.matchStatus === 'matched_exact' && row.currencyUnit === 'IRR')).toBe(true);
  await commitPriceHistory({ cataloguePath, operationsPath, batchId: staged.batchId, actor: 'PartAvar browser E2E', reason: 'Activate generated fixture for UI verification only' });

  const ids = Object.values(selectedEntries).map(entry => entry.entryId);
  const summaryQuery = new URLSearchParams({ version: catalogueVersion, ids: ids.join(',') });
  const summary = await apiJson<HistorySummary>(`${historyOrigin}/api/v1/price-history/summary?${summaryQuery}`);
  const byId = new Map(summary.items.map(item => [item.entryId, item]));
  expect(byId.get(high.entryId)).toMatchObject({ evidenceCount: 52, observationCount: 52, cumulativeChangeBps: '5100', classification: 'high', neutralReason: null });
  expect(byId.get(low.entryId)).toMatchObject({ evidenceCount: 2, observationCount: 2, cumulativeChangeBps: '-1000', classification: 'low', neutralReason: null });
  expect(byId.get(medium.entryId)).toMatchObject({ evidenceCount: 2, observationCount: 2, cumulativeChangeBps: '2000', classification: 'medium', neutralReason: null });
  expect(byId.get(neutral.entryId)).toMatchObject({ evidenceCount: 1, observationCount: 1, classification: 'neutral', neutralReason: 'insufficient_history' });
  expect(high.logRaw).not.toBe(low.logRaw);
  expect(high.basePrice).not.toBe(low.basePrice);
});

test.afterEach(async ({}, testInfo) => {
  reportStatus = testInfo.status ?? 'unknown';
  const report = {
    generatedAt: new Date().toISOString(),
    status: reportStatus,
    testOnly: true,
    warning: 'Historical prices, dates and XLSX source files are generated test fixtures, not company data. The production catalogue was opened read-only; all history writes used a temporary operations database that was removed after this test.',
    catalogueVersion,
    cataloguePath,
    temporaryOperationsDatabase: operationsPath,
    sourceFileName: operationsFileName,
    sourceSha256: importedSourceSha,
    correctionSourceSha256: correctionSourceSha || null,
    importedBatchId,
    fixtureEntries: selectedEntries ? Object.values(selectedEntries).map(entry => ({ entryId: entry.entryId, technicalCodeRaw: entry.techRaw, logisticsCodeRaw: entry.logRaw, catalogueBasePrice: entry.basePrice })) : [],
    catalogueBasePricesBefore: catalogueBasePricesBefore,
    observedHistoryRouteStatuses,
    screenshot: screenshotPath || null,
    testResult: testInfo.status,
    durationMs: testInfo.duration,
  };
  await mkdir('reports/partavar', { recursive: true });
  await writeFile('reports/partavar/history-ui-e2e.json', JSON.stringify(report, null, 2));
  const markdown = [
    '# گزارش آزمون رابط تاریخچهٔ قیمت',
    '',
    `- وضعیت: ${reportStatus}`,
    `- نسخهٔ کاتالوگ: ${catalogueVersion || 'نامشخص'}`,
    `- منبع مصنوعی آزمون: ${operationsFileName}`,
    `- SHA-256 منبع: ${importedSourceSha || 'نامشخص'}`,
    `- شناسهٔ بستهٔ واردشده: ${importedBatchId || 'نامشخص'}`,
    `- نتیجهٔ Playwright: ${testInfo.status}; مدت ${testInfo.duration} میلی‌ثانیه`,
    '',
    'این فایل XLSX و قیمت‌های آن صرفاً دادهٔ مصنوعی آزمون‌اند. پایگاه کاتالوگ فقط‌خواندنی باز شد؛ تاریخچه فقط در پایگاه موقت عملیات نوشته و پس از آزمون حذف شد.',
    '',
    `تصویر آزمون: ${screenshotPath || 'در این اجرا تولید نشد.'}`,
    '',
  ].join('\n');
  await writeFile('reports/partavar/history-ui-e2e.md', markdown);
});

test.afterAll(async () => {
  await historyServer?.close();
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
});

test('real catalogue entries keep independent historical evidence in the browser UI', async ({ page }) => {
  const historyApiStatuses: Array<{ path: string; status: number }> = [];
  observedHistoryRouteStatuses = historyApiStatuses;
  await page.route('**/api/v1/price-history/**', async route => {
    const browserUrl = new URL(route.request().url());
    const target = new URL(`${browserUrl.pathname}${browserUrl.search}`, historyOrigin);
    const response = await route.fetch({ url: target.href });
    historyApiStatuses.push({ path: `${target.pathname}${target.search}`, status: response.status() });
    await route.fulfill({ response });
  });

  const catalogueSearchBefore = await searchProductionCode('111100001AA');
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/app');
  await expect(page.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'online');
  await page.locator('[data-mode="codeMode"]').click();
  await page.locator('#codeQuery').fill('111100001AA');
  await page.locator('#codeSearchBtn').click();
  await expect(page.locator('#cards .resultCard')).toHaveCount(2);

  for (const [entry, classification] of [[selectedEntries.high, 'high'], [selectedEntries.low, 'low']] as const) {
    const card = page.locator(`.resultCard[data-entry-id="${entry.entryId}"]`);
    await expect(card).toBeVisible();
    await expect(card.locator('.historyBadge')).toHaveClass(new RegExp(`\\b${classification}\\b`));
    await expect(card.locator('.codeValue').nth(1)).toContainText(entry.logRaw);
    await expect(card.locator('.priceCell.base .priceValue')).toBeVisible();
  }

  await page.locator('[data-area="prices"]').click();
  const list = page.locator('#priceRoot .historyListRow');
  await expect(list).toHaveCount(3);
  await expect(list.nth(0)).toContainText(selectedEntries.high.logRaw);
  await expect(list.nth(1)).toContainText(selectedEntries.medium.logRaw);
  await expect(list.nth(2)).toContainText(selectedEntries.low.logRaw);

  const filters = page.locator('#priceRoot .historyFilters');
  await filters.locator('select').nth(0).selectOption('high');
  await filters.getByRole('button', { name: 'اعمال فیلتر' }).click();
  await expect(list).toHaveCount(1);
  await expect(list.first()).toContainText(selectedEntries.high.logRaw);
  await filters.locator('select').nth(0).selectOption('');
  await filters.locator('select').nth(1).selectOption('date');
  await filters.getByRole('button', { name: 'اعمال فیلتر' }).click();
  await expect(list).toHaveCount(3);
  await expect(list.nth(0)).toContainText(selectedEntries.medium.logRaw);
  await expect(list.nth(1)).toContainText(selectedEntries.high.logRaw);
  await expect(list.nth(2)).toContainText(selectedEntries.low.logRaw);

  // Save a browser-local threshold override. The 51% rise changes from high to medium,
  // and PriceIntelligence must refresh the already-rendered card badge.
  screenshotPath = 'reports/partavar/history-ui-e2e.png';
  await mkdir('reports/partavar', { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.locator('[data-area="settings"]').click();
  await page.locator('[data-doc-key="settings-high"]').fill('60');
  await page.getByRole('button', { name: 'ذخیره تنظیمات' }).click();
  await expect(page.locator('#documentRoot .docStatus')).toContainText('تنظیمات ذخیره شد');
  const highCard = page.locator(`.resultCard[data-entry-id="${selectedEntries.high.entryId}"]`);
  await expect(highCard.locator('.historyBadge')).toHaveClass(/\bmedium\b/);
  await expect(highCard.locator('.historyBadge')).toContainText('رشد متوسط');

  await page.locator('[data-area="search"]').click();
  await highCard.locator('.historyBadge').click();
  const dialog = page.locator('.historyDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(selectedEntries.high.logRaw);
  await expect(dialog).toContainText(operationsFileName);
  await expect(dialog).toContainText('PriceHistory');
  await expect(dialog.locator('.sourceHash').first()).toHaveText(importedSourceSha);
  await expect(dialog.locator('.historyObservation')).toHaveCount(50);
  await expect(dialog.locator('.historyObservation').first()).toContainText('ردیف 53');
  await expect(dialog).toContainText('قیمت فعلی کاتالوگ');

  // Superseding the imported batch changes the API revision. The already-rendered cursor
  // must be rejected, and the UI offers a retry starting from the first timeline page.
  const correctionPath = join(temporaryRoot, 'TEST-FIXTURE-CORRECTION-NOT-COMPANY.xlsx');
  await writeWorkbook(correctionPath, [
    [selectedEntries.high.techRaw, selectedEntries.high.logRaw, '100000', '2025-01-01'],
    [selectedEntries.high.techRaw, selectedEntries.high.logRaw, '151000', '2025-02-21'],
  ]);
  const correction = await stagePriceHistory({ sourcePath: correctionPath, cataloguePath, operationsPath, catalogueVersion, mapping, supersedesBatchId: importedBatchId });
  correctionSourceSha = correction.sourceSha256;
  const correctionPreview = previewPriceHistory(operationsPath, correction.batchId, 10, 0);
  expect(correctionPreview.rows).toHaveLength(2);
  await commitPriceHistory({ cataloguePath, operationsPath, batchId: correction.batchId, actor: 'PartAvar browser E2E', reason: 'Verify stale timeline cursor recovery with a generated replacement fixture' });
  await dialog.getByRole('button', { name: 'مشاهده‌های بعدی' }).click();
  await expect(dialog.getByRole('button', { name: 'تلاش دوباره از ابتدا' })).toBeVisible();
  await expect(dialog).toContainText('تاریخچه در دسترس نیست یا هنگام خواندن تغییر کرده');
  expect(historyApiStatuses.some(item => item.status === 409 && item.path.includes('cursor='))).toBe(true);
  await dialog.getByRole('button', { name: 'تلاش دوباره از ابتدا' }).click();
  await expect(dialog.locator('.historyObservation')).toHaveCount(2);
  await expect(dialog.locator('.historyObservation').first()).toContainText('TEST-FIXTURE-CORRECTION-NOT-COMPANY.xlsx');
  await expect(dialog.locator('.sourceHash').first()).toHaveText(correctionSourceSha);

  // Re-read the catalogue through the production API and SQLite; history import must leave
  // the catalogue price values and the sibling identities untouched.
  const catalogueSearchAfter = await searchProductionCode('111100001AA');
  expect(catalogueSearchAfter.map(entry => ({ id: entry.entryId, log: entry.logRaw, price: entry.basePrice })))
    .toEqual(catalogueSearchBefore.map(entry => ({ id: entry.entryId, log: entry.logRaw, price: entry.basePrice })));
  expect(await readCatalogueBasePrices()).toEqual(catalogueBasePricesBefore);
  expect(catalogueSearchAfter.find(entry => entry.entryId === selectedEntries.high.entryId)?.basePrice).toBe(selectedEntries.high.basePrice);
  expect(catalogueSearchAfter.find(entry => entry.entryId === selectedEntries.low.entryId)?.basePrice).toBe(selectedEntries.low.basePrice);
  expect(pageErrors).toEqual([]);
});
