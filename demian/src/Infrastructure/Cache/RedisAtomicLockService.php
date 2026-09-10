<?php
namespace App\Infrastructure\Cache;
class RedisAtomicLockService {
    public function acquire(string $key, int $seconds = 10): bool {
        return cache()->lock($key, $seconds)->get();
    }
    public function release(string $key): void {}
}
