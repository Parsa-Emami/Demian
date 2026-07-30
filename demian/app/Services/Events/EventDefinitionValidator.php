<?php

namespace App\Services\Events;

use UnexpectedValueException;

final class EventDefinitionValidator
{
    private const OBJECTIVE_TYPES = ['collect', 'reach', 'survive', 'defeat', 'score'];
    private const MODIFIER_TYPES = ['speed', 'low-gravity', 'fog', 'double-score'];
    private const REWARD_TYPES = ['coin', 'xp', 'badge', 'cosmetic'];

    public function assertValid(array $definition, string $source = 'event definition'): array
    {
        $errors = $this->validate($definition);
        if ($errors !== []) {
            throw new UnexpectedValueException(sprintf(
                'Invalid %s: %s',
                $source,
                implode('; ', $errors),
            ));
        }

        return $definition;
    }

    /** @return list<string> */
    public function validate(array $definition): array
    {
        $errors = [];
        $push = static function (bool $condition, string $message) use (&$errors): void {
            if (! $condition) {
                $errors[] = $message;
            }
        };

        $push(($definition['schemaVersion'] ?? null) === 1, 'schemaVersion must be 1');
        $push(
            is_string($definition['id'] ?? null)
                && preg_match('/^[a-z0-9][a-z0-9-]{2,63}$/', $definition['id']) === 1,
            'id is invalid',
        );
        $push(is_int($definition['revision'] ?? null) && $definition['revision'] >= 1, 'revision is invalid');
        $push(is_string($definition['title'] ?? null) && mb_strlen(trim($definition['title'])) >= 2, 'title is required');
        $push(is_string($definition['map'] ?? null) && $definition['map'] !== '', 'map is required');
        $push($this->numberBetween($definition['duration'] ?? null, 0.001, 3600), 'duration is invalid');
        $push($this->numberBetween($definition['countdown'] ?? 3, 0, 15), 'countdown is invalid');
        $push($this->validPlayerCount($definition['playerCount'] ?? null), 'playerCount is invalid');
        $push($this->validPoint($definition['spawn'] ?? null), 'spawn is invalid');

        $objectives = $definition['objectives'] ?? null;
        $modifiers = $definition['modifiers'] ?? null;
        $rewards = $definition['rewards'] ?? null;
        $world = $definition['world'] ?? null;
        $push(is_array($objectives) && $objectives !== [], 'at least one objective is required');
        $push(is_array($modifiers), 'modifiers must be an array');
        $push(is_array($rewards), 'rewards must be an array');
        $push(is_array($world), 'world is required');
        if (! is_array($objectives)) {
            return $errors;
        }

        $objectiveIds = [];
        $hasRequiredObjective = false;
        foreach ($objectives as $index => $objective) {
            if (! is_array($objective)) {
                $errors[] = "objective {$index} must be an object";
                continue;
            }
            $id = $objective['id'] ?? null;
            $push(is_string($id) && $id !== '' && ! isset($objectiveIds[$id]), "objective {$index} id is missing or duplicated");
            if (is_string($id) && $id !== '') {
                $objectiveIds[$id] = true;
            }
            $type = $objective['type'] ?? null;
            $push(in_array($type, self::OBJECTIVE_TYPES, true), "objective {$id} type is unsupported");
            $push(! isset($objective['required']) || is_bool($objective['required']), "objective {$id} required must be boolean");
            $requires = $objective['requires'] ?? [];
            $push(is_array($requires), "objective {$id} requires must be an array");
            $hasRequiredObjective = $hasRequiredObjective || (($objective['required'] ?? true) !== false);

            if ($type === 'collect') {
                $push(is_string($objective['item'] ?? null) && $objective['item'] !== '', "objective {$id} item is required");
                $push($this->positiveNumber($objective['amount'] ?? null), "objective {$id} amount is invalid");
            } elseif ($type === 'reach') {
                $push(is_string($objective['zone'] ?? null) && $objective['zone'] !== '', "objective {$id} zone is required");
            } elseif ($type === 'defeat') {
                $push(is_string($objective['enemy'] ?? null) && $objective['enemy'] !== '', "objective {$id} enemy is required");
                $push($this->positiveNumber($objective['amount'] ?? null), "objective {$id} amount is invalid");
            } elseif ($type === 'survive') {
                $push(
                    $this->positiveNumber($objective['seconds'] ?? null)
                        && (float) $objective['seconds'] <= (float) ($definition['duration'] ?? 0),
                    "objective {$id} seconds is invalid",
                );
            } elseif ($type === 'score') {
                $push($this->positiveNumber($objective['amount'] ?? null), "objective {$id} score is invalid");
            }
        }
        $push($hasRequiredObjective, 'at least one required objective is needed');

        foreach ($objectives as $objective) {
            if (! is_array($objective)) {
                continue;
            }
            $id = (string) ($objective['id'] ?? 'unknown');
            foreach (($objective['requires'] ?? []) as $dependency) {
                $push(is_string($dependency) && isset($objectiveIds[$dependency]), "objective {$id} requires unknown objective {$dependency}");
                $push($dependency !== $id, "objective {$id} cannot require itself");
            }
        }
        $push(! $this->hasDependencyCycle($objectives), 'objective dependency graph contains a cycle');

        $this->validateModifiers(is_array($modifiers) ? $modifiers : [], $errors);
        $this->validateRewards(is_array($rewards) ? $rewards : [], $objectiveIds, $errors);
        $this->validateWorld(is_array($world) ? $world : [], $objectives, $errors);

        return $errors;
    }

