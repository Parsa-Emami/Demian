<?php

namespace Tests\Feature;

use Tests\TestCase;

class DemianViewTest extends TestCase
{
    public function test_homepage_renders_json_ld_without_interpreting_schema_keys_as_blade(): void
    {
        $response = $this->get('/')->assertOk()->assertViewIs('demian');
        $html = $response->getContent();
        $this->assertSame(1, preg_match('/id="demian-project-schema">(.*?)<\/script>/s', $html, $matches));
        $schema = json_decode($matches[1], true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame('https://schema.org', $schema['@context']);
        $this->assertSame('VideoGame', $schema['@type']);
        $this->assertSame('Person', $schema['creator']['@type']);
        $this->assertSame('Parsa Emami', $schema['creator']['name']);
        $this->assertSame('https://parsaaemm.dev/', $schema['creator']['url']);
        $this->assertStringNotContainsString('@verbatim', $html);
        $this->assertStringNotContainsString('@endverbatim', $html);
        $this->assertStringNotContainsString('{{ csrf_token() }}', $html);
        $this->assertStringContainsString('name="csrf-token" content="'.csrf_token().'"', $html);
    }

    public function test_cached_views_still_render_the_homepage(): void
    {
        try {
            $this->artisan('view:cache')->assertSuccessful();
            $this->get('/')->assertOk()->assertSee('"@context": "https://schema.org"', false);
        } finally {
            $this->artisan('view:clear')->assertSuccessful();
        }
    }
}
