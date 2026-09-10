<?php
namespace Domain\Economy\Services;
class RewardHistoryService { public function record(array $data): array { return $data + ['created_at'=>now()]; } }
