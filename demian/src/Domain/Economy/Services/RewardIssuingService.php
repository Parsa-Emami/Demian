<?php
namespace Domain\Economy\Services;

use Domain\Economy\Repositories\CouponRepositoryInterface;
final class RewardIssuingService
{
 public function __construct(private CouponRepositoryInterface $repository) {}
 public function issue(): void { $coupon=$this->repository->findAvailable(); if($coupon){$coupon->claim();$this->repository->save($coupon);} }
}
