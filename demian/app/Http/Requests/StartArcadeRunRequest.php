<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class StartArcadeRunRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return ['request_id' => ['required', 'uuid'], 'game_id' => ['required', Rule::in(['dino-run'])],
            'character_slug' => ['required', Rule::in(config('demian-arcade.characters'))],
            'track_width' => ['required', 'integer', 'min:420', 'max:2560'], 'rules_version' => ['required', 'string', 'max:40']];
    }
}
