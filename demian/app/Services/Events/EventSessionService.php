<?php

namespace App\Services\Events;

use App\Models\EventRewardClaim;
use App\Models\EventSession;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

final class EventSessionService
{
    public function __construct(private readonly EventDefinitionRepository $definitions) {}

    public function start(string $eventId, array $metadata = []): array
    {
        $definition = $this->definitions->find($eventId);
        $token = Str::random(64);
        $now = now();
        $duration = (int) $definition['duration'] + (int) ($definition['countdown'] ?? 0);
        $grace = max(0, (int) config('demian-events.completion_grace_seconds', 30));

        $session = EventSession::query()->create([
            'event_id' => $definition['id'],
            'definition_revision' => (int) ($definition['revision'] ?? 1),
            'seed' => (string) Str::uuid(),
            'token_hash' => hash('sha256', $token),
            'status' => 'active',
            'started_at' => $now,
            'expires_at' => $now->clone()->addSeconds($duration + $grace),
            'metadata' => Arr::only($metadata, ['source', 'client_version', 'platform']),
        ]);

        return ['session' => $session, 'token' => $token, 'definition' => $definition];
    }

    public function complete(EventSession $session, string $token, array $payload): EventRewardClaim
    {
        if (! hash_equals($session->token_hash, hash('sha256', $token))) {
            throw new AuthorizationException('The event session token is invalid.');
        }

        if ($session->rewardClaim) {
            return $session->rewardClaim;
        }

        if ($session->status !== 'active' || $session->expires_at->isPast()) {
            throw ValidationException::withMessages(['session' => 'The event session is no longer active.']);
        }

        $definition = $this->definitions->find($session->event_id);
        if ((int) ($definition['revision'] ?? 1) !== $session->definition_revision) {
            throw ValidationException::withMessages(['definition' => 'The event definition revision has changed.']);
        }

        $evidence = $this->normalizeEvidence($payload['evidence'] ?? []);
        $score = max(0, (int) ($payload['score'] ?? 0));
        $elapsedMs = max(0, (int) ($payload['elapsed_ms'] ?? 0));
        $serverElapsedMs = max(0, $session->started_at->diffInMilliseconds(now()));
        if ($elapsedMs > $serverElapsedMs + 5000) {
            throw ValidationException::withMessages([
                'elapsed_ms' => 'The submitted duration is ahead of server time.',
            ]);
        }
        $maximumScore = $this->maximumPlausibleScore($definition);
        if ($score > $maximumScore) {
            throw ValidationException::withMessages(['score' => 'The submitted score exceeds the event limit.']);
        }

        $objectiveResults = $this->evaluateObjectives($definition, $evidence, $score, $elapsedMs);
        $successful = collect($objectiveResults)
            ->where('required', true)
            ->every(fn (array $objective): bool => $objective['completed']);
        $rewards = $successful ? $this->resolveRewards($definition, $score, $objectiveResults) : [];
        $evidenceHash = hash('sha256', json_encode($evidence, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        return DB::transaction(function () use ($session, $definition, $score, $successful, $rewards, $objectiveResults, $evidenceHash): EventRewardClaim {
            $locked = EventSession::query()->lockForUpdate()->findOrFail($session->id);
            if ($locked->rewardClaim) {
                return $locked->rewardClaim;
            }

            $locked->update([
                'status' => $successful ? 'completed' : 'failed',
                'completed_at' => now(),
                'score' => $score,
                'evidence_hash' => $evidenceHash,
                'objective_payload' => $objectiveResults,
                'reward_payload' => $rewards,
            ]);

            return EventRewardClaim::query()->create([
                'event_session_id' => $locked->id,
                'event_id' => $definition['id'],
                'score' => $score,
                'successful' => $successful,
                'rewards' => $rewards,
                'integrity_level' => 'client-evidence',
            ]);
        });
    }

    private function normalizeEvidence(array $evidence): array
    {
        $normalize = static function (array $values): array {
            $values = array_values(array_unique(array_filter($values, 'is_string')));
            sort($values, SORT_STRING);
            return $values;
        };

        return [
            'collected_item_ids' => $normalize($evidence['collected_item_ids'] ?? []),
            'reached_zone_ids' => $normalize($evidence['reached_zone_ids'] ?? []),
            'defeated_enemy_ids' => $normalize($evidence['defeated_enemy_ids'] ?? []),
        ];
    }

    private function evaluateObjectives(array $definition, array $evidence, int $score, int $elapsedMs): array
    {
        $collectibles = collect($definition['world']['collectibles'] ?? [])->keyBy('id');
        $enemies = collect($definition['world']['enemies'] ?? [])->keyBy('id');
        $zones = collect($definition['world']['zones'] ?? [])->keyBy('id');

        return collect($definition['objectives'])->map(function (array $objective) use ($evidence, $score, $elapsedMs, $collectibles, $enemies, $zones): array {
            $current = 0;
            $target = 1;
            $completed = false;

            if ($objective['type'] === 'collect') {
                $target = (int) $objective['amount'];
                $current = collect($evidence['collected_item_ids'])
                    ->filter(fn (string $id): bool => ($collectibles->get($id)['item'] ?? null) === $objective['item'])
                    ->count();
                $completed = $current >= $target;
            } elseif ($objective['type'] === 'reach') {
                $target = 1;
                $current = $zones->has($objective['zone']) && in_array($objective['zone'], $evidence['reached_zone_ids'], true) ? 1 : 0;
                $completed = $current === 1;
            } elseif ($objective['type'] === 'defeat') {
                $target = (int) $objective['amount'];
                $current = collect($evidence['defeated_enemy_ids'])
                    ->filter(fn (string $id): bool => ($enemies->get($id)['kind'] ?? null) === $objective['enemy'])
                    ->count();
                $completed = $current >= $target;
            } elseif ($objective['type'] === 'survive') {
                $target = (int) round(((float) $objective['seconds']) * 1000);
                $current = $elapsedMs;
                $completed = $current >= $target;
            } elseif ($objective['type'] === 'score') {
                $target = (int) $objective['amount'];
                $current = $score;
                $completed = $current >= $target;
            }

            return [
                'id' => $objective['id'],
                'type' => $objective['type'],
                'required' => ($objective['required'] ?? true) !== false,
                'current' => $current,
                'target' => $target,
                'completed' => $completed,
            ];
        })->all();
    }

    private function maximumPlausibleScore(array $definition): int
    {
        $worldPoints = collect($definition['world']['collectibles'] ?? [])->sum('points')
            + collect($definition['world']['enemies'] ?? [])->sum('points');
        $objectivePoints = collect($definition['objectives'] ?? [])->sum('points');
        $scoreMultiplier = collect($definition['modifiers'] ?? [])
            ->where('type', 'double-score')
            ->reduce(fn (float $carry, array $modifier): float => $carry * max(1, (float) $modifier['value']), 1.0);

        return (int) ceil(($worldPoints + $objectivePoints + 1000) * $scoreMultiplier * 2.0);
    }

    private function resolveRewards(array $definition, int $score, array $objectiveResults): array
    {
        $completed = collect($objectiveResults)->where('completed', true)->pluck('id');

        return collect($definition['rewards'] ?? [])->filter(function (array $reward) use ($score, $completed): bool {
            $conditions = $reward['conditions'] ?? [];
            if (($conditions['minScore'] ?? 0) > $score) {
                return false;
            }
            if (isset($conditions['objectiveId']) && ! $completed->contains($conditions['objectiveId'])) {
                return false;
            }
            return true;
        })->values()->all();
    }
}
