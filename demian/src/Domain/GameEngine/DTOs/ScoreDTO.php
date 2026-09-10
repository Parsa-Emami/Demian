<?php
namespace Domain\GameEngine\DTOs;

final class ScoreDTO { public function __construct(public readonly int $score, public readonly int $duration) {} }
