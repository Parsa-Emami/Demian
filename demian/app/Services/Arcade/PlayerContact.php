<?php

namespace App\Services\Arcade;

use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

final class PlayerContact
{
    public function fields(Request $request, bool $required, bool $registration = false): array
    {
        $fields = $request->validate([
            'contact_type' => [$required ? 'required' : 'required_with:contact_value', Rule::in(['phone', 'instagram', 'email'])],
            'contact_value' => [$required ? 'required' : 'required_with:contact_type', 'string', 'max:160'],
            'registration_key' => [$required && $registration ? 'required' : 'sometimes', 'uuid'],
        ]);
        if (! isset($fields['contact_type'], $fields['contact_value'])) {
            return [];
        }

        $type = $fields['contact_type'];
        $value = mb_strtolower(trim($fields['contact_value']));
        $value = match ($type) {
            'phone' => $this->phone($value),
            'instagram' => ltrim($value, '@'),
            default => $value,
        };
        $valid = match ($type) {
            'phone' => preg_match('/^\+[1-9][0-9]{7,14}$/D', $value) === 1,
            'instagram' => preg_match('/^(?!.*\.\.)[a-z0-9_](?:[a-z0-9._]{0,28}[a-z0-9_])?$/D', $value) === 1,
            'email' => filter_var($value, FILTER_VALIDATE_EMAIL) !== false,
        };
        if (! $valid) {
            throw ValidationException::withMessages(['contact_value' => ['راه ارتباطی معتبر وارد کنید.']]);
        }
        $key = (string) config('app.key');
        abort_unless(strlen($key) >= 24, 503, 'Player registration is temporarily unavailable.');

        return [
            'contact_type' => $type,
            'contact_value' => $value,
            'contact_hash' => hash_hmac('sha256', 'arcade-contact|'.$type.'|'.$value, $key),
            ...($registration && isset($fields['registration_key']) ? [
                'registration_key_hash' => hash_hmac('sha256', 'arcade-browser|'.strtolower($fields['registration_key']), $key),
            ] : []),
        ];
    }

    /**
     * Pre-authentication rate limiting must use the same canonical identity
     * as registration, without storing or logging the submitted contact.
     */
    public function rateLimitDigest(Request $request): string
    {
        $rawType = $request->input('contact_type');
        $rawValue = $request->input('contact_value');
        $type = is_string($rawType) ? strtolower(trim($rawType)) : '';
        $value = is_string($rawValue) ? mb_strtolower(trim(mb_substr($rawValue, 0, 160))) : '';
        if ($type === 'phone') $value = $this->phone($value);
        if ($type === 'instagram') $value = ltrim($value, '@');

        return hash('sha256', $type.'|'.$value);
    }

    private function phone(string $value): string
    {
        $value = strtr($value, array_combine(
            mb_str_split('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩'), str_split('01234567890123456789')
        ));
        $value = preg_replace('/[\s()\-]/u', '', $value);
        if (str_starts_with($value, '00')) return '+'.substr($value, 2);
        if (preg_match('/^0[1-9][0-9]{9}$/D', $value)) return '+98'.substr($value, 1);

        return $value;
    }
}
