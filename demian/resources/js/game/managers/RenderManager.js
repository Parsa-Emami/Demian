export default class RenderManager {
    constructor(scene) {
        this.scene = scene;
        
        // ایجاد لایه‌های مجزا برای مدیریت بهینه حافظه و رندر
        this.layers = {
            background: scene.add.group(), // لایه ۰: زمین، چمن، آب
            static: scene.add.group(),     // لایه ۱: اجسام ثابت مثل دیوار و درخت
            dynamic: scene.add.group(),    // لایه متغیر: کاراکترها، انمی‌ها
            ui: scene.add.group()          // لایه ۱۰۰۰: منوها و رابط کاربری
        };
    }

    /**
     * افزودن آبجکت استاتیک (بدون نیاز به آپدیت مداوم عمق)
     */
    addStaticObject(sprite) {
        this.layers.static.add(sprite);
        // یک عمق پایه برای اجسام ثابت در نظر می‌گیریم
        sprite.setDepth(10); 
    }

    /**
     * افزودن آبجکت داینامیک (نیاز به محاسبه عمق دارد)
     */
    addDynamicObject(sprite) {
        this.layers.dynamic.add(sprite);
    }

    /**
     * این تابع باید در متد update() کلاس اصلی سین (Scene) بازی شما فراخوانی شود
     * محاسبه Y-Sorting برای ایجاد حس عمق در بازی ۲ بعدی
     */
    updateDepths() {
        // فقط لایه داینامیک را پردازش می‌کنیم تا از افت فریم جلوگیری شود
        const dynamicChildren = this.layers.dynamic.getChildren();
        
        for (let i = 0; i < dynamicChildren.length; i++) {
            let child = dynamicChildren[i];
            
            // اگر آبجکت فعال و در صفحه موجود بود
            if (child && child.active) {
                // عمق آبجکت بر اساس موقعیت محور Y آن تنظیم می‌شود
                // عدد 10 اضافه می‌شود تا همیشه روی لایه‌های بک‌گراند و استاتیک باشد
                child.setDepth(10 + child.y);
            }
        }
    }
}