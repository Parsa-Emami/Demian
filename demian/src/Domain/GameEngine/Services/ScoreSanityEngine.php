<?php
namespace Domain\GameEngine\Services;

use Domain\GameEngine\DTOs\ScoreDTO;
final class ScoreSanityEngine
{
 public function validate(ScoreDTO $dto): bool { return $dto->duration>0 && $dto->score <= ($dto->duration*100); }
}
