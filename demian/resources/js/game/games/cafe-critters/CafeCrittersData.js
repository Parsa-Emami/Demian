import { freezeCafe } from '../../shared/cafe/CafeWalkthroughScene.js';

export const CRITTER_RULES = freezeCafe({
    calm: { label: 'آرام', level: 2, seconds: null, clue: 'همهٔ انتخاب‌ها در دفترچه' },
    easy: { label: 'آسان', level: 2, seconds: 300, clue: 'هر سه انتخاب در دفترچه' },
    standard: { label: 'استاندارد', level: 4, seconds: 240, clue: 'یک انتخاب از رفتار مهمان' },
    hard: { label: 'سخت', level: 6, seconds: 180, clue: 'ترکیب نوشته و تصویر پیشی' },
});

export const TABLE_FIELDS = freezeCafe([
    { id: 'light', label: 'نور', options: { sun: 'آفتاب', moon: 'مهتاب' } },
    { id: 'food', label: 'خوراکی', options: { cardamom: 'هل', berries: 'توت', seeds: 'دانه' } },
    { id: 'decor', label: 'دکور', options: { vase: 'گلدان', book: 'کتاب', ribbon: 'روبان' } },
]);

const foodSigns = Object.freeze({
    cardamom: 'غلاف سبز و خط‌دار',
    berries: 'سه میوهٔ گرد با برگ کوچک',
    seeds: 'دانه‌های باریک و خشک',
});

const decorSigns = Object.freeze({
    vase: 'ظرفی که چند برگ از آن بیرون زده',
    book: 'چند صفحهٔ باز',
    ribbon: 'گرهی با دو دنباله',
});

