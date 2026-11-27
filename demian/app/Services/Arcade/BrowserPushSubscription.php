<?php

namespace App\Services\Arcade;

final class BrowserPushSubscription
{
    public static function endpointAllowed(mixed $endpoint): bool
    {
        if (! is_string($endpoint) || strlen($endpoint) > 2048 || preg_match('/[^\x21-\x7e]|\\\\/', $endpoint)) {
            return false;
        }
        $parts = parse_url($endpoint);
        if (! is_array($parts) || ($parts['scheme'] ?? '') !== 'https'
            || empty($parts['path']) || isset($parts['user']) || isset($parts['pass'])
            || isset($parts['port']) || isset($parts['fragment'])) {
            return false;
        }

        return preg_match('/^(?:fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.mozilla\.org|(?:[a-z0-9-]+\.)*push\.apple\.com|wns[0-9]*-[a-z0-9-]+\.notify\.windows\.com)$/Di', $parts['host'] ?? '') === 1;
    }

    public static function decode(mixed $value): ?string
    {
        if (! is_string($value) || ! preg_match('/^[A-Za-z0-9_-]+$/D', $value)) {
            return null;
        }
        $decoded = base64_decode(strtr($value, '-_', '+/'), true);

        return is_string($decoded) && rtrim(strtr(base64_encode($decoded), '+/', '-_'), '=') === $value
            ? $decoded : null;
    }

    public static function publicKeyValid(mixed $value): bool
    {
        $bytes = self::decode($value);
        if ($bytes === null || strlen($bytes) !== 65 || $bytes[0] !== "\x04") {
            return false;
        }
        $prefix = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200');
        $pem = "-----BEGIN PUBLIC KEY-----\n".base64_encode($prefix.$bytes)."\n-----END PUBLIC KEY-----\n";

        return openssl_pkey_get_public($pem) !== false;
    }

    public static function valid(array $subscription): bool
    {
        return self::endpointAllowed($subscription['endpoint'] ?? null)
            && self::publicKeyValid($subscription['keys']['p256dh'] ?? null)
            && strlen(self::decode($subscription['keys']['auth'] ?? null) ?? '') === 16;
    }
}
