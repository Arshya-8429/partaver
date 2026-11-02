import type { SearchPage, SearchRequest } from '@partsfinder/contracts';
import type { Catalogue } from '../catalogue.js';
import { button, requiredElement } from './dom.js';
import { NameSuggestions } from './name-suggestions.js';
import { DetailsController } from './details.js';
import { entryCard, node } from './entry.js';
import { clearMessage, showMessage } from './messages.js';
import type { VehiclePicker } from './vehicle-picker.js';
const PAGE_SIZE = 20;
export class SearchController {
  private readonly cards = requiredElement<HTMLDivElement>('cards');
  private readonly results = requiredElement<HTMLElement>('results');
  private readonly resultCount = requiredElement('resultCount');
  private readonly partInput = requiredElement<HTMLInputElement>('partQuery');
  private readonly codeInput = requiredElement<HTMLInputElement>('codeQuery');
  private readonly partList = requiredElement<HTMLDivElement>('partList');
  private readonly suggestions:NameSuggestions;
  private readonly pagination = requiredElement('pagination');
  private readonly details: DetailsController;
  private version: string | null = null;
  private mode = 'partMode';
  private requestBase: SearchRequest | null = null;
  private cursorHistory: Array<string | undefined> = [];
  private currentCursor: string | undefined;
  private abortController: AbortController | null = null;

