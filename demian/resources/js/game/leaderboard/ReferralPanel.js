import {drawReferralQr} from './ReferralQr.js';
const elem=(tag,text='')=>{const node=document.createElement(tag);node.textContent=text;return node;};
export default class ReferralPanel {
    constructor(service,anchor){
        this.service=service;this.serial=0;
        this.root=elem('details');this.root.className='ranking-panel__mode';this.root.dataset.referrals='true';
        this.status=elem('p');this.status.setAttribute('role','status');
        this.stats=elem('p');this.link=elem('input');this.link.type='text';this.link.readOnly=true;
        this.link.setAttribute('aria-label','لینک دعوت اختصاصی');this.link.hidden=true;
        this.qr=elem('canvas');this.qr.hidden=true;this.qr.style.maxWidth='100%';this.qr.style.height='auto';
        this.qr.setAttribute('role','img');this.qr.setAttribute('aria-label','کد QR لینک دعوت');
        this.create=elem('button','ساخت کد دعوت');this.create.type='button';this.create.hidden=true;
        this.share=elem('button','اشتراک‌گذاری / کپی لینک');this.share.type='button';this.share.hidden=true;
        this.refresh=elem('button','به‌روزرسانی');this.refresh.type='button';
        this.root.append(elem('summary','دعوت دوستان'),this.status,this.stats,this.link,this.qr,this.create,this.share,this.refresh,
            elem('p','پاداش دعوت فقط امتیاز غیرمالی است؛ تأیید تلفن و بازی معتبر در دو روز متفاوت لازم است.'));
        anchor.after(this.root);
        this.root.addEventListener('toggle',()=>this.root.open?void this.load():this.clear());
        this.create.addEventListener('click',()=>void this.load(true));
        this.refresh.addEventListener('click',()=>void this.load());
        this.share.addEventListener('click',async()=>{
            if(!this.link.value)return;
            try{
                if(navigator.share)await navigator.share({url:this.link.value});
                else await navigator.clipboard.writeText(this.link.value);
            }catch{this.link.select();}
        });
    }
    clear(){this.serial++;this.status.textContent='';this.stats.textContent='';this.link.value='';this.link.hidden=true;this.qr.hidden=true;this.qr.width=this.qr.height=0;this.create.hidden=true;this.share.hidden=true;}
    reset(){this.root.open=false;this.clear();}
    open(){this.reset();this.root.hidden=!this.service.connected;}
    async load(create=false){
        this.clear();const serial=this.serial,token=this.service.identity?.token;
        const current=()=>serial===this.serial&&this.root.open&&token===this.service.identity?.token;
        if(!token){this.status.textContent='ابتدا وارد حساب آنلاین شو.';return;}
        this.status.textContent='در حال دریافت…';
        try{
            const d=await this.service.request('/player/referrals'+(create?'/code':''),{method:create?'POST':'GET',authenticated:true});
            if(!current())return;
            if(!d.available){this.status.textContent='سیستم دعوت هنوز فعال نیست.';return;}
            if(!d.verified){this.status.textContent='ابتدا شماره تلفن را تأیید کن.';return;}
            this.status.textContent='دعوت دوستان';
            const n=new Intl.NumberFormat('fa-IR');
            this.stats.textContent='ثبت‌نام: '+n.format(d.invited)+' · موفق: '+n.format(d.qualified)+' · امتیاز: '+n.format(d.points);
            if(d.attribution)this.stats.textContent+=' · وضعیت دعوت ورودی: '+({pending:'در انتظار',qualified:'موفق',review:'بررسی',expired:'منقضی',capped:'سقف پاداش',rejected:'رد شده'}[d.attribution.status]??'—');
            if(/^[A-F0-9]{16}$/.test(d.code??'')){
                const url=new URL(location.href);url.search='';url.hash='ref='+d.code;
                this.link.value=url.href;this.link.hidden=false;this.share.hidden=false;
                try{drawReferralQr(this.qr,url.href);this.qr.hidden=false;}catch{}
            }else this.create.hidden=false;
        }catch{if(current())this.status.textContent='دریافت دعوت ناموفق بود؛ دوباره تلاش کن.';}
    }
    dispose(){this.reset();this.root.remove();}
}
