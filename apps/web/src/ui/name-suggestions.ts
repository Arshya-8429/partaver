import { node } from './entry.js';
export class NameSuggestions {
  private timer=0; private sequence=0; private active=-1; private abort:AbortController|null=null;
  constructor(private readonly input:HTMLInputElement,private readonly list:HTMLDivElement,private readonly fetchLabels:(query:string,signal:AbortSignal)=>Promise<string[]>){
    input.addEventListener('keydown',this.key);document.addEventListener('pointerdown',this.outside);
  }
  schedule():void{
    this.clear();const query=this.input.value.trim();if([...query].length<2)return;
    const sequence=++this.sequence;
    this.timer=window.setTimeout(()=>{const abort=new AbortController();this.abort=abort;void this.fetchLabels(query,abort.signal).then(labels=>{
      if(abort.signal.aborted||sequence!==this.sequence||query!==this.input.value.trim())return;
      const options=[...new Set(labels)].slice(0,20);if(!options.length)return;
      this.list.replaceChildren(...options.map((label,index)=>{const button=node('button','nameOption',label);button.type='button';button.role='option';button.id=`part-suggestion-${sequence}-${index}`;button.tabIndex=-1;button.setAttribute('aria-selected','false');button.addEventListener('click',()=>{this.input.value=label;this.clear();this.input.focus();});return button}));
      this.list.hidden=false;this.input.setAttribute('aria-expanded','true');
    }).catch(()=>{if(sequence===this.sequence)this.clear()})},180);
  }
  acceptActive():void {const option=this.list.querySelectorAll<HTMLButtonElement>('button')[this.active];if(option&&!this.list.hidden)this.input.value=option.textContent??this.input.value;this.clear();}
  clear():void{clearTimeout(this.timer);this.abort?.abort();this.sequence++;this.active=-1;this.list.replaceChildren();this.list.hidden=true;this.input.setAttribute('aria-expanded','false');this.input.removeAttribute('aria-activedescendant');}
  destroy():void{this.clear();this.input.removeEventListener('keydown',this.key);document.removeEventListener('pointerdown',this.outside);}
  private readonly outside=(event:PointerEvent):void=>{if(!this.input.parentElement?.contains(event.target as Node))this.clear()};
  private readonly key=(event:KeyboardEvent):void=>{
    if(event.key==='Escape'||event.key==='Tab'){this.clear();return;}
    if(!['ArrowDown','ArrowUp'].includes(event.key)||this.list.hidden)return;
    event.preventDefault();const options=this.list.querySelectorAll<HTMLButtonElement>('button');this.active=Math.max(0,Math.min(options.length-1,this.active+(event.key==='ArrowDown'?1:-1)));
    options.forEach((option,index)=>{option.classList.toggle('active',index===this.active);option.setAttribute('aria-selected',String(index===this.active))});const active=options[this.active];if(active){this.input.setAttribute('aria-activedescendant',active.id);active.scrollIntoView({block:'nearest'})}
  };
}
