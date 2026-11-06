<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class CompleteArcadeRunRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return ['ticks' => ['required', 'integer', 'min:1', 'max:54000'],
            'transitions' => ['required', 'array', 'min:1', 'max:12000'],
            'transitions.*' => ['required', 'array:tick,mask'],
            'transitions.*.tick' => ['required', 'integer', 'min:0', 'max:53999'],
            'transitions.*.mask' => ['required', 'integer', 'min:0', 'max:7']];
    }
}
