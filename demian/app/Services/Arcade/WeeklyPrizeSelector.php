<?php

namespace App\Services\Arcade;

/**
 * Deterministic, side-effect-free prize allocation policy.
 *
 * Input rows MUST come from server-verified runs in one sealed weekly season
 * and one scoring-rules version per game. The caller is responsible for those
 * trust checks, season sealing, persistence and coupon issuance.
 */
final class WeeklyPrizeSelector
{
    public const MAX_WINNERS_PER_GAME = 10;

    /**
     * @param array<string, list<array{player_id: string, score: int, achieved_at: string, verified: bool}>> $rankingsByGame
     * @param list<string> $historicalWinnerIds Players awarded in earlier weeks.
     * @return array<string, list<array{game_id: string, player_id: string, score: int, achieved_at: string, technical_rank: int, prize_rank: int, previous_winner: bool}>>
     */
    public function select(array $rankingsByGame, array $historicalWinnerIds = []): array
    {
        $historical = array_fill_keys($historicalWinnerIds, true);
        $candidates = [];
        $winners = [];

        foreach ($rankingsByGame as $gameId => $entries) {
            if (! is_string($gameId) || $gameId === '' || ! is_array($entries)) {
                throw new \InvalidArgumentException('Invalid game rankings.');
            }

            $bestByPlayer = [];
            foreach ($entries as $entry) {
                if (! is_array($entry) || ($entry['verified'] ?? null) !== true
                    || ! is_string($entry['player_id'] ?? null) || trim($entry['player_id']) === ''
                    || ! is_int($entry['score'] ?? null) || $entry['score'] < 0
                    || ! is_string($entry['achieved_at'] ?? null)) {
                    throw new \InvalidArgumentException('Prize candidates must be verified, valid scores.');
                }
                $candidate = $entry;
                $candidate['achieved_at'] = $this->normalizedTimestamp($entry['achieved_at']);
                $candidate['game_id'] = $gameId;
                $playerId = $entry['player_id'];
                if (! isset($bestByPlayer[$playerId]) || $this->compare($candidate, $bestByPlayer[$playerId]) < 0) {
                    $bestByPlayer[$playerId] = $candidate;
                }
            }

            $ranked = array_values($bestByPlayer);
            usort($ranked, $this->compare(...));
            foreach ($ranked as $index => $candidate) {
                $candidate['technical_rank'] = $index + 1;
                $candidates[] = $candidate;
            }
            $winners[$gameId] = [];
        }

        // Compare relative rank, NOT scores across different games.
        // A player qualifying in multiple games gets only one award per week;
        // equal technical ranks resolve by stable game ID.
        usort($candidates, static fn (array $a, array $b): int =>
            ($a['technical_rank'] <=> $b['technical_rank']) ?: strcmp($a['game_id'], $b['game_id']));

        $awardedThisWeek = [];
        foreach ([false, true] as $selectPreviousWinners) {
            foreach ($candidates as $candidate) {
                $playerId = $candidate['player_id'];
                $gameId = $candidate['game_id'];
                $previousWinner = isset($historical[$playerId]);
                if ($previousWinner !== $selectPreviousWinners || isset($awardedThisWeek[$playerId])
                    || count($winners[$gameId]) >= self::MAX_WINNERS_PER_GAME) {
                    continue;
                }
                $winners[$gameId][] = [
                    'game_id' => $gameId,
                    'player_id' => $playerId,
                    'score' => $candidate['score'],
                    'achieved_at' => $candidate['achieved_at'],
                    'technical_rank' => $candidate['technical_rank'],
                    'prize_rank' => count($winners[$gameId]) + 1,
                    'previous_winner' => $previousWinner,
                ];
                $awardedThisWeek[$playerId] = true;
            }
        }
        ksort($winners, SORT_STRING);

        return $winners;
    }

    private function normalizedTimestamp(string $timestamp): string
    {
        if (! preg_match('/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})?$/', $timestamp)) {
            throw new \InvalidArgumentException('Invalid achievement timestamp.');
        }
        try {
            $when = new \DateTimeImmutable($timestamp, new \DateTimeZone('UTC'));
            $errors = \DateTimeImmutable::getLastErrors();
            if ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0)) {
                throw new \InvalidArgumentException('Invalid achievement timestamp.');
            }
        } catch (\Exception $exception) {
            throw new \InvalidArgumentException('Invalid achievement timestamp.', 0, $exception);
        }
        return $when->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s.u');
    }

    private function compare(array $a, array $b): int
    {
        return ($b['score'] <=> $a['score'])
            ?: strcmp($a['achieved_at'], $b['achieved_at'])
            ?: strcmp($a['player_id'], $b['player_id']);
    }
}
