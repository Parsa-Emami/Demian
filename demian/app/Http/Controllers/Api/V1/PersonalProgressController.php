<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Arcade\PersonalProgressService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class PersonalProgressController extends Controller
{
    public function show(Request $request, PersonalProgressService $service): JsonResponse
    {
        $data=$request->validate(['game'=>['sometimes','string',Rule::in(PersonalProgressService::GAMES)]]);
        return response()->json($service->profile($request->attributes->get('arcade_player')->id,$data['game']??'dino-run'))
            ->header('Cache-Control','no-store, private')->header('Pragma','no-cache');
    }
}
