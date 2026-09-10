<?php
namespace App\Application\Game\Commands;
class FinalizeGameSessionCommand {
    public function __construct(
        public readonly string $sessionId,
        public readonly int $score
    ) {}
}
