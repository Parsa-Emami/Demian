<?php

namespace App\Http\Controllers\Cafe;

use App\Http\Controllers\Controller;
use App\Models\ArcadePlayer;
use App\Services\Arcade\CafeAccess;
use App\Services\Arcade\CafeStaffAdminService;
use App\Services\Arcade\CouponLedgerAudit;
use App\Services\Arcade\CafeProductionReadiness;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\View\View;
use RuntimeException;

final class CafeAdminController extends Controller
{
    private function actor(Request $request, string $ability): object
    {
        $staff = $request->attributes->get('cafe_staff');
        CafeAccess::authorize($staff, $ability);

        return $staff;
    }

    private function reauthenticated(Request $request, object $staff): void
    {
        $data = $request->validate([
            'password' => ['required', 'string', 'max:256'],
            'confirmed' => ['accepted'],
        ]);
        abort_unless(Hash::check($data['password'], $staff->password_hash), 403,
            'Administrator password verification failed.');
    }

    public function players(Request $request): View
    {
        $staff = $this->actor($request, 'staff.directory');
        $search = $request->validate(['q' => ['nullable', 'string', 'max:50',
            'regex:/^[\p{L}\p{N} _‌-]+$/u']])['q'] ?? '';
        $players = ArcadePlayer::query()->select('id', 'display_name', 'contact_type', 'created_at')
            ->when($search !== '', fn ($query) => $query->where('display_name', 'like', '%'.$search.'%'))
            ->orderBy('display_name')->orderBy('id')->paginate(25)->withQueryString();
        $counts = DB::table('arcade_coupons')->whereIn('player_id', $players->pluck('id'))
            ->where('status', 'issued')->where('expires_at', '>', now()->utc())
            ->select('player_id', 'source', DB::raw('COUNT(*) AS total'))
            ->groupBy('player_id', 'source')->get()->groupBy('player_id');

        return view('cashier.players', compact('staff', 'players', 'counts', 'search'));
    }

    public function player(Request $request, ArcadePlayer $player): View
    {
        $staff = $this->actor($request, 'staff.directory');
        $coupons = DB::table('arcade_coupons as c')->leftJoin('arcade_weekly_winners as w', 'w.id', '=', 'c.winner_id')
            ->where('c.player_id', $player->id)->orderByDesc('c.id')->paginate(25, [
                'c.id', 'c.source', 'c.status', 'c.discount_percent', 'c.expires_at', 'c.redeemed_at',
                'w.game_id', 'w.period_key', 'w.prize_rank',
            ]);
        $contact = $staff->role === 'super_admin' ? $player->contact_value : null;
        return view('cashier.player', compact('staff', 'player', 'coupons', 'contact'));
    }

    public function directory(Request $request): View
    {
        $staff = $this->actor($request, 'staff.directory');
        $query = DB::table('arcade_cashier_staff')->orderBy('branch_id')
            ->orderBy('id')->select('id', 'username', 'display_name',
                'branch_id', 'role', 'is_active', 'last_login_at');
        if ($staff->role !== 'super_admin') {
            $query->where('branch_id', $staff->branch_id);
        }

        return view('cashier.staff', [
            'staff' => $staff, 'records' => $query->limit(100)->get(),
            'canManage' => CafeAccess::allows($staff, 'staff.disable'),
        ]);
    }

    public function setStaffActive(Request $request, int $subjectId,
        CafeStaffAdminService $service, string $operation): RedirectResponse
    {
        $enabled = $operation === 'enable';
        $staff = $this->actor($request, $enabled ? 'staff.enable' : 'staff.disable');
        $this->reauthenticated($request, $staff);
        $service->setActive((int) $staff->id,
            (int) $request->session()->get('cafe_staff_version'), $subjectId, $enabled);

        return redirect()->route('cashier.staff')->with('notice',
            'وضعیت دسترسی کارمند ثبت شد.');
    }

    public function globalReport(Request $request): View
    {
        $staff = $this->actor($request, 'report.global');
        $records = DB::table('arcade_coupon_redemptions as r')
            ->join('arcade_cashier_staff as s', 's.id', '=', 'r.cashier_id')
            ->where('r.channel', 'in_cafe')->orderByDesc('r.id')->limit(100)
            ->get(['r.id', 'r.branch_id', 'r.currency', 'r.subtotal_minor',
                'r.discount_minor', 'r.redeemed_at', 's.display_name as cashier'])
            ->map(fn (object $r): array => [
                'id' => $r->id, 'branch' => $r->branch_id, 'currency' => $r->currency,
                'subtotal_minor' => $r->subtotal_minor,
                'discount_minor' => $r->discount_minor,
                'redeemed_at' => $r->redeemed_at, 'cashier' => $r->cashier,
            ])->all();

        return view('cashier.report', ['staff' => $staff,
            'records' => $records, 'global' => true]);
    }

    public function revoke(Request $request, CafeStaffAdminService $service): RedirectResponse
    {
        $staff = $this->actor($request, 'coupon.revoke');
        $data = $request->validate([
            'coupon_id' => ['required', 'integer', 'min:1'],
            'reason' => ['required', 'in:fraud,policy,incident'],
        ]);
        $this->reauthenticated($request, $staff);
        try {
            $service->revokeCoupon((int) $staff->id,
                (int) $request->session()->get('cafe_staff_version'), (int) $data['coupon_id'],
                $data['reason']);
        } catch (RuntimeException) {
            abort(409, 'Voucher cannot be revoked after redemption or deletion.');
        }

        return redirect()->route('cashier.index')->with('notice',
            'کد تخفیف بدون افشای مقدار آن ابطال شد.');
    }

    public function audit(Request $request, CouponLedgerAudit $audit): View
    {
        $staff = $this->actor($request, 'audit.ledger');

        return view('cashier.audit', [
            'staff' => $staff, 'result' => $audit->inspect(),
            'events' => DB::table('arcade_cashier_admin_events')->orderByDesc('id')
                ->limit(50)->get(['id', 'actor_id', 'subject_id', 'event_type', 'created_at']),
        ]);
    }

    public function readiness(Request $request, CafeProductionReadiness $readiness): View
    {
        $staff = $this->actor($request, 'operations.readiness');

        return view('cashier.readiness', [
            'staff' => $staff, 'result' => $readiness->inspect(true),
        ]);
    }
}