  constructor(private readonly catalogue: Catalogue, private readonly vehiclePicker: VehiclePicker) {
    this.details = new DetailsController(catalogue);
    this.suggestions = new NameSuggestions(this.partInput,this.partList,async(query,signal)=>{const version=this.version,vehicle=this.vehiclePicker.selectedOption;if(!version||!vehicle)return [];return catalogue.suggestions(version,vehicle.id,query,20,signal)});
    requiredElement('partSearchBtn').addEventListener('click', () => void this.searchPart());
    requiredElement('codeSearchBtn').addEventListener('click', () => void this.searchCode());
    requiredElement('partClearBtn').addEventListener('click', () => this.clear(this.partInput));
    requiredElement('codeClearBtn').addEventListener('click', () => this.clear(this.codeInput));
    this.partInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); this.suggestions.acceptActive(); void this.searchPart(); } });
    this.codeInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); void this.searchCode(); } });
    this.partInput.addEventListener('input', () => { this.invalidate(); this.scheduleSuggestions(); });
    this.codeInput.addEventListener('input', () => this.invalidate());
    const tabs = [...document.querySelectorAll<HTMLButtonElement>('.tab[data-mode]')];
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => this.selectMode(tab.dataset.mode!));
      tab.addEventListener('keydown', event => {
        let next: number | null = null;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') next = 1 - index;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        if (next !== null) { event.preventDefault(); this.selectMode(tabs[next]!.dataset.mode!); tabs[next]!.focus(); }
      });
    });
    this.setVersion(null);
  }
  setVersion(version: string | null): void {
    if (version !== this.version) { this.invalidate(); this.details.close(); this.version = version; }
    for (const id of ['partSearchBtn', 'codeSearchBtn']) requiredElement<HTMLButtonElement>(id).disabled = !version;
  }
  selectionChanged(): void { if (this.mode === 'partMode') this.invalidate(); this.scheduleSuggestions(); }
  destroy(): void { this.abortController?.abort(); this.suggestions.destroy(); this.details.destroy(); }
  private invalidate(): void {
    this.abortController?.abort(); this.abortController = null; this.requestBase = null; this.cursorHistory = [];
    this.currentCursor = undefined; this.cards.replaceChildren(); this.pagination.replaceChildren();
    this.resultCount.textContent = ''; this.results.hidden = true; this.results.removeAttribute('aria-busy');
    requiredElement('welcome').hidden = false; clearMessage();
    this.suggestions.clear();
  }
  private scheduleSuggestions(): void { this.suggestions.schedule(); }
  get currentVehicleContext() { return this.mode==='partMode'?this.vehiclePicker.selectedOption:null; }
  get currentVersion():string|null { return this.version; }
  suspend():void { this.abortController?.abort(); this.suggestions.clear(); }
  private async searchPart(): Promise<void> {
    const vehicle = this.vehiclePicker.selectedOption, query = this.partInput.value.trim();
    if (!this.version) { showMessage('کاتالوگ در دسترس نیست؛ وضعیت اتصال را بررسی کنید.', 'warn'); return; }
    if (!vehicle) { showMessage('تیپ دقیق خودرو را از فهرست انتخاب کنید.', 'warn'); requiredElement('vehicle').focus(); return; }
    if (!query) { showMessage('نام قطعه را وارد کنید.', 'warn'); this.partInput.focus(); return; }
    await this.startSearch({ catalogVersion: this.version, mode: 'vehiclePart', kind: 'name', query, vehicleOptionId: vehicle.id, groupBy: 'entry', limit: PAGE_SIZE });
  }
  private async searchCode(): Promise<void> {
    const query = this.codeInput.value.trim();
    if (!this.version) { showMessage('کاتالوگ در دسترس نیست؛ وضعیت اتصال را بررسی کنید.', 'warn'); return; }
    if (!query) { showMessage('کد یا نام قطعه را وارد کنید.', 'warn'); this.codeInput.focus(); return; }
    await this.startSearch({ catalogVersion: this.version, mode: 'global', kind: 'auto', query, groupBy: 'entry', limit: PAGE_SIZE });
  }
  private async startSearch(request: SearchRequest): Promise<void> {
    this.suggestions.clear(); this.requestBase = request; this.cursorHistory = []; this.currentCursor = undefined; clearMessage(); await this.loadPage();
  }
  private async loadPage(cursor?: string): Promise<void> {
    if (!this.requestBase || !this.version) return;
    this.abortController?.abort(); const controller = new AbortController(); this.abortController = controller;
    const request = { ...this.requestBase, ...(cursor ? { cursor } : {}) }; this.currentCursor = cursor;
    this.cards.replaceChildren(node('div', 'loadingState', 'در حال جست‌وجو در کاتالوگ…')); this.pagination.replaceChildren();
    this.results.hidden = false; this.results.setAttribute('aria-busy', 'true'); requiredElement('welcome').hidden = true;
    this.resultCount.textContent = 'در حال جست‌وجو…'; requiredElement('resultRange').textContent = '';
    try {
      const page = await this.catalogue.search(request, controller.signal);
      if (controller.signal.aborted || this.abortController !== controller || page.catalogVersion !== this.version) return;
      this.results.removeAttribute('aria-busy'); this.renderPage(page, request);
    } catch (error) {
      if (controller.signal.aborted || this.abortController !== controller) return;
      this.results.removeAttribute('aria-busy'); this.resultCount.textContent = 'جست‌وجو انجام نشد';
      const empty = node('div', 'resultsEmpty'); empty.append(node('h3', '', 'خواندن نتایج انجام نشد'), node('p', '', navigator.onLine ? 'دوباره تلاش کنید؛ اگر مشکل ادامه داشت سرویس را بررسی کنید.' : 'اتصال قطع است. برای جست‌وجوی آفلاین، کاتالوگ باید قبلاً نصب شده باشد.'), button('تلاش دوباره', 'btn secondary', () => void this.loadPage(cursor)));
      this.cards.replaceChildren(empty);
      showMessage(error instanceof Error && /[\u0600-\u06FF]/.test(error.message) ? error.message : 'خواندن کاتالوگ انجام نشد؛ دوباره تلاش کنید.', 'warn');
    }
  }
  private renderPage(page: SearchPage, request: SearchRequest): void {
    this.cards.replaceChildren(); this.resultCount.textContent = `${page.totalMatchedEntries.toLocaleString('fa-IR')} ردیف`;
    const from = this.cursorHistory.length * PAGE_SIZE + 1, to = from + page.items.length - 1;
    requiredElement('resultRange').textContent = page.items.length ? `نمایش ${from.toLocaleString('fa-IR')} تا ${to.toLocaleString('fa-IR')} · قیمت و خودروهای هر کد لجستیکی مستقل است` : '';
    if (!page.items.length) {
      const empty = node('div', 'resultsEmpty'); empty.append(node('h3', '', 'نتیجه‌ای پیدا نشد'), node('p', '', 'بخش کوتاه‌تری از کد یا نام قطعه را جست‌وجو کنید.')); this.cards.append(empty);
    }
    for (const item of page.items) if (item.type === 'entry') this.cards.append(entryCard(item, page.catalogVersion, trigger => void this.details.entry(page.catalogVersion, item.entryId, trigger), trigger => void this.details.family(request, item, trigger)));
    window.dispatchEvent(new CustomEvent('partavar:page-rendered',{detail:{version:page.catalogVersion,entries:page.items.filter(item=>item.type==='entry')}}));
    this.pagination.replaceChildren();
    if (!this.cursorHistory.length && !page.nextCursor) return;
    const previous = button('صفحهٔ قبل', 'pageButton', () => void this.loadPage(this.cursorHistory.pop())); previous.disabled = !this.cursorHistory.length;
    this.pagination.append(previous, node('span', 'pageLabel', `صفحهٔ ${(this.cursorHistory.length + 1).toLocaleString('fa-IR')}`));
    if (page.nextCursor) this.pagination.append(button('صفحهٔ بعد', 'pageButton', () => { this.cursorHistory.push(this.currentCursor); void this.loadPage(page.nextCursor!); }));
  }
  private selectMode(mode: string): void {
    if (!['partMode', 'codeMode'].includes(mode) || mode === this.mode) return;
    this.invalidate(); this.mode = mode;
    document.querySelectorAll<HTMLElement>('.mode').forEach(panel => { panel.hidden = panel.id !== mode; panel.classList.toggle('active', panel.id === mode); });
    document.querySelectorAll<HTMLButtonElement>('.tab[data-mode]').forEach(tab => { const active = tab.dataset.mode === mode; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; });
  }
  private clear(input: HTMLInputElement): void { input.value = ''; this.invalidate(); input.focus(); }
}
