<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

final class ArcadePrivacyController extends Controller
{
    // Allowlisted personal-data fields; never export bearer/recovery hashes,
    // plaintext coupon secrets, payment references or anti-cheat evidence.
    private const RECORDS = [
        'runs' => ['arcade_runs', ['id', 'game_id', 'character_slug', 'status', 'score', 'started_at', 'completed_at']],
        'best_scores' => ['arcade_leaderboard_entries', ['id', 'game_id', 'period_key', 'score', 'achieved_at']],
        'weekly_results' => ['arcade_weekly_results', ['id', 'period_key', 'game_id', 'score', 'technical_rank', 'achieved_at']],
        'weekly_wins' => ['arcade_weekly_winners', ['id', 'period_key', 'game_id', 'prize_rank', 'score', 'created_at']],
        'coupons' => ['arcade_coupons', ['id', 'status', 'discount_percent', 'issued_at', 'expires_at', 'redeemed_at']],
        'anticheat_observations' => ['arcade_anticheat_observations', ['id', 'event_code', 'game_id', 'created_at']],
    ];

    public function policy(): JsonResponse
    {
        return response()->json([
            'version' => config('demian-legal.version'),
            'status' => config('demian-legal.publication_approved') ? 'approved' : 'draft-pending-legal-review',
            'require_acceptance' => config('demian-legal.require_acceptance'),
            'require_contact' => config('demian-arcade.require_contact'),
            'pages' => config('demian-legal.pages'),
        ])->header('Cache-Control', 'public, max-age=60');
    }

    public function snapshot(Request $request): JsonResponse
    {
        $player = $request->attributes->get('arcade_player');
        $counts = [];
        foreach (self::RECORDS as $kind => [$table]) {
            $counts[$kind] = DB::table($table)->where('player_id', $player->id)->count();
        }
        return response()->json([
            'schema' => 1, 'exported_at' => now()->toIso8601String(),
            'player' => [
                'player_id' => $player->id, 'display_name' => $player->display_name,
                'registered_at' => $player->created_at?->toIso8601String(),
                'legal_policy_version' => $player->legal_policy_version,
                'contact_type' => $player->contact_type, 'contact_value' => $player->contact_value,
                'legal_accepted_at' => $player->legal_accepted_at?->toIso8601String(),
                'phone_verified_at' => $player->phone_verified_at?->toIso8601String(),
            ],
            'record_counts' => $counts,
            'record_types' => array_keys(self::RECORDS),
            'page_size_limit' => 50,
            'notice' => 'Personal data summary; secrets and restricted operational evidence are excluded.',
        ])->header('Cache-Control', 'no-store, private')->header('Pragma', 'no-cache');
    }

    public function records(Request $request): JsonResponse
    {
        $input = $request->validate([
            'type' => ['required', 'string', Rule::in(array_keys(self::RECORDS))],
            'limit' => ['sometimes', 'integer', 'between:1,50'],
            'cursor' => ['sometimes', 'string', 'max:512'],
        ]);
        $player = $request->attributes->get('arcade_player');
        [$table, $columns] = self::RECORDS[$input['type']];
        $records = DB::table($table)->where('player_id', $player->id)
            ->orderBy('id')->cursorPaginate((int) ($input['limit'] ?? 25), $columns);
        return response()->json([
            'type' => $input['type'], 'data' => $records->items(),
            'next_cursor' => $records->nextCursor()?->encode(),
        ])->header('Cache-Control', 'no-store, private')->header('Pragma', 'no-cache');
    }
}