    private function validateModifiers(array $modifiers, array &$errors): void
    {
        $ids = [];
        foreach ($modifiers as $index => $modifier) {
            if (! is_array($modifier)) {
                $errors[] = "modifier {$index} must be an object";
                continue;
            }
            $id = $modifier['id'] ?? null;
            if (! is_string($id) || $id === '' || isset($ids[$id])) {
                $errors[] = "modifier {$index} id is missing or duplicated";
            } else {
                $ids[$id] = true;
            }
            $type = $modifier['type'] ?? null;
            if (! in_array($type, self::MODIFIER_TYPES, true)) {
                $errors[] = "modifier {$id} type is unsupported";
            }
            if (! is_numeric($modifier['value'] ?? null)) {
                $errors[] = "modifier {$id} value is invalid";
                continue;
            }
            $value = (float) $modifier['value'];
            if (in_array($type, ['speed', 'low-gravity'], true) && $value <= 0) {
                $errors[] = "modifier {$id} must be greater than zero";
            } elseif ($type === 'fog' && ($value < 0 || $value > 0.2)) {
                $errors[] = "modifier {$id} fog value is invalid";
            } elseif ($type === 'double-score' && ($value < 1 || $value > 10)) {
                $errors[] = "modifier {$id} score multiplier is invalid";
            }
        }
    }

    private function validateRewards(array $rewards, array $objectiveIds, array &$errors): void
    {
        foreach ($rewards as $index => $reward) {
            if (! is_array($reward)) {
                $errors[] = "reward {$index} must be an object";
                continue;
            }
            $type = $reward['type'] ?? null;
            if (! in_array($type, self::REWARD_TYPES, true)) {
                $errors[] = "reward {$index} type is unsupported";
            }
            if (in_array($type, ['coin', 'xp'], true)) {
                if (! is_numeric($reward['amount'] ?? null) || (float) $reward['amount'] < 0) {
                    $errors[] = "reward {$type} amount is invalid";
                }
            } elseif (! is_string($reward['id'] ?? null) || $reward['id'] === '') {
                $errors[] = "reward {$type} id is required";
            }
            $objectiveId = $reward['conditions']['objectiveId'] ?? null;
            if ($objectiveId !== null && ! isset($objectiveIds[$objectiveId])) {
                $errors[] = "reward references unknown objective {$objectiveId}";
            }
        }
    }

