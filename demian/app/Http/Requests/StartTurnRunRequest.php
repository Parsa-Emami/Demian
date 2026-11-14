<?php

namespace App\Http\Requests;

use App\Services\Arcade\CafeCrittersReplayVerifier;
use App\Services\Arcade\CoffeeCrashReplayVerifier;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class StartTurnRunRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'request_id' => ['required', 'uuid'],
            'game_id' => ['required', Rule::in([CafeCrittersReplayVerifier::GAME_ID, CoffeeCrashReplayVerifier::GAME_ID,
                ...array_keys(\App\Services\Arcade\CafeRouteReplayVerifier::VERSIONS)])],
            'rules_version' => ['required', 'string', 'max:40'],
        ];
    }
}
