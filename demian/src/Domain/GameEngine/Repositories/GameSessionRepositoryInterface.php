<?php
namespace Domain\GameEngine\Repositories;
interface GameSessionRepositoryInterface { public function save(object $session): void; }
