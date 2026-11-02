import { normalizeText } from './normalize.js';
import { RELATED_RULES } from './related-rules.js';
export { RELATED_RULES } from './related-rules.js';
export interface RelatedTarget { readonly label:string; readonly terms:readonly string[] }
export interface RelatedRule { readonly id:string; readonly label:string; readonly triggers:readonly string[]; readonly targets:readonly RelatedTarget[] }
export function relatedRule(name:string):RelatedRule|null {
  const normalized=normalizeText(name); let best:RelatedRule|null=null, score=-1;
  for(const rule of RELATED_RULES) for(const raw of rule.triggers){const trigger=normalizeText(raw);if(!normalized.includes(trigger))continue;const rank=trigger.length+(normalized===trigger?100:normalized.startsWith(trigger)?25:0);if(rank>score){best=rule;score=rank}}
  return best;
}
export function targetApplies(sourceName:string,target:RelatedTarget):boolean {
  const name=normalizeText(sourceName);return !target.terms.some(raw=>{const term=normalizeText(raw);return name===term||name.startsWith(term)});
}
export function directionAllowed(sourceName:string,candidateName:string):boolean {
  const source=normalizeText(sourceName),candidate=normalizeText(candidateName);
  return ![['جلو','عقب'],['عقب','جلو'],['چپ','راست'],['راست','چپ']].some(([wanted,opposite])=>source.includes(wanted!)&&candidate.includes(opposite!));
}
