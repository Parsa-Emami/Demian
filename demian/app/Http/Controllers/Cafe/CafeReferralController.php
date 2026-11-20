<?php

namespace App\Http\Controllers\Cafe;

use App\Http\Controllers\Controller;
use App\Services\Arcade\ReferralService;
use Illuminate\Http\Response;

final class CafeReferralController extends Controller
{
    public function __invoke(ReferralService $service): Response
    {
        return response()->view('cashier.referrals',['report'=>$service->report()])
            ->header('Cache-Control','no-store, private');
    }
}
