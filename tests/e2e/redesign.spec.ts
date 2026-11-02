import { test, expect } from '@playwright/test';

test('compact RTL redesign uses bounded online search and explicit vehicle selection', async ({ page, context }) => {
  const chunks: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('/snapshot/chunks/')) chunks.push(request.url()); });
  await page.goto('/app');
  await expect(page.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'online');
  expect(chunks).toEqual([]);
  await page.locator('#vehicle').fill('X33 Cross');
  await expect(page.locator('.vehicleOption')).toHaveCount(3);
  await page.locator('#vehicle').press('Enter');
  await expect(page.locator('#vehicle')).toHaveValue('X33 Cross');
  await expect(page.locator('#vehicle')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#vehicle').press('ArrowDown');
  await page.locator('#vehicle').press('Enter');
  await expect(page.locator('#vehicle')).toHaveValue(/CVT/);
  await page.locator('#vehicle').press('Escape');
  await page.locator('#vehicle').press('ArrowDown');
  await expect(page.locator('#vehicle')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#vehicle').press('Escape');
  await page.locator('[data-mode="codeMode"]').click();
  await page.locator('#codeQuery').fill('0CF25BE-1500011BA');
  await page.locator('#codeQuery').press('Enter');
  await expect(page.locator('#resultCount')).toContainText('۱۱ ردیف');
  const card = page.locator('#cards .resultCard').first();
  await expect(card).toContainText('۳٬۶۴۹٬۶۴۴٬۳۲۱');
  await expect(card).toContainText('۴٬۰۱۴٬۶۰۸٬۷۵۳');
  await expect(card).toContainText('۴٬۳۷۹٬۵۷۳٬۱۸۵');
  await card.locator('.detailToggle').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.entryDetail')).toContainText('TIGGO7 PRO Excellent');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(card.locator('.detailToggle')).toBeFocused();
  await card.locator('.familySearchButton').click();
  await expect(page.locator('.variantRow').first()).toBeVisible();
  expect(await page.locator('.variantRow').count()).toBeLessThanOrEqual(10);
  await page.goBack();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('#codeQuery')).toHaveValue('0CF25BE-1500011BA');
  for (const dark of [false, true]) {
    if ((await page.locator('body').getAttribute('class') ?? '').includes('dark') !== dark) await page.locator('#themeToggle').click();
    for (const width of [320, 360, 390, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator('#catalogueProgress').isVisible()).toBe(false);
    }
  }
  await page.locator('#codeQuery').fill('112000177AA-03');
  await page.locator('#codeSearchBtn').click();
  await expect(page.locator('#cards .resultCard').first()).toContainText('اطلاعات خودرو ثبت نشده');
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'empty');
  await expect(page.locator('#catalogueStatusText')).toContainText('نصب نشده');
  expect(errors).toEqual([]);
});

test('discarded requests cannot restore cleared or other-mode results', async ({ page }) => {
  let release!: () => void;
  let requested!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { requested = resolve; });
  await page.route('**/api/v1/search?*', async route => {
    try { const response = await route.fetch(); requested(); await gate; await route.fulfill({ response }); }
    catch { try { await route.abort(); } catch { /* Cancelled request. */ } }
  });
  await page.goto('/app');
  await expect(page.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'online');
  await page.locator('[data-mode="codeMode"]').click();
  await page.locator('#codeQuery').fill('111100001AA'); await page.locator('#codeSearchBtn').click();
  await started;
  await page.locator('#codeClearBtn').click();
  await page.locator('[data-mode="partMode"]').click(); release();
  await expect(page.locator('#cards .resultCard')).toHaveCount(0);
  await expect(page.locator('#results')).toBeHidden();
  await expect(page.locator('#resultCount')).toBeEmpty();
  await expect(page.locator('#codeQuery')).toHaveValue('');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#cards .resultCard')).toHaveCount(0);
});

