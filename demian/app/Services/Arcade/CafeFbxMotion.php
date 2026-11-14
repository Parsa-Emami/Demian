<?php

namespace App\Services\Arcade;

/**
 * Deterministic 2D circle-vs-FBX-AABB movement, independently ported from
 * resources/js/game/shared/collision/CollisionMath.js + CollisionWorld.js.
 *
 * This class does NOT accept client-supplied colliders or floor masks.
 * Coordinates are the canonical 4-units/metre cafe gameplay coordinates.
 * The 0.0001 resolution skin and six collision iterations mirror JS.
 */
final class CafeFbxMotion
{
    private const EPS = 1.0e-8;

    public function __construct(private readonly CafeRouteGeometry $geometry) {}

    private function penetration(array $center, float $radius, array $collider): ?array
    {
        $p = $collider['position'];
        $half = $collider['half_extents'];
        $minX = $p['x'] - $half['x'];
        $maxX = $p['x'] + $half['x'];
        $minZ = $p['z'] - $half['z'];
        $maxZ = $p['z'] + $half['z'];
        $nearX = max($minX, min($center['x'], $maxX));
        $nearZ = max($minZ, min($center['z'], $maxZ));
        $dx = $center['x'] - $nearX;
        $dz = $center['z'] - $nearZ;
        $sq = $dx*$dx+$dz*$dz;
        if ($sq > $radius*$radius) return null;
        if ($sq > self::EPS) {
            $distance = sqrt($sq);
            $depth = $radius - $distance;
            return [
                'x'=>$dx / $distance * $depth,
                'z'=>$dz / $distance * $depth,
                'nx'=>$dx / $distance, 'nz'=>$dz / $distance,
                'depth'=>$depth,
            ];
        }
        $left = abs($center['x'] - $minX);
        $right = abs($maxX - $center['x']);
        $top = abs($center['z'] - $minZ);
        $bottom = abs($maxZ - $center['z']);
        $min = min($left, $right, $top, $bottom);
        if ($min === $left) { $dx = -($radius+$left); $dz = 0.0; }
        elseif ($min === $right) { $dx = $radius+$right; $dz = 0.0; }
        elseif ($min === $top) { $dx = 0.0; $dz = -($radius+$top); }
        else { $dx = 0.0; $dz = $radius+$bottom; }
        $depth = hypot($dx, $dz);
        return [
            'x'=>$dx, 'z'=>$dz,
            'nx'=>$depth > self::EPS ? $dx / $depth : 0.0,
            'nz'=>$depth > self::EPS ? $dz / $depth : 0.0,
            'depth'=>$depth,
        ];
    }

    /**
     * Step a dynamic circle, including wall sliding, exactly as the client
     * CollisionWorld.moveCircle() with collideWithDynamic=false.
     *
     * The JS ground.move() first clamps the requested TARGET to the
     * game-specific bounds (not to the wider FBX asset bounds).
     */
    public function move(
        array $from, array $target, array $bounds,
        float $radius = 0.44
    ): array {
        $target = [
            'x' => max($bounds['minX']+$radius,
                min($bounds['maxX']-$radius, (float) $target['x'])),
            'z' => max($bounds['minZ']+$radius,
                min($bounds['maxZ']-$radius, (float) $target['z'])),
        ];
        $dx = $target['x']-$from['x'];
        $dz = $target['z']-$from['z'];
        $distance = hypot($dx, $dz);
        $steps = max(1, (int) ceil($distance / max(0.05, $radius*0.5)));
        if ($steps > 250) throw new \InvalidArgumentException('Physics step too large.');
        $stepX = $dx/$steps;
        $stepZ = $dz/$steps;
        $point = ['x'=>(float) $from['x'], 'z'=>(float) $from['z']];
        $colliders = $this->geometry->colliders();
        for ($step = 0; $step < $steps; $step++) {
            $point['x'] += $stepX;
            $point['z'] += $stepZ;
            for ($iter=0; $iter<6; $iter++) {
                $deepest = null;
                foreach ($colliders as $collider) {
                    $p = $collider['position'];
                    $h = $collider['half_extents'];
                    // CollisionWorld.queryAabb inclusive broadphase.
                    if ($point['x']+$radius < $p['x']-$h['x']
                        || $point['x']-$radius > $p['x']+$h['x']
                        || $point['z']+$radius < $p['z']-$h['z']
                        || $point['z']-$radius > $p['z']+$h['z']) continue;
                    $hit = $this->penetration($point, $radius, $collider);
                    if ($hit && (! $deepest || $hit['depth'] > $deepest['depth'])) {
                        $deepest = $hit;
                    }
                }
                if (! $deepest) break;
                $point['x'] += $deepest['x']+$deepest['nx']*0.0001;
                $point['z'] += $deepest['z']+$deepest['nz']*0.0001;
            }
        }
        return $point;
    }
}
