<?php

namespace App\Services\Arcade;

final class PilotPreflight
{
    public function inspect(): array
    {
        $checks=[];
        $checks['live_opt_in']=config('demian-pilot.live_enabled')===true;
        $checks['production_environment']=app()->environment('production');
        $checks['release_bound']=preg_match('/^[a-f0-9]{40}$/D',(string)config('demian-pilot.release_sha'))===1;
        $path=base_path('docs/character-standards/production-art-acceptance.json');
        $art=is_file($path)?json_decode((string)file_get_contents($path),true):null;
        $sha=(string)config('demian-pilot.art_manifest_sha256');
        $checks['art_manifest_bound']=is_array($art)&&($art['status']??null)==='approved'
            &&!empty($art['characters'])&&preg_match('/^[a-f0-9]{64}$/D',$sha)===1
            &&hash_equals($sha,hash_file('sha256',$path));
        $checks['otp_ready']=app(PhoneIdentityService::class)->ready();
        try {$checks['production_readiness']=app(CafeProductionReadiness::class)->inspect(true,'production')['status']==='passed';}
        catch(\Throwable){$checks['production_readiness']=false;}
        try {$checks['ops_healthy']=app(OpsReport::class)->snapshot()['status']==='ok';}
        catch(\Throwable){$checks['ops_healthy']=false;}
        return ['passed'=>!in_array(false,$checks,true),'checks'=>$checks];
    }
}
