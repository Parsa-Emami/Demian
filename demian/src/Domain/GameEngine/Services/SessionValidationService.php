<?php
namespace Domain\GameEngine\Services;
class SessionValidationService {
    public function validate(array $session): bool {
        return isset($session['id'], $session['started_at']);
    }
}
