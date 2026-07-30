<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Events\EventDefinitionRepository;
use Illuminate\Http\JsonResponse;

final class EventController extends Controller
{
    public function index(EventDefinitionRepository $definitions): JsonResponse
    {
        return response()->json(['data' => $definitions->summaries()]);
    }

    public function active(EventDefinitionRepository $definitions): JsonResponse
    {
        return response()->json(['data' => $definitions->active()]);
    }

    public function show(string $event, EventDefinitionRepository $definitions): JsonResponse
    {
        return response()->json(['data' => $definitions->find($event)]);
    }
}
