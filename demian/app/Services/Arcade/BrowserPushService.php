<?php

namespace App\Services\Arcade;

use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Minishlink\WebPush\VAPID;
use Throwable;

final class BrowserPushService
{
    public const TARGETS = ['home', 'leaderboard', 'rewards'];

    private const MAX_ATTEMPTS = 4;

    public function credentials(): ?array
    {
        if (config('demian-push.enabled') !== true) {
            return null;
        }
        if (app()->environment('production') && parse_url((string) config('app.url'), PHP_URL_SCHEME) !== 'https') {
            return null;
        }
        $subject = config('demian-push.subject');
        $public = config('demian-push.public_key');
        $private = config('demian-push.private_key');
        $contact = is_string($subject) && (str_starts_with($subject, 'mailto:')
            ? filter_var(substr($subject, 7), FILTER_VALIDATE_EMAIL) !== false
            : str_starts_with($subject, 'https://') && filter_var($subject, FILTER_VALIDATE_URL) !== false);
        if (! $contact || ! BrowserPushSubscription::publicKeyValid($public)
            || strlen(BrowserPushSubscription::decode($private) ?? '') !== 32) {
            return null;
        }
        $auth = ['subject' => $subject, 'publicKey' => $public, 'privateKey' => $private];
        try {
            VAPID::validate($auth);
        } catch (Throwable) {
            return null;
        }

        return $auth;
    }

    public function preferences(): array
    {
        $auth = $this->credentials();

        return ['enabled' => $auth !== null, 'public_key' => $auth['publicKey'] ?? null];
    }

    public function subscribe(string $playerId, array $subscription): void
    {
        $auth = $this->credentials();
        abort_unless($auth, 503);
        abort_unless(BrowserPushSubscription::valid($subscription), 422);
        $hash = hash('sha256', $subscription['endpoint']);
        $record = [
            'key_id' => hash('sha256', $auth['publicKey']),
            'ciphertext' => Crypt::encryptString(json_encode($subscription, JSON_THROW_ON_ERROR)),
            'updated_at' => now(),
        ];

        DB::transaction(function () use ($playerId, $hash, $record): void {
            $inserted = DB::table('arcade_push_subscriptions')->insertOrIgnore([
                'id' => (string) Str::uuid(), 'player_id' => $playerId, 'endpoint_hash' => $hash,
                ...$record, 'created_at' => now(),
            ]);
            if ($inserted === 0) {
                $row = DB::table('arcade_push_subscriptions')->where('endpoint_hash', $hash)->lockForUpdate()->first();
                abort_unless($row && $row->player_id === $playerId, 409);
                DB::table('arcade_push_subscriptions')->where('id', $row->id)->update($record);
            }
        }, 3);
    }

    public function unsubscribe(string $playerId, string $endpoint): void
    {
        DB::table('arcade_push_subscriptions')->where('player_id', $playerId)
            ->where('endpoint_hash', hash('sha256', $endpoint))->delete();
    }

    public function enqueue(string $title, string $body, string $target, ?int $actorId = null, ?string $playerId = null, ?string $noticeId = null): int
    {
        $auth = $this->credentials();
        if ($auth === null) {
            return 0;
        }
        if (! in_array($target, self::TARGETS, true)) {
            throw new \InvalidArgumentException('Unknown browser notification destination.');
        }
        $noticeId ??= (string) Str::uuid();
        $at = now();

        return DB::transaction(function () use ($auth, $title, $body, $target, $actorId, $playerId, $noticeId, $at): int {
            $created = DB::table('arcade_push_notices')->insertOrIgnore([
                'id' => $noticeId, 'actor_id' => $actorId, 'player_id' => $playerId,
                'title' => $title, 'body' => $body, 'target' => $target,
                'created_at' => $at, 'expires_at' => $at->copy()->addDay(),
            ]);
            if ($created === 0) {
                return (int) DB::table('arcade_push_notices')->where('id', $noticeId)
                    ->where('actor_id', $actorId)->value('recipients');
            }
            $recipients = DB::table('arcade_push_subscriptions')
                ->where('key_id', hash('sha256', $auth['publicKey']))
                ->when($playerId !== null, fn ($query) => $query->where('player_id', $playerId))
                ->selectRaw("?, id, 'pending', 0, ?", [$noticeId, $at]);
            $count = DB::table('arcade_push_deliveries')
                ->insertUsing(['notice_id', 'subscription_id', 'status', 'attempts', 'next_attempt_at'], $recipients);
            DB::table('arcade_push_notices')->where('id', $noticeId)->update(['recipients' => $count]);

            return $count;
        }, 3);
    }

