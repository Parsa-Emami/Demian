<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Feature tests should verify the rendered application response, not
        // depend on a pre-existing frontend build artifact. The production
        // Vite build is validated independently by the deployment workflow.
        $this->withoutVite();
    }
}
