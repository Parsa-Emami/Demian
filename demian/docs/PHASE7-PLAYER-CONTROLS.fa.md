# فاز ۷ — سیستم کنترل بازیکن

سیستم کنترل بازیکن اکنون از سه بخش مستقل تشکیل شده است: `VirtualJoystick` برای ورودی آنالوگ با dead-zone و clamp، `MobileInputManager` برای دکمه‌های press/hold، tap target، snapshot و پاک‌سازی امن، و `TapToMoveController` برای دنبال‌کردن مسیر Navigation بدون وابستگی به DOM یا Phaser. `InteractionSystem` نیز ثبت، حذف و انتخاب نزدیک‌ترین تعامل‌پذیر را انجام می‌دهد.

تمام pointerهای فعال در `pointerup`، `pointercancel`، `lostpointercapture` و blur/visibility پاک می‌شوند تا گیرکردن حرکت یا دکمه رخ ندهد. Navigation و Renderer به‌صورت dependency injection وارد می‌شوند و منطق قابل تست و قابل استفاده در دسکتاپ و موبایل است.
