<?php

namespace App\Http\Controllers\Cafe;

use App\Http\Controllers\Controller;
use App\Services\Arcade\ReferralService;
use App\Services\Arcade\CafeAccess;
use Illuminate\Http\Response;
use Illuminate\Http\Request;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

final class CafeReferralController extends Controller
{
    public function __invoke(Request $request,ReferralService $service): Response
    {
        return response()->view('cashier.referrals',['report'=>$service->report(),
            'staff'=>$request->attributes->get('cafe_staff'),
            'reviews'=>DB::table('arcade_referrals')->where('status','review')->orderBy('id')->limit(50)->get(['id','created_at','checked_at'])])
            ->header('Cache-Control','no-store, private');
    }

    private function stepUp(Request $request): object
    {
        $staff=$request->attributes->get('cafe_staff');
        CafeAccess::authorize($staff,'report.global');
        $data=$request->validate(['password'=>['required','string','max:256'],'confirmed'=>['accepted']]);
        abort_unless(Hash::check($data['password'],$staff->password_hash),403);
        return $staff;
    }

    public function cost(Request $request,ReferralService $service): RedirectResponse
    {
        $staff=$this->stepUp($request);
        $data=$request->validate(['month'=>['required','date_format:Y-m'],
            'spend_irr'=>['required','integer','between:0,1000000000000']]);
        $service->recordCost((int)$staff->id,(int)$request->session()->get('cafe_staff_version'),$data['month'],(int)$data['spend_irr']);
        return redirect()->route('cashier.referrals')->with('notice','هزینه واقعی ثبت شد.');
    }

    public function review(Request $request,ReferralService $service): RedirectResponse
    {
        $staff=$this->stepUp($request);
        $data=$request->validate(['referral_id'=>['required','integer','min:1'],'decision'=>['required','in:reject,recheck']]);
        $service->review((int)$staff->id,(int)$request->session()->get('cafe_staff_version'),(int)$data['referral_id'],$data['decision']);
        return redirect()->route('cashier.referrals')->with('notice','تصمیم بررسی ثبت شد؛ هیچ پاداش مستقیمی صادر نشد.');
    }
}
