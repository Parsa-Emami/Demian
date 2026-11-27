<?php

namespace App\Http\Controllers\Cafe;

use App\Http\Controllers\Controller;
use App\Services\Arcade\BrowserPushService;
use App\Services\Arcade\CafeAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

final class CafeBrowserPushController extends Controller
{
    public function index(BrowserPushService $push): Response
    {
        return response()->view('cashier.browser-push', [
            'enabled' => $push->credentials() !== null,
            'notices' => $push->recent(),
            'requestId' => (string) Str::uuid(),
        ])->header('Cache-Control', 'private, no-store');
    }

    public function publish(Request $request, BrowserPushService $push): Response
    {
        $input = $request->validate([
            'request_id' => ['required', 'uuid'],
            'title' => ['required', 'string', 'max:60'],
            'body' => ['required', 'string', 'max:180'],
            'target' => ['required', Rule::in(BrowserPushService::TARGETS)],
            'password' => ['required', 'string', 'max:256'],
            'confirmed' => ['accepted'],
        ]);
        abort_unless($push->credentials() !== null, 503);
        $actor = $request->attributes->get('cafe_staff');
        $count = DB::transaction(function () use ($request, $push, $input, $actor): int {
            $staff = DB::table('arcade_cashier_staff')->where('id', $actor->id)->lockForUpdate()->first();
            CafeAccess::authorize($staff, 'operations.readiness');
            abort_unless((int) $staff->session_version === (int) $request->session()->get('cafe_staff_version')
                && Hash::check($input['password'], $staff->password_hash), 403);

            return $push->enqueue($input['title'], $input['body'], $input['target'], (int) $staff->id,
                noticeId: strtolower($input['request_id']));
        }, 3);

        return redirect()->route('cashier.browser-push')->with('notice', "اعلان برای {$count} مرورگر در صف قرار گرفت.");
    }
}
