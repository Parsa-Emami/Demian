<?php

namespace App\Http\Controllers\Cafe;

use App\Http\Controllers\Controller;
use App\Services\Arcade\ArcadeAntiCheat;
use App\Services\Arcade\CafeAccess;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\View\View;

/**
 * Session/CSRF-protected staff review. Player bearer capabilities cannot see
 * reports. Only an active superadministrator can mutate a report or add a hold.
 */
final class CafeAntiCheatController extends Controller
{
    public function index(Request $request, ArcadeAntiCheat $antiCheat): View
    {
        $staff = $request->attributes->get('cafe_staff');
        CafeAccess::authorize($staff, 'audit.ledger');
        $filters = $request->validate([
            'status' => ['sometimes', 'in:open,investigating,cleared,confirmed'],
        ]);
        $query = DB::table('arcade_cheat_reports')->orderByDesc('id');
        if (isset($filters['status'])) $query->where('status', $filters['status']);
        return view('cashier.anticheat', [
            'staff' => $staff, 'summary' => $antiCheat->dashboard(),
            'reports' => $query->limit(100)->get([
                'id','player_id','run_id','signal','severity','risk_score',
                'status','hits','first_seen','last_seen','reviewed_at',
            ]),
            'reviews' => DB::table('arcade_cheat_review_events')
                ->orderByDesc('id')->limit(50)
                ->get(['id','report_id','actor_id','action','previous_status',
                    'next_status','created_at']),
            'activeHolds' => DB::table('arcade_anticheat_holds')
                ->where('expires_at','>',now())->count(),
            'canReview' => $staff->role === 'super_admin',
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

    public function review(Request $request, int $reportId,
        ArcadeAntiCheat $antiCheat): RedirectResponse
    {
        $staff = $this->stepUp($request);
        $data = $request->validate([
            'decision' => ['required','in:investigating,cleared,confirmed,reopen'],
            'note' => ['required','string','min:12','max:500'],
        ]);
        $antiCheat->review($reportId,(int)$staff->id,
            (int)$request->session()->get('cafe_staff_version'),
            $data['decision'],$data['note']);
        return redirect()->route('cashier.anticheat')->with('notice',
            'تصمیم بررسی انسانی با تاریخچه قابل ممیزی ثبت شد.');
    }

    public function hold(Request $request, int $reportId,
        ArcadeAntiCheat $antiCheat): RedirectResponse
    {
        $staff = $this->stepUp($request);
        $data = $request->validate([
            'operation' => ['required','in:apply,release'],
            'hours' => ['required_if:operation,apply','nullable',
                'integer','between:1,168'],
            'note' => ['required','string','min:12','max:500'],
        ]);
        $antiCheat->setHold($reportId,(int)$staff->id,
            (int)$request->session()->get('cafe_staff_version'),
            $data['operation'] === 'apply' ? (int)$data['hours'] : null,
            $data['note']);
        return redirect()->route('cashier.anticheat')->with('notice',
            'محدودیت فقط برای شروع مسابقات جدید ثبت شد؛ امتیازها و جوایز تغییر نکردند.');
    }
}
