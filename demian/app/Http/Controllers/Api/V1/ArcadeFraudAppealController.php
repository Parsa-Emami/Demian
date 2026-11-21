<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Arcade\ArcadeFraudAppeals;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class ArcadeFraudAppealController extends Controller
{
    public function index(Request $request, ArcadeFraudAppeals $appeals): JsonResponse
    {
        return response()->json(['appeals' => $appeals->forPlayer(
            $request->attributes->get('arcade_player'),
        )])->header('Cache-Control', 'no-store, private');
    }

    public function submit(Request $request, ArcadeFraudAppeals $appeals): JsonResponse
    {
        $data = $request->validate([
            'report_id' => ['required', 'integer', 'min:1'],
            'reason_code' => ['required', Rule::in(ArcadeFraudAppeals::REASONS)],
            'statement' => ['required', 'string', 'min:12', 'max:350'],
        ]);
        $outcome = $appeals->submit($request->attributes->get('arcade_player'),
            (int) $data['report_id'], $data['reason_code'], $data['statement']);
        return response()->json($outcome, $outcome['duplicate'] ? 200 : 201)
            ->header('Cache-Control', 'no-store, private');
    }
}
