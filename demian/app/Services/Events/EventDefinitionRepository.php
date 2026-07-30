<?php

namespace App\Services\Events;

use Illuminate\Support\Collection;
use JsonException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

final class EventDefinitionRepository
{
    public function __construct(private readonly EventDefinitionValidator $validator) {}
    public function all(): Collection
    {
        return collect(glob($this->definitionPath('*.json')) ?: [])
            ->map(fn (string $path): array => $this->decode($path))
            ->sortBy('id')
            ->values();
    }

    public function summaries(): Collection
    {
        return $this->all()->map(fn (array $definition): array => [
            'id' => $definition['id'],
            'revision' => $definition['revision'] ?? 1,
            'title' => $definition['title'],
            'subtitle' => $definition['subtitle'] ?? null,
            'description' => $definition['description'] ?? null,
            'duration' => $definition['duration'],
            'player_count' => $definition['playerCount'] ?? ['min' => 1, 'max' => 1],
        ]);
    }

    public function active(): array
    {
        return $this->find((string) config('demian-events.active', 'cafe-rush'));
    }

    public function find(string $eventId): array
    {
        if (! preg_match('/^[a-z0-9][a-z0-9-]{2,63}$/', $eventId)) {
            throw new NotFoundHttpException('Event definition was not found.');
        }

        $path = $this->definitionPath("{$eventId}.json");
        if (! is_file($path)) {
            throw new NotFoundHttpException('Event definition was not found.');
        }

        return $this->decode($path);
    }

    private function definitionPath(string $file): string
    {
        return resource_path("js/game/games/event/definitions/{$file}");
    }

    private function decode(string $path): array
    {
        try {
            $definition = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new \RuntimeException("Invalid event definition: {$path}", previous: $exception);
        }

        return $this->validator->assertValid($definition, $path);
    }
}
