<?php

namespace App\Http\Controllers\Cafe;

use App\Http\Controllers\Controller;
use App\Services\Arcade\CafeAccess;
use App\Services\Arcade\CouponDeliverySupportService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\View\View;

final class CafeCouponSupportController extends Controller
{
    private function staff(Request $request): object
    {
        $staff = $request->attributes->get('cafe_staff');
        CafeAccess::authorizeGift($staff);

        return $staff;
    }

    public function index(Request $request,
        CouponDeliverySupportService $service): View
    {
        return view('cashier.coupon-support', [
            'staff' => $this->staff($request), 'cases' => $service->queue(),
        ]);
    }

    public function decide(Request $request, int $caseId,
        CouponDeliverySupportService $service): RedirectResponse
    {
        $staff = $this->staff($request);
        $data = $request->validate([
            'decision' => ['required', 'in:explained,rejected,revoked,replaced'],
            'resolution_note' => ['required', 'string', 'min:10', 'max:300'],
            'password' => ['required', 'string', 'max:256'],
            'confirmed' => ['accepted'],
        ]);
        abort_unless(Hash::check($data['password'], $staff->password_hash),
            403, 'Super administrator password verification failed.');
        $result = $service->decide(
            (int) $staff->id,
            (int) $request->session()->get('cafe_staff_version'),
            $caseId, $data['decision'], $data['resolution_note']);

        return redirect()->route('cashier.coupon-support')->with('notice',
            $result['idempotent_replay']
                ? 'این پرونده قبلاً رسیدگی شده بود؛ اقدام مالی جدیدی انجام نشد.'
                : 'رأی پرونده همراه با سوابق ممیزی ثبت شد.');
    }
}
