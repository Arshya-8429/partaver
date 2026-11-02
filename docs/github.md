# دریافت و اجرای نسخهٔ GitHub

این مخزن سورس، build آماده، دیتابیس SQLite مهاجرت‌داده‌شده، ۱۱۰۳ chunk آفلاین، HTML اصلی، مرجع‌های master pack، آزمون‌ها و گزارش‌های واقعی نسخهٔ 1.0.0 را دارد. دیتابیس از بستهٔ نهایی ۲۰۲۶/۱۰/۲۸ گرفته شده و شامل ۳۶٬۵۶۹ ردیف اصلی است. قیمت، کد فنی، هویت مستقل کد لجستیک، سازگاری خودرو، alias و replacement از همان migration تأییدشده‌اند.

## نصب

Node.js 24+، pnpm 11.25.0، Git و Git LFS لازم‌اند. در GitHub Desktop پشتیبانی Git LFS فراهم است؛ در خط فرمان آن را با روش رسمی سیستم‌عامل نصب کنید و سپس اجرا کنید:

```sh
git lfs install
git clone https://github.com/Arshya-8429/partaver.git
cd partaver
git lfs pull
git lfs fsck
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

برنامه روی http://127.0.0.1:8787/app/ و سایت روی http://127.0.0.1:8787/ باز می‌شوند. اولین جست‌وجوی آنلاین از دیتابیس آماده پاسخ می‌گیرد؛ migration یا واردکردن دستی کاتالوگ لازم نیست. اجرا روی دامنهٔ واقعی و HTTPS به تنظیم‌های [استقرار](release-deployment.md) نیاز دارد.

فایل `private-data/sqlite/catalogue.db` در LFS است، چون اندازهٔ واقعی آن ۲۲۱٬۲۰۸٬۵۷۶ بایت است. نسخهٔ درست با هدر باینری `SQLite format 3` آغاز می‌شود. اگر فایل چندخطی `version https://git-lfs.github.com/spec/v1` می‌بینید، هنوز فقط pointer را گرفته‌اید؛ `git lfs pull` را اجرا کنید. Download ZIP معمولی GitHub ممکن است فایل‌های LFS را به‌صورت pointer بدهد؛ روش تأییدشده، کلون با LFS و بررسی `git lfs fsck` است.

## دریافت آفلاین و اسناد شخصی

دادهٔ آماده در سمت سرور موجود است؛ replica آفلاین هر مرورگر پس از درخواست کاربر در برنامه دریافت می‌شود و به فضای کافی نیاز دارد. کاتالوگ در bundle فرانت‌اند قرار نگرفته و همهٔ رکوردها در startup وارد حافظهٔ thread اصلی نمی‌شوند.

فاکتورها، پکیج‌ها و تنظیم‌های شخصی هر مرورگر در IndexedDB همان origin هستند. این مخزن آن اسناد را خودکار همراه ندارد. برای تغییر دامنه یا پورت، از تنظیمات مبدأ قبلی JSON صادر و در مبدأ جدید وارد کنید.

## منشأ و راستی‌آزمایی

SHA256 بستهٔ نهایی که مبنای این مخزن است:

```text
39e8d3e111d2d173574b0a8f11c62f0cab79b3638eb5c079ce4e3f85dafe9714
```

manifest و receipt اصلی در `reports/github-import/` محفوظ‌اند و وضعیت بستهٔ اولیه را ثبت می‌کنند. برای آماده‌سازی Git فقط قوانین ignore/LFS و مستندات دریافت اضافه یا اصلاح شده‌اند؛ فایل‌های برنامه و داده از همان نسخه آمده‌اند. manifest اولیه به این پوشه منتقل شده تا به‌اشتباه manifest وضعیت متغیر یک checkout معرفی نشود.

برای ساخت و بررسی یک بستهٔ جدید از checkout کامل دارای LFS، از ابزارهای موجود استفاده کنید؛ ZIP خروجی دیتابیس کامل را دارد و به LFS نیاز ندارد:

```sh
pnpm release:package --output /absolute/output/PartAvar-new.zip --version 1.0.0 --epoch 1793145600
pnpm release:verify --input /absolute/output/PartAvar-new.zip --sha256 HASH_PRINTED_BY_PACKAGE_COMMAND
```

محدودیت‌ها و آزمون‌های محیط واقعیِ باقی‌مانده در [REMAINING-WORK.md](../REMAINING-WORK.md) هستند. کلیدها، فایل ورود، دیتابیس عملیات شخصی، وابستگی‌ها و پشتیبان‌های تکراری جزو مخزن نیستند.
