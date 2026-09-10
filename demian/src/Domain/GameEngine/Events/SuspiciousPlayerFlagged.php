<?php
namespace Domain\GameEngine\Events;
class SuspiciousPlayerFlagged {
    public function __construct(public string $playerId, public string $reason){}
}
