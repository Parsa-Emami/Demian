<?php

namespace Domain\Arcade;

final readonly class VerifiedReplay
{
    public const IDENTITY_FIELDS = ['id', 'player_id', 'game_id', 'rules_version',
        'seed', 'track_width', 'character_slug', 'started_at', 'expires_at'];

    public function __construct(public array $identity, public string $hash,
        public array $score, public array $evidence)
    {
        if (! preg_match('/^[a-f0-9]{64}$/D', $hash)) {
            throw new \InvalidArgumentException('Invalid replay digest.');
        }
        foreach (self::IDENTITY_FIELDS as $field) {
            if (! array_key_exists($field, $identity)) throw new \InvalidArgumentException('Incomplete run identity.');
        }
        foreach (['score', 'ticks', 'passed'] as $field) {
            if (! isset($score[$field]) || ! is_int($score[$field]) || $score[$field] < 0) {
                throw new \InvalidArgumentException('Invalid verified score.');
            }
        }
    }

    public function matches(array $current): bool
    {
        foreach (self::IDENTITY_FIELDS as $field) {
            if (! array_key_exists($field, $current)
                || (string) $current[$field] !== (string) $this->identity[$field]) return false;
        }
        return true;
    }
}
