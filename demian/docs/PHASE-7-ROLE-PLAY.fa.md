# فاز هفتم — Role Play

این فاز یک بازی Role Play داده‌محور را روی هسته‌ی مشترک Demian Game Platform اضافه می‌کند. منطق داستان، گفتگو، مأموریت، آیتم، رابطه، شغل و برنامه‌ی NPC مستقل از Three.js و DOM است و فقط لایه‌ی Render/UI به مرورگر وابسته است.

## معماری

- `RolePlayGame`: آداپتر lifecycle و Composition Root بازی
- `RolePlayContentRegistry`: محتوای JSON و اعتبارسنجی‌شده
- `DialogueEngine / Runner / Condition / Action`: گفتگوی شاخه‌ای، شرطی و اکشن‌محور
- `QuestSystem / QuestTracker`: Objectiveهای وابسته و Reward ایدمپوتنت
- `InventorySystem / ItemRegistry / EquipmentSystem`: Stack، ظرفیت، Transaction و تجهیزات
- `RelationshipSystem`: امتیاز رابطه‌ی محدود و رتبه‌بندی پایدار
- `JobSystem`: XP، Level و Shift برای سه شغل
- `ScheduleSystem / RolePlayBrain / NpcMemory`: برنامه‌ی روزانه، A* و حافظه‌ی محدود NPC
- `RolePlaySaveStore`: ذخیره‌ی نسخه‌دار با Checksum و migration
- `StoryEventJournal`: ثبت رویدادهای معنایی بین بازی‌ها برای Objectiveهای Play/Win
- `RolePlayProtocol`: Snapshot immutable و Save State مستقل از Renderer

## محتوای نمونه

سه NPC (تیام، روناک و امیررضا)، سه دیالوگ شاخه‌ای، سه Quest، سه Job، شش Item، چهار Pickup و سه نقطه‌ی تعامل واقعی وجود دارد. مأموریت «اولین شیفت» چرخه‌ی Talk → Collect → Deliver را اجرا می‌کند و «کابین پرنویز» Collect → Interact را پوشش می‌دهد.

## Persistence

World Time، موقعیت بازیکن، Flagها، Variables، Inventory، Equipment، Relationships، Jobs، Quest Progress، Dialogue History، NPC Memory، Pickupهای جمع‌شده و Cursor رویدادهای بین‌بازی ذخیره می‌شوند. Save هنگام Autosave، Pause، خروج، دریافت Reward و Save Point انجام می‌شود.

## توسعه‌ی محتوا

برای افزودن محتوا، JSON جدید در `definitions/` ثبت می‌شود. Domain Validator ارجاع Nodeها، Objective Typeها، Dependencyها، شناسه‌های یکتا، Scheduleها و Action Typeها را بررسی می‌کند. افزودن Quest/Dialogue معمولی نیازی به تغییر `RolePlayGame` ندارد.
