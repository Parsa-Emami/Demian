<?php
namespace Domain\UserManagement\Repositories;
interface PlayerRepositoryInterface { public function find(string $id): ?object; }
