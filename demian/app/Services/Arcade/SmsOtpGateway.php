<?php

namespace App\Services\Arcade;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Configured gateway adapter; disabled by default. Production gateway must
 * accept POST JSON {to, code, template} with a bearer key and return 2xx.
 * It must send the SMS itself; no "test code" escapes to a public response.
 */
final class SmsOtpGateway
{
    public function ready(): bool
    {
        $url = (string) config('demian-arcade.otp.gateway_url');
        $key = (string) config('demian-arcade.otp.gateway_key');
        $parts = parse_url($url);

        return config('demian-arcade.otp.enabled') === true
            && is_array($parts)
            && strtolower((string) ($parts['scheme'] ?? '')) === 'https'
            && is_string($parts['host'] ?? null)
            && filter_var($parts['host'], FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) !== false
            && ! in_array(strtolower($parts['host']), ['localhost', 'localhost.localdomain'], true)
            && ! isset($parts['user'], $parts['pass'], $parts['fragment'])
            && strlen($key) >= 24;
    }

    public function send(string $phone, string $code): void
    {
        if (! $this->ready()) {
            throw new RuntimeException('OTP gateway is not configured.');
        }
        if (preg_match('/^\+[1-9][0-9]{7,14}$/D', $phone) !== 1
            || preg_match('/^[0-9]{6}$/D', $code) !== 1) {
            throw new RuntimeException('Invalid OTP delivery parameters.');
        }
        try {
            $response = Http::withToken((string) config('demian-arcade.otp.gateway_key'))
                ->acceptJson()
                ->asJson()->connectTimeout(2)->timeout(5)->post(
                    (string) config('demian-arcade.otp.gateway_url'),
                    ['to' => $phone, 'code' => $code, 'template' => 'demian-player-verify']
                );
            if (! $response->successful()) {
                throw new RuntimeException('OTP delivery failed.');
            }
        } catch (\Throwable $e) {
            // Never leak gateway response bodies, URLs, tokens or raw phone.
            throw new RuntimeException('OTP delivery failed.', 0, null);
        }
    }
}
