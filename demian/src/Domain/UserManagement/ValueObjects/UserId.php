<?php
namespace Domain\UserManagement\ValueObjects;

final class UserId { public function __construct(public readonly string $value) {} }
