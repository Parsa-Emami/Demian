<?php
namespace Domain\Economy\Entities;

final class Coupon
{
 public function __construct(public readonly string $id, public bool $claimed=false) {}
 public function claim(): void { $this->claimed=true; }
}
