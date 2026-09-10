<?php
namespace Domain\Economy\ValueObjects;
class RtpConfiguration { public function __construct(public float $target, public float $minWinRate, public float $maxWinRate) {} public function canIssue(float $rate): bool { return $rate <= $this->maxWinRate; } }
