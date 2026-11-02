import type { EntryListing, EntrySummary } from '@partsfinder/contracts';
import { button } from './dom.js';
import { icon } from './icons.js';
import { copyText } from './toast.js';
export function money(value: string): string {
  try { return new Intl.NumberFormat('fa-IR').format(BigInt(value)); } catch { return value; }
}
export function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag); element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
export function codeRow(label: string, value: string): HTMLElement {
  const row = node('div', 'codeRow'); const code = node('bdi', 'codeValue', value); code.dir = 'ltr';
  const copy = button('', 'copyButton', () => void copyText(value, label)); copy.append(icon('copy'));
  copy.setAttribute('aria-label', `کپی ${label}: ${value}`); copy.title = `کپی ${label}`;
  row.append(node('span', 'codeLabel', label), code, copy); return row;
}
export function prices(entry: EntryListing): HTMLElement {
  const group = node('div', 'priceGroup');
  const values = node('div', 'prices');
  for (const [label, value, css] of [['پایه', entry.basePrice, 'base'], ['میانی · ۱۰٪', entry.middlePrice, 'middle'], ['نهایی · ۲۰٪', entry.finalPrice, 'final']]) {
    const cell = node('div', `priceCell ${css}`); cell.append(node('span', 'priceLabel', label), node('bdi', 'priceValue', money(value!))); values.append(cell);
  }
  group.append(values, node('div', 'currencyNote', entry.currencyUnit === 'IRR' ? 'ریال' : entry.currencyUnit === 'TOMAN' ? 'تومان' : 'واحد اعلام نشده'));
  // Stack deliberately when complete digits cannot fit; only visible page nodes are observed.
  let width = -1;
  let frame = 0;
  const observer = new ResizeObserver(([record]) => {
    if (!group.isConnected) { observer.disconnect(); return; }
    if (!record || record.contentRect.width === width) return;
    width = record.contentRect.width;
    cancelAnimationFrame(frame);
    // A stacked layout changes this group's height. Write outside the observer
    // delivery cycle so that the resize does not recursively notify itself.
    frame = requestAnimationFrame(() => {
      if (!group.isConnected) { observer.disconnect(); return; }
      values.classList.remove('stacked');
      const overflow = [...values.querySelectorAll<HTMLElement>('.priceValue')].some(value => value.getBoundingClientRect().width > value.parentElement!.clientWidth - 8);
      values.classList.toggle('stacked', overflow);
    });
  });
  observer.observe(group); return group;
}
export function entryCard(entry: EntryListing | EntrySummary, version: string, onDetail: (trigger: HTMLButtonElement) => void, onFamily?: (trigger: HTMLButtonElement) => void): HTMLElement {
  const card = node('article', 'resultCard'); card.dataset.entryId = String(entry.entryId);
  const identity = node('div', 'entryIdentity'); const head = node('div', 'entryHead');
  head.append(node('h3', 'partName', entry.partNameRaw));
  if ('matchType' in entry) head.append(node('span', 'matchBadge', matchLabel(entry.matchType)));
  identity.append(head, codeRow('کد فنی', entry.techRaw), codeRow('کد لجستیکی', entry.logRaw));
  const actions = node('div', 'entryActions');
  actions.append(node('span', 'modelCount', entry.modelCount ? `${entry.modelCount.toLocaleString('fa-IR')} خودرو مرتبط` : 'اطلاعات خودرو ثبت نشده'));
  const buttons = node('div', 'cardButtons');
  const detail = button('جزئیات و خودروها ←', 'detailToggle', () => onDetail(detail)); detail.setAttribute('aria-haspopup', 'dialog');
  if (onFamily) { const family = button('خانوادهٔ کد', 'familySearchButton', () => onFamily(family)); family.setAttribute('aria-haspopup', 'dialog'); buttons.append(family); }
  buttons.append(detail);
  const history=button('سابقه ناکافی', 'historyBadge neutral',()=>window.dispatchEvent(new CustomEvent('partavar:history-entry',{detail:{version,entryId:entry.entryId,entry}})));history.dataset.historyEntry=String(entry.entryId);history.dataset.historyVersion=version;history.title='نمایش تاریخچهٔ مستند قیمت';buttons.append(history);
  const operations=node('div','entryOperations');
  for(const [action,label,css] of [['invoice','فاکتور +','invoiceAction'],['purchase','لیست خرید +','purchaseAction'],['package','پکیج +','packageAction'],['related','قطعات مرتبط','relatedAction']]) operations.append(button(label!,'operationButton '+css,()=>window.dispatchEvent(new CustomEvent('partavar:entry-action',{detail:{entry,action}}))));
  actions.append(buttons,operations); card.append(identity, prices(entry), actions); return card;
}
export function entrySummaryText(entry: EntryListing): string {
  return `${entry.partNameRaw}\nکد فنی: ${entry.techRaw}\nکد لجستیکی: ${entry.logRaw}\nپایه: ${money(entry.basePrice)}\nمیانی (+۱۰٪ پایه): ${money(entry.middlePrice)}\nنهایی (+۲۰٪ پایه): ${money(entry.finalPrice)}\nواحد: ${entry.currencyUnit === 'UNKNOWN' ? 'اعلام نشده' : entry.currencyUnit === 'IRR' ? 'ریال' : 'تومان'}`;
}
function matchLabel(type: EntrySummary['matchType']): string {
  if (type.endsWith('Exact')) return 'تطبیق دقیق';
  if (type.endsWith('Prefix')) return 'شروع کد / نام';
  if (type.endsWith('Infix')) return 'بخشی از کد';
  if (type.startsWith('alias')) return 'نام جایگزین';
  if (type.endsWith('Terms')) return 'همهٔ واژه‌ها';
  return 'عبارت نام';
}
