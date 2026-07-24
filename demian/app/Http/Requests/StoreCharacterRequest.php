<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreCharacterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:80'],
            'slug' => [
                'required',
                'alpha_dash:ascii',
                'max:100',
                Rule::unique('characters', 'slug'),
            ],
            'sprite_sheet' => [
                'required',
                'file',
                'image',
                'mimes:png,webp',
                'max:10240',
            ],
            'atlas' => [
                'required',
                'file',
                'mimes:json,txt',
                'max:1024',
            ],
            'settings' => ['nullable', 'json'],
        ];
    }
}
