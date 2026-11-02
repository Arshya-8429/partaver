# تحویل و اجرای PartAvar — ۲۸ اکتبر ۲۰۲۶

## شروع روی ماشین تازه

ZIP را در پوشه‌ای مستقل استخراج کنید. Node.js 24+ و pnpm 11.25.0 لازم‌اند؛ Python3 برای ابزار ZIP لازم است. نصب کامل dependencyها، نه prod-only، ضروری است. better-sqlite3 13 binaryهای پشتیبانی‌شده را داخل بسته دارد و تنظیم false مانع rebuild ضمنی pnpm می‌شود.

```sh
pnpm install --frozen-lockfile
pnpm release:verify --input .
pnpm build
pnpm start
```

سایت روی http://127.0.0.1:8787/ و برنامه روی http://127.0.0.1:8787/app/ باز می‌شود. دادهٔ SQLite و snapshotهای واقعی داخل بسته هستند و import مجدد لازم نیست. بررسی موجودی release را پیش از تغییر فایل‌های بسته انجام دهید؛ پس از اجرای برنامه از backup دادهٔ زنده استفاده کنید.

اسناد مرورگر به مبدأ دقیق وابسته‌اند: طرح اتصال، میزبان و پورت. دادهٔ http://127.0.0.1:4173 به‌طور خودکار در http://127.0.0.1:8787 یا دامنهٔ HTTPS تازه دیده نمی‌شود. پیش از تغییر آدرس، در آدرس قبلی از تنظیمات JSON صادر کنید؛ سپس در آدرس جدید، فایل را با پیش‌نمایش و تأیید وارد کنید. کاتالوگ آفلاین روی مبدأ تازه نیز باید دوباره نصب شود. ZIP سورس/SQLite شامل اسناد زندهٔ مرورگر نیست، مگر فایل export آن‌ها جداگانه به تحویل افزوده شده باشد.

## سرور و ورود

[docs/release-deployment.md](docs/release-deployment.md) تولید اعتبار ورود، دادهٔ خصوصی، Caddy/TLS، systemd، ارتقا و rollback را دارد. فایل‌های env/login بیرون release نگه داشته می‌شوند. نام دامنهٔ نمونه باید با مقصد واقعی عوض شود. production با origin/اعتبار ناقص شروع نمی‌شود.

Fastify به loopback محدود است و Caddy فقط reverse proxy می‌کند. فایل‌های پروژه/private-data به شکل فایل عمومی سرو نمی‌شوند. TLS و ورود روی loopback بررسی شده‌اند؛ نصب سرویس، DNS و صدور گواهی عمومیِ مقصد باید همان‌جا تأیید شوند.

## استفادهٔ آفلاین

پس از ورود، در «اطلاعات و دریافت» دریافت آفلاین را آغاز کنید. آماده بودن پس از بررسی پوسته، hash تمام chunkها، شمارها و فعال‌سازی اتمی اعلام می‌شود. قطع/لغو دریافت نسخهٔ سالم قبلی را حذف نمی‌کند. حجم دانلود با مصرف نهایی ایندکس‌های IndexedDB برابر نیست؛ فضای نسخهٔ قبلی هم لازم است.

profile موقت WebKit آزمون حدود یک گیگابایت quota دارد؛ کمبود فضا در آن صادقانه گزارش می‌شود. آزمون کامل WebKit با profile پایدار انجام می‌شود. timeout طولانی‌تر ظرفیت ذخیره ایجاد نمی‌کند.

## Backup، update و rollback

- از اسناد فاکتور/خرید/پکیج هر مرورگر در تنظیمات پشتیبان JSON بگیرید؛ آن‌ها در SQLite سرور نیستند.
- برای کاتالوگ، catalogue:backup و سپس catalogue:restore --verify-only را اجرا کنید. مسیرهای کامل دادهٔ زنده در [عملیات](docs/operations.md) آمده‌اند.
- پس از جابه‌جایی، archive منبع با SHA ثبت‌شده زیر data-root/source-archive پیدا می‌شود و metadata اصلی حفظ می‌شود.
- کاتالوگ جدید: import، verify، publish. تاریخچهٔ شرکت: stage، preview، commit اپراتور؛ قیمت جاری کاتالوگ بازنویسی نمی‌شود.
- برای ارتقای کد، release قبلی و backup دادهٔ زنده را حفظ کنید. DB یا اسناد کاربر را با فایل داخل ZIP تازه جایگزین نکنید. rollback کد، rollback کاتالوگ و restore عملیات جدا هستند.

## بررسی

```sh
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:integration
pnpm build
pnpm check:bundle
pnpm test:e2e
pnpm test:release:browsers
```

تطبیق مستقیم منبع در مقصد:

```sh
pnpm catalogue:verify -- --version 5223b7729f85e7657129cfbad7db83910c827e4ec4e6668e1919be9bebd05480-s1-n1-r1 --file "PartsFinder_Android-28 (1) (1).html"
```

شواهد در [گزارش انتشار](docs/release-verification.md) و reports/release-2026-10-28/ هستند. [REMAINING-WORK.md](REMAINING-WORK.md) وضعیت مقصد واقعی، Android/WebView، Safari و دسترس‌یار را دقیق مشخص می‌کند.
