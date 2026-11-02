import { describe, expect, it } from 'vitest';
import { relatedRule, targetApplies, directionAllowed } from '../../packages/domain/src/related-parts.js';
import { findRelatedParts } from '../../apps/web/src/application/related-service.js';
import type { EntrySummary, SearchPage, SearchRequest } from '../../packages/contracts/src/index.js';
const source: EntrySummary = { type:'entry',entryId:1,partId:1,partNameRaw:'جلو پنجره',techRaw:'001',logRaw:'001-01',replacementRaw:'',matchType:'nameExact',basePrice:'100',middlePrice:'110',finalPrice:'120',currencyUnit:'UNKNOWN',suffix01Rank:0,family:{root:'001',variant:'BASE',verified:false},modelCount:1,aliasCount:0,replacementCount:0 };
describe('source-based related parts',()=>{
 it('retains actual v3 rules with focused targets and no fabricated catalogue entries',()=>{
  expect(relatedRule('جلو پنجره')?.id).toBe('front-grille');
  expect(relatedRule('قطعه نامرتبط')).toBeNull();
  expect(relatedRule('واشر سر سیلندر')?.targets).toHaveLength(5);
  expect(targetApplies('پیستون', {label:'پیستون',terms:['پیستون']})).toBe(false);
  expect(directionAllowed('چراغ جلو چپ','پایه چراغ جلو راست')).toBe(false);
 });
 it('preserves sibling logistics choices and never falls back from selected vehicle',async()=>{
  const requests:SearchRequest[]=[];
  const lookup=async(request:SearchRequest):Promise<SearchPage>=>{
   requests.push(request);
   return {catalogVersion:'v1',normalizationVersion:1,totalMatchedEntries:2,nextCursor:null,items:[{...source,entryId:2,partNameRaw:'پوسته سپر جلو',techRaw:'002',logRaw:'002-01'},{...source,entryId:3,partNameRaw:'پوسته سپر جلو',techRaw:'002',logRaw:'002-02',basePrice:'200'}]};
  };
  const result=await findRelatedParts(lookup,source,'v1',7);
  expect(result.groups.length).toBeLessThanOrEqual(5);
  expect(result.groups[0]?.options.map(row=>row.logRaw)).toEqual(['002-01','002-02']);
  expect(result.groups[0]?.requiresChoice).toBe(true);
  expect(requests.every(request=>request.mode==='vehiclePart'&&request.vehicleOptionId===7&&request.limit===10)).toBe(true);
  const empty=await findRelatedParts(async request=>{expect(request.mode).toBe('vehiclePart');return {catalogVersion:'v1',normalizationVersion:1,totalMatchedEntries:0,items:[],nextCursor:null}},source,'v1',7);
  expect(empty.groups).toEqual([]);
 });
 it('continues a bounded cursor when first hits are only the source or wrong-direction parts',async()=>{
  const cursors:Array<string|undefined>=[];
  const result=await findRelatedParts(async(request)=>{
   cursors.push(request.cursor);const next=request.cursor===undefined?'next-page':null;
   const items=request.cursor===undefined?[{...source,entryId:9,partNameRaw:'پوسته سپر جلو راست'}]:[{...source,entryId:10,partNameRaw:'پوسته سپر جلو چپ',logRaw:'002-10'}];
   return{catalogVersion:'v1',normalizationVersion:1,totalMatchedEntries:2,items,nextCursor:next};
  },{...source,partNameRaw:'پوسته سپر جلو چپ'},'v1');
  expect(result.groups[0]?.options.map(row=>row.logRaw)).toEqual(['002-10']);expect(cursors[0]).toBeUndefined();expect(cursors[1]).toBe('next-page');
 });
});
