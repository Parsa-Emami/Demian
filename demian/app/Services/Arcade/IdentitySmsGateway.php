<?php

namespace App\Services\Arcade;

use Illuminate\Support\Facades\Http;

final class IdentitySmsGateway
{
    public function configured(): bool
    {
        $url = config('demian-identity.gateway_url');
        $token = config('demian-identity.gateway_token');
        return is_string($url) && filter_var($url, FILTER_VALIDATE_URL) !== false
            && parse_url($url, PHP_URL_SCHEME) === 'https'
            && parse_url($url, PHP_URL_USER) === null && parse_url($url, PHP_URL_PASS) === null
            && parse_url($url, PHP_URL_QUERY) === null && parse_url($url, PHP_URL_FRAGMENT) === null
            && is_string($token) && strlen($token) >= 16;
    }

    public function send(string $phone, string $code, string $id): bool
    {
        if (! $this->configured()) return false;
        try {
            // This is an operator-configured HTTPS adapter, not a built-in SMS vendor.
            // No redirects, retries, raw provider errors, or request payload logging.
            $response = Http::withToken(config('demian-identity.gateway_token'))
                ->acceptJson()->asJson()->withoutRedirecting()->connectTimeout(3)->timeout(8)
                ->post(config('demian-identity.gateway_url'), [
                    'to' => $phone, 'code' => $code, 'request_id' => $id,
                    'template' => 'demian_identity_otp', 'expires_in' => 300,
                ]);
            return $response->successful() && $response->json('accepted') === true;
        } catch (\Throwable) {
            return false;
        }
    }
}
