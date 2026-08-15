<?php

namespace App\Http\Controllers;

use Illuminate\Contracts\View\View;

class CharacterStudioController extends Controller
{
    public function index(): View
    {
        return view('demian');
    }
}
