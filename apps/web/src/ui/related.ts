import type { EntryListing, EntrySummary, VehicleOption } from '@partsfinder/contracts';
import type { Catalogue } from '../catalogue.js';
import { findRelatedParts, type RelatedGroup } from '../application/related-service.js';
import { directionAllowed } from '../../../../packages/domain/src/related-parts.js';
import { button } from './dom.js';
import { codeRow, money, node } from './entry.js';
import { toast } from './toast.js';
type Target='invoice'|'purchase'|'package';
export class RelatedController {
  private controller:AbortController|null=null;
  private generation=0;
  private busy=false;
  constructor(private readonly root:HTMLElement,private readonly catalogue:Catalogue,private readonly add:(entry:EntryListing,version:string,vehicle:VehicleOption|null,target:Target)=>Promise<void>){}
  clear():void{this.generation++;this.controller?.abort();this.root.replaceChildren();this.root.hidden=true;}
  async show(source:EntryListing,version:string,vehicle:VehicleOption|null,target:Target):Promise<void>{
    this.clear();const generation=this.generation,controller=new AbortController();this.controller=controller;this.root.hidden=false;
    this.root.replaceChildren(node('p','loadingState','در حال یافتن قطعات مرتبط…'));
    try{
      const result=await findRelatedParts((request,signal)=>this.catalogue.search(request,signal),source,version,vehicle?.id,controller.signal);
      if(controller.signal.aborted||generation!==this.generation)return;
      this.root.replaceChildren();const header=node('div','relatedHeading');header.append(node('h2','',result.label),button('بستن پیشنهادها','iconButton',()=>this.clear()));this.root.append(header,node('p','hint',vehicle?`فقط سازگار با ${vehicle.labelRaw} · انتخاب کد لجستیکی دقیق لازم است`:'جست‌وجو در همهٔ خودروها · سازگاری را در جزئیات بررسی کنید'));
      if(!result.groups.length){this.root.append(node('p','empty','پیشنهاد مرتبطی در این زمینه پیدا نشد. قطعات را می‌توانید جداگانه جست‌وجو کنید.'));return;}
      const chosen=new Map<RelatedGroup,EntrySummary>();
      for(const group of result.groups){
        const section=node('section','relatedGroup');section.append(node('h3','',group.label));
        const choices=node('div','relatedChoices'),paging=node('div','relatedPaging');section.append(choices,paging);this.root.append(section);
        let cursor:string|undefined=group.initialCursor??undefined;const previous:Array<string|undefined>=[...group.previousCursors];
        const addOne=button('افزودن انتخاب','operationButton',()=>void commit([chosen.get(group)!],addOne));addOne.disabled=true;section.append(addOne);
        const render=(options:EntrySummary[],next:string|null)=>{
          choices.replaceChildren();paging.replaceChildren();
          for(const entry of options.filter(entry=>!group.excludedEntryIds.includes(entry.entryId))){
            const row=node('label','relatedChoice');const radio=node('input','');radio.type='radio';radio.name=`related-${generation}-${result.groups.indexOf(group)}`;radio.checked=chosen.get(group)?.entryId===entry.entryId;
            radio.addEventListener('change',()=>{chosen.set(group,entry);addOne.disabled=false;});
            const identity=node('span','relatedIdentity');identity.append(node('strong','',entry.partNameRaw),codeRow('کد فنی',entry.techRaw),codeRow('کد لجستیکی',entry.logRaw),node('span','hint',`پایه: ${money(entry.basePrice)} · ${entry.modelCount.toLocaleString('fa-IR')} خودرو`));row.append(radio,identity);choices.append(row);
          }
          if(!options.length)choices.append(node('p','hint','در این صفحه گزینهٔ هم‌جهت دیگری نیست.'));
          if(previous.length)paging.append(button('گزینه‌های قبل','pageButton',()=>void load(previous.at(-1),'previous')));
          if(next)paging.append(button('گزینه‌های بیشتر','pageButton',()=>void load(next,'next')));
        };
        const load=async(nextCursor:string|undefined,direction:'next'|'previous')=>{paging.querySelectorAll('button').forEach(b=>b.disabled=true);try{const page=await this.catalogue.search({...group.request,...(nextCursor?{cursor:nextCursor}:{})},controller.signal);if(controller.signal.aborted||generation!==this.generation)return;if(direction==='next')previous.push(cursor);else previous.pop();cursor=nextCursor;render(page.items.filter((item):item is EntrySummary=>item.type==='entry'&&item.entryId!==source.entryId&&directionAllowed(source.partNameRaw,item.partNameRaw)&&!group.excludedEntryIds.includes(item.entryId)),page.nextCursor);}catch{if(!controller.signal.aborted){toast('خواندن گزینه‌ها انجام نشد یا داده تغییر کرده؛ فهرست را دوباره باز کنید.',true);paging.querySelectorAll('button').forEach(b=>b.disabled=false);}}};
        if(!group.requiresChoice&&group.options[0]){chosen.set(group,group.options[0]);addOne.disabled=false;}
        render(group.options,group.nextCursor);
      }
      const commit=async(entries:EntrySummary[],trigger:HTMLButtonElement)=>{
        if(this.busy)return;this.busy=true;trigger.disabled=true;
        try{for(const entry of new Map(entries.map(entry=>[entry.entryId,entry])).values()){if(controller.signal.aborted||generation!==this.generation)return;await this.add(entry,version,vehicle,target);}if(generation===this.generation){toast('قطعات انتخاب‌شده افزوده شدند.');this.clear();}}catch{toast('افزودن کامل نشد؛ سند را بررسی کنید.',true);}finally{this.busy=false;trigger.disabled=false;}
      };
      const all=button('افزودن انتخاب‌های مشخص‌شده','btn secondary',()=>void commit([...chosen.values()],all));
      all.addEventListener('click',event=>{if(!chosen.size){event.stopImmediatePropagation();toast('ابتدا یک کد لجستیکی را انتخاب کنید.',true);}},true);this.root.append(all);
    }catch{if(!controller.signal.aborted)this.root.replaceChildren(node('p','message show warn','خواندن پیشنهادها انجام نشد.'),button('تلاش دوباره','btn secondary',()=>void this.show(source,version,vehicle,target)));}
  }
}
