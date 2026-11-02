import type { EntryListing, VehicleOption } from '@partsfinder/contracts';
import { Catalogue } from './catalogue.js';
import { CatalogueWorkerClient } from './offline/worker-client.js';
import { registerServiceWorker } from './pwa.js';
import { CatalogueStatusController } from './ui/catalogue-status.js';
import { VehiclePicker } from './ui/vehicle-picker.js';
import { PresetController } from './ui/presets.js';
import { SearchController } from './ui/search.js';
import { initializeTheme } from './ui/theme.js';
import { requiredElement } from './ui/dom.js';
import { toast } from './ui/toast.js';
import { DocumentWorkspace, type DocumentArea } from './documents/workspace.js';
import { RelatedController } from './ui/related.js';
import { PriceIntelligence } from './price-intelligence/workspace.js';
import './styles/operations.css';
const worker=new CatalogueWorkerClient(),catalogue=new Catalogue(worker);
let search:SearchController|null=null,presets:PresetController|null=null,version:string|null=null;
const vehicle=new VehiclePicker(catalogue,()=>{search?.selectionChanged();presets?.setSelected(vehicle.selectedOption?.id??null);related.clear();});
search=new SearchController(catalogue,vehicle);presets=new PresetController(catalogue,option=>vehicle.select(option));
const destroyTheme=initializeTheme();const documents=new DocumentWorkspace(requiredElement('documentRoot'));
const prices=new PriceIntelligence(requiredElement('priceRoot'));
let suppressRelated=false;
const related=new RelatedController(requiredElement('relatedSuggestions'),catalogue,async(entry,pinned,context,target)=>{suppressRelated=true;try{await documents.addEntry(entry,pinned,context,target);}finally{suppressRelated=false;}});
type Area='search'|'prices'|DocumentArea;
let area:Area='search',navigation=0;
async function showArea(next:Area):Promise<void>{
  const sequence=++navigation;area=next;
  document.querySelectorAll<HTMLButtonElement>('.appNav [data-area]').forEach(button=>{if(button.dataset.area===next)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
  requiredElement('searchArea').hidden=next!=='search';requiredElement('documentRoot').hidden=next==='search'||next==='prices';requiredElement('priceRoot').hidden=next!=='prices';
  requiredElement('relatedSuggestions').hidden=next==='settings'||next==='prices'||!requiredElement('relatedSuggestions').childNodes.length;
  if(next!=='search')search?.suspend();
  try{if(next==='prices')await prices.show(version);else if(next!=='search')await documents.show(next);if(sequence!==navigation)return;}catch{toast('خواندن این بخش انجام نشد؛ فضای ذخیره و اتصال را بررسی کنید.',true);}
}
document.querySelectorAll<HTMLButtonElement>('.appNav [data-area]').forEach(button=>button.addEventListener('click',()=>void showArea(button.dataset.area as Area)));
window.addEventListener('partavar:document-area',event=>void showArea((event as CustomEvent<{area:DocumentArea}>).detail.area));
window.addEventListener('partavar:entry-action',event=>{
  const {entry,action}=(event as CustomEvent<{entry:EntryListing;action:'invoice'|'purchase'|'package'|'related'}>).detail;
  if(!version)return;const pinned=version,context=search?.currentVehicleContext??null;
  if(action==='related'){const target=area==='invoices'?'invoice':area==='purchase'?'purchase':'package';void related.show(entry,pinned,context,target);return;}
  void documents.addEntry(entry,pinned,context,action).catch(()=>toast('ذخیرهٔ سند انجام نشد.',true));
});
window.addEventListener('partavar:document-added',event=>{const detail=(event as CustomEvent<{entry:EntryListing;version:string;vehicle:VehicleOption|null;target:'invoice'|'purchase'|'package'}>).detail;toast('قطعه به سند افزوده شد.');if(!suppressRelated)void related.show(detail.entry,detail.version,detail.vehicle,detail.target);});
window.addEventListener('partavar:history-entry',event=>{const detail=(event as CustomEvent<{version?:string;entryId:number;entry:EntryListing}>).detail;const pinned=detail.version??version;if(pinned)void prices.entry(pinned,detail);});
const status=new CatalogueStatusController(worker,catalogue,async next=>{if(next!==version)related.clear();version=next;search!.setVersion(next);prices.setVersion(next);await Promise.all([vehicle.setVersion(next),presets!.setVersion(next)]);if(area==='prices')void prices.show(next);},registerServiceWorker());
void documents.initialize().catch(()=>toast('ذخیرهٔ محلی اسناد در دسترس نیست؛ تنظیمات مرورگر را بررسی کنید.',true));
void status.initialize();
window.addEventListener('pagehide',event=>{if(event.persisted)return;search?.destroy();presets?.destroy();vehicle.destroy();related.clear();prices.destroy();status.destroy();destroyTheme();worker.close();});
