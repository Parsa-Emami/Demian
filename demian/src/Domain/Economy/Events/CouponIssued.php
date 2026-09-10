<?php
namespace Domain\Economy\Events;

final class CouponIssued { public function __construct(public readonly string $couponId) {} }
