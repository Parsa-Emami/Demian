const labels = Object.freeze({
    'dino-run':'داینوران','cafe-critters':'سرنخ‌های کافه','coffee-crash':'کافی کرش',
    'cafe-drift':'کافه دریفت','after-hours':'بعد از ساعت کاری','cafe-rush':'کافه راش','open-world':'دنیای باز',
});
const fmt=new Intl.NumberFormat('fa-IR');
const number=n=>Number.isSafeInteger(n)&&n>=0?fmt.format(n):'—';
const elem=(tag,text='')=>{const node=document.createElement(tag);node.textContent=text;return node;};

export default class PersonalProgressPanel {
    constructor(service,anchor) {
        this.service=service; this.serial=0;
        this.root=elem('details');this.root.dataset.personalProgress='true';
        this.root.className='ranking-panel__mode';
        this.select=elem('select');this.select.setAttribute('aria-label','بازی پیشرفت فردی');
        for(const [id,label] of Object.entries(labels)){
            const option=elem('option',label);option.value=id;this.select.append(option);
        }
        const label=elem('label','بازی: ');label.append(this.select);
        this.status=elem('p');this.status.setAttribute('role','status');
        this.stats=elem('p');this.chart=elem('ol');this.chart.setAttribute('aria-label','نمودار ۱۲ هفته اخیر امتیاز نهایی');
        this.chart.style.paddingInlineStart='1.5em';
        this.root.append(elem('summary','پیشرفت فردی من'),label,this.status,this.stats,this.chart,
            elem('p','فقط بهترین امتیاز تأییدشده هر هفته و نسخه یکسان قوانین. سه هفته نخست برای تعیین خط مبنا؛ نشان‌ها افتخاری و بدون ارزش مالی هستند.'));
        anchor.after(this.root);
        this.onToggle=()=>{if(this.root.open)void this.load();else this.clear();};
        this.onChange=()=>{if(this.root.open)void this.load();};
        this.root.addEventListener('toggle',this.onToggle);this.select.addEventListener('change',this.onChange);
    }
    clear(){this.serial++;this.status.textContent='';this.stats.textContent='';this.chart.replaceChildren();}
    reset(){this.root.open=false;this.clear();}
    open(){this.reset();this.root.hidden=!this.service.connected;}
    async load(){
        this.clear();const ticket=this.serial;
        const token=this.service.identity?.token;
        if(!this.service.connected||!token){this.status.textContent='برای مشاهده پیشرفت وارد حساب آنلاین شو.';return;}
        this.status.textContent='در حال دریافت پیشرفت…';
        try{
            const data=await this.service.myPersonalProgress(this.select.value);
            if(ticket!==this.serial||!this.root.open||token!==this.service.identity?.token)return;
            if(!data?.verified){this.status.textContent='ابتدا شماره تلفن خود را تأیید کن.';return;}
            if(data.status==='awaiting_first_week'){this.status.textContent='پس از نهایی شدن اولین هفته بازی، پیشرفت نمایش داده می‌شود.';return;}
            this.status.textContent=data.status==='calibrating'?
                'تعیین خط مبنا: '+number(data.weeks)+' از ۳ هفته':
                'پیشرفت تأییدشده · نسخه '+String(data.rules_version??'—');
            this.stats.textContent='بهترین امتیاز: '+number(data.personal_best)+' · هدف بعدی: '+number(data.next_goal)+' · نشان: '+number(data.badges);
            const rows=Array.isArray(data.history)?data.history.slice(-12):[];
            const maximum=Math.max(1,...rows.map(r=>Number.isSafeInteger(r.score)&&r.score>=0?r.score:0));
            for(const r of rows){
                if(!Number.isSafeInteger(r.score)||r.score<0)continue;
                const text=String(r.period_key??'').split(':').at(-1)+' · '+number(r.score)+(r.badge==='personal-breakthrough'?' · نشان پیشرفت':'');
                const item=elem('li');item.append(elem('span',text));
                const bar=elem('meter');bar.min=0;bar.max=maximum;bar.value=r.score;
                bar.setAttribute('aria-label',text);bar.style.display='block';bar.style.width='100%';
                item.append(bar);this.chart.append(item);
            }
        }catch{
            if(ticket===this.serial&&this.root.open&&token===this.service.identity?.token)this.status.textContent='دریافت پیشرفت ناموفق بود؛ دوباره تلاش کن.';
        }
    }
    dispose(){this.reset();this.root.removeEventListener('toggle',this.onToggle);this.select.removeEventListener('change',this.onChange);this.root.remove();}
}
