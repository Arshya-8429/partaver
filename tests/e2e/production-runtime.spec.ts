import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { createServer } from '../../apps/api/src/server.js';

const origin = 'http://127.0.0.1:8788';
const token = 'synthetic-release-browser-token-never-use-in-production';
const output = 'reports/release-2026-10-28/production';
let server: Awaited<ReturnType<typeof createServer>>;
let context: BrowserContext;
let page: Page;
const errors: string[] = [];
test.describe.configure({ mode: 'serial' });
test.setTimeout(600_000);

test.beforeAll(async ({ browser }) => {
  await mkdir(output, { recursive: true });
  server = await createServer({ logger: false, webRoot: resolve('apps/web/dist'), access: { publicOrigin: origin, username: 'operator', tokenSha256: createHash('sha256').update(token).digest('hex') } });
  await server.listen({ host: '127.0.0.1', port: 8788 });
  context = await browser.newContext({ httpCredentials: { username: 'operator', password: token }, serviceWorkers: 'allow' });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
});
test.afterAll(async () => { await context?.close(); await server?.close(); });

test('production serves anonymous website but denies app and catalogue without credentials', async ({ request }) => {
  const site = await request.get(origin);
  expect(site.status()).toBe(200);
  const deny = await request.get(`${origin}/api/v1/catalog/manifest`);
  expect(deny.status()).toBe(401);
  expect(deny.headers()['cache-control']).toBe('no-store');
  expect((await request.get(`${origin}/app/`)).status()).toBe(401);
  expect((await request.get(`${origin}/private-data/sqlite/catalogue.db`)).status()).toBe(404);
});

test('authenticated same-origin app runs Worker search, documents and shell under production CSP', async () => {
  const response = await page.goto(`${origin}/app/`);
  expect(response!.headers()['content-security-policy']).toContain("script-src 'self'");
  await expect(page.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'online');
  await page.getByRole('tab', { name: 'کد یا نام قطعه' }).click();
  await page.locator('#codeQuery').fill('111100001AA');
  await page.locator('#codeSearchBtn').click();
  await expect(page.locator('#cards .resultCard')).toHaveCount(2);
  await page.locator('#cards .resultCard').first().locator('.packageAction').click();
  await page.locator('[data-area="packages"]').click();
  const price = page.locator('.docLine input[data-doc-key^="price-"]').first();
  await price.fill('12345678901234567890'); await price.dispatchEvent('change');
  await page.getByRole('button', { name: 'نمای چاپ / PDF' }).click();
  await expect(page.locator('#partavarPrintView')).toContainText('۱۲٬۳۴۵٬۶۷۸٬۹۰۱٬۲۳۴٬۵۶۷٬۸۹۰');
  await page.getByRole('button', { name: 'بازگشت به سند' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'خروجی Excel (.xlsx)' }).click()]);
  expect(await download.failure()).toBeNull();
  expect(await download.path()).toBeTruthy();
  await page.locator('[data-area="search"]').click();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => ({ name: new URL(entry.name).pathname, transferBytes: (entry as PerformanceResourceTiming).transferSize, decodedBytes: (entry as PerformanceResourceTiming).decodedBodySize })));
  await writeFile(`${output}/same-origin-resources.json`, JSON.stringify({ syntheticCredentialsOnly: true, resources, errors }, null, 2));
  await page.screenshot({ path: `${output}/authenticated-app.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('browser installation fetch reads the credentialed manifest and correctly sized brand icons', async () => {
  await page.goto(`${origin}/app/`);
  const session = await context.newCDPSession(page);
  try {
    const result = await session.send('Page.getAppManifest');
    expect(result.errors).toEqual([]);
    expect(result.data, 'The native browser manifest fetch must authenticate and return the manifest.').toBeTruthy();
    const manifest = JSON.parse(result.data!) as { start_url: string; icons: Array<{ src: string; sizes: string }> };
    expect(manifest.start_url).toBe('/app/');
    for (const size of [192, 512]) {
      const icon = manifest.icons.find(item => item.sizes === `${size}x${size}`);
      expect(icon).toBeTruthy();
      const response = await context.request.get(`${origin}${icon!.src}`);
      expect(response.status()).toBe(200);
      const bytes = await response.body();
      expect(bytes.subarray(1, 4).toString()).toBe('PNG');
      expect(bytes.readUInt32BE(16)).toBe(size);
      expect(bytes.readUInt32BE(20)).toBe(size);
    }
    const robots = await context.request.get(`${origin}/robots.txt`);
    expect(robots.status()).toBe(200);
    expect(robots.headers()['content-type']).toContain('text/plain');
    expect(await robots.text()).toContain('Disallow: /app');
    await writeFile(`${output}/install-manifest.json`, JSON.stringify({ browserManifestErrors: result.errors, manifest, nativeDeviceInstallationTested: false }, null, 2));
  } finally { await session.detach(); }
});

test('authenticated snapshots install completely and relaunch without network under CSP', async () => {
  await page.locator('#catalogueInfo').evaluate((element: HTMLDetailsElement) => { element.open = true; });
  const started = performance.now();
  await page.locator('#catalogueUpdateButton').click();
  await expect(page.locator('#catalogueStatusText')).toHaveAttribute('data-offline-ready', 'true', { timeout: 480_000 });
  const installMs = performance.now() - started;
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.locator('#catalogueStatusText')).toHaveAttribute('data-offline-ready', 'true');
    await page.getByRole('tab', { name: 'کد یا نام قطعه' }).click();
    await page.locator('#codeQuery').fill('111100001AA'); await page.locator('#codeSearchBtn').click();
    await expect(page.locator('#cards .resultCard')).toHaveCount(2);
    await page.screenshot({ path: `${output}/offline-authenticated-app.png`, fullPage: true });
    await writeFile(`${output}/offline-authenticated.json`, JSON.stringify({ generatedAt: new Date().toISOString(), installMs, offlineRelaunch: true, resultCount: 2, errors, catalogueSource: 'actual migrated catalogue; operator credentials are synthetic test-only values' }, null, 2));
    expect(errors).toEqual([]);
  } finally { await context.setOffline(false); }
});
