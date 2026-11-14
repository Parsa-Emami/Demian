<?php

namespace App\Services\Arcade;

use Illuminate\Validation\ValidationException;

/**
 * Step 09: independent replay of the ORIGINAL Cafe Rush order economy.
 *
 * This version is deliberately not exposed to ranked API routes yet: the
 * browser's per-frame movement/tray simulation has to be reconciled with the
 * sampled-motion proof before a scorer can be commercially trusted.
 *
 * Evidence is an ordered list of 10Hz collision-checked positions and actual
 * interaction attempts. Tickets, recipe times, patience, VIP, tray occupancy,
 * accepted/preparing/ready/carrying states, combo and score are SERVER owned.
 */
final class CafeRushGameplayReplayVerifier
{
    public const VERSION = 'cafe-rush-gameplay-v1';
    public const GAME_ID = 'cafe-rush';
    public const TICKS = 7200;
    public const MAX_ACTIONS = 6500;
    private const SPAWN = ['x' => -0.35, 'z' => -25.3];
    private const DIFFICULTIES = [
        'easy' => ['capacity'=>1, 'patience'=>33.0, 'cadence'=>12.0, 'quota'=>4],
        'standard' => ['capacity'=>2, 'patience'=>31.0, 'cadence'=>8.2, 'quota'=>6],
        'hard' => ['capacity'=>3, 'patience'=>29.0, 'cadence'=>6.6, 'quota'=>8],
    ];
    private const MENU = ['tea', 'cake', 'espresso', 'tea', 'espresso', 'cake'];
    private const TABLES = [1, 2, 1, 2, 1, 2, 2, 1];
    private const RECIPES = [
        'tea' => ['station'=>'bar', 'time'=>1.25],
        'espresso' => ['station'=>'bar', 'time'=>1.65],
        'cake' => ['station'=>'pastry', 'time'=>0.95],
        'vip' => ['station'=>'bar', 'time'=>2.6],
    ];
    private const SPOTS = [
        'tickets' => ['x'=>-0.1,'z'=>-26.35,'kind'=>'tickets'],
        'bar' => ['x'=>2.95,'z'=>-31.15,'kind'=>'station'],
        'pastry' => ['x'=>2.6,'z'=>-22.25,'kind'=>'station'],
        'table-1' => ['x'=>-2.35,'z'=>-16.9,'kind'=>'table','table'=>1],
        'table-2' => ['x'=>-2.9,'z'=>-43.4,'kind'=>'table','table'=>2],
    ];

    public function __construct(private readonly CafeRouteGeometry $geometry) {}

    private function reject(string $reason): never
    {
        throw ValidationException::withMessages(['replay' => $reason]);
    }

