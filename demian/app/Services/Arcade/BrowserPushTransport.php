<?php

namespace App\Services\Arcade;

use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

class BrowserPushTransport
{
    public function send(array $auth, array $batch): array
    {
        $push = new WebPush(['VAPID' => $auth], timeout: 5, clientOptions: [
            'connect_timeout' => 3,
            'allow_redirects' => false,
        ]);
        $byRequest = [];
        foreach ($batch as $id => $delivery) {
            $endpoint = $delivery['subscription']['endpoint'];
            $topic = substr(hash('sha256', $delivery['payload']['id']), 0, 32);
            $byRequest[$endpoint.'|'.$topic] = $id;
            $subscription = Subscription::create([
                ...$delivery['subscription'],
                'contentEncoding' => 'aes128gcm',
            ]);
            $push->queueNotification($subscription, json_encode($delivery['payload'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), [
                'TTL' => $delivery['ttl'],
                'topic' => $topic,
            ]);
        }

        $result = [];
        foreach ($push->flush(20) as $report) {
            $request = $report->getRequest();
            $id = $byRequest[(string) $request->getUri().'|'.$request->getHeaderLine('Topic')] ?? null;
            if ($id !== null) {
                $result[$id] = $report->getResponse()?->getStatusCode() ?? 0;
            }
        }

        return $result;
    }
}
