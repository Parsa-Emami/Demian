<?php
namespace Domain\UserManagement\Events;

final class PlayerFlagged { public function __construct(public readonly string $playerId) {} }
