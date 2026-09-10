<?php
namespace Domain\Economy\ValueObjects;

final class Money
{
 public function __construct(public readonly int $amount) {}
}
