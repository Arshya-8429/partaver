# بستهٔ انتشار و استقرار خصوصی PartAvar

نسخهٔ آماده‌سازی `1.0.0` است. این راهنما و فایل‌های `deploy/` پیکربندی قابل بازبینی هستند؛ نصب سرویس روی سرور، DNS، صدور گواهی عمومی TLS یا انتشار عمومی در این workspace انجام نشده است. reverse proxy و TLS محلی جداگانه آزموده شده‌اند؛ جزئیات در بخش شواهد پایین آمده است. گزارش دستگاه‌ها و مرورگرهای آزموده‌نشده و دادهٔ واقعی قیمت در `REMAINING-WORK.md` باقی می‌ماند.

## ساخت بستهٔ قابل بازیابی

Node.js 24+، pnpm 11.25.0 و Python 3 لازم‌اند. SQLite native module و `tsx` در dependencyهای پروژه هستند، بنابراین نصب کامل لازم است؛ از نصب فقط production dependencyها استفاده نکنید. در ریشهٔ منبع:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:integration
pnpm build
pnpm check:bundle
pnpm test:e2e
pnpm release:package --output "/private/output/PartAvar-1.0.0-2026-10-28.zip" --epoch 1793145600 --version 1.0.0 --report "/private/output/release-package-2026-10-28.json"
```

نسخهٔ قفل‌شدهٔ `better-sqlite3@13.0.3` باینری‌های N-API را داخل خود بستهٔ npm همراه دارد؛ loader ابتدا `prebuilds/<platform>-<arch>.node` را انتخاب می‌کند. `allowBuilds.better-sqlite3: false` در `pnpm-workspace.yaml` عمدی است: از اجرای ضمنی و غیرضروری `node-gyp rebuild` توسط pnpm جلوگیری می‌کند و باینری همراه را حذف نمی‌کند. این رفتار در [گزارش upstream نسخهٔ ۱۳](https://github.com/WiseLibs/better-sqlite3/issues/1503) و [تعریف رسمی بسته](https://github.com/WiseLibs/better-sqlite3/blob/v13.0.3/package.json) قابل بررسی است. پیش از راه‌اندازی روی میزبان مقصد، بارگذاری واقعی را بسنجید:

```sh
node --input-type=module -e 'import Database from "better-sqlite3"; const db = new Database(":memory:"); console.log(db.prepare("SELECT sqlite_version()").pluck().get()); db.close();'
```

اگر platform/architecture میزبان باینری سازگار نداشته باشد، آن میزبان هنوز تأییدشده نیست. build از source به ابزارهای compiler/linker نیاز دارد: Python 3 و make/C++ در Linux، Command Line Tools در macOS یا ابزار C++ متناسب در Windows. نصب این ابزارها یا فعال‌کردن build باید آگاهانه روی میزبان انجام و سپس addon و آزمون‌ها دوباره بررسی شوند؛ بستهٔ حاضر هیچ compiler یا native binary محلیِ کپی‌شده از ماشین سازنده را حمل نمی‌کند.

مسیر خروجی و فایل `.sha256` کنار آن باید تازه باشند. ابزار مقصد موجود را بازنویسی نمی‌کند. `--root` ریشهٔ منبع را صریح می‌گیرد؛ پیش‌فرض از محل خود اسکریپت پیدا می‌شود و به پوشهٔ جاری وابسته نیست. `--epoch` یا `SOURCE_DATE_EPOCH` زمان ثابت manifest و ZIP را تعیین می‌کند؛ پیش‌فرض صفر است، و زمان ZIP به حداقل مجاز سال ۱۹۸۰ محدود می‌شود. برای ورودی‌های ثابت، epoch ثابت و محیط Python/zlib یکسان، بایت‌های آرشیو قابل تکرارند؛ گزارش‌های تازه و تغییر واقعی داده طبیعتاً hash را تغییر می‌دهند. `PARTAVAR_PYTHON` می‌تواند مسیر executable پایتون را تعیین کند؛ ابزار runtime همراه Codex را نیز خودکار پیدا می‌کند.

در زمان ساخت بسته، import/publish/commit قیمت و هر نوشتن عملیاتی را متوقف نگه دارید. API فقط‌خواندنی می‌تواند فعال بماند. هر پایگاه موجود در `private-data/sqlite/*.db` با SQLite online backup کپی می‌شود و فقط کپی موقت checkpoint و به journal معمولی تبدیل می‌شود؛ فایل DB زنده یا WAL آن تغییر داده نمی‌شود. این کار از حذف تراکنش‌های commitشده‌ای که هنوز در WAL هستند جلوگیری می‌کند. پایگاه‌های مستقل یک تراکنش مشترک ندارند؛ توقف عملیات نوشتن، هم‌زمانی منطقی داده و archiveها را حفظ می‌کند.

بسته شامل کد کامل، lockfile، migrationها، build وب، HTML اصلی، تمام reference packها و archive منبع، snapshotها، گزارش‌های واقعی و سند کارهای باقی‌مانده است. `node_modules`، secretهای env و login، کلید خصوصی، فایل موقت آزمون، sidecarهای SQLite، backupهای قدیمی، deliverableهای قبلی و گزارش‌های تولیدشدهٔ خود بسته‌بندی وارد آن نمی‌شوند. فایل‌های مرجع ZIP در `private-data/reference-packs/` عمداً حفظ می‌شوند. آرشیو نهایی و checksum با دسترسی `0600` تولید می‌شوند. ساخت ZIP در پوشهٔ موقت کنار مقصد انجام می‌شود؛ انتشار فایل با hard link اتمی و بدون بازنویسی، فقط پس از استخراج و راستی‌آزمایی کامل است. filesystem مقصد باید hard link را پشتیبانی کند؛ فضای موقت کافی برای منبع، DBها، ZIP و استخراج بررسی لازم است.

## راستی‌آزمایی ZIP و جابه‌جایی

SHA-256 مورد اعتماد را از خروجی تحویل یا فایل checksum که از مسیر مورد اعتماد دریافت شده بردارید و صریح بدهید:

```sh
pnpm release:verify --input "/private/output/PartAvar-1.0.0-2026-10-28.zip" --sha256 EXPECTED_SHA256 --report "/private/output/release-verification-2026-10-28.json"
```

این فرمان ZIP را در پوشهٔ موقت جدا باز می‌کند، نام‌های ناامن و تکراری را رد می‌کند و سپس hash/اندازهٔ تمام فایل‌ها، موجودی دقیق فایل‌ها، `integrity_check` و foreign key تمام DBها، نسخهٔ فعال، manifest و همهٔ chunkهای نسخه‌های منتشرشده، شمار جدول‌ها و بازسازی هر هشت فیلد ردیف‌های منبع را می‌سنجد. هم DB و هم snapshot با منبع تطبیق داده می‌شوند. تاریخچهٔ قیمت می‌تواند هنوز خالی باشد؛ اگر archive تاریخچه‌ای در DB ثبت شده باشد، hash و اندازهٔ آن نیز بررسی می‌شود. DBهای بررسی در کپی موقت هستند و در پایان حذف می‌شوند.

`release-manifest.json` همهٔ فایل‌ها به‌جز خودش را hash می‌کند؛ SHA مستقل ZIP، خود manifest را نیز پوشش می‌دهد. hash تمامیت فایل را تأیید می‌کند؛ امضای دیجیتال یا هویت ناشر به‌تنهایی از آن نتیجه نمی‌شود. مقدار مورد اعتماد را همراه مسیر عمومی نامطمئن عوض نکنید.

برای بررسی پوشهٔ استخراج‌شده، پیش از راه‌اندازی یا هر تغییر داده:

```sh
pnpm install --frozen-lockfile
pnpm release:verify --input "/opt/partavar/releases/1.0.0"
```

وابستگی‌های نصب‌شده در `node_modules` از بررسی موجودی کنار گذاشته می‌شوند؛ فایل اضافهٔ دیگر یا فایل تغییرکرده رد می‌شود. گزارش `--report` را بیرون پوشهٔ release ذخیره کنید. آدرس‌های absolute زمان import در metadata اصلی DB حفظ می‌شوند؛ `sources[].path` در manifest به نسخهٔ همراه بسته اشاره می‌کند. verifier همین نگاشت و SHA منبع را به کار می‌گیرد، بنابراین برای بررسی بسته هیچ نیازی به مسیر Mac سازنده وجود ندارد. ابزارهای قدیمی importer برای تطبیق مستقیم همچنان `--file` صریح می‌خواهند:

```sh
pnpm catalogue:verify -- --db "/var/lib/partavar/private-data/sqlite/catalogue.db" --data-root "/var/lib/partavar/private-data" --version VERSION --file "/var/lib/partavar/private-data/source-archive/SOURCE.html"
```

## اجرای تولیدی با یک مبدأ

`pnpm start` از ریشهٔ release وب‌سایت، `/app/`، API و snapshotها را از یک Fastify روی `127.0.0.1:8787` سرو می‌کند. برای آزمایش دستی ابتدا از فایل env امن استفاده کنید:

```sh
pnpm release:credentials --output "/secure/partavar/operator.env" --origin "https://partavar.example.invalid" --username operator
```

نام میزبان بالا نمونه است؛ پیش از تولید فایل واقعی آن را با مبدأ تأییدشده عوض کنید. این فرمان token تصادفی قوی می‌سازد و در فایل env فقط SHA-256 آن را ذخیره می‌کند. نام کاربری و رمز ورود مرورگر در `/secure/partavar/operator.env.login.json` جدا و با دسترسی `0600` نوشته می‌شود؛ مقدار رمز در stdout چاپ نمی‌شود. فایل login را به اپراتور مسئول از مسیر خصوصی تحویل دهید و آن را داخل release، backup عمومی یا پوشهٔ وب نگذارید. هیچ secret واقعی در `deploy/partavar.env.example` وجود ندارد.

محتوای مسیرهای دادهٔ نمونه را پس از تولید به فایل env امن اضافه/تطبیق دهید. متغیرهای تولیدی:

| متغیر | مقدار/کاربرد |
| --- | --- |
| `NODE_ENV` | `production`؛ با تنظیم ناقص سرویس شروع نمی‌شود |
| `PARTAVAR_PUBLIC_ORIGIN` | مبدأ HTTPS واقعی بدون مسیر؛ HTTP فقط برای loopback دقیق مجاز است |
| `PARTAVAR_AUTH_USERNAME` | نام اپراتور مجاز |
| `PARTAVAR_AUTH_TOKEN_SHA256` | hash تولیدشدهٔ رمز؛ رمز خام در این متغیر قرار نگیرد |
| `PORT` | `8787`، bind همواره loopback |
| `CATALOGUE_DB_PATH` | `/var/lib/partavar/private-data/sqlite/catalogue.db` |
| `CATALOGUE_DATA_ROOT` | `/var/lib/partavar/private-data` |
| `PARTAVAR_OPERATIONS_PATH` | `/var/lib/partavar/private-data/sqlite/operations.db` |
| `PARTAVAR_WEB_ROOT` | `/opt/partavar/current/apps/web/dist` |

صفحهٔ معرفی و assetهای عمومی بدون ورود قابل خواندن‌اند. `/app` و زیرمسیرها، `/api` و زیرمسیرها، `/health/ready`، `sw.js` و manifest نصب به Basic authentication نیاز دارند. Fastify token را با مقایسهٔ زمان ثابت می‌سنجد و Host/Origin ناسازگار و درخواست cross-site را رد می‌کند. `/health/live` عمومی است. Caddy همان Authorization را به Fastify می‌رساند؛ TLS در Caddy تمام می‌شود. پس از دریافت آفلاین، داده در دستگاه مجاز باقی می‌ماند؛ حذف دسترسی سرور دادهٔ دریافت‌شده را از دستگاه پس نمی‌گیرد. پشتیبان JSON اسناد هر مرورگر نیز مستقل است.

## الگوی systemd و Caddy

این مراحل برای اپراتورِ استقرار مجاز روی Linux هستند و در این workspace اجرا نشده‌اند:

1. کاربر اختصاصی `partavar` بسازید. Node 24+، pnpm 11.25.0، Python3 و Caddy را از روش مورد اعتماد میزبان نصب کنید. مسیر واقعی Node را با `command -v node` بررسی و در `deploy/partavar.service` تطبیق دهید.
2. ZIP تأییدشده را در `/opt/partavar/releases/1.0.0/` استخراج کنید، نصب کامل frozen lockfile و `release:verify` را انجام دهید. release را با مالک root و دسترسی قابل خواندن برای سرویس نگه دارید. symlink `/opt/partavar/current` باید به همین پوشه اشاره کند.
3. فقط برای نخستین استقرار، یک کپی از `private-data/` بسته را به `/var/lib/partavar/private-data/` منتقل کنید و مالک آن را `partavar:partavar` و مجوز پوشه را `0700` قرار دهید. در ارتقای بعدی هیچ DB عملیاتی یا دادهٔ کاربر را با نسخهٔ داخل بسته جایگزین نکنید.
4. فایل env نهایی را در `/etc/partavar/operator.env` با مالک `partavar` و مجوز `0600` نصب کنید. پوشهٔ `/etc/partavar` باید برای همین کاربر قابل عبور باشد. فایل login را در محل امن اپراتور نگه دارید. نمونهٔ service را در `/etc/systemd/system/partavar.service` نصب کنید؛ `systemd-analyze verify` را روی نمونهٔ تطبیق‌یافته اجرا کنید.
5. نام دامنهٔ واقعی در Caddyfile باید دقیقاً با `PARTAVAR_PUBLIC_ORIGIN` یکسان باشد. Caddy تنها ورودی عمومی و Fastify فقط loopback است؛ `file_server` روی release یا `private-data` اضافه نکنید. پس از بررسی `caddy validate --config /etc/caddy/Caddyfile` و تأیید DNS/مجوز انتشار، سرویس‌ها را راه‌اندازی کنید.
6. روی hostname واقعی مرورگر را باز کنید: وب‌سایت عمومی، درخواست ورود `/app/`، جست‌وجو پس از ورود، health آماده با مجوز، نصب آفلاین، قطع اتصال و راه‌اندازی دوباره را بررسی و نتیجه را ثبت کنید. cookie/session مشترک مرورگر، token و TLS فقط با آزمون واقعی میزبان تأیید می‌شوند.

نسخهٔ Node از طریق systemd با `--env-file` تنظیم امن را بار می‌کند. فایل service مسیر کد را فقط‌خواندنی و `/var/lib/partavar` را قابل نوشتن نگه می‌دارد. کد با user عادی سرویس اجرا می‌شود. log سرویس در journal است؛ تنظیم Caddy نمونه access log حاوی عبارت‌های جست‌وجو را فعال نمی‌کند.

## پشتیبان و rollback

از کاتالوگ، عملیات قیمت و archiveهایشان پشتیبان online و restore verification جدا بگیرید؛ فرمان‌های موجود در `docs/operations.md` آمده‌اند. اسناد IndexedDB از داخل هر مرورگر JSON جدا می‌خواهند. پس از جابه‌جایی، `catalogue:backup` اگر مسیر اصلی archive موجود نباشد، منبع با SHA ثبت‌شدهٔ DB را در `source-archive/` زیر `--data-root` پیدا می‌کند؛ metadata اصلی DB و نام منبع در manifest دست‌نخورده می‌مانند. فایل موجود با hash نادرست یا نبودن نسخهٔ منطبق خطاست و بستهٔ خراب منتشر نمی‌شود. مسیر دادهٔ زنده را صریح بدهید:

```sh
pnpm catalogue:backup -- --db "/var/lib/partavar/private-data/sqlite/catalogue.db" --data-root "/var/lib/partavar/private-data" --output "/private/backups/partavar-catalogue-YYYY-MM-DD"
pnpm catalogue:restore -- --input "/private/backups/partavar-catalogue-YYYY-MM-DD" --verify-only
pnpm partavar:prices backup --operations "/var/lib/partavar/private-data/sqlite/operations.db" --output "/private/backups/partavar-operations-YYYY-MM-DD"
```

`release:package` نیز روی یک پوشهٔ کاملِ جابه‌جاشده منبع را با SHA در archiveهای همراه پیدا می‌کند. بستهٔ کدِ اولیه جایگزین backup دادهٔ جاری در `/var/lib/partavar` نیست.

برای rollback برنامه، release قبلی و فایل env سازگار را نگه دارید، سرویس را متوقف، symlink `current` را به release تأییدشدهٔ پیشین برگردانید و پس از health و آزمون ورود دوباره شروع کنید. DB را هم‌زمان با rollback کد جایگزین نکنید. rollback کاتالوگ با نسخهٔ منتشرشدهٔ قبلی و فرمان مستند `catalogue:rollback` انجام می‌شود. بازگرداندن DB، عملیات جدا با توقف سرویس، backup تأییدشده و بررسی source/snapshot و سلامت است. هیچ فایل زنده‌ای خودکار بازنویسی نمی‌شود.

آزمون fixture ابزار بسته‌بندی در `tests/integration/release-packaging.test.ts` و شواهد اجرای آن در `reports/release-2026-10-28/tooling/` است: ورود تراکنش فقط-WAL، checksum معتبر، تکرارپذیری byte-for-byte، جابه‌جایی بدون مسیر اصلی، رد tamper/overwrite و عدم انتشار snapshot یا منبع خراب.

## شواهد TLS و reverse proxy محلی

در ۲۸ اکتبر ۲۰۲۶ باینری macOS arm64 از [انتشار رسمی Caddy 2.11.7](https://github.com/caddyserver/caddy/releases/tag/v2.11.7) در پوشهٔ موقت بیرون workspace دریافت شد. SHA-256 asset در GitHub و SHA-512 فهرست checksum رسمی هر دو تطبیق داده شدند. `caddy validate` فایل واقعی `deploy/Caddyfile` را پذیرفت. سپس یک نسخهٔ موقت با `bind 127.0.0.1`، `tls internal`، admin خاموش، redirect خاموش و [گزینهٔ رسمی `skip_install_trust`](https://caddyserver.com/docs/caddyfile/options#skip_install_trust) روی `https://localhost:9443` به backend مستقل `127.0.0.1:8789` متصل شد. کلاینت HTTPS گواهی را با CA موقتِ صریح بررسی کرد و TLS 1.3 برقرار شد؛ هیچ گزینهٔ حذف بررسی گواهی به کار نرفت.

هر ۲۱ بررسی عبور کرد: صفحهٔ معرفی عمومی، ورود اجباری برنامه/API/manifest/chunk، جست‌وجوی واقعی پس از ورود، SHA دقیق chunk، readiness، انتقال CSP و HSTS، رد Origin دیگر و دسترسی‌ناپذیری فایل خصوصی. listenerها با `lsof` فقط روی loopback تأیید شدند. trust store سیستم تغییر نکرد، DNS/ACME عمومی استفاده نشد، و فرایندها، کلیدهای CA، باینری موقت و credential آزمونی پس از کار حذف شدند. گزارش بدون secret در `reports/release-2026-10-28/tooling/local-tls-proxy.json`، hash باینری در `caddy-download.json` و پذیرش template در `caddy-template-validate.log` است. این شواهد اتصال TLS محلی را می‌سنجد؛ DNS، صدور/تمدید گواهی عمومی و نصب systemd در میزبان واقعی همچنان نیازمند اجرای اپراتور است.

## شواهد نصب کاملاً تازه

یک candidate موقت بیرون workspace استخراج شد؛ هیچ `node_modules`، فایل `.npmrc`/`.netrc` یا credential از منبع حمل نشد. نصب frozen با pnpm 11.25.0 در store و cache تازه و با فایل‌های user/global npmrc خالی، ۴۰۲ بسته را دانلود و صفر بسته را reuse کرد. آزمون اول با `allowBuilds.better-sqlite3:true` به build ضمنی غیرضروری و شکست make به علت نبودن Command Line Tools رسید؛ log شکست حفظ شد. با سیاست صحیح `false`، نصب تازهٔ دوم exit صفر داشت و هیچ node-gyp اجرا نشد. باینری همراهِ همان بستهٔ دانلودشده، SQLite 3.53.4 و FTS5 trigram را واقعاً اجرا کرد.

در کپی نصب‌شده، `release:verify` هر ۳۶٬۵۶۹ ردیف منبع/DB/snapshot و ۱۱۰۳ chunk را سنجید؛ سپس typecheck، build و bundle guard مستقل همان کپی عبور کردند. سرور تولیدی روی `127.0.0.1:8791` با credential مصنوعی تازه و مجوز `0600` راه افتاد و هر ۲۳ بررسی HTTP برنامه، auth، static، health، جست‌وجوی واقعی Worker، snapshot و مرز فایل خصوصی عبور کرد. SIGTERM با exit صفر پایان یافت و پوشهٔ آزمایش، store و credentialها حذف شدند. source و dist اصلی workspace بازسازی یا تغییر داده نشدند. گزارش `reports/release-2026-10-28/tooling/clean-install-verification.json` و logهای `clean-install-*` شواهد دقیق‌اند. این نصب روی macOS arm64 انجام شد؛ نصب واقعی Linux/systemd هنوز آزمون میزبان مقصد را لازم دارد. این پیش‌آزمون نصب جایگزین گزارش نهایی مرورگرِ build نهایی نیست.
