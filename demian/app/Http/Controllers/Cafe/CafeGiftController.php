<?php

namespace App\Http\Controllers\Cafe;

use App\Http\Controllers\Controller;
use App\Services\Arcade\CafeAccess;
use App\Services\Arcade\ManualCouponGiftService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\View\View;

final class CafeGiftController extends Controller
{
    private function actor(Request $request): object
    {
        $staff = $request->attributes->get('cafe_staff');
        CafeAccess::authorizeGift($staff);

        return $staff;
    }

    public function index(Request $request, ManualCouponGiftService $service): View
    {
        $staff = $this->actor($request);
        $terms = $service->terms();
        $search = trim((string) $request->query('q', ''));

        return view('cashier.gifts', [
            'staff' => $staff,
            'terms' => $terms,
            'query' => mb_substr($search, 0, 60),
            'players' => $service->searchPlayers($search),
            'gifts' => $service->recent(),
            'requestKey' => (string) Str::uuid(),
        ]);
    }

    public function issue(Request $request, ManualCouponGiftService $service): RedirectResponse
    {
        $staff = $this->actor($request);
        $data = $request->validate([
            'player_id' => ['required', 'uuid', 'exists:arcade_players,id'],
            'percent' => ['required', 'integer', 'min:1', 'max:100'],
            'min_order_minor' => ['required', 'integer', 'min:1', 'max:1000000000000'],
            'max_discount_minor' => ['required', 'integer', 'min:1', 'max:1000000000000'],
            'valid_days' => ['required', 'integer', 'min:1', 'max:365'],
            'reason' => ['required', 'in:birthday,compensation,vip,campaign,other'],
            'reason_note' => ['nullable', 'string', 'max:200'],
            'request_key' => ['required', 'uuid'],
            'password' => ['required', 'string', 'max:256'],
            'confirmed' => ['accepted'],
        ]);
        abort_unless(Hash::check($data['password'], $staff->password_hash), 403,
            'Super administrator reauthentication failed.');

        $result = $service->issue((int) $staff->id,
            (int) $request->session()->get('cafe_staff_version'), $data);
        $notice = $result['idempotent_replay']
            ? 'این هدیه قبلاً صادر شده بود و کد جدیدی ساخته نشد.'
            : 'هدیه به کیف جوایز بازیکن افزوده شد. کد فقط برای دریافت‌کننده نمایش داده می‌شود.';

        return redirect()->route('cashier.gifts')->with('notice', $notice);
    }
}
