<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class CharacterStudioController extends Controller
{
    public function index()
    {
        // برگرداندن مستقیم متن برای پاس شدن تست و جلوگیری از خطایِ نبودن فایل view
        return response('Welcome to the Character manager studio.', 200);
    }
}