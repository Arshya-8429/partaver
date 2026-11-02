var e=`<a class="skipLink" href="#workspace">رفتن به جست‌وجو</a>
<div class="wrap">
  <header class="header">
    <div class="brand"><div><h1 dir="ltr">PartAvar<span class="brandDot">.</span></h1><p>پارت‌آور · ابزار کار قطعات خودرو</p></div></div>
    <div class="headerTools"><span id="connectionStatus" class="connection">بررسی اتصال</span><button id="themeToggle" type="button" class="iconButton" aria-label="تغییر حالت نمایش"></button></div>
  </header><nav class="appNav" aria-label="بخش‌های پارت‌آور"><button type="button" data-area="search" aria-current="page">جست‌وجو</button><button type="button" data-area="purchase">لیست خرید</button><button type="button" data-area="packages">بسته‌ها</button><button type="button" data-area="invoices">فاکتورها</button><button type="button" data-area="prices">روند قیمت</button><button type="button" data-area="settings">تنظیمات</button><a href="/">وب‌سایت ↗</a></nav>
  <section class="catalogueStatus" aria-label="وضعیت کاتالوگ">
    <details id="catalogueInfo"><summary><span class="statusDot" aria-hidden="true"></span><span id="catalogueStatusText" role="status" aria-live="polite" data-state="checking">در حال بررسی کاتالوگ…</span><span class="infoLabel">اطلاعات و دریافت <span aria-hidden="true">⌄</span></span></summary>
      <div class="statusBody"><span id="catalogueVersion" class="catalogueStatusVersion"></span><div id="catalogueStatusMeta" class="catalogueStatusMeta">در حال خواندن اطلاعات…</div><progress id="catalogueProgress" max="100" hidden aria-label="پیشرفت دریافت کاتالوگ"></progress><div class="catalogueStatusActions"><button id="catalogueUpdateButton" class="btn secondary" type="button">دریافت برای استفادهٔ آفلاین</button><button id="catalogueCancelButton" class="btn secondary" type="button" hidden>لغو دریافت</button></div></div>
    </details>
  </section>
  <main id="workspace" tabindex="-1"><div id="searchArea">
    <section class="searchPanel" aria-label="جست‌وجوی قطعات">
      <div class="workspaceTitle"><div><span class="eyebrow">کاتالوگ قطعات</span><h2>قطعهٔ موردنظرت را پیدا کن</h2></div><span class="workspaceHint">کد دقیق، نتیجهٔ دقیق‌تر</span></div>
      <div class="tabs" role="tablist" aria-label="روش جست‌وجو">
        <button id="partTab" class="tab active" data-mode="partMode" role="tab" aria-controls="partMode" aria-selected="true" type="button">قطعه و خودرو</button>
        <button id="codeTab" class="tab" data-mode="codeMode" role="tab" aria-controls="codeMode" aria-selected="false" tabindex="-1" type="button">کد یا نام قطعه</button>
      </div>
      <section id="partMode" class="mode active" role="tabpanel" aria-labelledby="partTab">
        <div class="formGrid"><div class="field vehicleField"><label for="vehicle">خودرو و تیپ</label><div class="vehiclePicker"><div class="inputWithAction"><input id="vehicle" autocomplete="off" spellcheck="false" placeholder="نام خودرو؛ مثلاً X55" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="vehicleSuggestions" aria-haspopup="listbox" aria-describedby="vehicleHint" maxlength="128" autocorrect="off" inputmode="search"><button id="vehicleClear" type="button" class="iconButton inputClear" aria-label="پاک کردن خودرو" hidden>×</button></div><div id="vehicleSuggestions" class="vehicleSuggestions" role="listbox" aria-label="تیپ‌های خودرو" hidden></div></div><span id="vehicleHint" class="hint">تیپ دقیق خودرو را از فهرست انتخاب کنید.</span></div>
        <div class="field"><label for="partQuery">نام قطعه</label><input id="partQuery" spellcheck="false" autocapitalize="none" role="combobox" aria-autocomplete="list" aria-controls="partList" aria-expanded="false" autocomplete="off" placeholder="مثلاً رادیاتور یا واتر پمپ" aria-describedby="partHint" maxlength="128" autocorrect="off" inputmode="search"><div id="partList" class="nameSuggestions" role="listbox" aria-label="پیشنهاد نام قطعه" hidden></div><span id="partHint" class="hint">بخشی از نام قطعه هم کافی است.</span></div></div>
        <details class="presetBlock" id="vehiclePresets"><summary>انتخاب سریع خودرو <span class="hint">خانواده و تیپ</span></summary><div class="presetFamilies" id="quickFamilies" aria-label="خانواده‌های خودرو"></div><div class="presetDrawer" id="presetDrawer" hidden><div class="presetDrawerHead"><strong id="presetDrawerTitle">تیپ‌ها</strong><button type="button" class="iconButton" id="presetDrawerToggle" aria-label="بستن تیپ‌ها" aria-expanded="true">×</button></div><div class="presetVariants" id="quickModels"></div></div></details>
        <div class="actions"><button type="button" class="btn primary" id="partSearchBtn">جست‌وجوی قطعه <span aria-hidden="true">←</span></button><button type="button" class="btn subtle" id="partClearBtn">پاک کردن</button></div>
      </section>
      <section id="codeMode" class="mode" role="tabpanel" aria-labelledby="codeTab" hidden>
        <div class="field"><label for="codeQuery">کد فنی، کد لجستیکی یا نام قطعه</label><input id="codeQuery" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="مثلاً 111100001AA یا واتر پمپ" dir="auto" maxlength="128" aria-describedby="codeHint" autocorrect="off" inputmode="search"><span id="codeHint" class="hint">جست‌وجو در همهٔ خودروها؛ بدون نیاز به انتخاب خودرو</span></div>
        <div class="actions"><button type="button" class="btn primary" id="codeSearchBtn">جست‌وجوی قطعه <span aria-hidden="true">←</span></button><button type="button" class="btn subtle" id="codeClearBtn">پاک کردن</button></div>
      </section>
      <div id="message" class="message" role="status" aria-live="polite" aria-atomic="true"></div>
    </section>
    <section id="results" class="results" aria-label="نتایج جست‌وجو" hidden><div class="resultsHead"><h2>نتایج جست‌وجو</h2><span id="resultCount" class="count" role="status" aria-live="polite"></span></div><div id="resultRange" class="resultRange"></div><div id="cards" class="cards"></div><nav id="pagination" class="pagination" aria-label="صفحه‌بندی نتایج"></nav></section>
    <section id="welcome" class="welcome"><div class="welcomeIcon" aria-hidden="true">⌕</div><h2>از خودرو یا کد قطعه شروع کنید</h2><p>قیمت و خودروهای مرتبط برای هر کد لجستیکی، جداگانه نمایش داده می‌شود.</p><div class="welcomeTags"><span>کدهای قابل کپی</span><span>سه سطح قیمت</span><span>جزئیات دقیق هر ردیف</span></div></section>
</div><section id="relatedSuggestions" hidden aria-label="پیشنهادهای مرتبط"></section><section id="documentRoot" hidden aria-label="اسناد عملیاتی"></section><section id="priceRoot" hidden aria-label="روند قیمت‌ها"></section>
  </main>
  <footer class="footer"><span>ردیف‌های کاتالوگ: <b id="dbCount">—</b></span><span>میانی ۱۰٪ و نهایی ۲۰٪ بالاتر از پایه</span><span class="designer" dir="ltr">design by behrad</span></footer>
</div>
<dialog id="detailDialog" aria-labelledby="detailTitle"><div class="dialogHead"><div><span id="detailEyebrow" class="eyebrow">جزئیات ردیف</span><h2 id="detailTitle" tabindex="-1"></h2></div><button id="detailClose" type="button" class="iconButton" aria-label="بستن جزئیات">×</button></div><div id="detailBody" class="dialogBody"></div></dialog>
<div id="toast" class="toast" role="status" aria-live="polite" aria-atomic="true"></div>
`;export{e as appMarkup};