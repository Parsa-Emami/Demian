<?php
namespace Domain\Economy\Events;
class RewardIssued { public function __construct(public string $playerId, public string $rewardId){} }
