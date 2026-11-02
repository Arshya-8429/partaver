# گزارش آماده‌سازی انتشار PartAvar 1.0.0

تاریخ: ۲۸ اکتبر ۲۰۲۶. این تحویل، کد و داده و پیکربندی آمادهٔ استقرار خصوصی را پوشش می‌دهد. انتشار عمومی، پذیرش دستگاه Android و تأیید دستی دسترس‌یار اجرا نشده‌اند؛ وضعیت دقیق در [REMAINING-WORK.md](../REMAINING-WORK.md) است.

## نتیجه و شواهد

| بررسی | نتیجهٔ واقعی | مدرک |
| --- | --- | --- |
| TypeScript، ESLint، build | موفق | [typecheck](../reports/release-2026-10-28/final-typecheck.log)، [lint](../reports/release-2026-10-28/final-lint.log)، [build](../reports/release-2026-10-28/final-build.log) |
| واحد و یکپارچه | ۸۷ از ۸۷، ۲۳ فایل | [اجرای نهایی](../reports/release-2026-10-28/final-core-suite.log) |
| مجموعهٔ کامل Chromium | ۲۵ از ۲۵ روی build پس از اصلاح ResizeObserver | [اجرای نهایی](../reports/release-2026-10-28/final-e2e.log) |
| مرورگرهای انتشار | ۲۷ سناریوی یکتا، ۹ برای هر موتور، آخرین نتیجهٔ مرتبط موفق | [ماتریس شواهد](../reports/release-2026-10-28/browser/combined-case-matrix.json)، [شرح اجرا](../reports/release-2026-10-28/browser/browser-release-report.md) |
| مهاجرت فعال | ۳۶٬۵۶۹ ردیف، تطبیق همهٔ هشت فیلد/metadata، اختلاف صفر، integrity سالم و صفر FK | [تطبیق](../reports/release-2026-10-28/migration-verification.json) |
| backup و restore | نسخهٔ تازه؛ ۳۶٬۵۶۹ ردیف قابل query، manifest معتبر | [backup](../reports/release-2026-10-28/catalogue-backup.json)، [restore](../reports/release-2026-10-28/restore-verification.json) |
| مرز frontend | کل JS/CSS/HTML خروجی ۱۳۵٬۵۸۴ بایت gzip؛ کاتالوگ/فایل خصوصی در bundle یا cache پوسته نیست | [گزارش bundle](../reports/release-2026-10-28/final-bundle.json) |
| وابستگی‌ها | advisory گزارش‌شده صفر پس از نصب نسخه‌های اصلاح‌شده | [audit](../reports/release-2026-10-28/dependency-audit-final.json) |
| اجرای امن و manifest نصب | app/API/snapshot محافظت‌شده، CSP و manifest بومی credentialed، PNG واقعی ۱۹۲/۵۱۲ | [production](../reports/release-2026-10-28/production/)، [manifest](../reports/release-2026-10-28/production/install-manifest.json) |
| HTTPS و reverse proxy محلی | Caddy رسمی با checksum، template معتبر، ۲۱ بررسی و TLS 1.3 با CA صریح | [شواهد TLS](../reports/release-2026-10-28/tooling/local-tls-proxy.json) |
| نصب روی پوشهٔ تازه | ۴۰۲ دانلود/صفر reuse؛ نصب frozen، SQLite/FTS5، verify/build و ۲۳ بررسی runtime؛ SIGTERM با exit 0 | [نصب مستقل](../reports/release-2026-10-28/tooling/clean-install-verification.json) |
| دسترس‌پذیری خودکار | ۳۶ حالت در هر موتور، ۱۰۸ audit نهایی بدون violation؛ کیبورد/بزرگ‌نمایی/دو تم بررسی شدند | [گزارش مرورگر](../reports/release-2026-10-28/browser/browser-release-report.md) |

ماتریس ۲۷تایی از اجرای اولیه و اجرای اصلاحی مرتبط تشکیل شده است؛ اجرای اولیه ۲۱ موفق و ۶ ناموفق داشت. خطای اندازه‌گیری inline در Firefox، quota واقعی profile موقت WebKit و عبور درخواست fixture از Service Worker در گزارش حفظ شده‌اند. اصلاح خطای واقعی ResizeObserver با آزمون قرمز و اجرای نهایی سبز ثبت شده است. این تفاوت‌ها به‌عنوان یک اجرای واحدِ بدون خطا بازنویسی نشده‌اند.

## اصلاح‌های مؤثر

- تمام نوشتن‌های staging/chunk/status/activation آفلاین با همان تراکنش IndexedDB به مالک معتبر قفل مقید شدند؛ تب منقضی‌شده وضعیت نسخهٔ سالمِ تب دیگر را خراب نمی‌کند. [قرمز](../reports/release-2026-10-28/lease-race-red-state.json) و [سبز](../reports/release-2026-10-28/lease-race-state.json).
- نشان‌ها و عمل‌های تاریخچه همیشه شناسهٔ ردیف و نسخهٔ کاتالوگ را با هم استفاده می‌کنند. تب‌ها پس از فعال‌سازی نسخه، pointer را از Worker می‌خوانند و نتایج قدیمی را کنار می‌گذارند.
- skip link، نام دسترس‌پذیر برند، چیدمان کارت در بزرگ‌نمایی، favicon و حلقهٔ ResizeObserver اصلاح شدند؛ حرکت و تغییر اندازه از تحویل observer جدا شد.
- Fastify build را با routeهای مشخص سرو می‌کند؛ source/SQLite/.env و metadata ساخت از مسیر عمومی قابل دریافت نیستند. production تنظیم ناقص را رد می‌کند؛ رمز اپراتور تصادفی و فایل آن خصوصی است.
- دریافت بومی manifest مرورگر بدون crossorigin قبلاً ۴۰۱ می‌گرفت؛ use-credentials و آیکون‌های نصب افزوده و با CDP روی احراز هویت واقعی بررسی شدند.
- backup پس از جابه‌جایی منبع را با SHA پیدا می‌کند؛ بسته‌ساز DB را آنلاین کپی، sidecar و secretها را حذف و همهٔ محتوا را پیش از ایجاد فایل نهایی بررسی می‌کند.

