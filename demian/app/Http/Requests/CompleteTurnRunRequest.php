<?php

namespace App\Http\Requests;

use App\Services\Arcade\CafeCrittersReplayVerifier;
use App\Services\Arcade\CoffeeCrashReplayVerifier;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class CompleteTurnRunRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'ticks' => ['required', 'integer', 'min:1',
                'max:'.max(CafeCrittersReplayVerifier::MAX_TICKS,
                    CoffeeCrashReplayVerifier::MAX_TICKS, 300*60)],
            'actions' => ['required_without:frames', 'prohibited_with:frames', 'array', 'min:1',
                'max:'.\App\Services\Arcade\CafeRouteReplayVerifier::MAX_ACTIONS],
            'frames' => ['required_without:actions', 'prohibited_with:actions',
                'array', 'min:2',
                'max:'.\App\Services\Arcade\CafeRushFrameReplayVerifier::MAX_TRANSITIONS],
            'frames.*' => ['required', 'array'],
            'actions.*' => ['required', 'array:tick,kind,field,option,a,b,x,z,target'],
            'actions.*.tick' => ['required', 'integer', 'min:0',
                'max:'.(max(CafeCrittersReplayVerifier::MAX_TICKS,
                    CoffeeCrashReplayVerifier::MAX_TICKS, 300*60) - 1)],
            'actions.*.kind' => ['required', Rule::in(['select', 'invite', 'next', 'swap', 'undo', 'move', 'checkpoint'])],
            'actions.*.field' => ['nullable', 'string', 'max:12'],
            'actions.*.option' => ['nullable', 'string', 'max:16'],
            'actions.*.a' => ['nullable', 'integer', 'min:0', 'max:55'],
            'actions.*.b' => ['nullable', 'integer', 'min:0', 'max:55'],
            'actions.*.x' => ['nullable', 'numeric', 'between:-200,200'],
            'actions.*.z' => ['nullable', 'numeric', 'between:-200,200'],
            'actions.*.target' => ['nullable', 'string', 'max:45'],
        ];
    }
}
