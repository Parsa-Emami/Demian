<?php
namespace Domain\GameEngine\Entities;

final class GameSession { public function __construct(public readonly string $id, public readonly string $userId) {} }