export const CRITTERS = freezeCafe([
    {
        id: 'hali', name: 'هَلی', title: 'گوش‌برگیِ ساکت',
        setting: { light: 'moon', food: 'cardamom', decor: 'vase' },
        lightClue: 'رد گوش‌های برگ‌مانندش فقط وقتی پیدا می‌شود که شب از پنجره روی میز بیفتد.',
        decorClue: 'برای پنهان‌کردن گوش‌هایش دنبال ظرفی با ساقه و برگ می‌گردد.',
        behavior: 'گوش‌هایش را مثل دو برگ باز می‌کند و پشت ساقه‌ها سرک می‌کشد.',
        souvenir: 'مهر برگ نقره‌ای',
    },
    {
        id: 'rosha', name: 'رُشا', title: 'دم‌گردِ بازیگوش',
        setting: { light: 'sun', food: 'berries', decor: 'ribbon' },
        lightClue: 'پیش از شلوغی کافه، اولین لکهٔ گرمِ روز را دنبال می‌کند.',
        decorClue: 'با نوک پنجه گره‌ها را باز می‌کند و دنبال دنبالهٔ پارچه می‌دود.',
        behavior: 'یک دور روی میز می‌پرد و دم پف‌دارش را دور گره می‌پیچد.',
        souvenir: 'سنجاق دم‌گرد',
    },
    {
        id: 'varagh', name: 'ورق‌زن', title: 'پرندهٔ کاغذخوان',
        setting: { light: 'sun', food: 'seeds', decor: 'book' },
        lightClue: 'صبح‌ها بال‌هایش را روی گرم‌ترین لبهٔ پنجره خشک می‌کند.',
        decorClue: 'جای نشستن محبوبش دو صفحهٔ باز کنار هم است.',
        behavior: 'دو بار بال می‌زند و با نوکش به لبهٔ یک صفحه ضربه می‌زند.',
        souvenir: 'نشانک آبی',
    },
    {
        id: 'tootak', name: 'توتک', title: 'توپکِ بنفش',
        setting: { light: 'moon', food: 'berries', decor: 'book' },
        lightClue: 'وقتی ستاره‌ها در شیشه پیدا می‌شوند، از زیر صندلی بیرون می‌آید.',
        decorClue: 'بین دو صفحهٔ باز جا می‌گیرد و مثل یک توپ جمع می‌شود.',
        behavior: 'خودش را گرد می‌کند، قل کوچکی می‌خورد و دوباره سرش را بیرون می‌آورد.',
        souvenir: 'مهر توت بنفش',
    },
    {
        id: 'noktak', name: 'نُقطک', title: 'بال‌طلاییِ معطر',
        setting: { light: 'sun', food: 'cardamom', decor: 'ribbon' },
        lightClue: 'بال‌های طلایی‌اش را در روشنایی صبح می‌شود دید.',
        decorClue: 'روی یک گره با دو دنباله فرود می‌آید و دورش می‌چرخد.',
        behavior: 'روی میز مکث می‌کند و با دو بال ریزش یک دور کوتاه می‌زند.',
        souvenir: 'پلاک بال‌طلایی',
    },
    {
        id: 'shabpar', name: 'شب‌پر', title: 'پروانهٔ لبهٔ پنجره',
        setting: { light: 'moon', food: 'seeds', decor: 'ribbon' },
        lightClue: 'وقتی کافه تاریک می‌شود، رد نقره‌ای بال‌هایش نزدیک پنجره می‌افتد.',
        decorClue: 'دنبال دو دنبالهٔ نرم می‌گردد تا بال‌هایش را روی آن‌ها جمع کند.',
        behavior: 'بال‌ها را باز می‌کند، یک‌بار در هوا می‌چرخد و آرام می‌نشیند.',
        souvenir: 'پر شب‌تاب',
    },
    {
        id: 'danerou', name: 'دانه‌رو', title: 'لاک‌پشتِ برگ‌دوست',
        setting: { light: 'sun', food: 'seeds', decor: 'vase' },
        lightClue: 'پیش از راه‌افتادن، لاکش را زیر گرمای روز می‌گیرد.',
        decorClue: 'کنار ظرف برگ‌دار سایه پیدا می‌کند و سرش را به ساقه‌ها می‌مالد.',
        behavior: 'آرام سرش را جلو می‌آورد، زیر برگ‌ها می‌ایستد و چرت می‌زند.',
        souvenir: 'کاشی لاک سبز',
    },
    {
        id: 'abri', name: 'ابری', title: 'ابرکِ بین صفحه‌ها',
        setting: { light: 'moon', food: 'cardamom', decor: 'book' },
        lightClue: 'در آخرین ساعت شب، بالای میز مثل یک تکه مه شناور می‌شود.',
        decorClue: 'صبر می‌کند دو صفحه باز شوند تا خودش را بینشان جا بدهد.',
        behavior: 'بالای میز کمی شناور می‌ماند و شکلش را مثل یک ابر جمع می‌کند.',
        souvenir: 'مدال ابرِ کاغذی',
    },
]);

export const CRITTER_BY_ID = Object.freeze(Object.fromEntries(CRITTERS.map((guest) => [guest.id, guest])));
export const TURN_PAGES = 3;
export const HINT_AFTER = 2;

export function tableLabel(field, value) {
    return TABLE_FIELDS.find((entry) => entry.id === field)?.options[value] ?? '';
}

export function cluesFor(guest, difficulty) {
    const { light, food, decor } = guest.setting;
    const lightName = tableLabel('light', light);
    const foodName = tableLabel('food', food);
    if (difficulty === 'easy' || difficulty === 'calm') return {
        journal: `${lightName}، ${foodName} و ${tableLabel('decor', decor)} را برای این مهمان روی میز بگذار.`,
        pishi: 'پیشی سه انتخاب را در نقاشی کنارش نشان می‌دهد.',
        art: [light, food, decor],
    };
    if (difficulty === 'standard') return {
        journal: `نور ${lightName} و بوی ${foodName} را دوست دارد. برای دکور، رفتار مهمان را بخوان.`,
        pishi: guest.decorClue,
        art: [],
    };
    return {
        journal: guest.lightClue,
        pishi: `پیشی ${foodSigns[food]} را کنار ${decorSigns[decor]} دیده است.`,
        art: [food, decor],
    };
}
