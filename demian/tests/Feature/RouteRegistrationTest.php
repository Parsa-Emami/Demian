<?php

namespace Tests\Feature;

use Illuminate\Http\Request;
use Illuminate\Routing\Router;
use Tests\TestCase;

class RouteRegistrationTest extends TestCase
{
    public function test_required_routes_are_present_in_the_http_test_kernel(): void
    {
        /** @var Router $router */
        $router = $this->app->make(Router::class);
        $routes = $router->getRoutes();

        $this->assertNotNull($routes->getByName('studio'));
        $this->assertNotNull($routes->getByName('characters.index'));

        $activeEvent = $routes->match(Request::create('/api/v1/events/active', 'GET'));
        $startSession = $routes->match(Request::create('/api/v1/events/cafe-rush/sessions', 'POST'));

        $this->assertSame('api/v1/events/active', $activeEvent->uri());
        $this->assertSame('api/v1/events/{event}/sessions', $startSession->uri());
    }

    public function test_required_routes_are_reachable_through_the_http_kernel(): void
    {
        $this->get('/')
            ->assertOk()
            ->assertViewIs('demian')
            ->assertSee('Character manager')
            ->assertSee('data-character-manager', false)
            ->assertSee('data-demian-scene', false)
            ->assertSee('data-runtime-version="9.1.0-atomic-pixel2d"', false);

        $this->getJson('/api/v1/events/active')
            ->assertOk()
            ->assertJsonPath('data.id', 'cafe-rush');
    }
}
