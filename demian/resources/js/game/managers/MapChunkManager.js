export default class MapChunkManager {
    constructor(scene, chunkSize = 1024) {
        this.scene = scene;
        this.chunkSize = chunkSize; // ابعاد هر قطعه از نقشه به پیکسل (مثلاً 1024x1024)
        this.loadedChunks = new Map(); // کش محلی برای نگهداری قطعات لود شده
    }

    /**
     * بررسی و آپدیت قطعات بر اساس موقعیت دوربین
     * این تابع باید در متد update() صدا زده شود
     */
    update(cameraX, cameraY) {
        // محاسبه مختصات قطعه‌ای که دوربین در آن قرار دارد
        const currentChunkX = Math.floor(cameraX / this.chunkSize);
        const currentChunkY = Math.floor(cameraY / this.chunkSize);
        
        // یک آیدی منحصر به فرد برای قطعه فعلی
        const chunkId = `${currentChunkX}_${currentChunkY}`;

        // اگر قطعه فعلی لود نشده بود، آن را لود کن
        if (!this.loadedChunks.has(chunkId)) {
            this.loadChunk(currentChunkX, currentChunkY, chunkId);
            // در معماری پیشرفته‌تر، در اینجا قطعات مجاور (بالا، پایین، چپ، راست) را هم لود می‌کنند
        }

        // پاکسازی قطعاتی که از دید دوربین خارج شده‌اند
        this.unloadDistantChunks(currentChunkX, currentChunkY);
    }

    /**
     * فراخوانی API لاراول برای دریافت اطلاعات قطعه نقشه
     */
    async loadChunk(x, y, chunkId) {
        // قرار دادن وضعیت در حالت loading برای جلوگیری از ریکوئست‌های تکراری
        this.loadedChunks.set(chunkId, 'loading');

        try {
            // فراخوانی دیتای نقشه از بک‌اند لاراول
            const response = await fetch(`/api/v1/map/chunk?x=${x}&y=${y}`);
            if (!response.ok) throw new Error('Network response was not ok');
            
            const chunkData = await response.json();
            
            // در اینجا باید منطق رندر کردن تایل‌ها (Tiles) را بر اساس موتور بازی خود بنویسید
            // مثال برای فیزر:
            // const tilemap = this.scene.make.tilemap({ data: chunkData, tileWidth: 32, tileHeight: 32 });
            
            // ذخیره دیتای لود شده
            this.loadedChunks.set(chunkId, { x, y, data: chunkData, active: true });
            
        } catch (error) {
            console.error(`[MapChunkManager] Failed to load chunk ${chunkId}:`, error);
            this.loadedChunks.delete(chunkId); // در صورت خطا، حذف می‌کنیم تا دوباره تلاش کند
        }
    }

    /**
     * پاک کردن قطعات دور از دسترس برای خالی کردن RAM
     */
    unloadDistantChunks(currentX, currentY) {
        for (let [id, chunk] of this.loadedChunks.entries()) {
            // اگر در حال لود بود، نادیده بگیر
            if (chunk === 'loading') continue;

            let [cX, cY] = id.split('_').map(Number);
            
            // اگر فاصله قطعه از دوربین بیشتر از 1 قطعه (یک گرید 3x3) بود
            if (Math.abs(cX - currentX) > 1 || Math.abs(cY - currentY) > 1) {
                
                // تخریب آبجکت‌ها از صحنه بازی برای آزاد شدن حافظه
                // مثال: chunk.data.destroy();
                
                this.loadedChunks.delete(id);
            }
        }
    }
}