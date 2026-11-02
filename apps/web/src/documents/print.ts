import { documentTotals, lineTotal, type OperationalDocument, type PrintTemplate } from '../../../../packages/domain/src/documents.js';
import { currencyLabel, escapeHTML as e, money, vehicleLabel } from './format.js';
export function renderPrintDocument(doc: OperationalDocument, template: PrintTemplate): string {
  const title = doc.kind === 'invoice' ? template.documentTitle : doc.kind === 'purchase' ? 'لیست خرید قطعات' : 'پکیج قطعات';
  const columns = 6 + Number(template.showLogisticsCode) + Number(template.showVehicle);
  const totals = Object.entries(documentTotals(doc.lines).byCurrency).map(([unit,total]) => `<p class="printTotal"><span>جمع کل · ${e(currencyLabel(unit as 'UNKNOWN'|'IRR'|'TOMAN'))}</span><bdi dir="ltr">${e(money(total!))}</bdi></p>`).join('');
  return `<article class="partavarPrintDocument" dir="rtl" aria-label="${e(title)}"><header class="printHeading"><div><p class="printCompany">${e(template.companyName)}</p><h1>${e(title)}</h1>${doc.name ? `<p>${e(doc.name)}</p>`:''}</div><div class="printMeta">${template.showDocumentNumber ? `<p>شماره: <bdi dir="ltr">${e(doc.documentNumber || '—')}</bdi></p>`:''}${template.showDate ? `<p>تاریخ: <bdi dir="ltr">${e(doc.date)}</bdi></p>`:''}</div></header>
  ${template.showCustomer && (doc.customer.name || doc.customer.phone || doc.customer.reference) ? `<section class="printCustomer"><span>مشتری: ${e(doc.customer.name || '—')}</span>${doc.customer.phone ? `<span>تلفن: <bdi dir="ltr">${e(doc.customer.phone)}</bdi></span>`:''}${doc.customer.reference ? `<span>مرجع: ${e(doc.customer.reference)}</span>`:''}</section>`:''}
  <table class="printTable"><colgroup><col style="width:5%"><col style="width:${47-Number(template.showLogisticsCode)*14-Number(template.showVehicle)*13}%"><col style="width:15%">${template.showLogisticsCode?'<col style="width:14%">':''}${template.showVehicle?'<col style="width:13%">':''}<col style="width:7%"><col style="width:13%"><col style="width:13%"></colgroup><thead><tr><th scope="col">ردیف</th><th scope="col">نام قطعه</th><th scope="col">کد فنی</th>${template.showLogisticsCode?'<th scope="col">کد لجستیکی</th>':''}${template.showVehicle?'<th scope="col">خودرو / زمینه</th>':''}<th scope="col">تعداد</th><th scope="col">قیمت واحد</th><th scope="col">جمع ردیف</th></tr></thead><tbody>
  ${doc.lines.map((line,i) => `<tr><td>${e(String(i+1))}</td><td>${e(line.partName)}${line.identityStatus==='legacy-ambiguous'?'<small class="printLegacy">هویت قدیمی حل نشده</small>':''}</td><td class="printCode"><bdi dir="ltr">${e(line.technicalCode)}</bdi></td>${template.showLogisticsCode?`<td class="printCode"><bdi dir="ltr">${e(line.logisticsCode || '—')}</bdi></td>`:''}${template.showVehicle?`<td>${e(vehicleLabel(line))}</td>`:''}<td><bdi dir="ltr">${e(money(line.quantity))}</bdi></td><td class="printAmount"><bdi dir="ltr">${e(money(line.unitPrice))}</bdi><small>${e(currencyLabel(line.currencyUnit))}</small></td><td class="printAmount"><bdi dir="ltr">${e(money(lineTotal(line)))}</bdi></td></tr>`).join('') || `<tr><td colspan="${columns}">ردیفی ثبت نشده است.</td></tr>`}
  </tbody></table><section class="printTotals">${totals}</section>${template.showNotes && doc.notes?`<section class="printNotes"><b>یادداشت</b><p>${e(doc.notes)}</p></section>`:''}${template.footer?`<footer class="printFooter">${e(template.footer)}</footer>`:''}</article>`;
}
export function mountPrintView(doc: OperationalDocument, template: PrintTemplate, onClose?: () => void): () => void {
  const old = document.getElementById('partavarPrintView'); old?.remove();
  const beforeURL = `${location.pathname}${location.search}${location.hash}`;
  const root = document.createElement('section'); root.id = 'partavarPrintView'; root.className = 'partavarPrintView'; root.dir = 'rtl';
  const toolbar = document.createElement('nav'); toolbar.className = 'printToolbar'; toolbar.setAttribute('aria-label','کنترل چاپ');
  const print = document.createElement('button'); print.type='button'; print.className='docButton primary'; print.textContent='چاپ / ذخیره PDF'; print.addEventListener('click',() => window.print());
  const back = document.createElement('button'); back.type='button'; back.className='docButton'; back.textContent='بازگشت به سند';
  const hint = document.createElement('span'); hint.textContent='کاغذ A4 · برای PDF، مقصد چاپ را ذخیره به‌صورت PDF انتخاب کنید.';
  toolbar.append(back,print,hint); root.append(toolbar);
  const content = document.createElement('div'); content.innerHTML=renderPrintDocument(doc,template); root.append(content); document.body.append(root); document.body.classList.add('partavarPrinting');
  const url = new URL(location.href); url.searchParams.set('print',doc.id); history.replaceState({...history.state, partavarPrint:doc.id},'',url);
  const close = (): void => { root.remove(); document.body.classList.remove('partavarPrinting'); const restore=new URL(beforeURL,location.origin); restore.searchParams.delete('print'); history.replaceState({...history.state, partavarPrint:null},'',restore); window.removeEventListener('popstate',close); onClose?.(); };
  back.addEventListener('click',close); window.addEventListener('popstate',close); back.focus();
  window.dispatchEvent(new CustomEvent('partavar:print-ready',{detail:{id:doc.id,kind:doc.kind}})); return close;
}
