# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: browser.spec.ts >> app keyboard, touch targets, reduced motion and 200 percent layout preserve usable content
- Location: tests/release/browser.spec.ts:284:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

- Array []
+ Array [
+   "ResizeObserver loop completed with undelivered notifications.",
+ ]
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - link "رفتن به جست‌وجو" [ref=e3]:
    - /url: "#workspace"
  - generic [ref=e4]:
    - banner [ref=e5]:
      - generic [ref=e7]:
        - heading "PartAvar." [level=1] [ref=e8]
        - paragraph [ref=e9]: پارت‌آور · ابزار کار قطعات خودرو
      - generic [ref=e10]:
        - generic [ref=e11]: متصل
        - button "تغییر به حالت روشن" [ref=e12] [cursor=pointer]
    - navigation "بخش‌های پارت‌آور" [ref=e16]:
      - button "جست‌وجو" [ref=e17] [cursor=pointer]
      - button "لیست خرید" [ref=e18] [cursor=pointer]
      - button "بسته‌ها" [ref=e19] [cursor=pointer]
      - button "فاکتورها" [ref=e20] [cursor=pointer]
      - button "روند قیمت" [ref=e21] [cursor=pointer]
      - button "تنظیمات" [ref=e22] [cursor=pointer]
      - link "وب‌سایت ↗" [ref=e23]:
        - /url: /
    - region "وضعیت کاتالوگ" [ref=e24]:
      - group [ref=e25]:
        - generic "جست‌وجوی آنلاین آماده است · دریافت آفلاین اختیاری، اطلاعات و دریافت" [ref=e26] [cursor=pointer]:
          - status [ref=e28]: جست‌وجوی آنلاین آماده است · دریافت آفلاین اختیاری
          - generic [ref=e29]: اطلاعات و دریافت ⌄
    - main [ref=e30]:
      - text: + · · ·
      - region "اسناد عملیاتی" [ref=e31]:
        - generic [ref=e33]:
          - paragraph [ref=e34]: تنظیمات اپراتور
          - heading "قیمت، قالب چاپ و پشتیبان" [level=2] [ref=e35]
        - generic [ref=e36]:
          - heading "قیمت‌گذاری و نشان تاریخچه" [level=3] [ref=e37]
          - generic [ref=e38]:
            - generic [ref=e39]:
              - generic [ref=e40]: سطح پیش‌فرض قیمت پکیج
              - combobox "سطح پیش‌فرض قیمت پکیج" [ref=e41]:
                - option "پایه (پیش‌فرض امن)" [selected]
                - option "میانی +۱۰٪"
                - option "نهایی +۲۰٪"
              - generic [ref=e42]: فقط روی قطعاتی اثر دارد که بعداً به پکیج اضافه می‌شوند.
            - generic [ref=e43]:
              - generic [ref=e44]: روش دسته‌بندی تغییر قیمت
              - combobox "روش دسته‌بندی تغییر قیمت" [ref=e45]:
                - option "آستانهٔ درصد تغییر" [selected]
                - option "صدک در مجموعهٔ قابل مقایسه"
            - generic [ref=e46]:
              - generic [ref=e47]: مرز تغییر متوسط (درصد)
              - textbox "مرز تغییر متوسط (درصد)" [ref=e48]: "10"
            - generic [ref=e49]:
              - generic [ref=e50]: مرز تغییر زیاد (درصد)
              - textbox "مرز تغییر زیاد (درصد)" [ref=e51]: "30"
            - generic [ref=e52]:
              - generic [ref=e53]: مرز صدک متوسط (۰ تا ۱۰۰)
              - textbox "مرز صدک متوسط (۰ تا ۱۰۰)" [ref=e54]: "33.33"
            - generic [ref=e55]:
              - generic [ref=e56]: مرز صدک زیاد (۰ تا ۱۰۰)
              - textbox "مرز صدک زیاد (۰ تا ۱۰۰)" [ref=e57]: "66.67"
            - generic [ref=e58]:
              - generic [ref=e59]: حداقل مشاهده برای تاریخچه
              - textbox "حداقل مشاهده برای تاریخچه" [ref=e60]: "2"
          - paragraph [ref=e61]: مرز متوسط باید از مرز زیاد کوچک‌تر باشد. مرزهای آستانه و صدک مستقل ذخیره می‌شوند. این نشان، تغییر تاریخی قیمت را توصیف می‌کند.
        - generic [ref=e62]:
          - heading "قالب چاپ فاکتور" [level=3] [ref=e63]
          - generic [ref=e64]:
            - generic [ref=e65]:
              - generic [ref=e66]: نام شرکت / نمایش‌دهنده
              - textbox "نام شرکت / نمایش‌دهنده" [ref=e67]: پارت‌آور
            - generic [ref=e68]:
              - generic [ref=e69]: عنوان فاکتور
              - textbox "عنوان فاکتور" [ref=e70]: فاکتور قطعات
            - generic [ref=e71]:
              - generic [ref=e72]: پانوشت چاپ (اختیاری)
              - textbox "پانوشت چاپ (اختیاری)" [ref=e73]
          - generic [ref=e74]:
            - generic [ref=e75]:
              - generic [ref=e76]: شماره سند
              - checkbox "شماره سند" [checked] [ref=e77]
            - generic [ref=e78]:
              - generic [ref=e79]: تاریخ
              - checkbox "تاریخ" [checked] [ref=e80]
            - generic [ref=e81]:
              - generic [ref=e82]: مشخصات مشتری
              - checkbox "مشخصات مشتری" [checked] [ref=e83]
            - generic [ref=e84]:
              - generic [ref=e85]: یادداشت
              - checkbox "یادداشت" [checked] [ref=e86]
            - generic [ref=e87]:
              - generic [ref=e88]: کد لجستیکی
              - checkbox "کد لجستیکی" [checked] [ref=e89]
            - generic [ref=e90]:
              - generic [ref=e91]: زمینهٔ خودرو
              - checkbox "زمینهٔ خودرو" [checked] [ref=e92]
          - paragraph [ref=e93]: قالب پیش‌فرض A4 است. مالیات یا محاسبهٔ قانونی اضافه نشده است. نمونهٔ نهایی موردنظر شما می‌تواند جایگزین این قالب شود.
        - button "ذخیره تنظیمات" [ref=e94] [cursor=pointer]
        - generic [ref=e95]:
          - heading "پشتیبان اسناد و ورود نسخهٔ قدیمی" [level=3] [ref=e96]
          - paragraph [ref=e97]: پشتیبان JSON شامل پیش‌نویس‌ها، سوابق، پکیج‌ها و تنظیمات این مرورگر است. اطلاعات کاتالوگ در این فایل نیست. ورود فایل، اسناد را با شناسهٔ جدید به سوابق اضافه می‌کند.
          - generic [ref=e98]:
            - button "دریافت پشتیبان JSON" [ref=e99] [cursor=pointer]
            - generic [ref=e100] [cursor=pointer]:
              - text: انتخاب فایل برای ورود
              - button "انتخاب فایل پشتیبان JSON" [ref=e101]
            - button "بررسی دادهٔ قدیمی این مبدا" [ref=e102] [cursor=pointer]
          - paragraph [ref=e103]: دسترسی مرورگر به localStorage محدود به همان مبدا است. برای نسخهٔ فایل HTML یا مبدأ دیگر، JSON کلیدهای قدیمی را از همان محیط صادر و اینجا انتخاب کنید. کد لجستیکی یا هویت حل‌نشدهٔ قدیمی حدس زده نمی‌شود.
    - contentinfo [ref=e104]:
      - generic [ref=e105]: "ردیف‌های کاتالوگ: ۳۶٬۵۶۹"
      - generic [ref=e106]: میانی ۱۰٪ و نهایی ۲۰٪ بالاتر از پایه
      - generic [ref=e107]: design by behrad
  - status
