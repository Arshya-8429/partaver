import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const routes = ['/', '/product', '/features', '/offline-data', '/support', '/contact'];
const widths = [320, 360, 390, 430, 768, 1024, 1440];

test('public routes have distinct metadata, real internal links and no catalogue requests', async ({ page }) => {
  const privateRequests: string[] = [];
  const errors: string[] = [];
  const titles = new Set<string>();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\/(api\/|snapshot|private-data)/.test(new URL(request.url()).pathname)) privateRequests.push(request.url()); });
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('main[data-site-page]')).toHaveAttribute('data-site-page', route);
    await expect(page.locator('main h1')).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fa');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /پارت‌آور/);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', await page.title());
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'fa_IR');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
    await expect(page.locator('#themeToggle')).toHaveCount(1);
    await expect(page.locator('#catalogueInfo')).toHaveCount(0);
    titles.add(await page.title());
    const links = await page.locator('.public-website a').evaluateAll(anchors => anchors.map(anchor => anchor.getAttribute('href') ?? ''));
    expect(links.length).toBeGreaterThan(10);
    for (const href of links) {
      expect(href, `${route}: empty or external link`).toMatch(/^(\/|#)/);
      const url = new URL(href, page.url());
      expect([...routes, '/app'], `${route}: unknown destination ${href}`).toContain(url.pathname);
      if (url.pathname === route && url.hash) await expect(page.locator(`[id="${url.hash.slice(1)}"]`)).toHaveCount(1);
    }
    if (route !== '/') await expect(page.locator('#site-navigation a[aria-current="page"]')).toHaveAttribute('href', route);
  }
  expect(titles.size).toBe(routes.length);
  expect(privateRequests).toEqual([]);
  expect(errors).toEqual([]);
  await page.goto('/missing-partavar-page');
  await expect(page.locator('main')).toHaveAttribute('data-site-page', 'not-found');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('وجود ندارد');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
});

test('responsive navigation supports keyboard, Escape, route links and app entry', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.locator('.site-skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#site-main')).toBeFocused();
  const menu = page.locator('#site-menu-toggle');
  await expect(page.locator('#site-navigation')).toBeHidden();
  await menu.focus(); await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#site-navigation')).toBeVisible();
  await page.locator('#site-navigation a').first().focus();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.press('Enter');
  await page.locator('#site-navigation a[href="/product"]').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/product$/);
  await page.locator('a.site-header-cta').click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator('.public-website')).toHaveCount(0);
});

test('themes, public page layouts, touch targets and text enlargement stay usable', async ({ page }) => {
  test.setTimeout(120_000);
  await mkdir('reports/partavar', { recursive: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const dark of [false, true]) {
    if (await page.locator('body').evaluate(body => body.classList.contains('dark')) !== dark) await page.locator('#themeToggle').click();
    for (const route of routes) {
      await page.goto(route);
      expect(await page.locator('body').evaluate(body => body.classList.contains('dark'))).toBe(dark);
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route}, width ${width}, dark=${dark}`).toBe(true);
        const tooSmall = await page.locator('.public-website a:visible, .public-website button:visible, .public-website summary:visible').evaluateAll(elements => elements.map(element => ({ label: element.textContent?.trim() ?? element.getAttribute('aria-label'), rect: element.getBoundingClientRect() })).filter(item => item.rect.width < 43.5 || item.rect.height < 43.5).map(item => ({ label: item.label, width: item.rect.width, height: item.rect.height })));
        expect(tooSmall, `${route}, width ${width}, dark=${dark}`).toEqual([]);
        if ((route === '/' || route === '/support') && (width === 390 || width === 1440)) {
          await page.screenshot({ path: `reports/partavar/site-${route === '/' ? 'home' : 'support'}-${dark ? 'dark' : 'light'}-${width}.png`, fullPage: true, animations: 'disabled' });
        }
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/support');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  const motion = await page.locator('.site-button').first().evaluate(element => getComputedStyle(element).transitionDuration);
  expect(motion).toBe('0s');
});

test('real preview loads and a failed image keeps useful app access', async ({ page }) => {
  await page.goto('/');
  const preview = page.locator('#site-app-preview');
  await expect(preview).toBeVisible();
  expect(await preview.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(preview).toHaveAttribute('src', '/website/app-preview.webp');
  await expect(page.locator('#site-preview-fallback')).toBeHidden();
  await page.route('**/website/app-preview.webp', route => route.abort());
  await page.reload();
  await expect(preview).toBeHidden();
  await expect(page.locator('#site-preview-fallback')).toBeVisible();
  await expect(page.locator('#site-preview-fallback a')).toHaveAttribute('href', '/app');
});

test('help links resolve to sections and contact does not invent a submission channel', async ({ page }) => {
  await page.goto('/support#offline');
  await expect(page.locator('#offline')).toBeInViewport();
  const question = page.locator('.site-faq').first();
  await question.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(question).toHaveAttribute('open', '');
  await page.goto('/contact');
  await expect(page.locator('main')).toContainText('اطلاعات تماس عمومیِ تأییدشده ندارد');
  await expect(page.locator('main form, main input, a[href^="mailto:"], a[href^="tel:"]')).toHaveCount(0);
});
