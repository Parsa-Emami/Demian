<?php
namespace App\Application\Economy;
use App\Domain\Economy\Services\RewardIssuingService;
class RewardWorkflowService {
    public function __construct(private RewardIssuingService $rewards){}
    public function issue(object $request): mixed {
        return $this->rewards->issue($request);
    }
}
