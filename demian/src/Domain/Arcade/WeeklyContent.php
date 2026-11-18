<?php

namespace Domain\Arcade;

use DateTimeImmutable;
use DateTimeInterface;

final class WeeklyContent
{
    private const WEEK = 604800;

    private static function catalog(): array
    {
        static $catalog = null;
        return $catalog ??= json_decode(file_get_contents(__DIR__.'/../../../resources/game/weekly-content.json'), true, flags: JSON_THROW_ON_ERROR);
    }

    public static function version(string $game): string
    {
        return self::catalog()['versions'][$game];
    }

    public static function index(DateTimeInterface $at): int
    {
        $epoch = new DateTimeImmutable(self::catalog()['epoch']);
        return max(0, intdiv($at->getTimestamp() - $epoch->getTimestamp(), self::WEEK));
    }

    public static function effectiveVersion(string $game, string $legacy, DateTimeInterface $at, ?string $rollout = null): string
    {
        $activation = new DateTimeImmutable($rollout ?? self::catalog()['epoch']);
        return $at < $activation ? $legacy : self::version($game);
    }

    public static function runner(array $rules, int $week, string $character): array
    {
        $cast = self::catalog()['runnerCast'];
        $pairs = [];
        foreach ($cast as $index => $first) {
            foreach (array_slice($cast, $index + 1) as $second) $pairs[] = [$first, $second];
        }
        $pair = $pairs[(($week % count($pairs)) * 25) % count($pairs)];
        $reserve = array_values(array_diff(array_slice($cast, $week % 4), $pair, [$character]));
        $ground = array_values(array_filter($rules['obstacleCatalog'], static fn (array $spot): bool => $spot['y'] === 0));
        $overhead = array_values(array_filter($rules['obstacleCatalog'], static fn (array $spot): bool => $spot['y'] > 0));
        $group = static fn (array $items, int $offset, int $count): array => array_map(
            static fn (int $i): array => $items[($offset + $i) % count($items)], range(0, $count - 1));
        return array_replace($rules, [
            'attackers' => array_map(static fn (string $slug): string => $slug === $character ? $reserve[0] : $slug, $pair),
            'obstacleCatalog' => array_merge($group($ground, $week % count($ground), 5 + intdiv($week, count($ground) * count($overhead)) % 3),
                $group($overhead, intdiv($week, count($ground)) % count($overhead), 3)),
            'attackChance' => [.24, .29, .34][$week % 3],
            'overheadChance' => [.26, .35, .43][intdiv($week, 3) % 3],
        ]);
    }

    public static function coffee(int $week, int $stage): array
    {
        $slot = ($week % 10000) * 3 + $stage - 1;
        $primary = ($slot * 3 + intdiv($slot, 7)) % 5;
        $secondary = ($primary + 1 + intdiv($slot, 5) % 4) % 5;
        return [
            'id' => $stage,
            'seed' => 1000003 + $slot * 65537 + (self::catalog()['coffeeSeedOffsets'][$slot] ?? 0),
            'moves' => 23 + $stage * 2 + intdiv($slot, 3) % 3,
            'goals' => [['type' => $primary, 'count' => 11 + $slot % 5 + $stage],
                ...($stage === 1 ? [] : [['type' => $secondary, 'count' => 7 + ($slot * 3) % 8]])],
        ];
    }

    public static function critters(int $week, int $guestCount = 8): array
    {
        $count = self::catalog()['crittersPacks'];
        $pack = (($week % $count) * 313) % $count;
        $variations = $guestCount * ($guestCount - 1) * ($guestCount - 2);
        $order = $pack % $variations;
        $variant = intdiv($pack, $variations);
        $available = range(0, $guestCount - 1);
        $pages = [];
        for ($page = 0; $page < 3; $page++) {
            $size = count($available);
            [$guest] = array_splice($available, $order % $size, 1);
            $order = intdiv($order, $size);
            $pages[] = ['guest' => $guest,
                'light' => ($guest + $page + intdiv($pack, 11)) % 2,
                'food' => ($guest + $page + intdiv($pack, 7)) % 3,
                'decor' => ($guest + $page + intdiv($pack % $variations, 19) + $variant) % 3];
        }
        return $pages;
    }

    public static function shiftCards(int $week): array
    {
        ['front' => $front, 'back' => $back] = self::catalog()['shiftCards'];
        $size = count($front) * count($back);
        $index = ($week % $size) * 41 % $size;
        return array_map(static fn (array $spot): array => ['x' => $spot[0], 'z' => $spot[1]],
            [$front[$index % count($front)], $back[intdiv($index, count($front))]]);
    }

    private static function orderedChoice(array $items, int $rank, int $count): array
    {
        $result = [];
        while (count($result) < $count) {
            $size = count($items);
            $result[] = array_splice($items, $rank % $size, 1)[0];
            $rank = intdiv($rank, $size);
        }
        return $result;
    }

    public static function rushOrder(int $week, int $order): array
    {
        $variation = ($week % 384) * 13 % 384;
        $recipes = self::orderedChoice(['tea', 'cake', 'espresso'], $variation % 6, 3);
        return ['recipe' => $recipes[$order % 3], 'table' => 1 + ((intdiv($variation, 6) >> ($order % 6)) & 1)];
    }

    public static function worldRoute(int $week): array
    {
        return array_map(static fn (array $spot): array => ['id' => $spot[0], 'x' => $spot[1], 'z' => $spot[2]],
            self::orderedChoice(self::catalog()['worldPoints'], ($week % 120) * 73 % 120, 4));
    }

    public static function rushReach(): float
    {
        return self::catalog()['rushStationReach'];
    }
}
