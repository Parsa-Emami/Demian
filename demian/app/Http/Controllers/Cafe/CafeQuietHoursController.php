<?php

namespace App\Http\Controllers\Cafe;

use App\Http\Controllers\Controller;
use App\Services\Arcade\CafeAccess;
use App\Services\Arcade\QuietHoursService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpFoundation\Response;

final class CafeQuietHoursController extends Controller
{
    private function actor(Request $request): object
    {
        $staff = $request->attributes->get('cafe_staff');
        CafeAccess::authorizeGift($staff);

        return $staff;
    }

    private function stepUp(Request $request): object
    {
        $staff = $this->actor($request);
        $credentials = $request->validate(['password' => ['required', 'string', 'max:256'], 'confirmed' => ['accepted']]);
        abort_unless(Hash::check($credentials['password'], $staff->password_hash), 403);

        return $staff;
    }

    public function index(Request $request, QuietHoursService $service): Response
    {
        return response()->view('cashier.quiet-hours', ['staff' => $this->actor($request), 'offers' => $service->report(),
            'branches' => DB::table('arcade_cashier_staff')->where('is_active', true)->distinct()->orderBy('branch_id')->limit(500)->pluck('branch_id'),
            'enabled' => config('demian-quiet-hours.enabled') === true]);
    }

    public function create(Request $request, QuietHoursService $service): Response
    {
        $actor = $this->stepUp($request);
        $data = $request->validate(['branch_id' => ['required', 'string', 'max:40'], 'starts_at' => ['required', 'date_format:Y-m-d\TH:i'],
            'ends_at' => ['required', 'date_format:Y-m-d\TH:i'], 'occupied_seats' => ['required', 'integer', 'min:0', 'max:1000'],
            'total_seats' => ['required', 'integer', 'min:1', 'max:1000'], 'percent' => ['required', 'integer', 'min:1', 'max:10'],
            'min_order_minor' => ['required', 'integer', 'min:1', 'max:1000000000000'], 'max_discount_minor' => ['required', 'integer', 'min:1', 'max:1000000000000'],
            'capacity' => ['required', 'integer', 'min:1', 'max:20']]);
        $service->create((int) $actor->id, (int) $request->session()->get('cafe_staff_version'), $data);

        return redirect()->route('cashier.quiet-hours')->with('notice', 'پیشنهاد ثبت شد.');
    }

    public function pause(Request $request, int $offerId, QuietHoursService $service): Response
    {
        $actor = $this->stepUp($request);
        $service->pause((int) $actor->id, (int) $request->session()->get('cafe_staff_version'), $offerId);

        return redirect()->route('cashier.quiet-hours')->with('notice','صدور جدید متوقف شد؛ کدهای قبلی تا انقضا معتبرند.');
    }
}
