<?php

namespace App\Http\Controllers\Cafe;

use App\Http\Controllers\Controller;
use App\Services\Arcade\CafeTableService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class PublicTableController extends Controller
{
    private function secure(Response $response): Response
    {
        $response->headers->set('Cache-Control','private, no-store, max-age=0');
        $response->headers->set('Referrer-Policy','no-referrer');
        $response->headers->set('X-Content-Type-Options','nosniff');
        $response->headers->set('X-Robots-Tag','noindex, nofollow');
        $response->headers->set('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https:; frame-ancestors 'none'; base-uri 'none'");
        return $response;
    }

    public function show(Request $request,string $code,CafeTableService $service): Response
    {
        $table=$service->resolve($code);
        $nonce=bin2hex(random_bytes(32));
        $request->session()->put('table_launch',['code'=>$code,'nonce'=>$nonce,'expires'=>now()->timestamp+600]);
        return $this->secure(response()->view('table-landing',['label'=>$table->label,'code'=>$code,'nonce'=>$nonce]));
    }

    public function launch(Request $request,string $code,CafeTableService $service): Response
    {
        $service->resolve($code);
        $data=$request->validate(['nonce'=>['required','string','regex:/^[a-f0-9]{64}$/D']]);
        $claim=$request->session()->get('table_launch');
        abort_unless(is_array($claim)&&($claim['code']??null)===$code
            &&is_string($claim['nonce']??null)&&hash_equals($claim['nonce'],$data['nonce'])
            &&($claim['expires']??0)>now()->timestamp,419);
        $service->launch($code,$data['nonce']);
        $request->session()->forget('table_launch');
        return $this->secure(redirect()->away($service->gameUrl(),303));
    }
}
