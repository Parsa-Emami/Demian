const names=Object.freeze({member:'عضو',regular:'مشتری ثابت',loyal:'وفادار',vip:'ویژه',ambassador:'سفیر دمیان'});
const fmt=new Intl.NumberFormat('fa-IR');
const number=n=>Number.isSafeInteger(n)&&n>=0?fmt.format(n):'—';
const elem=(tag,text='')=>{const n=document.createElement(tag);n.textContent=text;return n;};
const tier=id=>Object.hasOwn(names,id)?names[id]:'نامشخص';

export default class LoyaltyXpPanel {
    constructor(service,anchor) {
        this.service=service;this.serial=0;
        this.root=elem('details');this.root.dataset.loyaltyXp='true';
        this.root.className='ranking-panel__mode';
        this.status=elem('p');this.status.setAttribute('role','status');
        this.stats=elem('p');
        this.bar=elem('meter');this.bar.min=0;this.bar.max=250;this.bar.value=0;
        this.bar.setAttribute('aria-label','میزان پیشرفت تا سطح بعدی');
        this.bar.style.width='100%';this.bar.hidden=true;
        this.rows=elem('ol');this.rows.style.paddingInlineStart='1.5em';
        this.rows.setAttribute('aria-label','تاریخچه امتیاز تجربه هفتگی');
        this.root.append(elem('summary','سطح و وفاداری من'),this.status,this.stats,this.bar,this.rows,
            elem('p','امتیاز تجربه در پایان هفته و فقط از عملکرد معتبر ثبت می‌شود. سقف ۲۲۵ XP در هفته؛ بدون ارزش مالی، خرید یا انتقال. سطح وفاداری با لیگ مهارت متفاوت است.'));
        anchor.after(this.root);
        this.onToggle=()=>{if(this.root.open)void this.load();else this.clear();};
        this.root.addEventListener('toggle',this.onToggle);
    }
    clear(){
        this.serial++;this.status.textContent='';this.stats.textContent='';
        this.bar.hidden=true;this.bar.value=0;this.rows.replaceChildren();
    }
    reset(){this.root.open=false;this.clear();}
    open(){this.reset();this.root.hidden=!this.service.connected;}
    async load(){
        this.clear();const ticket=this.serial,token=this.service.identity?.token;
        const current=()=>ticket===this.serial&&this.root.open&&token===this.service.identity?.token;
        if(!this.service.connected||!token){this.status.textContent='برای مشاهده سطح وفاداری وارد حساب آنلاین شو.';return;}
        this.status.textContent='در حال دریافت XP…';
        try{
            const data=await this.service.myLoyalty();
            if(!current())return;
            if(!data?.verified){this.status.textContent='ابتدا شماره تلفن خود را تأیید کن.';return;}
            this.status.textContent=data.status==='active'?'سطح وفاداری: '+tier(data.tier):'پس از نهایی شدن نخستین هفته، XP ثبت می‌شود.';
            this.stats.textContent='سطح '+number(data.level)+' · مجموع XP: '+number(data.total_xp)+' · هفته فعال: '+number(data.active_weeks)
                +(data.next_tier&&Number.isSafeInteger(data.next_tier_xp)&&Number.isSafeInteger(data.total_xp)
                    ?' · تا '+tier(data.next_tier)+': '+number(Math.max(0,data.next_tier_xp-data.total_xp))+' XP':'');
            if(Number.isSafeInteger(data.level_step_xp)&&data.level_step_xp>0&&Number.isSafeInteger(data.level_progress_xp)){
                this.bar.max=data.level_step_xp;this.bar.value=Math.max(0,Math.min(data.level_step_xp,data.level_progress_xp));
                this.bar.hidden=false;
            }
            for(const r of (Array.isArray(data.history)?data.history.slice(0,12):[])){
                const week=String(r.period_key??'').split(':').at(-1);
                this.rows.append(elem('li',week+' · '+number(r.total_xp)+' XP (مشارکت '+number(r.participation_xp)
                    +'، تنوع '+number(r.variety_xp)+'، پیشرفت '+number(r.progress_xp)+'، استمرار '+number(r.continuity_xp)+')'));
            }
        }catch{if(current())this.status.textContent='دریافت سطح وفاداری ناموفق بود؛ دوباره تلاش کن.';}
    }
    dispose(){this.reset();this.root.removeEventListener('toggle',this.onToggle);this.root.remove();}
}
