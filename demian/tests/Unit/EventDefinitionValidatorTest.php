<?php

namespace Tests\Unit;

use App\Services\Events\EventDefinitionValidator;
use Tests\TestCase;

class EventDefinitionValidatorTest extends TestCase
{
    public function test_bundled_event_definitions_are_valid_on_the_server(): void
    {
        $validator = app(EventDefinitionValidator::class);
        $paths = glob(resource_path('js/game/games/event/definitions/*.json')) ?: [];

        $this->assertGreaterThanOrEqual(3, count($paths));
        foreach ($paths as $path) {
            $definition = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
            $this->assertSame([], $validator->validate($definition), basename($path));
        }
    }

    public function test_dependency_cycles_and_unknown_world_references_are_rejected(): void
    {
        $path = resource_path('js/game/games/event/definitions/cafe-rush.json');
        $definition = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        $definition['objectives'][0]['requires'] = [$definition['objectives'][1]['id']];
        $definition['objectives'][1]['requires'] = [$definition['objectives'][0]['id']];
        $definition['objectives'][1]['zone'] = 'missing-zone';

        $errors = app(EventDefinitionValidator::class)->validate($definition);
        $this->assertTrue(collect($errors)->contains(fn (string $error): bool => str_contains($error, 'dependency graph')));
        $this->assertTrue(collect($errors)->contains(fn (string $error): bool => str_contains($error, 'unknown zone')));
    }
}
