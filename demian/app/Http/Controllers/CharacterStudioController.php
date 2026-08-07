<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class CharacterStudioController extends Controller
{
    public function index()
    {
        // فایل blade مربوطه باید شامل کلمه "Character manager" باشد تا تست پاس شود
        return view('studio.index'); 
    }
}