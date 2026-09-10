<?php
namespace Infrastructure\Security;
class AtomicLockService {
    public function acquire(string $key): bool { return true; }
    public function release(string $key): void {}
}
