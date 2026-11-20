const labels=Object.freeze({'dino-run':'داینوران','cafe-critters':'سرنخ‌های کافه','coffee-crash':'کافی کرش',
    'cafe-drift':'کافه دریفت','after-hours':'بعد از ساعت کاری','cafe-rush':'کافه راش','open-world':'دنیای باز'});
const fmt=new Intl.NumberFormat('fa-IR');
const num=n=>Number.isSafeInteger(n)&&n>=0?fmt.format(n):'—';
const elem=(tag,text='')=>{const n=document.createElement(tag);n.textContent=text;return n;};
const title=id=>Object.hasOwn(labels,id)?labels[id]:'بازی';

export function missionRemaining(seconds) {
    const s=Math.max(0,Math.ceil(Number.isFinite(seconds)?seconds:0));
    return num(Math.floor(s/86400))+' روز '+num(Math.floor(s/3600)%24)+' ساعت '+num(Math.floor(s/60)%60)+' دقیقه '+num(s%60)+' ثانیه';
}

export default class MissionPanel {
    constructor(service,anchor) {
        this.service=service;this.serial=0;this.timer=null;this.deadlines=null;
        this.root=elem('details');this.root.dataset.missions='true';this.root.className='ranking-panel__mode';
        this.status=elem('p');this.status.setAttribute('role','status');
        this.countdown=elem('p');this.stats=elem('p');
        this.rows=elem('ul');this.rows.style.paddingInlineStart='1.5em';
        this.refresh=elem('button','به‌روزرسانی مأموریت‌ها');this.refresh.type='button';
        this.root.append(elem('summary','مأموریت‌های روزانه و هفتگی'),this.status,this.countdown,this.stats,this.rows,this.refresh,
            elem('p','ملاک زمان تهران است. پیشرفت تا پایان هفته موقت است و پس از نهایی‌سازی سرور ثبت می‌شود؛ مأموریت‌ها جایزه مالی ندارند.'));
        anchor.after(this.root);
        this.onToggle=()=>{if(this.root.open)void this.load();else this.clear();};
        this.onRefresh=()=>{if(this.root.open)void this.load();};
        this.root.addEventListener('toggle',this.onToggle);this.refresh.addEventListener('click',this.onRefresh);
    }
    clear(){
        this.serial++;if(this.timer!==null)clearInterval(this.timer);this.timer=null;this.deadlines=null;
        this.status.textContent='';this.countdown.textContent='';this.stats.textContent='';this.rows.replaceChildren();
    }
    reset(){this.root.open=false;this.clear();}
    open(){this.reset();this.root.hidden=!this.service.connected;}
    tick(){
        if(!this.deadlines)return;const elapsed=(performance.now()-this.deadlines.received)/1000;
        const day=this.deadlines.day-elapsed,week=this.deadlines.week-elapsed;
        this.countdown.textContent='تا پایان روز: '+missionRemaining(day)+' · تا پایان هفته: '+missionRemaining(week);
        if(day<=0||week<=0){
            clearInterval(this.timer);this.timer=null;this.deadlines=null;
            this.status.textContent='بازه تغییر کرده است؛ برای وضعیت تازه به‌روزرسانی کن.';
        }
    }
    async load(){
        this.clear();const ticket=this.serial,token=this.service.identity?.token;
        const current=()=>ticket===this.serial&&this.root.open&&token===this.service.identity?.token;
        if(!this.service.connected||!token){this.status.textContent='برای مشاهده مأموریت وارد حساب آنلاین شو.';return;}
        this.status.textContent='در حال دریافت مأموریت…';
        try{
            const d=await this.service.myMissions();if(!current())return;
            if(!d?.verified){this.status.textContent='ابتدا شماره تلفن خود را تأیید کن.';return;}
            const p=d.progress??{};
            this.status.textContent='مأموریت‌های این هفته · در انتظار نهایی‌سازی';
            this.stats.textContent='XP موقت: '+num(p.total_xp)+' از ۷۵'+(d.last_finalized?' · XP نهایی هفته قبل: '+num(d.last_finalized.total_xp):'');
            const add=text=>this.rows.append(elem('li',text));
            add('روزانه: '+(d.today_complete?'تکمیل شده':'یک بازی معتبر با امتیاز مثبت')+' · ۵ XP');
            add('استمرار هفتگی: '+num(p.active_days)+' روز از ۳ · ۱۵ XP');
            add('تنوع هفتگی: '+num(p.distinct_games)+' بازی از ۲ · ۱۰ XP');
            for(const game of (Array.isArray(d.played_games)?d.played_games:[]).slice(0,7))add('مأموریت بازی: '+title(game)+' · بازی معتبر ثبت شد');
            const targets=(Array.isArray(d.targets)?d.targets:[]).slice(0,7);
            if(!targets.length)add('هدف مهارتی: پس از سه هفته معتبر و تعیین نسخه قوانین بازی در این هفته نمایش داده می‌شود.');
            else for(const t of targets)add('هدف '+title(t.game_id)+': '+num(t.score)+' از '+num(t.target)+(t.provisional_met?' · موقتاً محقق شده':'')+' · حداکثر ۱۵ XP برای همه اهداف');
            const now=Date.parse(d.server_now),day=Date.parse(d.day_ends_at),week=Date.parse(d.week_ends_at);
            if([now,day,week].every(Number.isFinite)){
                this.deadlines={day:(day-now)/1000,week:(week-now)/1000,received:performance.now()};
                this.timer=setInterval(()=>{if(current())this.tick();else this.clear();},1000);this.tick();
            }
        }catch{if(current())this.status.textContent='دریافت مأموریت ناموفق بود؛ دوباره تلاش کن.';}
    }
    dispose(){this.reset();this.root.removeEventListener('toggle',this.onToggle);this.refresh.removeEventListener('click',this.onRefresh);this.root.remove();}
}
