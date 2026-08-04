<?php

namespace App\Http\Controllers;

use Illuminate\Contracts\View\View;

final class CharacterStudioController extends Controller
{
    /**
     * Render the Laravel source page used both by local development and the
     * one-time GitHub Pages static export.
     */
    public function __invoke(): View
    {
        return view('demian');
    }
}
