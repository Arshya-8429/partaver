# راهنمای اجرای PartAvar و عملیات داده

## اجرای محلی

در ریشهٔ پروژه با Node.js 24+ و pnpm 11+:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm dev
```

- وب‌سایت محلی: `http://127.0.0.1:5173/`
- برنامهٔ قطعات: `http://127.0.0.1:5173/app/`
- preview نهایی بعد از build: `http://127.0.0.1:4173/app/`
- API: `http://127.0.0.1:8787`
- وضعیت زنده: `http://127.0.0.1:8787/health/live`
- وضعیت کاتالوگ: `http://127.0.0.1:8787/health/ready`
- OpenAPI JSON: `http://127.0.0.1:8787/api/v1/openapi.json`

برای اجرای build با یک مبدأ، پس از `pnpm build` از `pnpm start` استفاده کنید؛ سایت، `/app/` و API همگی از 8787 پاسخ می‌دهند. Vite preview برای پیش‌نمایش و آزمون نگه داشته شده است. production به origin صریح و اعتبار اپراتور نیاز دارد؛ راهنمای کامل TLS/systemd در [release-deployment.md](release-deployment.md) است.

مسیرهای پیش‌فرض، نسبت به ریشهٔ workspace هستند:

- پایگاه داده: `private-data/sqlite/catalogue.db`
- پایگاه دادهٔ اسناد تاریخی و عملیات قیمت: `private-data/sqlite/operations.db`
- archiveهای اصلی فایل‌های قیمت تاریخی: `private-data/sqlite/price-history-sources/`
- archive و گزارش import: `private-data/`
- snapshotهای immutable: `private-data/snapshots/<version>/`

برای مسیرهای دیگر، API از `CATALOGUE_DB_PATH` و `CATALOGUE_DATA_ROOT` استفاده می‌کند. این API به `127.0.0.1` bind می‌شود؛ متغیر `HOST` را برای شبکهٔ عمومی تنظیم نکنید.

اسناد فاکتور، خرید و پکیج در مرورگر و IndexedDB مستقل `PartAvarOperations` می‌مانند. از «تنظیمات ← خروجی/ورود پشتیبان» فایل JSON پشتیبان بسازید؛ ورود پس از پیش‌نمایش و تأیید، به سوابق می‌افزاید و پیش‌نویس فعلی را جایگزین نمی‌کند. این اسناد خودکار بین دستگاه‌ها همگام نمی‌شوند. `operations.db` برای شواهد قیمت و backup سمت سرور است و جایگزین پشتیبان JSON مرورگر نیست.

IndexedDB به مبدأ کامل (scheme/host/port) وابسته است. انتقال از preview روی `127.0.0.1:4173` به runtime روی `127.0.0.1:8787` یا دامنهٔ HTTPS جدید، فضای مرورگر مستقلی می‌سازد؛ حذف داده در مبدأ قبلی نیست. پیش از تغییر آدرس، JSON اسناد را از آدرس قبلی صادر و در آدرس جدید پس از preview/تأیید وارد کنید. replica کاتالوگ نیز برای مبدأ تازه مستقل نصب می‌شود. بستهٔ سورس و SQLite به اسناد روزمرهٔ profile مرورگر دسترسی خودکار ندارد.

## Import و انتشار نسخهٔ جدید

فایل منبع را ابتدا dry-run کنید، سپس import واقعی، reconciliation کامل، و در پایان publish:

```sh
pnpm catalogue:import -- --file "/absolute/path/to/PartsFinder.html" --dry-run
pnpm catalogue:import -- --file "/absolute/path/to/PartsFinder.html"
pnpm catalogue:verify -- --version VERSION --file "/absolute/path/to/PartsFinder.html"
pnpm catalogue:publish -- --version VERSION
```

از `versionId` خروجی import استفاده کنید. `verify` همهٔ هشت فیلد سطرها، ترتیب رابطه‌ها، metadata، hashها، foreign keyها و `integrity_check` را بررسی می‌کند. `publish` ابتدا snapshotهای immutable را می‌نویسد، اندازه/هش chunkها و بازسازی تمام سطرهای منبع را می‌سنجد و بعد pointer فعال SQLite را اتمی جابه‌جا می‌کند. اگر نسخه منتشر نشود، API نسخهٔ جدیدی را فعال نمی‌بیند.

