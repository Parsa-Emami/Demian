<?php
namespace Domain\Economy\ValueObjects;
class DifficultyLevel { public function __construct(public int $level) {} public function increase(): self { return new self($this->level+1); } }