test('copy reports success only on actual writes; themes, keyboard and enlarged layout remain usable', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/app');
  await expect(page.locator('body')).toHaveClass(/dark/);
  await expect(page.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'online');
  await page.locator('#partTab').focus(); await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#codeTab')).toHaveAttribute('aria-selected', 'true');
  await page.locator('#codeQuery').fill('111100001AA'); await page.locator('#codeQuery').press('Enter');
  await expect(page.locator('#resultCount')).toContainText('۲ ردیف');
  const first = page.locator('#cards .resultCard').first();
  await first.locator('.copyButton').first().click();
  await expect(page.locator('#toast')).toContainText('کپی شد');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('111100001AA');
  await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); });
  await first.locator('.copyButton').last().click();
  await expect(page.locator('#toast')).toContainText('کپی انجام نشد');
  await first.locator('.detailToggle').click();
  await expect(page.locator('#detailTitle')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(first.locator('.detailToggle')).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.zoom = ''; });
  await page.locator('#themeToggle').click();
  await first.locator('.detailToggle').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goto('/app?navigation-check=1');
  await expect(page).toHaveURL(/navigation-check=1/);
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();
  await expect(page.locator('body')).not.toHaveClass(/dark/);
  const sizes = await page.locator('button:visible').evaluateAll(buttons => buttons.map(button => ({ label: button.getAttribute('aria-label') ?? button.textContent, width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
  expect(sizes.filter(size => size.width < 44 || size.height < 44)).toEqual([]);
});

test('vehicle search, normalized digits, empty results and large values retain their real identities', async ({ page }) => {
  await page.goto('/app'); await expect(page.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'online');
  await page.locator('#vehicle').fill('X33 Cross CVT');
  await expect(page.locator('.vehicleOption').first()).toBeVisible();
  await page.locator('#vehicle').press('Enter');
  await expect(page.locator('#vehicle')).toHaveValue('X33 Cross CVT');
  await page.locator('#partQuery').fill('سپر'); await page.locator('#partSearchBtn').click();
  await expect(page.locator('#cards .resultCard').first()).toContainText('دیاق سپر جلو');
  await expect(page.locator('#cards .resultCard')).toHaveCount(20);
  await page.locator('#vehicleClear').click();
  await expect(page.locator('#vehicle')).toHaveValue(''); await expect(page.locator('#results')).toBeHidden();
  await page.locator('[data-mode="codeMode"]').click();
  for (const query of ['۱۱۱۱۰۰۰۰۱AA', '١١١١٠٠٠٠١AA', '111100001AA']) {
    await page.locator('#codeQuery').fill(query); await page.locator('#codeSearchBtn').click();
    await expect(page.locator('#resultCount')).toContainText('۲ ردیف');
    await expect(page.locator('#cards .resultCard').first()).toContainText('111100001AA-01');
    await expect(page.locator('#cards .resultCard').nth(1)).toContainText('۷۵٬۵۳۳٬۷۱۸');
  }
  await page.locator('#codeQuery').fill('ZZZ-NO-SOURCE-MATCH-987654321'); await page.locator('#codeSearchBtn').click();
  await expect(page.locator('#resultCount')).toContainText('۰ ردیف');
  await expect(page.locator('.resultsEmpty')).toContainText('نتیجه‌ای پیدا نشد');
  await page.locator('#codeQuery').fill('112000177AA-01'); await page.locator('#codeSearchBtn').click();
  await expect(page.locator('#cards .resultCard').first()).toContainText('۵٬۸۸۲٬۳۲۸٬۷۳۳');
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('simulated quota exhaustion explains recovery without activating a partial catalogue', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  let chunks = 0;
  page.on('request', request => { if (request.url().includes('/snapshot/chunks/')) chunks++; });
  await context.route('**/assets/catalogue.worker-*.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: "Object.defineProperty(navigator.storage,'estimate',{value:async()=>({usage:99,quota:100})});\n" + await response.text() });
  });
  try {
    await page.goto('/app'); await expect(page.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'online');
    await page.locator('#catalogueInfo summary').click(); await page.locator('#catalogueUpdateButton').click();
    await expect(page.locator('#catalogueStatusMeta')).toContainText('فضای کافی');
    await expect(page.locator('#catalogueUpdateButton')).toBeEnabled();
    await expect(page.locator('#catalogueProgress')).toBeHidden();
    expect(chunks).toBe(0);
    await expect(page.locator('#catalogueStatusText')).toHaveAttribute('data-offline-ready', 'false');
  } finally { await context.close(); }
});

test('lazy logistics navigation follows actual API cursors and preserves entry prices', async ({ page }) => {
  // Return a smaller real server page so both directions are reachable with this
  // source (no technical code in the source has more than eight logistics rows).
  await page.route('**/api/v1/search?*', async route => {
    const url = new URL(route.request().url());
    if (!url.searchParams.has('partId')) { await route.continue(); return; }
    url.searchParams.set('limit', '1');
    const response = await route.fetch({ url: url.href }); await route.fulfill({ response });
  });
  await page.goto('/app'); await expect(page.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'online');
  await page.locator('[data-mode="codeMode"]').click();
  await page.locator('#codeQuery').fill('0CF25BE-1500011BA'); await page.locator('#codeSearchBtn').click();
  await expect(page.locator('#resultCount')).toContainText('۱۱ ردیف');
  await page.locator('#cards .familySearchButton').first().click();
  await expect(page.locator('.variantEntries .resultCard')).toHaveCount(0);
  await page.locator('.variantToggle').first().click();
  const entries = page.locator('.variantEntries .resultCard');
  await expect(entries).toHaveCount(1); await expect(entries).toContainText('۳٬۶۴۹٬۶۴۴٬۳۲۱');
  await page.getByRole('button', { name: 'ردیف‌های بعدی' }).click();
  await expect(entries).toHaveCount(1); await expect(entries).toContainText('۲٬۳۸۶٬۹۵۶٬۰۰۰');
  await page.getByRole('button', { name: 'ردیف‌های قبلی' }).click();
  await expect(entries).toContainText('۳٬۶۴۹٬۶۴۴٬۳۲۱');
});