    public function drain(BrowserPushTransport $transport, int $limit = 60): array
    {
        $result = ['sent' => 0, 'retry' => 0, 'failed' => 0, 'expired' => 0];
        $auth = $this->credentials();
        if ($auth === null) {
            return $result;
        }
        $at = now();
        $due = DB::table('arcade_push_deliveries as delivery')
            ->join('arcade_push_notices as notice', 'notice.id', '=', 'delivery.notice_id')
            ->join('arcade_push_subscriptions as subscription', 'subscription.id', '=', 'delivery.subscription_id')
            ->where('notice.expires_at', '>', $at)
            ->where('subscription.key_id', hash('sha256', $auth['publicKey']))
            ->whereIn('delivery.status', ['pending', 'sending'])->where('delivery.next_attempt_at', '<=', $at)
            ->where('delivery.attempts', '<', self::MAX_ATTEMPTS)->orderBy('delivery.next_attempt_at')->orderBy('delivery.id')
            ->limit(max(1, min(100, $limit)))->get([
                'delivery.id', 'delivery.attempts', 'delivery.subscription_id', 'subscription.ciphertext',
                'notice.id as notice_id', 'notice.title', 'notice.body', 'notice.target', 'notice.expires_at',
            ]);
        $batch = [];
        $claimed = [];
        foreach ($due as $row) {
            $claim = DB::table('arcade_push_deliveries')->where('id', $row->id)->where('attempts', $row->attempts)
                ->whereIn('status', ['pending', 'sending'])->where('next_attempt_at', '<=', $at)
                ->update(['status' => 'sending', 'attempts' => $row->attempts + 1, 'next_attempt_at' => $at->copy()->addMinutes(3)]);
            if ($claim !== 1) {
                continue;
            }
            try {
                $subscription = json_decode(Crypt::decryptString($row->ciphertext), true, flags: JSON_THROW_ON_ERROR);
                if (! is_array($subscription) || ! BrowserPushSubscription::valid($subscription)) {
                    throw new \UnexpectedValueException('Invalid stored subscription.');
                }
            } catch (Throwable) {
                $this->deleteSubscription($row);
                $result['expired']++;

                continue;
            }
            $claimed[$row->id] = $row;
            $batch[$row->id] = [
                'subscription' => $subscription,
                'payload' => ['id' => $row->notice_id, 'title' => $row->title, 'body' => $row->body, 'target' => $row->target],
                'ttl' => max(1, strtotime($row->expires_at.' UTC') - $at->getTimestamp()),
            ];
        }
        if ($batch === []) {
            return $result;
        }
        try {
            $statuses = $transport->send($auth, $batch);
        } catch (Throwable) {
            $statuses = [];
        }
        foreach ($claimed as $id => $row) {
            $code = $statuses[$id] ?? 0;
            if (in_array($code, [404, 410], true)) {
                $this->deleteSubscription($row);
                $result['expired']++;

                continue;
            }
            $success = $code >= 200 && $code < 300;
            $canRetry = ! $success && ($code === 0 || $code === 429 || $code >= 500)
                && $row->attempts + 1 < self::MAX_ATTEMPTS;
            DB::transaction(function () use ($id, $row, $success, $canRetry, $at): void {
                $updated = DB::table('arcade_push_deliveries')->where('id', $id)->where('attempts', $row->attempts + 1)
                    ->where('status', 'sending')->update([
                        'status' => $success ? 'sent' : ($canRetry ? 'pending' : 'failed'),
                        'next_attempt_at' => $canRetry ? $at->copy()->addMinutes(2 ** $row->attempts) : $at,
                    ]);
                if ($updated === 1 && $success) {
                    DB::table('arcade_push_notices')->where('id', $row->notice_id)->increment('accepted');
                }
            }, 3);
            $result[$success ? 'sent' : ($canRetry ? 'retry' : 'failed')]++;
        }

        return $result;
    }

    public function recent(): array
    {
        return DB::table('arcade_push_notices')->orderByDesc('created_at')->orderByDesc('id')->limit(25)
            ->get(['title', 'recipients', 'accepted', 'created_at'])
            ->map(static fn (object $notice): array => (array) $notice)->all();
    }

    public function prune(): int
    {
        return DB::table('arcade_push_notices')->where('expires_at', '<', now()->subDays(30))->delete();
    }

    private function deleteSubscription(object $row): void
    {
        DB::table('arcade_push_subscriptions')->where('id', $row->subscription_id)
            ->where('ciphertext', $row->ciphertext)->delete();
    }
}
