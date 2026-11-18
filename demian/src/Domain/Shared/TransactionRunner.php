<?php

namespace Domain\Shared;

interface TransactionRunner
{
    public function execute(callable $operation): mixed;
}
