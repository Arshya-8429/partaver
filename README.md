# PartAvar | پارت‌آور

برنامهٔ فارسی RTL جست‌وجوی قطعات، فاکتور، خرید، پکیج و تاریخچهٔ مستند قیمت. SQLite کاتالوگ اصلی را نگه می‌دارد؛ پاسخ‌ها صفحه‌ای هستند و جست‌وجوی آفلاین در Worker و Dexie انجام می‌شود. اسناد کاربر در IndexedDB مستقل می‌مانند.

## دریافت از GitHub همراه دادهٔ آماده

دیتابیس آمادهٔ ۳۶٬۵۶۹ ردیفی با Git LFS در همین مخزن قرار دارد؛ پس از دریافت فایل‌های LFS نیازی به اجرای دوبارهٔ migration یا import نیست. Git LFS باید پیش از کلون نصب باشد:

```sh
git lfs install
git clone https://github.com/Arshya-8429/partaver.git
cd partaver
git lfs pull
```

سپس دستورهای اجرای محلی زیر را اجرا کنید. جزئیات دریافت داده، بررسی سلامت و وضعیت دریافت آفلاین مرورگر در [راهنمای GitHub](docs/github.md) آمده است.

## اجرای محلی

Node.js 24+ و pnpm 11.25.0 لازم‌اند. نصب کامل dependencyها را انجام دهید. better-sqlite3 13 بسته‌های native آماده را همراه خود دارد؛ تنظیم allowBuilds=false برای جلوگیری از rebuild ضمنی غیرضروری pnpm حفظ شده است.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

سایت: http://127.0.0.1:8787/ ؛ برنامه: http://127.0.0.1:8787/app/ . همان فرایند Fastify پاسخ‌های وب، API و snapshot را از یک مبدأ می‌دهد. اجرای بدون NODE_ENV=production برای loopback محلی است. برای توسعه pnpm dev و پورت 5173 وجود دارد؛ PWA نهایی را روی build بررسی کنید. Vite preview ابزار آزمون است.

## اجرای تولیدی

از [راهنمای استقرار](docs/release-deployment.md) استفاده کنید. نمونهٔ نام دامنه را با مقصد واقعی تطبیق دهید:

```sh
pnpm release:credentials --output /secure/partavar/operator.env --origin https://parts.example.invalid --username operator
node --env-file=/secure/partavar/operator.env --import tsx apps/api/src/server.ts
```

env فقط hash رمز تصادفی را دارد؛ فایل جداگانهٔ .login.json نام کاربری و رمز ورود مرورگر را دارد و خصوصی است. در حالت production تنظیم ناقص origin/ورود باعث توقف startup می‌شود. برنامه، API، manifest، snapshot و Service Worker به ورود نیاز دارند. backend فقط روی loopback است؛ Caddy اتصال HTTPS را برقرار می‌کند. الگوهای استقرار در deploy/ قرار دارند.

## داده و پشتیبان

- HTML اصلی و هر سه مرجع master pack محفوظ‌اند. تمام ۳۶٬۵۶۹ ردیف و همهٔ فیلدها/روابط با منبع بررسی می‌شوند؛ هویت و قیمت لجستیک‌های هم‌خانواده مستقل می‌مانند.
- تاریخ و واحد پول ناموجود حدس زده نمی‌شوند. هنوز XLSX واقعی تاریخچهٔ شرکت ارائه نشده؛ وضعیت بدون شاهد خنثی می‌ماند. stage/preview/commit واقعی در [عملیات](docs/operations.md) مستند است.
- اسناد هر مرورگر را از تنظیمات به JSON صادر کنید. کپی SQLite سرور پشتیبان اسناد مرورگر نیست و همگام‌سازی چنددستگاهی ادعا نمی‌شود.
- پس از دریافت آفلاین، داده روی دستگاه مجاز باقی می‌ماند؛ تغییر رمز سرور آن را از دستگاه آفلاین حذف نمی‌کند.

## بررسی و بسته‌بندی

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

برای مرورگرهای آزمون: pnpm exec playwright install chromium firefox webkit . آزمون‌های کامل آفلاین فضای قابل توجهی می‌خواهند؛ WebKit موقت با quota یک گیگابایت دریافت را به‌درستی رد می‌کند و آزمون کامل آن با profile پایدار اجرا می‌شود.

Python3 برای ساخت و بررسی ZIP لازم است. ابزار release از SQLite online backup استفاده می‌کند و موجودی/hash، تمام DBها، منبع و chunkها را پیش از انتشار فایل بررسی می‌کند:

```sh
pnpm release:package --output /private/output/PartAvar-1.0.0-2026-10-28.zip --version 1.0.0 --epoch 1793145600
pnpm release:verify --input /private/output/PartAvar-1.0.0-2026-10-28.zip --sha256 TRUSTED_SHA256
```

آخرین شواهد در [گزارش انتشار](docs/release-verification.md) و محدودیت‌های محیط واقعی در [REMAINING-WORK.md](REMAINING-WORK.md) هستند. [HANDOFF.md](HANDOFF.md)، [عملیات](docs/operations.md) و [استقرار](docs/release-deployment.md) دستورهای اجرا، ارتقا، backup و rollback را دارند. گزارش‌ها و ZIPهای ۲۷ اکتبر شواهد تاریخی‌اند.
