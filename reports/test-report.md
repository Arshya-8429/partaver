# PartsFinder / PartAvar — گزارش آزمون نهایی

تاریخ: ۲۷ اکتبر ۲۰۲۶. نسخهٔ کاتالوگ: `5223b7729f85e7657129cfbad7db83910c827e4ec4e6668e1919be9bebd05480-s1-n1-r1`. اجرای واقعی روی Node 24، pnpm 11.25 و Chrome 156 در این workspace.

## نتیجه

| فرمان/بررسی | نتیجه |
|---|---|
| `pnpm typecheck` | موفق؛ `reports/partavar/final-verified-typecheck.log` |
| `pnpm lint` | موفق؛ `reports/partavar/final-verified-lint.log` |
| `pnpm test:unit` | ۱۲ فایل، ۳۸ آزمون موفق |
| `pnpm test:integration` | ۷ فایل، ۳۱ آزمون موفق؛ شامل migration/round trip و price history |
| `pnpm build` | موفق؛ Fastify و Vite production build |
| `pnpm check:bundle` | موفق؛ shell gzip=14,677 بایت؛ بدون legacy literal، private files یا کاتالوگ در service-worker cache |
| `pnpm exec playwright test` | ۲۰ از ۲۰ آزمون موفق در ۳۸٫۸ ثانیه؛ `reports/partavar/final-e2e.log` |
| `pnpm catalogue:verify ...` | موفق؛ ۳۶٬۵۶۹ ردیف، تطبیق کامل هشت field و metadata، integrity سالم، FK و mismatch صفر |
| Backup و `restore --verify-only` | manifest/hash تأیید؛ ۳۶٬۵۶۹ ردیف query شد، integrity=`ok`, FK=0 |

## آنچه آزموده شد

- کاتالوگ واقعی از SQLite و snapshot دریافت شد؛ نتیجهٔ جست‌وجو، Worker و IndexedDB بررسی شدند. جست‌وجوی آفلاین، reload مرورگر بدون شبکه و صفحه‌بندی محدود موفق شدند.
- جست‌وجوی کد/نام، انتخاب vehicle، نتایج stale، کپی، تم‌ها، جزئیات lazy و related logistics pagination اجرا شدند.
- update لغوشده بین chunkها، خرابی SHA، قفل مشترک دو تب، بستن Chromium در میانهٔ staging و relaunch با profile همان مرورگر و quota تزریقی بررسی شدند. نسخهٔ سالم قبلی در هر خطا حفظ شد.
- بستهٔ قطعات با قیمت و تعداد دستی در IndexedDB ذخیره و باز شد؛ به فاکتور منتقل شد؛ `.xlsx` دوباره با ExcelJS خوانده شد؛ PDF چاپی یک صفحه با اندازهٔ A4 تولید شد.
- فایل XLSX مصنوعی تاریخچه در پایگاه عملیات موقت stage/commit شد؛ timeline و badges در UI بررسی شدند. SQLite کاتالوگ فقط‌خواندنی بود و قیمت siblingهای لجستیکی تغییر نکرد.
- وب‌سایت جدا از برنامه در شش route، دو تم و هفت عرض پاسخ‌گو بررسی شد؛ metadata، route، keyboard، overflow، تصویر و fallback و لینک‌های بدون API آزموده شدند.

## سنجش‌های ثبت‌شده و محدودیت

snapshot decoded برابر 89,939,083 بایت بود؛ IndexedDB در اجرای Chromium حدود 1,291,649,024 بایت استفاده کرد؛ نصب 24.456s، جست‌وجوی گستردهٔ آفلاین 6.358s و صفحهٔ بعدی cacheشده 40ms ثبت شد. این یک اجرای مرورگر است، نه benchmark کنترل‌شده یا مقایسهٔ سرعت قبل/بعد.

هیچ XLSX واقعی شرکت برای تاریخچهٔ قیمت ارائه نشده، پس دادهٔ تاریخی تولیدی وجود ندارد و همهٔ ورودی‌های تاریخچهٔ آزمون ساختگی و موقتی‌اند. Android/WebView واقعی، screen reader، Safari/Firefox، قطع برق یا پرشدن واقعی دیسک، TLS/reverse proxy عملیاتی، APK و انتشار عمومی آزموده/ساخته نشده‌اند.

جزئیات و تصاویر در [`docs/uiux/partavar-final-verification.md`](../docs/uiux/partavar-final-verification.md)، [`reports/e2e-report.json`](e2e-report.json)، [`reports/partavar/migration-verification.log`](partavar/migration-verification.log)، [`reports/partavar/offline-faults.json`](partavar/offline-faults.json) و `reports/uiux/SCREENSHOTS.md` هستند.