صفحهٔ وب در شروع و هنگام آنلاین شدن manifest را بررسی می‌کند. کاربر هم می‌تواند دریافت را با دکمهٔ به‌روزرسانی آغاز کند یا لغو کند. نسخهٔ محلی قبلی تا زمان بررسی کامل و فعال‌سازی اتمی نسخهٔ تازه باقی می‌ماند. chunkهای دریافت‌شده با نشانگر تراکنشی، پس از قطع قابل ادامه‌اند.

## Backup و راستی‌آزمایی بازیابی

مسیر خروجی نباید از قبل وجود داشته باشد. هر backup یک پوشه با `catalogue.db`، manifest هش‌دار، snapshotهای ثبت‌شده و archiveهای منبع می‌سازد:

```sh
pnpm catalogue:backup -- --output "private-data/backups/partavar-YYYY-MM-DD"
pnpm catalogue:restore -- --input "private-data/backups/partavar-YYYY-MM-DD" --verify-only
```

Backup از SQLite online backup استفاده می‌کند، سپس هش و اندازهٔ DB و تک‌تک artifactها را در `backup-manifest.json` می‌نویسد. `restore --verify-only` کپی جداگانه‌ای می‌سازد، integrity و foreign key و قابلیت query را می‌سنجد و آن را حذف می‌کند؛ DB فعال را جایگزین نمی‌کند. برای بازیابی واقعی، ابتدا API را متوقف کنید، backup را به مسیر خصوصی برگردانید، مسیر archive را در محیط مقصد تنظیم و `catalogue:verify` و `/health/ready` را قبل از راه‌اندازی دوباره اجرا کنید. هیچ فرمان خودکاری برای جایگزینی مخرب DB فعال وجود ندارد.

## Rollback

نسخه‌های قبلی و snapshotهایشان حفظ می‌شوند. شناسهٔ نسخهٔ قبلی را از خروجی import/publish، `catalogue_versions` یا گزارش مهاجرت بردارید:

```sh
pnpm catalogue:rollback -- --version PREVIOUS_VERSION
```

rollback پیش از تغییر pointer، manifest و تمام chunkهای نسخهٔ هدف را بررسی می‌کند. درخواست‌هایی که به نسخهٔ مشخص pin شده‌اند، تا وقتی آن نسخه حفظ است قابل پاسخ‌گویی‌اند. این دستور rollback دادهٔ IndexedDB مرورگر را از راه دور حذف نمی‌کند؛ مرورگر وقتی آنلاین شود نسخهٔ فعال را می‌گیرد.

## ورود تاریخچهٔ قیمت شرکت

فایل شرکت باید XLSX بازبینی‌شده داشته باشد؛ فایل واقعی هنوز ارائه نشده و بنابراین هیچ سابقهٔ تولیدی وارد نشده است. زمان import جای تاریخ مؤثر را نمی‌گیرد. برای شروع، ستون‌ها را با mapping صریح ببینید:

```sh
pnpm partavar:prices inspect --source "/absolute/path/company-history.xlsx"
```

نمونهٔ mapping `reports/partavar/price-history-test-mapping.json` فقط برای fixture آزمون ساخته شده است؛ پیش از استفاده، نام sheet/ستون‌ها، تاریخ‌های گریگوری صریح، ارز، حروف صفر ابتدایی و معنای قیمت را با اصل شرکت بازبینی کنید. نمونه را برای دادهٔ شرکت کپی و تصحیح کنید. قیمت/کد بزرگ را در Excel به‌صورت Text نگه دارید. `.xls`، تبدیل خودکار تاریخ شمسی و تاریخ حدس‌زده پذیرفته نمی‌شود.

```sh
pnpm partavar:prices stage --source "/absolute/path/company-history.xlsx" --mapping "/absolute/path/reviewed-mapping.json" --version 5223b7729f85e7657129cfbad7db83910c827e4ec4e6668e1919be9bebd05480-s1-n1-r1
pnpm partavar:prices preview --batch BATCH_ID
pnpm partavar:prices commit --batch BATCH_ID --actor "نام اپراتور" --reason "دلیل تأیید منبع"
```

تنها پس از بررسی گزارش preview، با شناسهٔ اپراتور و دلیل واقعی commit کنید. تطبیق لجستیکی دقیق مرجع است؛ کد فنی مشترک با چند لجستیک مبهم باقی می‌ماند. هیچ مسیر HTTP برای نوشتن/آپلود وجود ندارد. SQLite کاتالوگ فقط‌خواندنی باز می‌شود و قیمت فعلی تغییر نمی‌کند. خروجی رنگ‌ها رشد تاریخی است، سود یا حاشیهٔ سود نیست.