    private function validateWorld(array $world, array $objectives, array &$errors): void
    {
        $worldIds = [];
        $collectibleItems = [];
        $zoneIds = [];
        $enemyKinds = [];

        foreach (['collectibles', 'zones', 'enemies'] as $group) {
            if (! is_array($world[$group] ?? null)) {
                $errors[] = "world.{$group} must be an array";
                continue;
            }
            foreach ($world[$group] as $index => $entity) {
                if (! is_array($entity)) {
                    $errors[] = "world.{$group}.{$index} must be an object";
                    continue;
                }
                $id = $entity['id'] ?? null;
                if (! is_string($id) || $id === '' || isset($worldIds[$id])) {
                    $errors[] = "world id is missing or duplicated: {$id}";
                } else {
                    $worldIds[$id] = true;
                }
                if (! $this->validPoint($entity)) {
                    $errors[] = "world entity {$id} position is invalid";
                }
                if ($group === 'collectibles' && is_string($entity['item'] ?? null)) {
                    $collectibleItems[$entity['item']] = true;
                } elseif ($group === 'zones' && is_string($id)) {
                    $zoneIds[$id] = true;
                } elseif ($group === 'enemies' && is_string($entity['kind'] ?? null)) {
                    $enemyKinds[$entity['kind']] = true;
                }
            }
        }

        foreach ($objectives as $objective) {
            if (! is_array($objective)) {
                continue;
            }
            $id = (string) ($objective['id'] ?? 'unknown');
            if (($objective['type'] ?? null) === 'collect' && ! isset($collectibleItems[$objective['item'] ?? ''])) {
                $errors[] = "objective {$id} references unknown collectible item";
            } elseif (($objective['type'] ?? null) === 'reach' && ! isset($zoneIds[$objective['zone'] ?? ''])) {
                $errors[] = "objective {$id} references unknown zone";
            } elseif (($objective['type'] ?? null) === 'defeat' && ! isset($enemyKinds[$objective['enemy'] ?? ''])) {
                $errors[] = "objective {$id} references unknown enemy kind";
            }
        }
    }

    private function hasDependencyCycle(array $objectives): bool
    {
        $graph = [];
        foreach ($objectives as $objective) {
            if (is_array($objective) && is_string($objective['id'] ?? null)) {
                $graph[$objective['id']] = is_array($objective['requires'] ?? null) ? $objective['requires'] : [];
            }
        }
        $visiting = [];
        $visited = [];
        $visit = function (string $id) use (&$visit, &$visiting, &$visited, $graph): bool {
            if (isset($visiting[$id])) {
                return true;
            }
            if (isset($visited[$id])) {
                return false;
            }
            $visiting[$id] = true;
            foreach ($graph[$id] ?? [] as $dependency) {
                if (is_string($dependency) && $visit($dependency)) {
                    return true;
                }
            }
            unset($visiting[$id]);
            $visited[$id] = true;
            return false;
        };

        foreach (array_keys($graph) as $id) {
            if ($visit($id)) {
                return true;
            }
        }
        return false;
    }

    private function validPlayerCount(mixed $value): bool
    {
        return is_array($value)
            && is_int($value['min'] ?? null)
            && is_int($value['max'] ?? null)
            && $value['min'] >= 1
            && $value['max'] >= $value['min']
            && $value['max'] <= 64;
    }

    private function validPoint(mixed $value): bool
    {
        return is_array($value) && is_numeric($value['x'] ?? null) && is_numeric($value['z'] ?? null);
    }

    private function positiveNumber(mixed $value): bool
    {
        return is_numeric($value) && is_finite((float) $value) && (float) $value > 0;
    }

    private function numberBetween(mixed $value, float $minimum, float $maximum): bool
    {
        return is_numeric($value)
            && is_finite((float) $value)
            && (float) $value >= $minimum
            && (float) $value <= $maximum;
    }
}
