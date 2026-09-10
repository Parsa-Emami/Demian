<?php
namespace Domain\Economy\Services;
use Domain\Economy\ValueObjects\RtpConfiguration;
class RtpController { public function __construct(private RtpConfiguration $config){} public function allow(float $currentRate): bool { return $this->config->canIssue($currentRate); } }
