<?php

namespace App\Http\Requests;

use App\Services\Arcade\CafeCrittersReplayVerifier;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class CompleteTurnRunRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'ticks' => ['required', 'integer', 'min:1',
                'max:'.CafeCrittersReplayVerifier::MAX_TICKS],
            'actions' => ['required', 'array', 'min:12',
                'max:'.CafeCrittersReplayVerifier::MAX_ACTIONS],
            'actions.*' => ['required', 'array:tick,kind,field,option'],
            'actions.*.tick' => ['required', 'integer', 'min:0',
                'max:'.(CafeCrittersReplayVerifier::MAX_TICKS - 1)],
            'actions.*.kind' => ['required', Rule::in(['select', 'invite', 'next'])],
            'actions.*.field' => ['nullable', 'string', 'max:12'],
            'actions.*.option' => ['nullable', 'string', 'max:16'],
        ];
    }
}
