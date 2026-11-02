import type { EntryListing, EntrySummary, SearchPage, SearchRequest } from '@partsfinder/contracts';
import { directionAllowed, relatedRule, targetApplies } from '../../../../packages/domain/src/related-parts.js';
export interface RelatedGroup { label:string; options:EntrySummary[]; total:number; requiresChoice:boolean; request:SearchRequest; initialCursor:string|null; previousCursors:Array<string|undefined>; nextCursor:string|null; excludedEntryIds:number[] }
export interface RelatedResult { label:string; groups:RelatedGroup[]; vehicleScoped:boolean }
export async function findRelatedParts(search:(request:SearchRequest,signal?:AbortSignal)=>Promise<SearchPage>,source:EntryListing,version:string,vehicleOptionId?:number,signal?:AbortSignal):Promise<RelatedResult> {
  const rule=relatedRule(source.partNameRaw);const groups:RelatedGroup[]=[];const used=new Set<number>([source.entryId]);
  if(!rule)return {label:'پیشنهاد مرتبط',groups,vehicleScoped:vehicleOptionId!==undefined};
  for(const target of rule.targets){
    if(signal?.aborted)throw new DOMException('Cancelled','AbortError');if(!targetApplies(source.partNameRaw,target))continue;
    for(const query of target.terms){
      const request:SearchRequest={catalogVersion:version,mode:vehicleOptionId===undefined?'global':'vehiclePart',kind:'name',query,groupBy:'entry',limit:10,...(vehicleOptionId===undefined?{}:{vehicleOptionId})};
      let cursor:string|undefined;let found:EntrySummary[]=[];let initialCursor:string|null=null;const previousCursors:Array<string|undefined>=[];let nextCursor:string|null=null;let total=0;
      // Search a small fixed number of 10-entry pages when early hits are the source row,
      // opposite-direction parts, or identities already assigned to an earlier target.
      for(let pageNumber=0;pageNumber<4;pageNumber++){
        const page=await search({...request,...(cursor?{cursor}:{})},signal);if(page.catalogVersion!==version)throw new Error('نسخهٔ کاتالوگ تغییر کرده است؛ پیشنهادها را دوباره بخوانید.');
        total=page.totalMatchedEntries;const options=page.items.filter((item):item is EntrySummary=>item.type==='entry').filter(item=>!used.has(item.entryId)&&directionAllowed(source.partNameRaw,item.partNameRaw));
        if(options.length){found=options;initialCursor=cursor??null;nextCursor=page.nextCursor;break;}
        if(!page.nextCursor)break;previousCursors.push(cursor);cursor=page.nextCursor;
      }
      if(!found.length)continue;
      const excludedEntryIds=[...used];for(const option of found)used.add(option.entryId);
      groups.push({label:target.label,options:found,total,requiresChoice:total!==1||found.length!==1,request,initialCursor,previousCursors,nextCursor,excludedEntryIds});break;
    }
    if(groups.length>=5)break;
  }
  return {label:rule.label,groups,vehicleScoped:vehicleOptionId!==undefined};
}
