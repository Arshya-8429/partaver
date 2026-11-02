import type { EntrySummary, SearchRequest, VariantSummary } from '@partsfinder/contracts';
import type { Catalogue } from '../catalogue.js';
import { button, requiredElement } from './dom.js';
import { codeRow, entryCard, entrySummaryText, node, prices } from './entry.js';
import { copyText } from './toast.js';

export class DetailsController {
  private readonly dialog = requiredElement<HTMLDialogElement>('detailDialog');
  private readonly title = requiredElement<HTMLHeadingElement>('detailTitle');
  private readonly body = requiredElement<HTMLDivElement>('detailBody');
  private controller: AbortController | null = null;
  private trigger: HTMLElement | null = null;
  private ownsHistory = false;
  private generation = 0;
  constructor(private readonly catalogue: Catalogue) {
    requiredElement('detailClose').addEventListener('click', () => this.close());
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    window.addEventListener('popstate', () => { if (this.dialog.open) { this.ownsHistory = false; this.dismiss(); } });
  }
  destroy(): void {
    // Leaving the document must not navigate its browser history.
    this.controller?.abort(); this.generation++; this.ownsHistory = false;
    if (this.dialog.open) this.dialog.close();
    this.body.replaceChildren();
  }
  close(): void {
    if (!this.dialog.open) return;
    const goBack = this.ownsHistory; this.ownsHistory = false; this.dismiss();
    if (goBack) history.back();
  }
  private dismiss(): void {
    this.controller?.abort(); this.generation++; this.dialog.close(); this.body.replaceChildren();
    if (this.trigger?.isConnected) this.trigger.focus({ preventScroll: true });
  }
  private open(title: string, trigger: HTMLElement): { signal: AbortSignal; current: () => boolean } {
    this.controller?.abort(); this.controller = new AbortController(); const generation = ++this.generation;
    this.title.textContent = title; this.body.replaceChildren(node('div', 'loadingState', 'در حال خواندن اطلاعات…'));
    if (!this.dialog.open) {
      this.trigger = trigger; this.dialog.showModal();
      history.pushState({ partsFinderDetail: true }, ''); this.ownsHistory = true;
    }
    this.title.focus();
    const signal = this.controller.signal;
    return { signal, current: () => !signal.aborted && this.dialog.open && generation === this.generation };
  }
  async entry(version: string, id: number, trigger: HTMLElement, returnToFamily?: () => void): Promise<void> {
    const { signal, current } = this.open('جزئیات قطعه', trigger);
    requiredElement('detailEyebrow').textContent = 'اطلاعات همین کد لجستیکی';
    try {
      const detail = await this.catalogue.detail(version, id, signal); if (!current()) return;
      this.title.textContent = detail.partNameRaw;
      const content = node('section', 'entryDetail');
      if (returnToFamily) content.append(button('→ بازگشت به خانوادهٔ کد', 'loadEntries', returnToFamily));
      content.append(codeRow('کد فنی', detail.techRaw), codeRow('کد لجستیکی', detail.logRaw), prices(detail), button('کپی مشخصات و قیمت‌ها', 'copySummary', () => void copyText(entrySummaryText(detail), 'مشخصات ردیف')));
      this.list(content, 'مدل‌های خودرو', detail.models, 'اطلاعات خودرو ثبت نشده');
      this.list(content, 'برچسب‌های ثبت‌شده', detail.friendlyLabels);
      this.list(content, 'نام‌های جایگزین', detail.aliases);
      this.list(content, 'رشتهٔ جایگزین خام', detail.replacementRaw ? [detail.replacementRaw] : [], undefined, true);
      this.list(content, 'ارجاع‌های جایگزینی منبع', detail.replacementTokens.map(token => token.targetTechRaw ? `${token.raw} ← ${token.targetTechRaw}` : `${token.raw} (هدف مشخص نشده)`), undefined, true);
      content.append(node('p', 'detailNotice', 'ارجاع جایگزینی و خانوادهٔ کد، تأیید مهندسیِ قابل‌جایگزین‌بودن قطعات نیست.'), node('small', 'sourceOrdinal', `ردیف منبع: ${detail.sourceRowOrdinal.toLocaleString('fa-IR')}`));
      this.body.replaceChildren(content); this.body.scrollTop = 0;
    } catch (error) { if (current()) this.failure(error, () => void this.entry(version, id, trigger, returnToFamily)); }
  }
  async family(request: SearchRequest, entry: EntrySummary, trigger: HTMLElement, cursor?: string, previous: Array<string | undefined> = []): Promise<void> {
    const { signal, current } = this.open('خانوادهٔ کد', trigger);
    requiredElement('detailEyebrow').textContent = 'گروه‌بندی محاسباتی · تأییدنشده';
    const base: SearchRequest = { ...request, groupBy: 'variant', familyRoot: entry.family.root, limit: 10 };
    delete base.cursor; delete base.partId;
    try {
      const page = await this.catalogue.search({ ...base, ...(cursor ? { cursor } : {}) }, signal); if (!current()) return;
      this.body.replaceChildren(codeRow('ریشهٔ کد', entry.family.root), node('p', 'detailNotice', 'گونه‌های این گروه بر اساس شکل کد کنار هم قرار گرفته‌اند؛ هر ردیف لجستیکی قیمت و خودروهای خودش را دارد.'), node('p', 'detailMeta', `${page.totalMatchedEntries.toLocaleString('fa-IR')} ردیف منطبق · ${(page.totalMatchedVariants ?? 0).toLocaleString('fa-IR')} گونهٔ فنی منطبق`));
      for (const variant of page.items) if (variant.type === 'variant') this.body.append(this.variant(base, variant, () => void this.family(request, entry, trigger, cursor, previous), signal));
      const pagination = node('nav', 'pagination'); pagination.setAttribute('aria-label', 'صفحه‌بندی گونه‌ها');
      if (previous.length) pagination.append(button('گونه‌های قبلی', 'pageButton', () => void this.family(request, entry, trigger, previous[previous.length - 1], previous.slice(0, -1))));
      if (page.nextCursor) pagination.append(button('گونه‌های بعدی', 'pageButton', () => void this.family(request, entry, trigger, page.nextCursor!, [...previous, cursor])));
      this.body.append(pagination); this.body.scrollTop = 0;
    } catch (error) { if (current()) this.failure(error, () => void this.family(request, entry, trigger, cursor, previous)); }
  }
  private variant(base: SearchRequest, variant: VariantSummary, returnToFamily: () => void, signal: AbortSignal): HTMLElement {
    const row = node('section', 'variantRow');
    const label = node('span', ''); label.append(node('bdi', 'codeValue', variant.techRaw), node('span', 'variantInfo', `${variant.partNameRaw} · ${variant.matchedEntryCount.toLocaleString('fa-IR')} ردیف منطبق`));
    const toggle = button('', 'variantToggle', () => { if (toggle.getAttribute('aria-expanded') === 'true') { panel.replaceChildren(); toggle.setAttribute('aria-expanded', 'false'); expanded++; } else { toggle.setAttribute('aria-expanded', 'true'); void load(false); } });
    toggle.append(label, node('span', '', '⌄')); toggle.setAttribute('aria-expanded', 'false');
    const panel = node('div', 'variantEntries'); let expanded = 0;
    const load = async (all: boolean, cursor?: string, previous: Array<string | undefined> = []): Promise<void> => {
      const sequence = ++expanded; panel.replaceChildren(node('div', 'loadingState', 'در حال خواندن ردیف‌ها…'));
      const request: SearchRequest = all
        ? { catalogVersion: base.catalogVersion, mode: 'global', kind: 'code', query: variant.techRaw, partId: variant.partId, groupBy: 'entry', limit: 10 }
        : { ...base, groupBy: 'entry', partId: variant.partId, limit: 10 };
      delete request.cursor;
      try {
        const page = await this.catalogue.search({ ...request, ...(cursor ? { cursor } : {}) }, signal);
        if (signal.aborted || sequence !== expanded || !row.isConnected) return;
        panel.replaceChildren(node('p', 'detailMeta', `${all ? 'همهٔ ردیف‌های این کد فنی' : 'ردیف‌های منطبق با جست‌وجوی شما'} · ${page.totalMatchedEntries.toLocaleString('fa-IR')} ردیف`));
        for (const item of page.items) if (item.type === 'entry') panel.append(entryCard(item, page.catalogVersion, trigger => void this.entry(page.catalogVersion, item.entryId, trigger, returnToFamily)));
        const paging = node('nav', 'pagination');
        if (previous.length) paging.append(button('ردیف‌های قبلی', 'pageButton', () => void load(all, previous[previous.length - 1], previous.slice(0, -1))));
        if (page.nextCursor) paging.append(button('ردیف‌های بعدی', 'pageButton', () => void load(all, page.nextCursor!, [...previous, cursor])));
        panel.append(paging);
        if (!all) panel.append(button('نمایش همهٔ ردیف‌های این کد فنی', 'loadEntries', () => void load(true)));
      } catch (error) { if (!signal.aborted && sequence === expanded) { panel.replaceChildren(node('p', 'detailNotice', error instanceof Error ? error.message : 'اطلاعات خوانده نشد.'), button('تلاش دوباره', 'loadEntries', () => void load(all, cursor, previous))); } }
    };
    row.append(toggle, panel); return row;
  }
  private list(parent: HTMLElement, label: string, values: string[], empty = 'ثبت نشده', code = false): void {
    const section = node('section', 'detailList'); section.append(node('h3', '', label));
    if (!values.length) section.append(node('p', 'empty', empty));
    else { const list = node('ul', ''); for (const value of values) list.append(node('li', code ? 'codeValue' : '', value)); section.append(list); }
    parent.append(section);
  }
  private failure(error: unknown, retry: () => void): void { this.body.replaceChildren(node('p', 'detailNotice', error instanceof Error ? error.message : 'اطلاعات خوانده نشد.'), button('تلاش دوباره', 'btn secondary', retry)); }
}