```

# Test source

```ts
  229 |     const result = await audit(page, testInfo, name);
  230 |     if (result.violations.length) failures.push({ state: name, violations: result.violations });
  231 |   }
  232 |   for (const dark of [false, true]) {
  233 |     const theme = dark ? 'dark' : 'light';
  234 |     await page.goto('/');
  235 |     if (await page.locator('body').evaluate(body => body.classList.contains('dark')) !== dark) await page.locator('#themeToggle').click();
  236 |     for (const route of publicRoutes) {
  237 |       await page.goto(route);
  238 |       await check(`site-${route.replaceAll('/', '') || 'home'}-${theme}`);
  239 |     }
  240 |     await onlineApp(page);
  241 |     await check(`app-search-${theme}`);
  242 |     await page.locator('#vehicle').fill('X33 Cross');
  243 |     await expect(page.locator('#vehicleSuggestions')).toBeVisible();
  244 |     await check(`vehicle-combobox-${theme}`);
  245 |     await page.locator('#vehicle').press('Escape');
  246 |     await page.locator('#vehicle').fill('X33 Cross CVT');
  247 |     await expect(page.locator('.vehicleOption').first()).toBeVisible();
  248 |     await page.locator('#vehicle').press('Enter');
  249 |     await page.locator('#partQuery').fill('سپر');
  250 |     await expect(page.locator('#partList [role="option"]').first()).toBeVisible();
  251 |     await check(`part-combobox-${theme}`);
  252 |     await page.locator('#partQuery').press('Escape');
  253 |     await codeSearch(page);
  254 |     await check(`app-results-${theme}`);
  255 |     const first = page.locator('#cards .resultCard').first();
  256 |     await first.locator('.detailToggle').click();
  257 |     await expect(page.locator('#detailDialog')).toBeVisible();
  258 |     await check(`entry-dialog-${theme}`);
  259 |     await page.keyboard.press('Escape');
  260 |     await first.locator('.invoiceAction').click();
  261 |     await expect(page.locator('.docPricePicker')).toBeVisible();
  262 |     await check(`invoice-price-dialog-${theme}`);
  263 |     await page.keyboard.press('Escape');
  264 |     for (const area of ['purchase', 'packages', 'invoices', 'prices', 'settings']) {
  265 |       await page.locator(`[data-area="${area}"]`).click();
  266 |       await expect(page.locator(area === 'prices' ? '#priceRoot' : '#documentRoot')).toBeVisible();
  267 |       await check(`app-${area}-${theme}`);
  268 |     }
  269 |     const [backup] = await Promise.all([
  270 |       page.waitForEvent('download'),
  271 |       page.getByRole('button', { name: 'دریافت پشتیبان JSON' }).click(),
  272 |     ]);
  273 |     const backupPath = await backup.path();
  274 |     expect(backupPath).toBeTruthy();
  275 |     await page.locator('.docFileInput').setInputFiles(backupPath!);
  276 |     await expect(page.locator('.docImportDialog')).toBeVisible();
  277 |     await check(`backup-import-dialog-${theme}`);
  278 |     await page.keyboard.press('Escape');
  279 |   }
  280 |   await evidence(testInfo, 'axe-summary', { automatedScope: 'axe-core WCAG 2 A/AA, WCAG 2.1 A/AA and best-practice rules; not screen-reader certification', failures });
  281 |   expect(failures).toEqual([]);
  282 | });
  283 | 
  284 | test('app keyboard, touch targets, reduced motion and 200 percent layout preserve usable content', async ({ page }, testInfo) => {
  285 |   const errors: string[] = [];
  286 |   page.on('pageerror', error => errors.push(error.message));
  287 |   await page.emulateMedia({ reducedMotion: 'reduce' });
  288 |   await onlineApp(page);
  289 |   await page.keyboard.press(testInfo.project.name === 'webkit' ? 'Alt+Tab' : 'Tab');
  290 |   await expect(page.locator('.skipLink')).toBeFocused();
  291 |   await page.keyboard.press('Enter');
  292 |   await expect(page.locator('#workspace')).toBeFocused();
  293 |   await page.locator('#partTab').focus();
  294 |   await page.keyboard.press('ArrowLeft');
  295 |   await expect(page.locator('#codeTab')).toBeFocused();
  296 |   await expect(page.locator('#codeTab')).toHaveAttribute('aria-selected', 'true');
  297 |   await codeSearch(page, '0CF25BE-1500011BA');
  298 |   const problems: Array<{ width: number; dark: boolean; kind: string; detail: unknown }> = [];
  299 |   for (const dark of [false, true]) {
  300 |     if (await page.locator('body').evaluate(body => body.classList.contains('dark')) !== dark) await page.locator('#themeToggle').click();
  301 |     for (const width of widths) {
  302 |       await page.setViewportSize({ width, height: 900 });
  303 |       await settleLayout(page);
  304 |       const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  305 |       if (overflow) problems.push({ width, dark, kind: 'page overflow', detail: true });
  306 |       const clipped = await clippedValues(page);
  307 |       if (clipped.length) problems.push({ width, dark, kind: 'clipped price/code', detail: clipped });
  308 |       const tooSmall = await page.locator('button:visible, .appNav a:visible, summary:visible').evaluateAll(elements => elements.map(element => ({ label: element.textContent?.trim() || element.getAttribute('aria-label'), width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })).filter(item => item.width < 43.5 || item.height < 43.5));
  309 |       if (tooSmall.length) problems.push({ width, dark, kind: 'touch target', detail: tooSmall });
  310 |       if (width === 390) await screenshot(page, testInfo, `app-results-${dark ? 'dark' : 'light'}-390`);
  311 |     }
  312 |   }
  313 |   await page.setViewportSize({ width: 1440, height: 1000 });
  314 |   await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  315 |   await settleLayout(page);
  316 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  317 |   const clippedAtZoom = await clippedValues(page);
  318 |   await screenshot(page, testInfo, 'app-zoom-200-percent');
  319 |   expect(clippedAtZoom).toEqual([]);
  320 |   await page.evaluate(() => { document.documentElement.style.zoom = ''; });
  321 |   await page.locator('[data-area="settings"]').click();
  322 |   await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  323 |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  324 |   await screenshot(page, testInfo, 'settings-text-200-percent');
  325 |   const transition = await page.locator('#themeToggle').evaluate(element => getComputedStyle(element).transitionDuration);
  326 |   expect(transition).toBe('0s');
  327 |   await evidence(testInfo, 'app-layout', { widths, themes: ['light', 'dark'], problems, clippedAtZoom, transition, errors });
  328 |   expect(problems).toEqual([]);
> 329 |   expect(errors).toEqual([]);
      |                  ^ Error: expect(received).toEqual(expected) // deep equality
  330 | });
  331 | 
  332 | test('full catalogue installs and offline shell relaunch preserves search parity in real IndexedDB', async ({ browser, browserName }, testInfo) => {
  333 |   test.setTimeout(12 * 60 * 1000);
  334 |   // WebKit's ephemeral profile reports a 1GB quota; the complete installed catalogue
  335 |   // needs more. A clean persistent profile exercises real disk storage and process restart.
  336 |   const profile = browserName === 'webkit' ? await mkdtemp(join(tmpdir(), 'partavar-release-webkit-')) : null;
  337 |   let context = profile ? await webkit.launchPersistentContext(profile, { headless: true, serviceWorkers: 'allow' }) : await browser.newContext({ serviceWorkers: 'allow' });
  338 |   const page = await context.newPage();
  339 |   try {
  340 |   const errors: string[] = [];
  341 |   const consoleProblems: string[] = [];
  342 |   let intentionalOffline = false;
  343 |   page.on('pageerror', error => errors.push(error.message));
  344 |   page.on('console', message => { if (!intentionalOffline && (message.type() === 'warning' || message.type() === 'error')) consoleProblems.push(message.text()); });
  345 |   await onlineApp(page);
  346 |   await codeSearch(page, '0CF25BE-1500011BA');
  347 |   const onlineCards = await page.locator('#cards .resultCard').allTextContents();
  348 |   await observePerformance(page);
  349 |   await page.locator('#catalogueInfo summary').click();
  350 |   const started = Date.now();
  351 |   await page.locator('#catalogueUpdateButton').click();
  352 |   await page.waitForFunction(() => {
  353 |     const state = document.getElementById('catalogueStatusText')?.dataset.state;
  354 |     return state === 'ready' || (state === 'online' && (document.getElementById('catalogueCancelButton') as HTMLButtonElement).hidden);
  355 |   }, undefined, { timeout: 10 * 60 * 1000 });
  356 |   await evidence(testInfo, 'install-outcome', { state: await page.locator('#catalogueStatusText').getAttribute('data-state'), details: await page.locator('#catalogueStatusMeta').innerText(), profile: profile ? 'isolated persistent profile' : 'isolated ephemeral context' });
  357 |   await expect(page.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'ready');
  358 |   const installMs = Date.now() - started;
  359 |   await expect(page.locator('#dbCount')).toHaveText('۳۶٬۵۶۹');
  360 |   await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  361 |   const storage = await page.evaluate(async () => ({
  362 |     estimate: await navigator.storage.estimate(),
  363 |     caches: await caches.keys(),
  364 |     secureContext: isSecureContext,
  365 |     controller: Boolean(navigator.serviceWorker.controller),
  366 |   }));
  367 |   const installationPerformance = await performanceMeasurements(page);
  368 |   intentionalOffline = true;
  369 |   if (profile) {
  370 |     await context.close();
  371 |     context = await webkit.launchPersistentContext(profile, { headless: true, offline: true, serviceWorkers: 'allow' });
  372 |   } else {
  373 |     await context.setOffline(true);
  374 |     await page.close();
  375 |   }
  376 |   const reopened = await context.newPage();
  377 |   reopened.on('pageerror', error => errors.push(error.message));
  378 |   await reopened.goto('/app/', { waitUntil: 'domcontentloaded' });
  379 |   await expect(reopened.locator('#dbCount')).toHaveText('۳۶٬۵۶۹');
  380 |   expect(await reopened.evaluate(() => navigator.onLine)).toBe(false);
  381 |   await codeSearch(reopened, '0CF25BE-1500011BA');
  382 |   await expect(reopened.locator('#cards .resultCard')).toHaveCount(11);
  383 |   expect(await reopened.locator('#cards .resultCard').allTextContents()).toEqual(onlineCards);
  384 |   await observePerformance(reopened, true);
  385 |   for (const query of ['111100001AA-01', 'واتر پمپ', '150']) {
  386 |     for (let trial = 0; trial < 9; trial++) {
  387 |       await codeSearch(reopened, query);
  388 |       await settleLayout(reopened);
  389 |     }
  390 |   }
  391 |   await reopened.locator('#partTab').click();
  392 |   await reopened.locator('#vehicle').fill('X33 Cross CVT');
  393 |   await expect(reopened.locator('.vehicleOption').first()).toBeVisible();
  394 |   await reopened.locator('#vehicle').press('Enter');
  395 |   for (let trial = 0; trial < 9; trial++) {
  396 |     await reopened.locator('#partQuery').fill('سپر');
  397 |     await reopened.locator('#partQuery').press('Enter');
  398 |     await expect(reopened.locator('#cards .resultCard').first()).toBeVisible();
  399 |     await settleLayout(reopened);
  400 |   }
  401 |   const searchPerformance = await performanceMeasurements(reopened);
  402 |   const latency = [
  403 |     { label: 'exact logistics code', query: '111100001AA-01', mode: 'global', proposedWarmP95TargetMs: 150 },
  404 |     { label: 'part phrase', query: 'واتر پمپ', mode: 'global', proposedWarmP95TargetMs: 300 },
  405 |     { label: 'broad three-character code', query: '150', mode: 'global', proposedWarmP95TargetMs: null },
  406 |     { label: 'vehicle-filtered part', query: 'سپر', mode: 'vehiclePart', proposedWarmP95TargetMs: 300 },
  407 |   ].map(({ label, query, mode, proposedWarmP95TargetMs }) => {
  408 |     const measurements = searchPerformance.search.filter(sample => sample.query === query && sample.mode === mode);
  409 |     expect(measurements).toHaveLength(9);
  410 |     const warm = measurements.slice(2).map(sample => sample.durationMs).sort((a, b) => a - b);
  411 |     const p95Ms = warm[Math.ceil(warm.length * .95) - 1]!;
  412 |     return { label, query, mode, warmupSamples: measurements.slice(0, 2), warmSamplesMs: warm, p95Ms, proposedWarmP95TargetMs, meetsProposedTarget: proposedWarmP95TargetMs === null ? null : p95Ms <= proposedWarmP95TargetMs };
  413 |   });
  414 |   await evidence(testInfo, 'local-performance', {
  415 |     measurementScope: 'actual keydown-to-result DOM update using performance.now and MutationObserver; includes local Worker work and UI rendering, excludes Playwright transport time; seven warm sequential samples after two warmups per query',
  416 |     environment: 'single shared macOS host; no controlled mobile/low-end hardware or before/after performance claim',
  417 |     browserVersion: browser.version(), latency, installationPerformance, searchPerformance,
  418 |   });
  419 |   await codeSearch(reopened, '0CF25BE-1500011BA');
  420 |   await reopened.setViewportSize({ width: 390, height: 844 });
  421 |   await screenshot(reopened, testInfo, 'offline-search-390');
  422 |   await evidence(testInfo, 'offline', {
  423 |     browserVersion: browser.version(), installMs, storage, rowCount: 36569,
  424 |     exactCode: '0CF25BE-1500011BA', onlineOfflineResultCount: 11,
  425 |     searchParity: true, shellReopenedWithoutNetwork: true,
  426 |     relaunchScope: profile ? 'temporary persistent WebKit profile: full browser process closed and reopened with offline=true before navigation' : 'page closed and new page opened in the same live browser context; full browser process restart is covered separately by existing Chromium tests',
  427 |     errors, consoleProblems,
  428 |   });
  429 |   expect(errors).toEqual([]);
```