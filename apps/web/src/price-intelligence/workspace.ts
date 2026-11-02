import Dexie, { type Table } from 'dexie';
import type { EntryListing } from '@partsfinder/contracts';
import type { HistoryClassification, HistoryMetrics, PriceHistoryEntryDto, PriceHistoryListDto, PriceHistorySummaryDto, PriceHistorySummaryItem } from '../../../../packages/contracts/src/price-history.js';
import { classifyPriceHistory } from '../../../../packages/domain/src/price-history.js';
import { getPreferences } from '../documents/store.js';
import { readJson } from '../catalogue.js';
import { button } from '../ui/dom.js';
import { codeRow, money, node } from '../ui/entry.js';
type SummaryCache={key:string;version:string;revision:number;savedAt:number;item:PriceHistorySummaryItem};
type TimelineCache={key:string;savedAt:number;value:PriceHistoryEntryDto};
class EvidenceCache extends Dexie {
  summaries!:Table<SummaryCache,string>;timelines!:Table<TimelineCache,string>;
  constructor(){super('PartAvarPriceEvidence');this.version(1).stores({summaries:'key,savedAt',timelines:'key,savedAt'});}
}
const cache=new EvidenceCache();
const labels:Record<HistoryClassification,string>={high:'رشد بالا',medium:'رشد متوسط',low:'رشد کم',neutral:'سابقه ناکافی'};
const reasons:Record<string,string>={insufficient_history:'سابقهٔ کافی وجود ندارد.',undated_history:'تاریخ معتبر کافی ثبت نشده است.',ambiguous_history:'تطبیق بعضی شواهد مبهم است.',same_date_conflict:'قیمت‌های متناقض در یک تاریخ ثبت شده‌اند.',unknown_currency:'واحد قیمت منبع مشخص نیست.',mixed_currency:'واحد منابع متفاوت است.',zero_baseline:'قیمت آغازین صفر است؛ درصد معتبر نیست.'};
function percent(value:string|null):string {if(value===null)return '—';const bps=BigInt(value),sign=bps<0n?'−':bps>0n?'+':'';const n=bps<0n?-bps:bps;return `${sign}${money((n/100n).toString())}.${(n%100n).toString().padStart(2,'0')}٪`;}
function facts(metrics:HistoryMetrics):HTMLElement{
  const grid=node('dl','historyFacts');for(const [label,value] of [['اولین قیمت',metrics.earliestPrice===null?'—':money(metrics.earliestPrice)],['آخرین قیمت مستند',metrics.latestPrice===null?'—':money(metrics.latestPrice)],['تغییر کل',percent(metrics.cumulativeChangeBps)],['تغییر آخر',percent(metrics.previousChangeBps)],['تعداد تاریخ معتبر',metrics.observationCount.toLocaleString('fa-IR')],['بازهٔ مشاهده',`${metrics.firstDate??'—'} تا ${metrics.lastDate??'—'}`],['کمترین / بیشترین',`${metrics.minPrice===null?'—':money(metrics.minPrice)} / ${metrics.maxPrice===null?'—':money(metrics.maxPrice)}`]]){const item=node('div','');item.append(node('dt','',label),node('dd','',value));grid.append(item);}return grid;
}
export class PriceIntelligence {
  private version:string|null=null;
  private summaryController:AbortController|null=null;
  private readonly badgeRequests=new Map<string,AbortController>();
  private listController:AbortController|null=null;
  private timelineController:AbortController|null=null;
  private dialog:HTMLDialogElement|null=null;
  private lastPage:{version:string;ids:number[]}|null=null;
  private readonly page=(event:Event)=>{const d=(event as CustomEvent<{version:string;entries:Array<{entryId:number}>}>).detail;void this.badges(d.version,d.entries.map(x=>x.entryId));};
  private readonly documents=(event:Event)=>{const entries=(event as CustomEvent<{entries:Array<{entryId:number;catalogueVersion:string}>}>).detail.entries;const groups=new Map<string,number[]>();for(const entry of entries){const ids=groups.get(entry.catalogueVersion)??[];ids.push(entry.entryId);groups.set(entry.catalogueVersion,ids);}for(const [version,ids] of groups)void this.badges(version,ids,false);};
  private readonly preferences=()=>{if(this.lastPage)void this.badges(this.lastPage.version,this.lastPage.ids);};
  constructor(private readonly root:HTMLElement){root.classList.add('priceWorkspace');window.addEventListener('partavar:page-rendered',this.page);window.addEventListener('partavar:document-rendered',this.documents);window.addEventListener('partavar:preferences-changed',this.preferences);}
  setVersion(version:string|null):void {if(version!==this.version){this.summaryController?.abort();this.listController?.abort();this.timelineController?.abort();this.dialog?.close();this.lastPage=null;}this.version=version;}
  destroy():void {this.summaryController?.abort();for(const request of this.badgeRequests.values())request.abort();this.listController?.abort();this.timelineController?.abort();window.removeEventListener('partavar:page-rendered',this.page);window.removeEventListener('partavar:document-rendered',this.documents);window.removeEventListener('partavar:preferences-changed',this.preferences);this.dialog?.remove();}
  private async badges(version:string,ids:number[],replace=true):Promise<void>{
    ids=[...new Set(ids)].slice(0,20);if(!ids.length)return;
    if(replace){this.lastPage={version,ids};this.summaryController?.abort();}
    this.badgeRequests.get(version)?.abort();const controller=new AbortController();this.badgeRequests.set(version,controller);if(replace)this.summaryController=controller;
    const signal=controller.signal;
    let items:PriceHistorySummaryItem[]=[],stale=false;
    try{
      const dto=await readJson<PriceHistorySummaryDto>('price-history/summary',{version,ids:ids.join(',')},signal);items=dto.items;
      if(dto.catalogVersion!==version||signal?.aborted)return;
      // Cache only the last400 compact records, never the catalogue/history tables.
      void cache.transaction('rw',cache.summaries,async()=>{if(signal.aborted)return;await cache.summaries.bulkPut(items.map(item=>({key:`${version}:${item.entryId}`,version,revision:dto.revision,savedAt:Date.now(),item})));const excess=await cache.summaries.count()-400;if(excess>0)await cache.summaries.orderBy('savedAt').limit(excess).delete();}).catch(()=>undefined);
    }catch{if(signal?.aborted)return;stale=true;try{items=(await cache.summaries.bulkGet(ids.map(id=>`${version}:${id}`))).flatMap(row=>row?[row.item]:[]);}catch{/* History is optional; search stays usable. */}}
    const preferences=await getPreferences().catch(()=>null);if(signal?.aborted)return;
    for(const id of ids){const item=items.find(x=>x.entryId===id);const classification=item?classifyPriceHistory(item,preferences?.priceClassification):'neutral';
      document.querySelectorAll<HTMLButtonElement>(`[data-history-entry="${id}"]`).forEach(badge=>{if(badge.dataset.historyVersion!==version)return;badge.className=`historyBadge ${classification}`;badge.textContent=labels[classification];badge.title=item?`${labels[classification]} · تغییر ${percent(item.cumulativeChangeBps)} · ${item.observationCount} تاریخ${stale?' · آخرین سابقهٔ ذخیره‌شده؛ تازگی تأیید نشده':''}`:'تاریخچه در دسترس نیست یا سابقه کافی نیست';badge.setAttribute('aria-label',badge.title+'؛ نمایش جزئیات');});
    }
  }
  async entry(version:string,context:{entryId:number;entry:Pick<EntryListing,'partNameRaw'|'techRaw'|'logRaw'|'basePrice'>}):Promise<void>{
    this.timelineController?.abort();const controller=new AbortController();this.timelineController=controller;this.dialog?.remove();
    const trigger=document.activeElement;const dialog=node('dialog','historyDialog');this.dialog=dialog;dialog.setAttribute('aria-labelledby','historyTitle');
    const header=node('div','dialogHead'),title=node('h2','','تاریخچهٔ قیمت');title.id='historyTitle';const close=button('×','iconButton',()=>dialog.close());close.setAttribute('aria-label','بستن تاریخچه');header.append(title,close);const body=node('div','dialogBody');dialog.append(header,body);document.body.append(dialog);dialog.addEventListener('close',()=>{controller.abort();if(trigger instanceof HTMLElement&&trigger.isConnected)trigger.focus();},{once:true});dialog.showModal();
    const load=async(cursor?:string)=>{
      body.replaceChildren(node('p','loadingState','در حال خواندن شواهد قیمت…'));let dto:PriceHistoryEntryDto,stale=false;
      try{dto=await readJson(`price-history/entries/${context.entryId}`,{version,limit:50,cursor},controller.signal);if(dto.catalogVersion!==version||dto.entryId!==context.entryId)throw new Error('Version mismatch');if(!cursor)void cache.transaction('rw',cache.timelines,async()=>{await cache.timelines.put({key:`${version}:${context.entryId}`,savedAt:Date.now(),value:dto});const excess=await cache.timelines.count()-20;if(excess>0)await cache.timelines.orderBy('savedAt').limit(excess).delete();}).catch(()=>undefined);}
      catch{if(controller.signal.aborted)return;const saved=!cursor?await cache.timelines.get(`${version}:${context.entryId}`).catch(()=>undefined):undefined;if(!saved){body.replaceChildren(node('p','message show warn','تاریخچه در دسترس نیست یا هنگام خواندن تغییر کرده؛ از ابتدای تاریخچه تلاش کنید.'),button('تلاش دوباره از ابتدا','btn secondary',()=>void load()));return;}dto=saved.value;stale=true;}
      if(controller.signal.aborted)return;
      body.replaceChildren(node('h3','',context.entry.partNameRaw),codeRow('کد فنی',context.entry.techRaw),codeRow('کد لجستیکی',context.entry.logRaw));
      if(stale)body.append(node('p','detailNotice','آخرین تاریخچهٔ ذخیره‌شده · تازگی این نسخه بدون اتصال تأیید نشده است.'));
      body.append(node('p','hint',`قیمت فعلی کاتالوگ: ${context.entry.basePrice===null?'—':money(context.entry.basePrice)} · رشد قیمت، تضمین سود نیست.`),facts(dto.summary));
      if(dto.summary.neutralReason)body.append(node('p','detailNotice',reasons[dto.summary.neutralReason]??'شواهد برای طبقه‌بندی کافی نیست.'));
      const table=node('div','historyTimeline');for(const observation of dto.observations){const row=node('article','historyObservation');row.append(node('strong','',`${observation.effectiveDate??'تاریخ نامشخص'} · ${money(observation.price)} ${observation.currencyUnit==='IRR'?'ریال':observation.currencyUnit==='TOMAN'?'تومان':'واحد نامشخص'}`),node('p','hint',`${observation.sourceFileName} · ${observation.sourceSheet} · ردیف ${observation.sourceRow}`),node('code','sourceHash',observation.sourceSha256));table.append(row);}if(!dto.observations.length)table.append(node('p','empty','هنوز فایل تاریخی معتبری برای این کد لجستیکی وارد نشده است.'));body.append(table);
      const paging=node('div','pagination');if(cursor)paging.append(button('ابتدای تاریخچه','pageButton',()=>void load()));if(dto.nextCursor&&!stale)paging.append(button('مشاهده‌های بعدی','pageButton',()=>void load(dto.nextCursor!)));body.append(paging);
    };await load();
  }
  async show(version:string|null):Promise<void>{
    this.setVersion(version);this.root.replaceChildren(node('h2','','روند مستند قیمت‌ها'),node('p','hint','سبز: رشد بالا · زرد: رشد متوسط · قرمز: رشد کم · خاکستری: شواهد ناکافی. قیمت فعلی و قیمت اسناد خودکار تغییر نمی‌کند.'));
    if(!version){this.root.append(node('p','empty','کاتالوگ هنوز در دسترس نیست.'));return;}
    const form=node('form','historyFilters');const classification=node('select',''),sort=node('select','');
    for(const [value,text]of [['','همهٔ وضعیت‌ها'],['high','رشد بالا'],['medium','رشد متوسط'],['low','رشد کم'],['neutral','سابقه ناکافی']]){const option=node('option','',text);option.value=value!;classification.append(option);}
    for(const[value,text]of [['growth','بیشترین رشد'],['date','تازه‌ترین مشاهده']]){const option=node('option','',text);option.value=value!;sort.append(option);}
    const minimum=node('input','');minimum.type='number';minimum.min='2';minimum.max='100000';minimum.value='2';const from=node('input','');from.type='date';const to=node('input','');to.type='date';
    for(const [label,input] of [['وضعیت',classification],['مرتب‌سازی',sort],['حداقل تاریخ معتبر',minimum],['آخرین مشاهده از',from],['آخرین مشاهده تا',to]] as const){const field=node('label','historyField');field.append(node('span','',label),input);form.append(field);}
    const apply=button('اعمال فیلتر','btn secondary',()=>undefined, 'submit');form.append(apply);form.addEventListener('submit',event=>{event.preventDefault();if(form.reportValidity())void load();});this.root.append(form,node('p','hint','بازهٔ بالا تاریخ آخرین مشاهده را فیلتر می‌کند؛ رشد و صدک بر کل سابقهٔ معتبر همان نسخه محاسبه می‌شود. طبقه‌بندی محلی را از تنظیمات تغییر دهید؛ فیلتر وضعیت، تنظیمات مشترک سرور را به کار می‌برد.'));
    const results=node('div','historyResults');results.setAttribute('aria-live','polite');this.root.append(results);
    const load=async(cursor?:string)=>{
      this.listController?.abort();const controller=new AbortController();this.listController=controller;results.replaceChildren(node('p','loadingState','در حال خواندن روندها…'));
      try{const dto=await readJson<PriceHistoryListDto>('price-history/entries',{version,limit:20,sort:sort.value,classification:classification.value||undefined,minimumObservations:minimum.value,from:from.value||undefined,to:to.value||undefined,cursor},controller.signal);if(controller.signal.aborted)return;results.replaceChildren();
        if(!dto.items.length)results.append(node('div','resultsEmpty','سابقهٔ مطابقی وجود ندارد. فایل‌های تاریخی واقعی شرکت هنوز ارائه نشده‌اند یا با این فیلتر مطابق نیستند.'));
        for(const entry of dto.items){const row=node('article','historyListRow');row.append(node('h3','',entry.partNameRaw),codeRow('کد لجستیکی',entry.logRaw),node('p',`historyBadge ${entry.classification}`,`${labels[entry.classification]} · ${percent(entry.cumulativeChangeBps)}`),button('نمایش شواهد','operationButton',()=>void this.entry(version,{entryId:entry.entryId,entry})));results.append(row);}
        if(cursor)results.append(button('صفحهٔ اول','pageButton',()=>void load()));if(dto.nextCursor)results.append(button('صفحهٔ بعد','pageButton',()=>void load(dto.nextCursor!)));
      }catch{if(!controller.signal.aborted)results.replaceChildren(node('p','message show warn','خواندن فهرست انجام نشد یا داده تغییر کرده است. از صفحهٔ اول دوباره تلاش کنید.'),button('تلاش دوباره از ابتدا','btn secondary',()=>void load()));}
    };await load();
  }
}
