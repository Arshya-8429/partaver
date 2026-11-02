# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: browser.spec.ts >> full catalogue installs and offline shell relaunch preserves search parity in real IndexedDB
- Location: tests/release/browser.spec.ts:329:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 5

- Array []
+ Array [
+   "ResizeObserver loop completed with undelivered notifications.",
+   "ResizeObserver loop completed with undelivered notifications.",
+   "ResizeObserver loop completed with undelivered notifications.",
+ ]
```

# Test source

```ts
  326 |   expect(problems).toEqual([]);
  327 | });
  328 | 
  329 | test('full catalogue installs and offline shell relaunch preserves search parity in real IndexedDB', async ({ browser, browserName }, testInfo) => {
  330 |   test.setTimeout(12 * 60 * 1000);
  331 |   // WebKit's ephemeral profile reports a 1GB quota; the complete installed catalogue
  332 |   // needs more. A clean persistent profile exercises real disk storage and process restart.
  333 |   const profile = browserName === 'webkit' ? await mkdtemp(join(tmpdir(), 'partavar-release-webkit-')) : null;
  334 |   let context = profile ? await webkit.launchPersistentContext(profile, { headless: true, serviceWorkers: 'allow' }) : await browser.newContext({ serviceWorkers: 'allow' });
  335 |   const page = await context.newPage();
  336 |   try {
  337 |   const errors: string[] = [];
  338 |   const consoleProblems: string[] = [];
  339 |   let intentionalOffline = false;
  340 |   page.on('pageerror', error => errors.push(error.message));
  341 |   page.on('console', message => { if (!intentionalOffline && (message.type() === 'warning' || message.type() === 'error')) consoleProblems.push(message.text()); });
  342 |   await onlineApp(page);
  343 |   await codeSearch(page, '0CF25BE-1500011BA');
  344 |   const onlineCards = await page.locator('#cards .resultCard').allTextContents();
  345 |   await observePerformance(page);
  346 |   await page.locator('#catalogueInfo summary').click();
  347 |   const started = Date.now();
  348 |   await page.locator('#catalogueUpdateButton').click();
  349 |   await page.waitForFunction(() => {
  350 |     const state = document.getElementById('catalogueStatusText')?.dataset.state;
  351 |     return state === 'ready' || (state === 'online' && (document.getElementById('catalogueCancelButton') as HTMLButtonElement).hidden);
  352 |   }, undefined, { timeout: 10 * 60 * 1000 });
  353 |   await evidence(testInfo, 'install-outcome', { state: await page.locator('#catalogueStatusText').getAttribute('data-state'), details: await page.locator('#catalogueStatusMeta').innerText(), profile: profile ? 'isolated persistent profile' : 'isolated ephemeral context' });
  354 |   await expect(page.locator('#catalogueStatusText')).toHaveAttribute('data-state', 'ready');
  355 |   const installMs = Date.now() - started;
  356 |   await expect(page.locator('#dbCount')).toHaveText('۳۶٬۵۶۹');
  357 |   await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  358 |   const storage = await page.evaluate(async () => ({
  359 |     estimate: await navigator.storage.estimate(),
  360 |     caches: await caches.keys(),
  361 |     secureContext: isSecureContext,
  362 |     controller: Boolean(navigator.serviceWorker.controller),
  363 |   }));
  364 |   const installationPerformance = await performanceMeasurements(page);
  365 |   intentionalOffline = true;
  366 |   if (profile) {
  367 |     await context.close();
  368 |     context = await webkit.launchPersistentContext(profile, { headless: true, offline: true, serviceWorkers: 'allow' });
  369 |   } else {
  370 |     await context.setOffline(true);
  371 |     await page.close();
  372 |   }
  373 |   const reopened = await context.newPage();
  374 |   reopened.on('pageerror', error => errors.push(error.message));
  375 |   await reopened.goto('/app/', { waitUntil: 'domcontentloaded' });
  376 |   await expect(reopened.locator('#dbCount')).toHaveText('۳۶٬۵۶۹');
  377 |   expect(await reopened.evaluate(() => navigator.onLine)).toBe(false);
  378 |   await codeSearch(reopened, '0CF25BE-1500011BA');
  379 |   await expect(reopened.locator('#cards .resultCard')).toHaveCount(11);
  380 |   expect(await reopened.locator('#cards .resultCard').allTextContents()).toEqual(onlineCards);
  381 |   await observePerformance(reopened, true);
  382 |   for (const query of ['111100001AA-01', 'واتر پمپ', '150']) {
  383 |     for (let trial = 0; trial < 9; trial++) {
  384 |       await codeSearch(reopened, query);
  385 |       await settleLayout(reopened);
  386 |     }
  387 |   }
  388 |   await reopened.locator('#partTab').click();
  389 |   await reopened.locator('#vehicle').fill('X33 Cross CVT');
  390 |   await expect(reopened.locator('.vehicleOption').first()).toBeVisible();
  391 |   await reopened.locator('#vehicle').press('Enter');
  392 |   for (let trial = 0; trial < 9; trial++) {
  393 |     await reopened.locator('#partQuery').fill('سپر');
  394 |     await reopened.locator('#partQuery').press('Enter');
  395 |     await expect(reopened.locator('#cards .resultCard').first()).toBeVisible();
  396 |     await settleLayout(reopened);
  397 |   }
  398 |   const searchPerformance = await performanceMeasurements(reopened);
  399 |   const latency = [
  400 |     { label: 'exact logistics code', query: '111100001AA-01', mode: 'global', proposedWarmP95TargetMs: 150 },
  401 |     { label: 'part phrase', query: 'واتر پمپ', mode: 'global', proposedWarmP95TargetMs: 300 },
  402 |     { label: 'broad three-character code', query: '150', mode: 'global', proposedWarmP95TargetMs: null },
  403 |     { label: 'vehicle-filtered part', query: 'سپر', mode: 'vehiclePart', proposedWarmP95TargetMs: 300 },
  404 |   ].map(({ label, query, mode, proposedWarmP95TargetMs }) => {
  405 |     const measurements = searchPerformance.search.filter(sample => sample.query === query && sample.mode === mode);
  406 |     expect(measurements).toHaveLength(9);
  407 |     const warm = measurements.slice(2).map(sample => sample.durationMs).sort((a, b) => a - b);
  408 |     const p95Ms = warm[Math.ceil(warm.length * .95) - 1]!;
  409 |     return { label, query, mode, warmupSamples: measurements.slice(0, 2), warmSamplesMs: warm, p95Ms, proposedWarmP95TargetMs, meetsProposedTarget: proposedWarmP95TargetMs === null ? null : p95Ms <= proposedWarmP95TargetMs };
  410 |   });
  411 |   await evidence(testInfo, 'local-performance', {
  412 |     measurementScope: 'actual keydown-to-result DOM update using performance.now and MutationObserver; includes local Worker work and UI rendering, excludes Playwright transport time; seven warm sequential samples after two warmups per query',
  413 |     environment: 'single shared macOS host; no controlled mobile/low-end hardware or before/after performance claim',
  414 |     browserVersion: browser.version(), latency, installationPerformance, searchPerformance,
  415 |   });
  416 |   await codeSearch(reopened, '0CF25BE-1500011BA');
  417 |   await reopened.setViewportSize({ width: 390, height: 844 });
  418 |   await screenshot(reopened, testInfo, 'offline-search-390');
  419 |   await evidence(testInfo, 'offline', {
  420 |     browserVersion: browser.version(), installMs, storage, rowCount: 36569,
  421 |     exactCode: '0CF25BE-1500011BA', onlineOfflineResultCount: 11,
  422 |     searchParity: true, shellReopenedWithoutNetwork: true,
  423 |     relaunchScope: profile ? 'temporary persistent WebKit profile: full browser process closed and reopened with offline=true before navigation' : 'page closed and new page opened in the same live browser context; full browser process restart is covered separately by existing Chromium tests',
  424 |     errors, consoleProblems,
  425 |   });
> 426 |   expect(errors).toEqual([]);
      |                  ^ Error: expect(received).toEqual(expected) // deep equality
  427 |   expect(consoleProblems).toEqual([]);
  428 |   } finally {
  429 |     await context.close();
  430 |     if (profile) await rm(profile, { recursive: true, force: true });
  431 |   }
  432 | });
  433 | 
```