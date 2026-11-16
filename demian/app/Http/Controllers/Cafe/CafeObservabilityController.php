<?php

namespace App\Http\Controllers\Cafe;

use App\Http\Controllers\Controller;
use App\Services\Arcade\OpsReport;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Request;

final class CafeObservabilityController extends Controller
{
    public function __invoke(Request $request, OpsReport $report): View
    {
        // Route middleware AuthenticateCafeCashier + RequireCafePermission
        // already authorises the superadmin-only operations.readiness ability.
        return view('cashier.observability', [
            'staff' => $request->attributes->get('cafe_staff'),
            'result' => $report->snapshot(),
        ]);
    }
}
