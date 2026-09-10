<?php
namespace Domain\Economy\DTOs;
class RewardRequestDTO { public function __construct(public string $playerId, public int $score, public string $sessionId){} }