## کارایی و ظرفیت

اندازهٔ bundle یک bound محافظه‌کارانه بر همهٔ JS/CSS/HTML خروجی است، نه عدد کوچکِ index اولیه. Resource Timing نهایی app حدود ۱۱۹٬۹۸۷ بایت و سایت حدود ۲۱٬۲۴۴ بایت کد فشرده مشاهده کرد؛ حدود ۹۱۲ بایت HTML جداست و scope این نمونه SW bootstrap را شامل نمی‌شود. [نمونهٔ نهایی شبکه](../reports/release-2026-10-28/browser/final-startup-resources.json).

در سنجش گرم با دو warmup و هفت نمونه، p95 کد دقیق حدود ۳ تا ۱۱٫۴ms، عبارت قطعه ۱۲ تا ۱۹٫۶ms و خودرو+قطعه ۱۲ تا ۱۸ms بود. scope نسخهٔ ساخت هر نمونه در [گزارش performance](../reports/release-2026-10-28/browser/performance-summary.json) آمده؛ این اعداد پیشرفت نسبت به HTML اصلی یا تضمین گوشی نیستند. query گستردهٔ نخست حدود ۸–۹s بود و به‌صراحت حفظ می‌شود. [API benchmark تازه](../reports/release-2026-10-28/api-benchmark.json) اندازه‌گیری جداگانهٔ Node/Worker است.

نصب در Chromium حدود ۲۳٫۴s، Firefox حدود ۳۹٫۱s و WebKit پایدار حدود ۹۹٫۱s طول کشید. مصرف مشاهده‌شده به ترتیب حدود ۱٫۲۹، ۱٫۱۶ و ۰٫۷۴GB بود. WebKit موقت با quota یک GB نصب را ایمن رد می‌کند؛ profile پایدار quota کافی داشت. بار سیستم مشترک و تفاوت موتور/نسخهٔ ساخت در گزارش‌ها مشخص‌اند.

## بازبینی و تصاویر

[بازبینی مستقل](../reports/release-2026-10-28/final-independent-review.md) مورد Critical پیدا نکرد و دو مورد Important، manifest credentialed و runbook متناقض، را ثبت کرد. وضعیت بستن آن‌ها و تصمیم‌های اجرایی در [review-resolution.md](../reports/release-2026-10-28/review-resolution.md) است.

- [موبایل روشن](../reports/release-2026-10-28/browser/final-app-light-390.png) و [کارت کامل موبایل](../reports/release-2026-10-28/browser/final-app-results-light-390.png)
- [موبایل تیره](../reports/release-2026-10-28/browser/final-app-dark-390.png)
- [دسکتاپ روشن](../reports/release-2026-10-28/browser/final-app-light-1440.png) و [دسکتاپ تیره](../reports/release-2026-10-28/browser/final-app-dark-1440.png)
- تصاویر قبل و بعد طراحی با query یکسان در [SCREENSHOTS.md](../reports/uiux/SCREENSHOTS.md) محفوظ‌اند.

## بستهٔ تحویل

نام فایل نهایی PartAvar-1.0.0-2026-10-28.zip است. release-manifest.json داخل آن hash و اندازهٔ هر فایل را دارد. checksum SHA-256 و receipt راستی‌آزمایی کل ZIP کنار فایل نهایی قرار می‌گیرند؛ hash خود ZIP داخل خودش درج نمی‌شود. تولید ZIP پس از این گزارش و با استخراج/verify مستقل انجام می‌شود. فایل‌های بسته‌بندی‌شده شامل سورس، build، دادهٔ SQLiteِ کپی‌شدهٔ سازگار، snapshotها، تمام منابع اصلی، آزمون‌ها، گزارش‌ها، راهنمای عملیات و REMAINING-WORK.md هستند. dependency نصب‌شده، secret واقعی و sidecar گذرا وارد ZIP نمی‌شوند.

پذیرش فیزیکی Android/Safari، TalkBack/VoiceOver، ورودی قیمت شرکت و نصب/DNS/TLS عمومی مقصد انجام نشده‌اند. [فهرست اقدامات مقصد](../REMAINING-WORK.md) این موارد را با دلیل و اقدام بعدی دارد. هیچ انتشار عمومی، push یا APK انجام نشده است.

اسناد زندهٔ مرورگر در SQLite کاتالوگ نیستند؛ به scheme/host/port همان مرورگر وابسته‌اند و این ZIP آن‌ها را خودکار از profile شخصی صادر نکرده است. پیش از تغییر آدرس از 4173 به 8787 یا دامنهٔ تازه، روند JSON export/import در HANDOFF را اجرا کنید.
