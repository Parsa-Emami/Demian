<?php

namespace Tests\Feature;

use Illuminate\Http\Request;
use Illuminate\Routing\Router;
use Tests\TestCase;

class RouteRegistrationTest extends TestCase
{
    public function test_required_web_and_api_routes_are_registered(): void
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
}