    /**
     * Original game has a 120s duration. This verifier does not accept
     * arbitrary claimed scores, orders, combo, VIP, finish or elapsed seconds.
     */
    public function verify(int $seed, int $ticks, array $actions, string $difficulty = 'standard'): array
    {
        if ($seed < 1 || $ticks !== self::TICKS
            || ! isset(self::DIFFICULTIES[$difficulty])
            || count($actions) < 24 || count($actions) > self::MAX_ACTIONS) {
            $this->reject('Invalid original Cafe Rush proof bounds.');
        }
        $variation = $seed % 3;
        $rules = self::DIFFICULTIES[$difficulty];
        $position = self::SPAWN;
        $lastTick = -1;
        $lastMoveTick = 0;
        $moves = 0;
        $score = 0;
        $delivered = 0;
        $combo = 0;
        $bestCombo = 0;
        $vipIssued = false;
        $vipServed = false;
        $nextTicketAt = 0.0;
        $ticketNumber = 0;
        $regularNumber = 0;
        $orders = [];
        $tray = null;
        $expired = 0;
        $mistakes = 0;
        $lastMovingSpeed = 0.0;
        $lastDirection = ['x'=>0.0, 'z'=>-1.0];
        $risk = 0.0;
        $spills = 0;
        $puddles = [];
        $index = 0;

        $addTicket = static function (bool $vip, float $now) use (
            &$orders, &$regularNumber, &$ticketNumber, &$nextTicketAt, &$vipIssued, $variation, $rules
        ): void {
            $menuIndex = $regularNumber + $variation;
            $recipe = $vip ? 'vip' : self::MENU[$menuIndex % count(self::MENU)];
            $table = $vip ? 2 : self::TABLES[$menuIndex % count(self::TABLES)];
            $orders[] = [
                'id'=>++$ticketNumber, 'recipe'=>$recipe, 'table'=>$table,
                'vip'=>$vip, 'state'=>'waiting',
                'due'=>min(120.0, $now + ($vip ? 30.0 : $rules['patience'])),
                'readyAt'=>0.0,
            ];
            if ($vip) $vipIssued = true;
            else {
                $regularNumber++;
                $nextTicketAt = $now + $rules['cadence'];
            }
        };
        $schedule = static function (float $now) use (
            &$orders, &$vipIssued, &$nextTicketAt, $addTicket, $rules
        ): void {
            if (count($orders) >= $rules['capacity']) return;
            if ($now >= 90.0 && ! $vipIssued) $addTicket(true, $now);
            elseif ($now >= $nextTicketAt && ($now < 77.0
                || ($vipIssued && $now < 108.0))) $addTicket(false, $now);
        };
        $schedule(0.0);
        for ($tick = 1; $tick <= self::TICKS; $tick++) {
            $now = $tick / 60;
            // Source CafeRushModel.updateTickets(): expiry precedes readiness.
            foreach ($orders as $i => &$order) {
                if ($order['due'] <= $now + 1e-6) {
                    if ($tray === $order['id']) {
                        $tray = null;
                        $risk = 0;
                    }
                    $order['state'] = 'expired';
                    $expired++;
                    $combo = 0;
                } elseif ($order['state'] === 'preparing'
                    && $order['readyAt'] <= $now + 1e-6) {
                    $order['state'] = 'ready';
                }
            }
            unset($order);
            $orders = array_values(array_filter($orders,
                static fn (array $o): bool => $o['state'] !== 'expired'));
            if ($tick === self::TICKS) break;
            if (isset($actions[$index]) && ($actions[$index]['tick'] ?? null) === $tick) {
                $entry = $actions[$index++];
                $kind = $entry['kind'] ?? null;
                if ($kind === 'move') {
                    if (! is_numeric($entry['x'] ?? null)
                        || ! is_numeric($entry['z'] ?? null)
                        || is_bool($entry['x']) || is_bool($entry['z'])) {
                        $this->reject('Invalid movement coordinates.');
                    }
                    $next = ['x'=>(float)$entry['x'], 'z'=>(float)$entry['z']];
                    $dt = ($tick - $lastMoveTick)/60;
                    $length = hypot($next['x']-$position['x'], $next['z']-$position['z']);
                    if ($dt <= 0 || $dt > 0.5
                        || $length > 11.6*$dt + 0.12
                        || ! $this->geometry->canTraverse($position, $next)) {
                        $this->reject('Impossible Cafe Rush movement / collision.');
                    }
                    $speed = $length/$dt;
                    $direction = $speed > 0.02 ? [
                        'x'=>($next['x']-$position['x'])/max($length, 1e-9),
                        'z'=>($next['z']-$position['z'])/max($length, 1e-9),
                    ] : $lastDirection;
                    if ($tray !== null) {
                        // Reject a run that would certainly spill: turn and
                        // speed cannot be edited away by omitting a client event.
                        $turn = $speed > 7.15 && $lastMovingSpeed > 7.15
                            ? max(0, 1-$direction['x']*$lastDirection['x']
                                -$direction['z']*$lastDirection['z'])*0.51 : 0;
                        $slippery = false;
                        foreach ($puddles as $puddle) {
                            if (hypot($puddle['x']-$position['x'],
                                $puddle['z']-$position['z']) < 1.35) {
                                $slippery = true;
                                break;
                            }
                        }
                        $vip = false;
                        foreach ($orders as $order) {
                            if ($order['id'] === $tray) $vip = $order['vip'];
                        }
                        $risk = max(0, min(1, $risk
                            + ($turn + ($slippery && $speed > 2 ? $dt*0.48 : 0))
                                * ($vip ? 1.23 : 1)
                            - $dt * ($speed > 7.15 ? 0.23 : 0.68)));
                        if ($risk >= 1) {
                            foreach ($orders as &$order) {
                                if ($order['id'] === $tray) $order['state'] = 'accepted';
                            }
                            unset($order);
                            $tray = null;
                            $risk = 0;
                            $spills++;
                            $combo = 0;
                            if (count($puddles) < 64) $puddles[] = $next;
                        }
                    }
                    $position = $next;
                    $lastMoveTick = $tick;
                    $lastMovingSpeed = $speed;
                    $lastDirection = $direction;
                    $moves++;
                } elseif ($kind === 'interact') {
                    if ($tick - $lastMoveTick > 15) {
                        $this->reject('Interaction lacks recent movement evidence.');
                    }
                    $nearest = null;
                    $distance = 2.2;
                    foreach (self::SPOTS as $id=>$spot) {
                        $gap = hypot($position['x']-$spot['x'],
                            $position['z']-$spot['z']);
                        if ($gap < $distance && $this->geometry->canSee($position, $spot)) {
                            $distance = $gap;
                            $nearest = ['id'=>$id, ...$spot];
                        }
                    }
                    if ($nearest !== null) {
                        if ($nearest['kind'] === 'tickets' && $tray === null) {
                            $accepted = false;
                            foreach ($orders as $order) {
                                if ($order['state'] === 'accepted') $accepted = true;
                            }
                            if (! $accepted) {
                                // JS waitingOrder prioritizes a queued VIP over
                                // any regular order regardless of insertion order.
                                $choice = null;
                                foreach ($orders as $i=>$order) {
                                    if ($order['state'] !== 'waiting') continue;
                                    if ($choice === null) $choice = $i;
                                    if ($order['vip']) {
                                        $choice = $i;
                                        break;
                                    }
                                }
                                if ($choice !== null) $orders[$choice]['state'] = 'accepted';
                            }
                        } elseif ($nearest['kind'] === 'station' && $tray === null) {
                            $existing = null;
                            foreach ($orders as $i=>$order) {
                                if (self::RECIPES[$order['recipe']]['station'] === $nearest['id']
                                    && in_array($order['state'], ['preparing', 'ready'], true)) {
                                    $existing = $i;
                                    break;
                                }
                            }
                            if ($existing !== null && $orders[$existing]['state'] === 'ready') {
                                $tray = $orders[$existing]['id'];
                                $orders[$existing]['state'] = 'carrying';
                                $risk = 0;
                            } elseif ($existing === null) {
                                foreach ($orders as &$order) {
                                    if ($order['state'] === 'accepted'
                                        && self::RECIPES[$order['recipe']]['station']
                                            === $nearest['id']) {
                                        $order['state'] = 'preparing';
                                        $order['readyAt'] = $now
                                            + self::RECIPES[$order['recipe']]['time'];
                                        break;
                                    }
                                }
                                unset($order);
                            }
                        } elseif ($nearest['kind'] === 'table' && $tray !== null) {
                            foreach ($orders as $i=>$order) {
                                if ($order['id'] !== $tray) continue;
                                if ($order['table'] !== $nearest['table']) {
                                    $combo = 0;
                                    $mistakes++;
                                } else {
                                    $orders = array_values(array_filter($orders,
                                        static fn (array $o): bool => $o['id'] !== $tray));
                                    $combo++;
                                    $bestCombo = max($bestCombo, $combo);
                                    $delivered++;
                                    $vipServed = $vipServed || $order['vip'];
                                    $score += 100 + ($combo % 3 === 0 ? 50 : 0)
                                        + ($order['vip'] ? 75 : 0);
                                    $tray = null;
                                    $risk = 0;
                                }
                                break;
                            }
                        }
                    }
                } else {
                    $this->reject('Unknown original-game action.');
                }
            }
            $schedule($now);
        }
        if ($index !== count($actions)) {
            $this->reject('Invalid or out-of-range action sequence.');
        }
        if ($moves < 24 || self::TICKS - $lastMoveTick > 30) {
            $this->reject('Insufficient continuous movement evidence.');
        }
        if ($delivered < 1) {
            $this->reject('Original gameplay completed without verified delivery.');
        }
        return ['score'=>$score, 'ticks'=>self::TICKS, 'passed'=>$delivered,
            'details'=>['vip_served'=>$vipServed, 'best_combo'=>$bestCombo,
                'spills'=>$spills, 'expired'=>$expired, 'mistakes'=>$mistakes]];
    }
}
