import type { EntryListing, VehicleOption } from '@partsfinder/contracts';
import { addDocumentLine, createDocument, createLineSnapshot, DEFAULT_PREFERENCES, documentTotals, integerString, lineTotal, priceForMode, transferLines, type DocumentKind, type DocumentLine, type OperationalDocument, type OperatorPreferences, type PackageTier, type PriceMode } from '../../../../packages/domain/src/documents.js';
import { currentOriginLegacyJSON, MAX_BACKUP_BYTES, parseOperationsImport, type OperationsImport } from './backup.js';
import { currencyLabel, modeLabel, money, vehicleLabel } from './format.js';
import { mountPrintView } from './print.js';
import { exportOperationsBackup, getDraft, getPreferences, importOperationsData, listSavedDocuments, openSavedDocument, operationsDatabase, removeSavedDocument, saveDraft, savePreferences, saveToHistory } from './store.js';
import { downloadBlob, downloadDocumentXlsx } from './xlsx.js';
import '../styles/documents.css';
export { getPreferences, savePreferences } from './store.js';
export type { OperatorPreferences, OperationalDocument, DocumentLine, DocumentKind, PriceMode, PackageTier } from '../../../../packages/domain/src/documents.js';
export type DocumentArea = 'invoices' | 'purchase' | 'packages' | 'settings';
const names: Record<DocumentKind,string> = {invoice:'فاکتور',purchase:'لیست خرید',package:'پکیج'};
const kinds: Record<Exclude<DocumentArea,'settings'>,DocumentKind> = {invoices:'invoice',purchase:'purchase',packages:'package'};
const areas: Record<DocumentKind,DocumentArea> = {invoice:'invoices',purchase:'purchase',package:'packages'};
function node<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] { const element=document.createElement(tag); element.className=cls; if(text!==undefined) element.textContent=text; return element; }
function action(label: string, handler: () => void, cls = ''): HTMLButtonElement { const b=node('button',`docButton ${cls}`,label); b.type='button'; b.addEventListener('click',handler); return b; }
function digits(value: string): string { return value.replace(/[۰-۹]/g,x=>String(x.charCodeAt(0)-1776)).replace(/[٠-٩]/g,x=>String(x.charCodeAt(0)-1632)).replace(/[,٬\s]/g,''); }
function percentToBps(raw: string): number { const value=digits(raw).replace('٫','.'); if(!/^-?\d{1,5}(\.\d{1,2})?$/.test(value)) throw new TypeError('درصد باید عددی با حداکثر دو رقم اعشار باشد.'); const negative=value.startsWith('-'), parts=value.replace('-','').split('.'), result=Number(parts[0])*100+Number((parts[1]??'').padEnd(2,'0')); const bps=negative?-result:result; if(bps < -10000 || bps > 1000000) throw new TypeError('درصد باید بین ۱۰۰- و ۱۰۰۰۰ باشد.'); return bps; }
let fieldSequence=0;
function field(label: string, input: HTMLElement, hint?: string): HTMLLabelElement { const wrap=node('label','docField'),title=node('span','docFieldLabel',label);title.id=`doc-field-label-${++fieldSequence}`;input.setAttribute('aria-labelledby',title.id);wrap.append(title,input);if(hint){const description=node('small','docHint',hint);description.id=`doc-field-hint-${fieldSequence}`;input.setAttribute('aria-describedby',description.id);wrap.append(description);}return wrap; }
function textInput(value: string, onChange: (value: string) => void, key: string, numeric=false): HTMLInputElement { const input=node('input','docInput'); input.type='text'; input.value=value; input.dataset.docKey=key; if(numeric) { input.inputMode='numeric'; input.dir='ltr'; } input.addEventListener('change',()=>onChange(input.value)); return input; }
function selectInput<T extends string>(value:T, choices: Array<[T,string]>, change:(value:T)=>void): HTMLSelectElement { const select=node('select','docInput'); for(const [v,label] of choices) { const opt=node('option','',label); opt.value=v; select.append(opt); } select.value=value; select.addEventListener('change',()=>change(select.value as T)); return select; }
export class DocumentWorkspace {
  private area: DocumentArea='invoices';
  private current: OperationalDocument | null=null;
  private preferences: OperatorPreferences=structuredClone(DEFAULT_PREFERENCES);
  private history: OperationalDocument[]=[];
  private tail: Promise<void>=Promise.resolve();
  private initialized=false;
  private status='';
  private error=false;
  private statusNode: HTMLElement | null=null;
  constructor(private readonly root: HTMLElement) { root.classList.add('documentWorkspace'); root.dir='rtl'; }
  async initialize(): Promise<void> {
    if(this.initialized) return;
    await operationsDatabase.open(); this.preferences=await getPreferences(); this.initialized=true;
    window.addEventListener('partavar:preferences-changed',()=>void getPreferences().then(value=>{this.preferences=value;}));
    const printId=new URL(location.href).searchParams.get('print');
    if(printId) { const saved=await operationsDatabase.documents.get(printId); if(saved) mountPrintView(saved,this.preferences.printTemplate); }
  }
  async show(area: DocumentArea): Promise<void> {
    await this.initialize(); await this.tail; this.area=area; this.status='';
    if(area!=='settings') { this.current=await getDraft(kinds[area]); this.history=await listSavedDocuments(kinds[area]); }
    else this.preferences=await getPreferences();
    this.render();
  }
  async addEntry(entry: EntryListing, version: string, vehicle: VehicleOption|null, target: DocumentKind): Promise<void> {
    await this.initialize();
    let selection:{mode:PackageTier|'custom';customBps:number|null;quantity:string}|null={mode:target==='package'?this.preferences.defaultPackageTier:'base',customBps:null,quantity:'1'};
    if(target==='invoice') selection=await this.pickPrice(entry);
    if(!selection) return;
    const line=createLineSnapshot(entry,version,vehicle,selection.mode,selection.customBps,selection.quantity);
    await this.enqueue(async()=>{
      const draft=await getDraft(target); const updated=await saveDraft(addDocumentLine(draft,line));
      if(this.area===areas[target]) {this.current=updated;this.history=await listSavedDocuments(target);this.status=`قطعه به ${names[target]} افزوده شد.`;this.error=false;this.render();}
      window.dispatchEvent(new CustomEvent('partavar:document-added',{detail:{entry,version,vehicle,target}}));
    });
  }
  private async enqueue(task:()=>Promise<void>):Promise<void> {
    const next=this.tail.then(task); this.tail=next.catch(error=>{this.message(error instanceof Error?error.message:'ذخیره انجام نشد؛ دوباره تلاش کنید.',true);}); await next;
  }
  private run(task:()=>Promise<void>):void { void this.enqueue(task).catch(()=>undefined); }
  private message(text:string,error=false):void {this.status=text;this.error=error;if(this.statusNode){this.statusNode.textContent=text;this.statusNode.className=`docStatus ${error?'error':''}`;this.statusNode.hidden=!text;this.statusNode.setAttribute('role',error?'alert':'status');}}
  private async persist(render=true):Promise<void> { if(!this.current)return;this.current=await saveDraft(this.current);if(render)this.render(); }
  private render():void {
    const active=document.activeElement, focus=active instanceof HTMLElement?active.dataset.docKey:undefined;
    const edit=active instanceof HTMLInputElement||active instanceof HTMLTextAreaElement?{value:active.value,start:active.selectionStart,end:active.selectionEnd}:null;
    this.root.replaceChildren();
    this.statusNode=node('p',`docStatus ${this.error?'error':''}`,this.status);this.statusNode.setAttribute('aria-live','polite');this.statusNode.setAttribute('role',this.error?'alert':'status');this.statusNode.hidden=!this.status;
    if(this.area==='settings') this.renderSettings(); else if(this.current) this.renderDocument();
    this.root.append(this.statusNode);
    if(this.area!=='settings'&&this.current) window.dispatchEvent(new CustomEvent('partavar:document-rendered',{detail:{entries:this.current.lines.filter(line=>line.identityStatus==='exact'&&line.entryId!==null).slice(0,20).map(line=>({entryId:line.entryId,catalogueVersion:line.catalogueVersion}))}}));
    if(focus) { const target=[...this.root.querySelectorAll<HTMLElement>('[data-doc-key]')].find(el=>el.dataset.docKey===focus);if(target){if(edit&&(target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement)){target.value=edit.value;target.focus();try{target.setSelectionRange(edit.start,edit.end);}catch{/* Non-text inputs have no selection range. */}}else target.focus();} }
  }
  private renderDocument():void {
    const doc=this.current!;
    const header=node('header','docHeading');const title=node('div');title.append(node('p','docEyebrow','اسناد عملیاتی'),node('h2','',`${names[doc.kind]} · ${doc.sourceDocumentId?'ویرایش سند ذخیره‌شده':'پیش‌نویس'}`),node('p','docHint','تغییرات پیش‌نویس در این مرورگر ذخیره می‌شود.'));
    const actions=node('div','docActions');
    actions.append(action(`${names[doc.kind]} جدید`,()=>this.run(async()=>{if(doc.lines.length&&!confirm(`پیش‌نویس ${names[doc.kind]} پاک شود؟ سوابق ذخیره‌شده باقی می‌ماند.`))return;this.current=await saveDraft(createDocument(doc.kind));this.message('پیش‌نویس جدید آماده است.');this.render();})),action(doc.sourceDocumentId?'ذخیره تغییرات':'ذخیره در سوابق',()=>this.run(async()=>{if(!this.current?.lines.length){this.message('ابتدا قطعه‌ای به سند اضافه کنید.',true);return;}const saved=await saveToHistory(this.current);this.current=await getDraft(doc.kind);this.history=await listSavedDocuments(doc.kind);this.status=`${names[doc.kind]} ذخیره شد: ${saved.name||saved.documentNumber||'بدون عنوان'}`;this.error=false;this.render();}),'primary'));
    header.append(title,actions);this.root.append(header);
    const form=node('section','docHeaderForm');form.setAttribute('aria-label','مشخصات سند');
    form.append(field(doc.kind==='package'?'نام پکیج':'عنوان سند',textInput(doc.name,v=>this.run(async()=>{this.current!.name=v;await this.persist(false);}), 'doc-name')));
    if(doc.kind==='invoice') {
      form.append(field('شماره فاکتور',textInput(doc.documentNumber,v=>this.run(async()=>{this.current!.documentNumber=v;await this.persist(false);}), 'doc-number')));
      const date=node('input','docInput');date.type='date';date.value=doc.date;date.addEventListener('change',()=>this.run(async()=>{this.current!.date=date.value;await this.persist(false);}));form.append(field('تاریخ',date));
    }
    this.root.append(form);
    if(doc.kind==='invoice') {
      const details=node('details','docCustomer');details.open=Boolean(doc.customer.name||doc.customer.phone||doc.customer.reference);details.append(node('summary','','مشخصات مشتری (اختیاری)'));
      const grid=node('div','docHeaderForm');for(const [key,label] of [['name','نام مشتری'],['phone','تلفن مشتری'],['reference','مرجع مشتری']] as const) grid.append(field(label,textInput(doc.customer[key],v=>this.run(async()=>{this.current!.customer[key]=v;await this.persist(false);}),`customer-${key}`,key==='phone')));details.append(grid);this.root.append(details);
    }
    if(doc.lines.length) {
      const section=node('section','docLines');section.setAttribute('aria-label','ردیف‌های سند');doc.lines.forEach((line,index)=>section.append(this.lineEditor(line,index)));this.root.append(section);
      const summary=node('div','docSummary');const totals=documentTotals(doc.lines);summary.append(node('span','docHint',`${money(String(doc.lines.length))} ردیف · ${money(totals.quantity)} عدد`));
      const sums=node('div','docTotalGroup');for(const [currency,total] of Object.entries(totals.byCurrency)) {const row=node('p','docGrandTotal');row.append(node('span','',`جمع · ${currencyLabel(currency as DocumentLine['currencyUnit'])}`),node('bdi','',money(total!)));sums.append(row);}summary.append(sums);this.root.append(summary);
    } else {const empty=node('div','docEmpty');empty.append(node('h3','',`${names[doc.kind]} خالی است`),node('p','','از نتیجهٔ جستجو، قطعه را با کد لجستیکی دقیق به این سند اضافه کنید.'));this.root.append(empty);}
    const notes=node('textarea','docInput docNotes');notes.rows=2;notes.value=doc.notes;notes.dataset.docKey='doc-notes';notes.addEventListener('change',()=>this.run(async()=>{this.current!.notes=notes.value;await this.persist(false);}));this.root.append(field('یادداشت (اختیاری)',notes));
    const tools=node('div','docActions docExportActions');
    const exportXlsx=action('خروجی Excel (.xlsx)',()=>{downloadDocumentXlsx(this.current!);this.message('فایل Excel ساخته شد.');});exportXlsx.disabled=!doc.lines.length;
    const print=action('نمای چاپ / PDF',()=>this.run(async()=>{await this.persist(false);mountPrintView(this.current!,this.preferences.printTemplate);}));print.disabled=!doc.lines.length;tools.append(exportXlsx,print);
    if(doc.kind==='purchase') {const toPackage=action('ساخت پکیج از این لیست',()=>this.run(async()=>{const pkg=await getDraft('package');if(pkg.lines.length&&!confirm('ردیف‌های خرید به پکیج فعلی افزوده شود؟'))return;const next=transferLines(pkg,this.current!.lines);if(!next.name)next.name=doc.name||'پکیج قطعات';await saveDraft(next);await this.showAfterQueue('packages');}));toPackage.disabled=!doc.lines.length;tools.append(toPackage);}
    if(doc.kind==='package') {const toInvoice=action('افزودن پکیج به فاکتور',()=>this.run(async()=>{const invoice=await getDraft('invoice');await saveDraft(transferLines(invoice,this.current!.lines));this.status='پکیج با همان قیمت‌ها و تعداد به فاکتور اضافه شد.';await this.showAfterQueue('invoices');window.dispatchEvent(new CustomEvent('partavar:document-area',{detail:{area:'invoices'}}));}),'docTransfer');toInvoice.disabled=!doc.lines.length;tools.append(toInvoice);}
    this.root.append(tools);this.renderHistory(doc.kind);
  }
  private async showAfterQueue(area:Exclude<DocumentArea,'settings'>):Promise<void> {this.area=area;this.current=await getDraft(kinds[area]);this.history=await listSavedDocuments(kinds[area]);this.render();}
  private lineEditor(line:DocumentLine,index:number):HTMLElement {
    const row=node('article','docLine');row.dataset.lineId=line.lineId;
    const identity=node('div','docLineIdentity');const top=node('div','docLineTop');top.append(node('h3','',`${money(String(index+1))}. ${line.partName}`),action('حذف',()=>this.run(async()=>{if(!confirm('این ردیف از پیش‌نویس حذف شود؟'))return;this.current!.lines=this.current!.lines.filter(x=>x.lineId!==line.lineId);await this.persist();}),'docDanger'));identity.append(top);
    const codes=node('div','docCodes');for(const [label,value] of [['کد فنی',line.technicalCode],['کد لجستیکی',line.logisticsCode||'—']]) {const item=node('span','docCode');item.append(node('small','',label),node('bdi','',value));codes.append(item);}identity.append(codes,node('p','docHint',vehicleLabel(line)));
    const provenance=node('small','docProvenance',line.identityStatus==='legacy-ambiguous'?'دادهٔ قدیمی · هویت لجستیکی حل نشده':`ورودی ${line.entryId} · نسخه ${line.catalogueVersion.length>32?`${line.catalogueVersion.slice(0,12)}…${line.catalogueVersion.slice(-12)}`:line.catalogueVersion}`);provenance.dir='auto';provenance.title=line.catalogueVersion;identity.append(provenance);
    if(this.current?.kind!=='invoice'&&line.identityStatus==='exact'&&line.entryId!==null){const badge=action('سابقه ناکافی',()=>window.dispatchEvent(new CustomEvent('partavar:history-entry',{detail:{entryId:line.entryId,version:line.catalogueVersion,entry:{partNameRaw:line.partName,techRaw:line.technicalCode,logRaw:line.logisticsCode,basePrice:line.basePrice}}})));badge.className='historyBadge neutral';badge.dataset.historyEntry=String(line.entryId);badge.dataset.historyVersion=line.catalogueVersion;identity.append(badge);}
    if(line.identityStatus==='legacy-ambiguous')row.classList.add('docLegacy');
    const controls=node('div','docLineControls');controls.dataset.custom=String(line.priceMode==='custom');
    const setLine=(fn:(value:DocumentLine)=>void,rerender=true):void=>this.run(async()=>{const current=this.current!.lines.find(x=>x.lineId===line.lineId);if(!current)return;fn(current);await this.persist(rerender);if(!rerender)this.updateTotals();});
    const choices:Array<[PriceMode,string]>=[['base','پایه'],['middle','میانی +۱۰٪'],['final','نهایی +۲۰٪'],['custom','درصد سفارشی'],['manual','قیمت دستی']];
    const mode=selectInput(line.priceMode,choices,value=>setLine(current=>{if(value!=='manual'&&current.basePrice===null)throw new TypeError('قیمت پایهٔ قدیمی ثبت نشده؛ قیمت واحد را دستی وارد کنید.');current.priceMode=value;current.customBps=value==='custom'?(current.customBps??0):null;if(value!=='manual')current.unitPrice=priceForMode(current.basePrice!,value,current.customBps);}));mode.dataset.docKey=`mode-${line.lineId}`;controls.append(field('روش قیمت',mode));
    if(line.priceMode==='custom') controls.append(field('درصد روی پایه',textInput(String((line.customBps??0)/100),value=>setLine(current=>{const bps=percentToBps(value);current.customBps=bps;current.unitPrice=priceForMode(current.basePrice!,'custom',bps);},false),`percent-${line.lineId}`)));
    controls.append(field('تعداد',textInput(line.quantity,value=>setLine(current=>{current.quantity=integerString(digits(value),true);},false),`quantity-${line.lineId}`,true)),field('قیمت واحد · قابل ویرایش',textInput(line.unitPrice,value=>setLine(current=>{current.unitPrice=integerString(digits(value));current.priceMode='manual';current.customBps=null;},false),`price-${line.lineId}`,true)));
    const total=node('div','docLineTotal');total.append(node('small','','جمع ردیف'),node('bdi','',money(lineTotal(line))),node('small','',currencyLabel(line.currencyUnit)));
    const base=node('p','docHint',line.basePrice===null?'قیمت پایه ثبت نشده':`پایهٔ ثبت‌شده: ${money(line.basePrice)} · ${modeLabel(line.priceMode,line.customBps)}`);controls.append(total);row.append(identity,controls,base);return row;
  }
  private updateTotals():void {
    if(!this.current)return;
    for(const row of this.root.querySelectorAll<HTMLElement>('.docLine')) {
      const line=this.current.lines.find(x=>x.lineId===row.dataset.lineId);if(!line)continue;
      const total=row.querySelector('.docLineTotal bdi');if(total)total.textContent=money(lineTotal(line));
      const mode=row.querySelector<HTMLSelectElement>('.docLineControls select');if(mode)mode.value=line.priceMode;
      const controls=row.querySelector<HTMLElement>('.docLineControls');if(controls)controls.dataset.custom=String(line.priceMode==='custom');
      const percent=row.querySelector<HTMLInputElement>('[data-doc-key^="percent-"]');if(percent)percent.closest<HTMLElement>('.docField')!.hidden=line.priceMode!=='custom';
      const price=row.querySelector<HTMLInputElement>('[data-doc-key^="price-"]');if(price&&document.activeElement!==price)price.value=line.unitPrice;
      const base=row.lastElementChild;if(base?.classList.contains('docHint'))base.textContent=line.basePrice===null?'قیمت پایه ثبت نشده':`پایهٔ ثبت‌شده: ${money(line.basePrice)} · ${modeLabel(line.priceMode,line.customBps)}`;
    }
    const totals=documentTotals(this.current.lines),summary=this.root.querySelector('.docSummary');if(summary){const meta=summary.querySelector('.docHint');if(meta)meta.textContent=`${money(String(this.current.lines.length))} ردیف · ${money(totals.quantity)} عدد`;const values=Object.values(totals.byCurrency);summary.querySelectorAll('.docGrandTotal bdi').forEach((element,index)=>{element.textContent=money(values[index]??'0');});}
  }
  private renderHistory(kind:DocumentKind):void {
    const section=node('section','docHistory');const heading=node('div','docHistoryHeading');heading.append(node('h3','',`سوابق ${names[kind]}`),node('span','docHint',`${money(String(this.history.length))} سند ذخیره‌شده`));section.append(heading);
    if(!this.history.length) section.append(node('p','docHint','هنوز سندی ذخیره نشده است.'));
    for(const saved of this.history) {
      const row=node('article','docHistoryItem');const info=node('div');info.append(node('h4','',saved.name||saved.documentNumber||`${names[kind]} بدون عنوان`),node('p','docHint',`${new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(saved.updatedAt))} · ${money(String(saved.lines.length))} ردیف`));
      const actions=node('div','docActions');const open=(duplicate:boolean):void=>this.run(async()=>{if(this.current!.lines.length&&!confirm(`پیش‌نویس فعلی با ${duplicate?'رونوشت این سند':'این سند'} جایگزین شود؟`))return;this.current=await openSavedDocument(saved.id,duplicate);this.status=duplicate?'رونوشت آمادهٔ ویرایش است.':'سند از سوابق باز شد.';this.error=false;this.render();});
      actions.append(action('بازکردن',()=>open(false)),action('رونوشت',()=>open(true)),action('Excel',()=>downloadDocumentXlsx(saved)),action('چاپ / PDF',()=>mountPrintView(saved,this.preferences.printTemplate)),action('حذف',()=>this.run(async()=>{if(!confirm(`«${saved.name||saved.documentNumber||names[kind]}» از سوابق حذف شود؟`))return;await removeSavedDocument(saved.id);this.current=await getDraft(kind);this.history=await listSavedDocuments(kind);this.status='سند از سوابق حذف شد.';this.error=false;this.render();}),'docDanger'));
      if(kind==='package') actions.append(action('افزودن به فاکتور',()=>this.run(async()=>{await saveDraft(transferLines(await getDraft('invoice'),saved.lines));this.status='پکیج با قیمت‌ها و تعداد ثبت‌شده به فاکتور افزوده شد.';await this.showAfterQueue('invoices');window.dispatchEvent(new CustomEvent('partavar:document-area',{detail:{area:'invoices'}}));})));
      row.append(info,actions);section.append(row);
    }
    this.root.append(section);
  }
  private renderSettings():void {
    const heading=node('header','docHeading');const title=node('div');title.append(node('p','docEyebrow','تنظیمات اپراتور'),node('h2','','قیمت، قالب چاپ و پشتیبان'));heading.append(title);this.root.append(heading);
    const prefs=structuredClone(this.preferences);
    const pricing=node('section','docSettingsSection');pricing.append(node('h3','','قیمت‌گذاری و نشان تاریخچه'));
    const grid=node('div','docSettingsGrid');
    grid.append(field('سطح پیش‌فرض قیمت پکیج',selectInput(prefs.defaultPackageTier,[['base','پایه (پیش‌فرض امن)'],['middle','میانی +۱۰٪'],['final','نهایی +۲۰٪']],v=>{prefs.defaultPackageTier=v;}),'فقط روی قطعاتی اثر دارد که بعداً به پکیج اضافه می‌شوند.'));
    const classification=prefs.priceClassification;
    grid.append(field('روش دسته‌بندی تغییر قیمت',selectInput(classification.strategy,[['threshold','آستانهٔ درصد تغییر'],['percentile','صدک در مجموعهٔ قابل مقایسه']],v=>{classification.strategy=v;})));
    grid.append(field('مرز تغییر متوسط (درصد)',textInput(String(classification.mediumBps/100),v=>{try{classification.mediumBps=percentToBps(v);}catch(error){this.message((error as Error).message,true);}},'settings-medium')),
      field('مرز تغییر زیاد (درصد)',textInput(String(classification.highBps/100),v=>{try{classification.highBps=percentToBps(v);}catch(error){this.message((error as Error).message,true);}},'settings-high')),
      field('مرز صدک متوسط (۰ تا ۱۰۰)',textInput(String(classification.mediumPercentileBps/100),v=>{try{classification.mediumPercentileBps=percentToBps(v);}catch(error){this.message((error as Error).message,true);}},'settings-percentile-medium')),
      field('مرز صدک زیاد (۰ تا ۱۰۰)',textInput(String(classification.highPercentileBps/100),v=>{try{classification.highPercentileBps=percentToBps(v);}catch(error){this.message((error as Error).message,true);}},'settings-percentile-high')),
      field('حداقل مشاهده برای تاریخچه',textInput(String(classification.minimumObservations),v=>{classification.minimumObservations=Number(digits(v));},'settings-min-observations',true)));
    pricing.append(grid,node('p','docHint','مرز متوسط باید از مرز زیاد کوچک‌تر باشد. مرزهای آستانه و صدک مستقل ذخیره می‌شوند. این نشان، تغییر تاریخی قیمت را توصیف می‌کند.'));this.root.append(pricing);
    const printing=node('section','docSettingsSection');printing.append(node('h3','','قالب چاپ فاکتور'));
    const printGrid=node('div','docSettingsGrid');
    printGrid.append(field('نام شرکت / نمایش‌دهنده',textInput(prefs.printTemplate.companyName,v=>{prefs.printTemplate.companyName=v;},'template-company')),field('عنوان فاکتور',textInput(prefs.printTemplate.documentTitle,v=>{prefs.printTemplate.documentTitle=v;},'template-title')));
    const footer=node('textarea','docInput docNotes');footer.value=prefs.printTemplate.footer;footer.rows=2;footer.addEventListener('change',()=>{prefs.printTemplate.footer=footer.value;});printGrid.append(field('پانوشت چاپ (اختیاری)',footer));
    const checks=node('div','docTemplateChecks');for(const [key,label] of [['showDocumentNumber','شماره سند'],['showDate','تاریخ'],['showCustomer','مشخصات مشتری'],['showNotes','یادداشت'],['showLogisticsCode','کد لجستیکی'],['showVehicle','زمینهٔ خودرو']] as const) {const checkbox=node('input');checkbox.type='checkbox';checkbox.checked=prefs.printTemplate[key];checkbox.addEventListener('change',()=>{prefs.printTemplate[key]=checkbox.checked;});checks.append(field(label,checkbox));}
    printing.append(printGrid,checks,node('p','docHint','قالب پیش‌فرض A4 است. مالیات یا محاسبهٔ قانونی اضافه نشده است. نمونهٔ نهایی موردنظر شما می‌تواند جایگزین این قالب شود.'));this.root.append(printing);
    this.root.append(action('ذخیره تنظیمات',()=>this.run(async()=>{await savePreferences(prefs);this.preferences=await getPreferences();this.status='تنظیمات ذخیره شد.';this.error=false;this.render();}),'primary'));
    const backup=node('section','docSettingsSection');backup.append(node('h3','','پشتیبان اسناد و ورود نسخهٔ قدیمی'),node('p','docHint','پشتیبان JSON شامل پیش‌نویس‌ها، سوابق، پکیج‌ها و تنظیمات این مرورگر است. اطلاعات کاتالوگ در این فایل نیست. ورود فایل، اسناد را با شناسهٔ جدید به سوابق اضافه می‌کند.'));
    const controls=node('div','docActions');controls.append(action('دریافت پشتیبان JSON',()=>this.run(async()=>{const data=await exportOperationsBackup();downloadBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),`PartAvar-operations-${new Date().toISOString().slice(0,10)}.json`);this.message('پشتیبان ساخته شد؛ فایل را در محل امن نگه دارید.');})));
    const upload=node('input','docFileInput');upload.type='file';upload.accept='.json,application/json';upload.setAttribute('aria-label','انتخاب فایل پشتیبان JSON');upload.addEventListener('change',()=>{const file=upload.files?.[0];if(!file)return;void (async()=>{try{if(file.size>MAX_BACKUP_BYTES)throw new TypeError('حداکثر اندازهٔ فایل ۱۰ مگابایت است.');this.previewImport(parseOperationsImport(await file.text()),file.name);}catch(error){this.message(error instanceof Error?error.message:'فایل خوانده نشد.',true);}finally{upload.value='';}})();});
    const fileLabel=node('label','docUploadLabel','انتخاب فایل برای ورود');fileLabel.append(upload);controls.append(fileLabel);
    controls.append(action('بررسی دادهٔ قدیمی این مبدا',()=>{try{const raw=currentOriginLegacyJSON(localStorage);if(!raw){this.message('هیچ کلید قدیمی در مبدأ فعلی پیدا نشد. دادهٔ فایل HTML یا سایت دیگری خودکار قابل دسترسی نیست.');return;}this.previewImport(parseOperationsImport(raw),'دادهٔ مرورگر در مبدأ فعلی');}catch(error){this.message(error instanceof Error?error.message:'دادهٔ قدیمی خوانده نشد.',true);}}));
    backup.append(controls,node('p','docHint','دسترسی مرورگر به localStorage محدود به همان مبدا است. برای نسخهٔ فایل HTML یا مبدأ دیگر، JSON کلیدهای قدیمی را از همان محیط صادر و اینجا انتخاب کنید. کد لجستیکی یا هویت حل‌نشدهٔ قدیمی حدس زده نمی‌شود.'));this.root.append(backup);
  }
  private previewImport(data:OperationsImport,sourceLabel:string):void {
    const dialog=node('dialog','docImportDialog');dialog.dir='rtl';const form=node('form','docDialogBody');form.append(node('h2','','بررسی و تأیید ورود'),node('p','docHint',sourceLabel),node('p','',`${money(String(data.documents.length))} سند · ${money(String(data.documents.reduce((sum,d)=>sum+d.lines.length,0)))} ردیف`),node('p','docHint',`مبدأ ثبت‌شده: ${data.origin}`));
    const counts=node('ul','docImportCounts');for(const kind of ['invoice','purchase','package'] as const) counts.append(node('li','',`${names[kind]}: ${money(String(data.documents.filter(d=>d.kind===kind).length))}`));form.append(counts);
    for(const warning of data.warnings)form.append(node('p','docImportWarning',warning));
    let includePreferences=false;
    if(data.preferences) {const check=node('input');check.type='checkbox';check.addEventListener('change',()=>{includePreferences=check.checked;});form.append(field('تنظیمات فایل نیز جایگزین تنظیمات فعلی شود',check));}
    const controls=node('div','docActions');const cancel=action('انصراف',()=>dialog.close());const apply=node('button','docButton primary','تأیید ورود به سوابق');apply.type='submit';apply.disabled=!data.documents.length&&!data.preferences;controls.append(cancel,apply);form.append(controls);
    const errorNode=node('p','docStatus error');errorNode.hidden=true;errorNode.setAttribute('role','alert');form.append(errorNode);dialog.append(form);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    form.addEventListener('submit',event=>{event.preventDefault();if(!confirm(`${data.documents.length} سند از «${sourceLabel}» به سوابق افزوده شود؟${includePreferences?' تنظیمات فعلی جایگزین خواهد شد.':''}`))return;apply.disabled=true;this.run(async()=>{try{const count=await importOperationsData(data,includePreferences);dialog.close();this.preferences=await getPreferences();this.status=`${money(String(count))} سند وارد شد. پیش‌نویس‌ها حفظ شدند.`;this.error=false;this.render();}catch(error){apply.disabled=false;errorNode.hidden=false;errorNode.textContent=error instanceof Error?error.message:'ورود انجام نشد.';throw error;}});});dialog.showModal();cancel.focus();
  }
  private pickPrice(entry:EntryListing):Promise<{mode:PackageTier|'custom';customBps:number|null;quantity:string}|null> {
    return new Promise(resolve=>{
      const dialog=node('dialog','docPricePicker');dialog.dir='rtl';const form=node('form','docDialogBody');
      form.append(node('h2','','افزودن به فاکتور'),node('h3','',entry.partNameRaw));const code=node('bdi','docPickerCode',`${entry.techRaw} · ${entry.logRaw}`);code.dir='ltr';form.append(code);
      let mode:PackageTier|'custom'='base';const choices:Array<[PackageTier|'custom',string]>=[['base',`پایه · ${money(entry.basePrice)}`],['middle',`میانی +۱۰٪ · ${money(entry.middlePrice)}`],['final',`نهایی +۲۰٪ · ${money(entry.finalPrice)}`],['custom','درصد سفارشی روی قیمت پایه']];
      const select=selectInput(mode,choices,v=>{mode=v;customField.hidden=v!=='custom';updatePreview();});form.append(field('روش قیمت',select));
      const percent=node('input','docInput');percent.type='text';percent.inputMode='decimal';percent.dir='ltr';percent.value='0';const customField=field('درصد سفارشی',percent,'حداکثر دو رقم اعشار؛ محاسبه مستقیم روی پایه است.');customField.hidden=true;form.append(customField);
      const quantity=node('input','docInput');quantity.type='text';quantity.inputMode='numeric';quantity.dir='ltr';quantity.value='1';form.append(field('تعداد',quantity));
      const preview=node('p','docPickerPreview');form.append(preview);const updatePreview=():void=>{try{const bps=mode==='custom'?percentToBps(percent.value):null;preview.textContent=`قیمت واحد: ${money(priceForMode(entry.basePrice,mode,bps))} · ${currencyLabel(entry.currencyUnit)}`;}catch{preview.textContent='درصد معتبر وارد کنید.';}};percent.addEventListener('input',updatePreview);updatePreview();
      const error=node('p','docStatus error');error.setAttribute('role','alert');error.hidden=true;form.append(error);
      const controls=node('div','docActions');const cancel=action('انصراف',()=>dialog.close());const apply=node('button','docButton primary','افزودن به فاکتور');apply.type='submit';controls.append(cancel,apply);form.append(controls);dialog.append(form);document.body.append(dialog);
      let result:{mode:PackageTier|'custom';customBps:number|null;quantity:string}|null=null;
      form.addEventListener('submit',event=>{event.preventDefault();try{const qty=integerString(digits(quantity.value),true),bps=mode==='custom'?percentToBps(percent.value):null;priceForMode(entry.basePrice,mode,bps);result={mode,customBps:bps,quantity:qty};dialog.close();}catch(err){error.textContent=err instanceof Error?err.message:'مقدار معتبر وارد کنید.';error.hidden=false;}});
      dialog.addEventListener('close',()=>{dialog.remove();resolve(result);},{once:true});dialog.showModal();select.focus();
    });
  }
}
