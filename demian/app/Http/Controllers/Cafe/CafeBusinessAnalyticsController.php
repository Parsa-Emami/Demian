<?php

namespace App\Http\Controllers\Cafe;

use App\Http\Controllers\Controller;
use App\Services\Arcade\BusinessAnalytics;
use App\Services\Arcade\CafeAccess;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class CafeBusinessAnalyticsController extends Controller
{
    public function __invoke(Request $request,BusinessAnalytics $analytics): Response
    {
        $staff=$request->attributes->get('cafe_staff');
        CafeAccess::authorize($staff,'report.global');
        $data=$request->validate(['days'=>['sometimes','integer','in:7,30,90'],
            'format'=>['sometimes','in:html,json']]);
        $report=$analytics->snapshot((int)($data['days']??30));
        if (($data['format']??'html')==='json') {
            return response()->json($report)->header('Content-Disposition','attachment; filename="demian-business-analytics.json"')
                ->header('Cache-Control','private, no-store')->header('X-Content-Type-Options','nosniff');
        }
        return response()->view('cashier.business-analytics',['staff'=>$staff,'report'=>$report])
            ->header('Cache-Control','private, no-store');
    }
}