برای برگشت batch ثبت‌شده از `rollback --batch BATCH_ID --actor ... --reason ...` استفاده کنید. برای مشاهدهٔ شواهد واقعی و گزارش شمارها:

```sh
pnpm partavar:prices backup --output "/private/backups/partavar-operations-YYYY-MM-DD"
pnpm partavar:prices restore --backup "/private/backups/partavar-operations-YYYY-MM-DD" --operations "/private/restore/operations.db"
```

خروجی مسیر تازه می‌خواهد. این پایگاه شامل جداول عملیاتی و تاریخچه است؛ JSON اسناد کاربر هر مرورگر را نیز جداگانه export کنید. گزینه‌های کامل، mapping و hash هر فایل در [گزارش ورود تاریخچه](/Users/barmana/Documents/E/behrad/docs/price-history-import-report.md) آمده‌اند.

## بررسی

```sh
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:integration
pnpm build
pnpm check:bundle
pnpm benchmark -- --source "PartsFinder_Android-28 (1) (1).html" --version VERSION
pnpm test:e2e
```

`test:e2e` Chrome نصب‌شده را باز می‌کند؛ آزمون نصب کامل حدود ۹۰ مگابایت دادهٔ snapshot و حدود ۱٫۲۹GB IndexedDB در profile موقت مصرف می‌کند. تصاویر و گزارش‌های همین کار در `reports/partavar/` و `reports/uiux/` هستند.

## نتایج ثبت‌شده در این workspace

- `reports/partavar/final-e2e.log`: اجرای نهایی Playwright، ۲۰ از ۲۰.
- `reports/partavar/migration-verification.log`: تطبیق هر هشت فیلد، metadata، تمام ردیف‌ها و کنترل‌های SQLite.
- `reports/e2e-report.json`: snapshot decoded برابر 89,939,083 بایت؛ مصرف IndexedDB برابر 1,291,649,024 بایت؛ نصب ثبت‌شده 24.456s؛ جست‌وجوی گستردهٔ آفلاین 6.358s و صفحهٔ بعدی cacheشده 40ms. اعداد یک اجرای مرورگرند، نه benchmark کنترل‌شده.
- `reports/partavar/final-bundle.log`: در گزارش تاریخی ۲۷ اکتبر subtotal ورودی HTML/CSS/index برابر 14,677 بایت gzip و کل JS برابر 121,669 بایت بود. subtotal شامل bootstrap پویا/Worker نبود و معیار کامل startup نیست. gate فعلی تمام JS/CSS/HTML خروجی را با هم می‌سنجد؛ گزارش تازه در `reports/release-2026-10-28/final-bundle.json` است.
- Backup واقعی و restore-only تأییدشده در `private-data/backups/partavar-release-2026-10-27/` و `reports/partavar/final-release-restore-verification.log` است.

این سنجش‌های تاریخی baseline هم‌شرایطی از HTML قدیمی ندارند و ادعای بهبود قبل/بعد نیستند. در آماده‌سازی ۲۸ اکتبر Firefox، WebKit، quota واقعی profile موقت، هماهنگی تب‌ها، مالک منقضی‌شدهٔ update، Basic auth، CSP، دریافت بومی manifest و TLS/reverse proxy محلی نیز بررسی شدند؛ نتیجه و مرز هر آزمون در [release-verification.md](release-verification.md) ثبت می‌شود. Android/WebView واقعی، Safari محصول نهایی، screen reader، قطع برق فیزیکی/پرشدن دیسک و استقرار عمومی از این آزمون‌ها نتیجه نمی‌شوند.

## مرز انتشار

احراز هویت در Fastify پیاده‌سازی و با مسیرهای واقعی search، manifest، snapshot و پوسته آزموده شده است. در production، تنظیم ناقص origin/اعتبار ورود سرویس را متوقف می‌کند. رمز تصادفی با `release:credentials` ساخته می‌شود؛ env فقط SHA-256 دارد. CSP، کنترل Host/Origin، routeهای محدود static و binding به loopback مرز اجرایی هستند. [راهنمای انتشار](release-deployment.md) تنظیم HTTPS در Caddy، env خصوصی و روند استقرار را دارد. TLS محلی با CA صریح بررسی شد؛ DNS، گواهی عمومی و سرویس مقصد هنوز اجرا نشده‌اند. دادهٔ کاتالوگ پس از دریافت در دستگاه مجاز قابل خواندن است و هنگام آفلاین بودن از راه دور قابل پس‌گرفتن نیست.
