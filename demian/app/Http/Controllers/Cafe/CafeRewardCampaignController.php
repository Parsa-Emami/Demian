<?php

namespace App\Http\Controllers\Cafe;

use App\Http\Controllers\Controller;
use App\Services\Arcade\CafeAccess;
use App\Services\Arcade\CouponPolicy;
use App\Services\Arcade\RewardCampaignService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\View\View;

final class CafeRewardCampaignController extends Controller
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
        $credentials = $request->validate([
            'password' => ['required', 'string', 'max:256'],
            'confirmed' => ['accepted'],
        ]);
        abort_unless(Hash::check($credentials['password'], $staff->password_hash), 403);

        return $staff;
    }

    private function fields(Request $request, bool $creating): array
    {
        $rules = [
            'title' => ['required', 'string', 'min:3', 'max:100'],
            'max_awards' => ['required', 'integer', 'between:1,200'],
            'min_order_minor' => ['required', 'integer', 'between:1,1000000000000'],
            'max_discount_minor' => ['required', 'integer', 'between:1,1000000000000'],
            'valid_days' => ['required', 'integer', 'between:1,365'],
            'percent_first' => ['required', 'integer', 'between:1,30'],
            'percent_second' => ['required', 'integer', 'between:1,30'],
            'percent_third' => ['required', 'integer', 'between:1,30'],
            'percent_other' => ['required', 'integer', 'between:1,30'],
        ];
        if ($creating) {
            $rules['period_key'] = ['required', 'regex:/^weekly:tehran:\d{4}-\d{2}-\d{2}$/D'];
        }

        return $request->validate($rules);
    }

    public function index(Request $request, RewardCampaignService $service,
        CouponPolicy $policy): View
    {
        $staff = $this->actor($request);
        $weeks = DB::table('arcade_weekly_periods')->where('status', 'open')
            ->where('starts_at', '>', now())
            ->whereNotIn('period_key', DB::table('arcade_reward_campaigns')->select('period_key'))
            ->orderBy('starts_at')->limit(16)->pluck('period_key')->all();

        return view('cashier.campaigns', [
            'staff' => $staff, 'policy' => $policy->approved(), 'weeks' => $weeks,
            'campaigns' => $service->dashboard(),
            'batchKeys' => DB::table('arcade_reward_campaigns')->orderByDesc('id')
                ->limit(30)->pluck('id')->mapWithKeys(
                    fn ($id): array => [$id => (string) Str::uuid()]
                )->all(),
            'events' => DB::table('arcade_reward_campaign_events')->orderByDesc('id')
                ->limit(50)->get(['id', 'campaign_id', 'event_type', 'created_at']),
        ]);
    }

    public function create(Request $request, RewardCampaignService $service): RedirectResponse
    {
        $staff = $this->stepUp($request);
        $service->create((int) $staff->id,
            (int) $request->session()->get('cafe_staff_version'),
            $this->fields($request, true));

        return $this->done('کمپین پیش‌نویس ایجاد شد.');
    }

    public function revise(Request $request, int $campaignId,
        RewardCampaignService $service): RedirectResponse
    {
        $staff = $this->stepUp($request);
        $service->revise((int) $staff->id,
            (int) $request->session()->get('cafe_staff_version'),
            $campaignId, $this->fields($request, false));

        return $this->done('شرایط پیش‌نویس کمپین ثبت شد.');
    }

    public function import(Request $request, int $campaignId,
        RewardCampaignService $service): RedirectResponse
    {
        $staff = $this->stepUp($request);
        $data = $request->validate([
            'request_key' => ['required', 'uuid'],
            'codes' => ['required', 'string', 'max:8192'],
        ]);
        $result = $service->import((int) $staff->id,
            (int) $request->session()->get('cafe_staff_version'),
            $campaignId, $data['request_key'], $data['codes']);

        return $this->done('ورود: '.$result['imported']
            .' کد جدید، '.$result['existing'].' کد قبلاً ثبت‌شده.');
    }

    public function transition(Request $request, int $campaignId, string $action,
        RewardCampaignService $service): RedirectResponse
    {
        $staff = $this->stepUp($request);
        $service->transition((int) $staff->id,
            (int) $request->session()->get('cafe_staff_version'), $campaignId, $action);

        return $this->done('وضعیت کمپین ثبت شد.');
    }

    public function voidCode(Request $request, RewardCampaignService $service): RedirectResponse
    {
        $staff = $this->stepUp($request);
        $data = $request->validate(['inventory_id' => ['required', 'integer', 'min:1']]);
        $service->voidCode((int) $staff->id,
            (int) $request->session()->get('cafe_staff_version'),
            (int) $data['inventory_id']);

        return $this->done('کد تخصیص‌نیافته باطل شد.');
    }

    private function done(string $message): RedirectResponse
    {
        return redirect()->route('cashier.campaigns')->with('notice', $message);
    }
}
