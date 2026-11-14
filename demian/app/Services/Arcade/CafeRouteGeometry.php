<?php

namespace App\Services\Arcade;

use RuntimeException;

/**
 * Read-only FBX-derived collision snapshot shared by the verified route trials.
 * The snapshot is generated from the canonical CafeWalkthroughScene FBX data,
 * not from user-submitted collision/visibility data.
 */
final class CafeRouteGeometry
{
    private ?array $snapshot = null;

    private function data(): array
    {
        if ($this->snapshot !== null) return $this->snapshot;
        $path = resource_path('server/cafe_geometry_v5.json');
        $json = file_get_contents($path);
        if (! is_string($json)) throw new RuntimeException('Missing canonical cafe geometry.');
        $data = json_decode($json, true, flags: JSON_THROW_ON_ERROR);
        if (($data['layout_version'] ?? 0) !== 5
            || ! preg_match('/^[a-f0-9]{64}$/D', (string) ($data['source_sha256'] ?? ''))
            || count($data['floor_rows'] ?? []) !== (int) ($data['rows'] ?? 0)
            || count($data['colliders'] ?? []) < 100) {
            throw new RuntimeException('Cafe collision snapshot failed integrity checks.');
        }
        return $this->snapshot = $data;
    }

    public function identity(): array
    {
        $data = $this->data();
        return ['layout_version' => $data['layout_version'],
            'source_sha256' => $data['source_sha256'],
            'colliders' => count($data['colliders'])];
    }

    /** The same FBX-derived floor mask and collider safety rules on the server. */
    public function canStand(float $x, float $z, float $radius = 0.44): bool
    {
        if (! is_finite($x) || ! is_finite($z)) return false;
        $data = $this->data();
        $b = $data['bounds'];
        if ($x < $b['minX'] + $radius || $x > $b['maxX'] - $radius
            || $z < $b['minZ'] + $radius || $z > $b['maxZ'] - $radius) return false;

        $col = (int) floor(($x - $b['minX']) / $data['cell_size']);
        $row = (int) floor(($z - $b['minZ']) / $data['cell_size']);
        if ($row < 0 || $row >= $data['rows'] || $col < 0
            || $col >= $data['columns']
            || ($data['floor_rows'][$row][$col] ?? '0') !== '1') return false;

        foreach ($data['colliders'] as $collider) {
            $p = $collider['position']; $h = $collider['half_extents'];
            // Mirror a circle-vs-AABB query; a 0.03 skin provides
            // conservative margin without accepting paths through walls.
            $nearestX = max($p['x'] - $h['x'], min($x, $p['x'] + $h['x']));
            $nearestZ = max($p['z'] - $h['z'], min($z, $p['z'] + $h['z']));
            $dx = $x - $nearestX; $dz = $z - $nearestZ;
            if ($dx*$dx + $dz*$dz <= ($radius + 0.03)**2) return false;
        }
        return true;
    }

    /**
     * Conservative full-segment collision. Never accept a path merely because
     * its endpoints are valid on opposite sides of a wall or closed room.
     * Samples are <=0.18 units, finer than FBX floor cell size.
     */
    public function canTraverse(array $from, array $to): bool
    {
        $d = hypot((float) $to['x'] - (float) $from['x'],
            (float) $to['z'] - (float) $from['z']);
        if (! is_finite($d) || $d > 30) return false;
        $steps = max(1, (int) ceil($d / 0.18));
        for ($i = 0; $i <= $steps; $i++) {
            $p = $i / $steps;
            if (! $this->canStand(
                (float) $from['x'] + ((float) $to['x'] - (float) $from['x']) * $p,
                (float) $from['z'] + ((float) $to['z'] - (float) $from['z']) * $p
            )) return false;
        }
        return true;
    }
}
