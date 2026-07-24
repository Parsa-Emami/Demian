<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCharacterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $character = $this->route('character');

        return [
            'name' => ['sometimes', 'required', 'string', 'max:80'],
            'slug' => [
                'sometimes',
                'required',
                'alpha_dash:ascii',
                'max:100',
                Rule::unique('characters', 'slug')->ignore($character),
            ],
            'sprite_sheet' => [
                'nullable',
                'file',
                'image',
                'mimes:png,webp',
                'max:10240',
            ],
            'atlas' => [
                'nullable',
                'file',
                'mimes:json,txt',
                'max:1024',
            ],
            'settings' => ['nullable', 'json'],
        ];
    }
}
