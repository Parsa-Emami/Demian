<?php
namespace Domain\Economy\Services;
use Domain\Economy\ValueObjects\DifficultyLevel;
class DynamicDifficultyScalingService { public function calculate(int $score,int $target): DifficultyLevel { $ratio=$target>0?$score/$target:0; return new DifficultyLevel($ratio>=.8?3:($ratio>=.5?2:1)); } }
