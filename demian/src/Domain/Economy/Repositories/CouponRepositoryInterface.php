<?php
namespace Domain\Economy\Repositories;

use Domain\Economy\Entities\Coupon;
interface CouponRepositoryInterface { public function findAvailable(): ?Coupon; public function save(Coupon $coupon): void; }
