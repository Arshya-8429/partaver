# گزارش مهاجرت کاتالوگ PartsFinder

## منبع و نتیجه

- منبع اصلی: `PartsFinder_Android-28 (1) (1).html`
- SHA-256 منبع و archive: `5223b7729f85e7657129cfbad7db83910c827e4ec4e6668e1919be9bebd05480`
- شناسهٔ کاتالوگ: `5223b7729f85e7657129cfbad7db83910c827e4ec4e6668e1919be9bebd05480-s1-n1-r1`
- وضعیت: SQLite مهاجرت شده، snapshot تولید و پس از بررسی منتشر شده است.
- مسیر DB محلی: `private-data/sqlite/catalogue.db`
- archive immutable: `private-data/source-archive/5223b7729f85e7657129cfbad7db83910c827e4ec4e6668e1919be9bebd05480.html`
- گزارش خام import: `private-data/imports/<version>/migration-report.json`

## شمارش و تطبیق

| میدان | مقدار منبع/SQLite |
|---|---:|
| سطرهای کاتالوگ | 36,569 |
| کد فنی متمایز | 31,509 |
| کد لجستیکی | 36,569 |
| نام قطعه | 13,045 |
| مدل خام خودرو | 119 |
| رابطهٔ سطر و مدل | 192,630 |
| friendly label | 59,116 |
| alias | 738 |
| سطر بدون مدل | 1,809 |
| سطر دارای replacement | 5,883 |
| کد فنی دارای چند قیمت | 3,750 |
| مجموع خام قیمت | 5,416,428,982,434 |

نتیجهٔ `catalogue:verify`: هر هشت hash فیلد تطبیق، hash metadata و full database برابر؛ سطر/hash ناسازگار صفر؛ اختلاف گردکردن قیمت صفر؛ `PRAGMA integrity_check=ok`؛ تخلف foreign key صفر؛ گروه collision نرمال‌شده صفر. واحد پول و تاریخ مؤثر در منبع موجود نبود، بنابراین `currencyUnit=UNKNOWN` و `priceEffectiveAt=null` مانده‌اند.

## انتشار snapshot

- حجم decoded snapshot: 89,939,083 بایت
- chunkها: 1,103؛ هر chunk حداکثر 512 KiB decoded و 500 رکورد
- hash بازسازی کل سطرهای منبع از snapshot: 36,569 سطر بررسی شد، بدون اختلاف
- SHA-256 manifest: `5657324a6bb8e1847198657943961762396790a48521d3eb0be7d0b2c991ab4f`
- مسیر: `private-data/snapshots/<version>/`

نمونهٔ رفتار دادهٔ حساس: جست‌وجوی `0CF25BE-1500011BA` پنج کد لجستیکی همان قطعه را جداگانه نشان داد و قیمت‌های پایهٔ متفاوت (`3,649,644,321` و `2,386,956,000`) را در سطرهای مربوط به خود نگه داشت؛ هیچ قیمت یا سازگاری بین siblingها ادغام نشد.

## آزمون و اندازه‌گیری واقعی

- راستی‌آزمایی مستقل و تازه در `reports/partavar/migration-verification.log`: تطبیق هر 8 hash فیلد، full-database hash، metadata، همهٔ ردیف‌ها، `integrity_check=ok` و صفر foreign-key violation.
- آخرین آزمون واحد: 38/38؛ آزمون یکپارچه: 31/31؛ آزمون مرورگر: 20/20. شامل مهاجرت و round trip منبع کامل، import تکرارپذیر، API/search، انتشار و rollback، خرابی هش، قفل چندتب، بستن مرورگر و relaunch، quota تزریقی، انتقال سند، XLSX/A4 و retry آفلاین.
- آزمون مرورگر نصب 36,569 ورودی، Worker، Service Worker و IndexedDB واقعی را بررسی کرد؛ جست‌وجوی آفلاین و relaunch بدون شبکه موفق شدند. لغو update بین chunkها نسخهٔ قبلی را فعال نگه داشت. گزارش کامل: `reports/partavar/final-e2e.log` و `reports/e2e-report.json`.
- پوستهٔ شروع HTML+CSS+JS: 14,677 بایت gzip؛ کل JS بارگذاری‌پذیر برنامه: 121,669 بایت gzip. آزمون bundle، literal قدیمی، فایل خصوصی و کاتالوگ در cache سرویس‌ورکر پیدا نکرد.
- سنجش API روی Node.js v24.19، macOS arm64، Apple M4: کد دقیق p95=4.32ms، عبارت نام p95=12.43ms، جست‌وجوی نام خودرو p95=43.23ms (۷ نمونه برای هرکدام). fallback کد دوحرفی p95=127.60ms و بدون threshold بود.
- سنجش ثبت‌شدهٔ Chromium: snapshot decoded برابر 89,939,083 بایت، مصرف IndexedDB برابر 1,291,649,024 بایت، نصب 24.456s، جست‌وجوی گستردهٔ آفلاین 6.358s و صفحهٔ دوم cacheشده 40ms. برآورد preflight 18× decoded size است؛ زمان‌ها از یک اجرا هستند، نه benchmark کنترل‌شده.
- backup نهایی 323,524,253 بایت، 1,105 artifact و SHA-256 برابر `19e280e4c05664adde1af4d1f3cc584e87315fcd64bab1c69031f5f504d35c69`؛ restore-only روی نسخهٔ همین workspace، 36,569 ردیف را query کرد، integrity=`ok` و FK violation=0 داشت. در `private-data/backups/partavar-release-2026-10-27` محفوظ است.

فایل‌های گزارش ماشین‌خوان در پوشهٔ `reports/` هستند؛ جمع‌بندی فرمان‌ها در `reports/test-report.md` آمده است.

## محدودیت‌های باقی‌مانده

- خانواده‌های کد محاسباتی‌اند و در خروجی با `verified:false` می‌آیند.
- هیچ APK یا استقرار عمومی انجام نشده است.
- تست روی گوشی Android واقعی، WebView، TLS و reverse proxy خصوصی در این محیط اجرا نشده‌اند.
- baseline هم‌شرایط از HTML قدیمی و سنجش Long Task مرورگر ثبت نشده است. قطع واقعی برق/فرایند، پرشدن دیسک و quota واقعی دستگاه آزمون نشده؛ quota UI با stub محدود در Worker بررسی شده است.
- روی Android/WebView، screen reader و مرورگرهای Safari/Firefox آزمون نشده است. کروم دسکتاپ با viewport موبایل و بزرگ‌نمایی بررسی شده.
- جست‌وجوی گستردهٔ آفلاینِ بار اول در اجرای ثبت‌شده 6.358s طول کشید؛ صفحهٔ دوم cacheشده 40ms بود. این fallback را با latency API اشتباه نگیرید.
- ضریب 18× فضای ذخیره‌سازی بر اساس اندازه‌گیری یک Chromium و این نسخهٔ کاتالوگ است؛ اندازه‌گیری روی مرورگر/گوشی Android واقعی لازم است.
- این گزارش ادعای بهبود سرعت نسبت به نسخهٔ قدیمی نمی‌کند.
