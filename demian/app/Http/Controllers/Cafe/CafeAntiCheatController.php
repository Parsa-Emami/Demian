<?php

namespace App\Http\Controllers\Cafe;

use App\Http\Controllers\Controller;
use App\Services\Arcade\ArcadeAntiCheat;
use App\Services\Arcade\ArcadeFraudAppeals;
use App\Services\Arcade\CafeAccess;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\View\View;

/**
 * Session/CSRF-protected staff review. Player bearer capabilities cannot see
 * reports. Only an active superadministrator can mutate a report or add a hold.
 */
final class CafeAntiCheatController extends Controller
{
    private const SIGNAL_LABELS = [
        'multi_account' => 'همهٔ نشانه‌های چندحسابی',
        'cross_account_replay' => 'بازپخش یکسان بین حساب‌ها',
        'shared_network_rejections' => 'رد مکرر بازپخش در حساب‌های یک شبکه',
        'shared_network_cohort' => 'حساب‌های فعال در شبکهٔ مشترک',
        'overlapping_verified_runs' => 'دورهای تأییدشدهٔ هم‌زمان',
        'invalid_replay_velocity' => 'رد مکرر بازپخش یک حساب',
        'start_velocity' => 'شروع‌های پرتعداد مسابقه',
        'statistical_score_outlier' => 'امتیاز دور از سطح بازیکنان هم‌هفته',
        'short_high_score' => 'امتیاز بالا در دور کوتاه',
        'dense_control_trace' => 'ورودی‌های متراکم',
        'periodic_jump_cadence' => 'الگوی بسیار منظم پرش',
    ];

    public function index(Request $request, ArcadeAntiCheat $antiCheat,
        ArcadeFraudAppeals $appeals): View
    {
        $staff = $request->attributes->get('cafe_staff');
        CafeAccess::authorize($staff, 'audit.ledger');
        abort_unless($staff->role === 'super_admin', 403);
        $filters = $request->validate([
            'status' => ['nullable', 'in:active,open,investigating,cleared,confirmed'],
            'signal' => ['nullable', Rule::in(array_keys(self::SIGNAL_LABELS))],
            'player' => ['nullable', 'uuid'],
            'report' => ['sometimes', 'integer', 'min:1'],
        ]);
        $fields = ['id', 'player_id', 'run_id', 'signal', 'severity', 'risk_score', 'status',
            'hits', 'first_seen', 'last_seen', 'reviewed_at', 'evidence'];
        $query = DB::table('arcade_cheat_reports')->orderByDesc('last_seen')->orderByDesc('id');
        if (($filters['status'] ?? null) === 'active') {
            $query->whereIn('status', ['open', 'investigating']);
        } elseif (isset($filters['status'])) {
            $query->where('status', $filters['status']);
        }
        if (isset($filters['player'])) {
            $query->where('player_id', $filters['player']);
        }
        $signal = $filters['signal'] ?? null;
        if ($signal === 'multi_account') {
            $query->whereIn('signal', ArcadeAntiCheat::MULTI_ACCOUNT_SIGNALS);
        } elseif ($signal !== null) {
            $query->where('signal', $signal);
        }
        $selected = isset($filters['report'])
            ? DB::table('arcade_cheat_reports')->where('id', $filters['report'])->first($fields)
            : null;
        abort_if(isset($filters['report']) && ! $selected, 404);
        $reviewQuery = DB::table('arcade_cheat_review_events')->orderByDesc('id')->limit(50);
        if ($selected) {
            $reviewQuery->where('report_id', $selected->id);
        }
        $selectedRun = $selected?->run_id
            ? DB::table('arcade_runs')->where('id', $selected->run_id)
                ->where('player_id', $selected->player_id)->first(['game_id', 'rules_version'])
            : null;

        return view('cashier.anticheat', [
            'staff' => $staff, 'summary' => $antiCheat->dashboard(),
            'filters' => $filters,
            'signalLabels' => self::SIGNAL_LABELS,
            'reports' => $query->paginate(30, $fields)->appends($filters),
            'selected' => $selected,
            'selectedRun' => $selectedRun,
            'relatedAccounts' => $selected ? $antiCheat->relatedReplayAccounts($selected) : collect(),
            'riskQueue' => $antiCheat->riskQueue(),
            'sharedRegistrations' => $antiCheat->sharedPhoneRegistrations(),
            'reviews' => $reviewQuery->get(['id', 'report_id', 'actor_id', 'action',
                'previous_status', 'next_status', 'created_at', 'note']),
            'appeals' => $appeals->adminQueue(),
        ]);
    }

    private function stepUp(Request $request): object
    {
        $staff = $request->attributes->get('cafe_staff');
        CafeAccess::authorize($staff, 'audit.ledger');
        abort_unless($staff->role === 'super_admin', 403);
        $data = $request->validate([
            'password' => ['required','string','max:256'],
            'confirmed' => ['accepted'],
        ]);
        abort_unless(Hash::check($data['password'],$staff->password_hash),403,
            'Human anti-cheat review requires fresh superadministrator password.');
        return $staff;
    }

    public function appeal(Request $request,
        ArcadeFraudAppeals $appeals): RedirectResponse
    {
        $staff = $this->stepUp($request);
        $data = $request->validate([
            'appeal_id' => ['required', 'integer', 'min:1'],
            'decision' => ['required', 'in:accept,reject'],
            'note' => ['required', 'string', 'min:12', 'max:500'],
        ]);
        $appeals->resolve((int) $data['appeal_id'], (int) $staff->id,
            (int) $request->session()->get('cafe_staff_version'),
            $data['decision'], $data['note']);
        return redirect()->route('cashier.anticheat')->with('notice',
            'پاسخ اعتراض با امضای سوپرادمین و ثبت ممیزی انجام شد.');
    }

    public function review(Request $request,
        ArcadeAntiCheat $antiCheat): RedirectResponse
    {
        $staff = $this->stepUp($request);
        $data = $request->validate([
            'report_id' => ['required','integer','min:1'],
            'decision' => ['required','in:investigating,cleared,confirmed,reopen'],
            'note' => ['required','string','min:12','max:500'],
        ]);
        $antiCheat->review((int)$data['report_id'],(int)$staff->id,
            (int)$request->session()->get('cafe_staff_version'),
            $data['decision'],$data['note']);
        return redirect()->route('cashier.anticheat')->with('notice',
            'تصمیم بررسی انسانی با تاریخچه قابل ممیزی ثبت شد.');
    }

    public function hold(Request $request,
        ArcadeAntiCheat $antiCheat): RedirectResponse
    {
        $staff = $this->stepUp($request);
        $data = $request->validate([
            'report_id' => ['required','integer','min:1'],
            'operation' => ['required','in:apply,release'],
            'hours' => ['required_if:operation,apply','nullable',
                'integer','between:1,168'],
            'note' => ['required','string','min:12','max:500'],
        ]);
        $antiCheat->setHold((int)$data['report_id'],(int)$staff->id,
            (int)$request->session()->get('cafe_staff_version'),
            $data['operation'] === 'apply' ? (int)$data['hours'] : null,
            $data['note']);
        return redirect()->route('cashier.anticheat')->with('notice',
            'محدودیت فقط برای شروع مسابقات جدید ثبت شد؛ امتیازها و جوایز تغییر نکردند.');
    }
}
