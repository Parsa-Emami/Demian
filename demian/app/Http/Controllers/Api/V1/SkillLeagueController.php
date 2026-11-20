<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Arcade\SkillLeaguePolicy;
use App\Services\Arcade\SkillLeagueService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

final class SkillLeagueController extends Controller
{
    public function board(Request $request, SkillLeagueService $service): JsonResponse
    {
        $data=$request->validate([
            'week'=>['sometimes','date_format:Y-m-d'],
            'league'=>['sometimes',Rule::in([...SkillLeaguePolicy::TIERS,'placement'])],
            'limit'=>['sometimes','integer','between:1,50'],
        ]);
        try {
            return response()->json($service->board(isset($data['week'])?'weekly:tehran:'.$data['week']:null,
                $data['league']??'bronze',(int)($data['limit']??20)))->header('Cache-Control','public, max-age=15');
        } catch (\InvalidArgumentException) {
            throw ValidationException::withMessages(['week'=>'Week must start on a Tehran Saturday.']);
        }
    }

    public function profile(Request $request,SkillLeagueService $service): JsonResponse
    {
        return response()->json($service->profile($request->attributes->get('arcade_player')->id))
            ->header('Cache-Control','private, no-store');
    }
}
