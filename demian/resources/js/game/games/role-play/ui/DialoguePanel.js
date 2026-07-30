function esc(value){return String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
export default class DialoguePanel{
 constructor({host,onChoice,onClose}={}){this.host=host;this.onChoice=onChoice;this.onClose=onClose;this.element=null;this.onClick=this.onClick.bind(this);}
 mount(){if(this.element||!this.host)return;const el=document.createElement('section');el.className='role-play-dialogue';el.dir='rtl';el.hidden=true;el.innerHTML='<header><small>CONVERSATION</small><strong data-rp-speaker></strong><button type="button" data-rp-dialogue-close aria-label="بستن">×</button></header><p data-rp-dialogue-text></p><div data-rp-choices></div>';el.addEventListener('click',this.onClick);this.host.appendChild(el);this.element=el;}
 onClick(event){const choice=event.target.closest('[data-rp-choice]');if(choice)this.onChoice?.(choice.dataset.rpChoice);if(event.target.closest('[data-rp-dialogue-close]'))this.onClose?.();}
 show(snapshot){if(!this.element)this.mount();this.element.hidden=false;this.element.querySelector('[data-rp-speaker]').textContent=snapshot.speaker??'—';this.element.querySelector('[data-rp-dialogue-text]').textContent=snapshot.text??'';this.element.querySelector('[data-rp-choices]').innerHTML=snapshot.choices.map((c,index)=>`<button type="button" data-rp-choice="${esc(c.id)}"><b>${index+1}</b><span>${esc(c.text)}</span></button>`).join('');}
 hide(){if(this.element)this.element.hidden=true;}
 dispose(){this.element?.removeEventListener('click',this.onClick);this.element?.remove();this.element=null;}
}
