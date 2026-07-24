<?php

namespace App\Http\Controllers;

use Illuminate\Contracts\View\View;

class CharacterStudioController extends Controller
{
    public function __invoke(): View
    {
        return view('demian');
    }
}
