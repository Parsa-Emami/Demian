<?php

namespace App\Services\Arcade;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class CafeTableService
{
    public const DAILY_CAP=2000;
    public const TABLE_CAP=500;

    private function url(string $key): ?string
    {
        $url=config('demian-tables.'.$key);
        if(!is_string($url)||strlen($url)>134||!filter_var($url,FILTER_VALIDATE_URL)
            ||parse_url($url,PHP_URL_SCHEME)!=='https'||parse_url($url,PHP_URL_USER)!==null
            ||parse_url($url,PHP_URL_PASS)!==null||parse_url($url,PHP_URL_QUERY)!==null
            ||parse_url($url,PHP_URL_FRAGMENT)!==null)return null;
        return $url;
    }

    public function available(): bool
    {
        $base=$this->url('public_base');
        return config('demian-tables.enabled')===true && $base!==null
            && strlen(rtrim($base,'/').'/t/'.str_repeat('a',32))<=134
            && $this->url('game_url')!==null;
    }

    public function gameUrl(): string
    {
        abort_unless($this->available(),503);
        return $this->url('game_url');
    }

    public function link(object $table): string
    {
        abort_unless($this->available(),503);
        return rtrim($this->url('public_base'),'/').'/t/'.$table->code;
    }

    private function audit(int $actor,string $event,array $details): void
    {
        DB::table('arcade_cashier_admin_events')->insert(['actor_id'=>$actor,'event_type'=>$event,
            'details'=>json_encode($details,JSON_THROW_ON_ERROR),'created_at'=>now()->utc()]);
    }

    private function staff(int $id,int $version): object
    {
        $staff=DB::table('arcade_cashier_staff')->where('id',$id)->lockForUpdate()->first();
        CafeAccess::authorize($staff,'report.global');
        abort_unless((int)$staff->session_version===$version,403);
        return $staff;
    }

    public function create(int $actor,int $version,string $branch,string $label): void
    {
        DB::transaction(function()use($actor,$version,$branch,$label): void {
            $this->staff($actor,$version);
            abort_unless(DB::table('arcade_table_inventory_lock')->where('id',1)->lockForUpdate()->first(),503);
            abort_unless(DB::table('arcade_cashier_staff')->where('branch_id',$branch)->where('is_active',true)->exists(),422);
            if(DB::table('arcade_cafe_tables')->count()>=self::TABLE_CAP)
                throw ValidationException::withMessages(['label'=>'Table inventory limit reached.']);
            if(DB::table('arcade_cafe_tables')->where('branch_id',$branch)->where('label',$label)->exists())
                throw ValidationException::withMessages(['label'=>'Table label already exists in this branch.']);
            $id=DB::table('arcade_cafe_tables')->insertGetId(['branch_id'=>$branch,'label'=>$label,
                'code'=>bin2hex(random_bytes(16)),'active'=>true,'created_at'=>now()->utc(),'updated_at'=>now()->utc()]);
            $this->audit($actor,'cafe_table_created',['table_id'=>$id]);
        },3);
    }

    public function change(int $actor,int $version,int $id,string $action): void
    {
        abort_unless(in_array($action,['enable','disable','rotate'],true),422);
        DB::transaction(function()use($actor,$version,$id,$action): void {
            $this->staff($actor,$version);
            $row=DB::table('arcade_cafe_tables')->where('id',$id)->lockForUpdate()->first();
            abort_unless($row,404);
            $data=$action==='rotate'?['code'=>bin2hex(random_bytes(16))]:['active'=>$action==='enable'];
            DB::table('arcade_cafe_tables')->where('id',$id)->update([...$data,'updated_at'=>now()->utc()]);
            $this->audit($actor,'cafe_table_'.$action,['table_id'=>$id]);
        },3);
    }

    public function resolve(string $code): object
    {
        abort_unless($this->available(),503);
        $row=DB::table('arcade_cafe_tables')->where('code',$code)->where('active',true)->first();
        abort_unless($row,404);
        return $row;
    }

    public function launch(string $code,string $nonce): void
    {
        abort_unless($this->available(),503);
        DB::transaction(function()use($code,$nonce): void {
            $row=DB::table('arcade_cafe_tables')->where('code',$code)->where('active',true)->lockForUpdate()->first();
            abort_unless($row,404);
            $day=now('Asia/Tehran')->toDateString();
            DB::table('arcade_table_daily_launches')->insertOrIgnore(['table_id'=>$row->id,'day'=>$day,'launches'=>0]);
            $daily=DB::table('arcade_table_daily_launches')->where('table_id',$row->id)->where('day',$day)->lockForUpdate()->first();
            if((int)$daily->launches>=self::DAILY_CAP)return;
            $seen=DB::table('arcade_table_launch_nonces')->insertOrIgnore([
                'nonce_hash'=>hash('sha256',$nonce),'expires_at'=>now()->utc()->addDay()]);
            if(!$seen)return;
            DB::table('arcade_table_daily_launches')->where('table_id',$row->id)->where('day',$day)
                ->where('launches','<',self::DAILY_CAP)->increment('launches');
        },3);
    }

    public function report(): array
    {
        $since=now('Asia/Tehran')->subDays(29)->toDateString();
        $today=now('Asia/Tehran')->toDateString();
        $totals=DB::table('arcade_table_daily_launches')->whereBetween('day',[$since,$today])
            ->selectRaw('table_id,SUM(launches) AS launches')->groupBy('table_id')->pluck('launches','table_id');
        return DB::table('arcade_cafe_tables')->orderBy('branch_id')->orderBy('label')->limit(self::TABLE_CAP)->get()
            ->map(fn($r)=>['id'=>(int)$r->id,'branch'=>$r->branch_id,'label'=>$r->label,'active'=>(bool)$r->active,
                'launches_30d'=>(int)($totals[$r->id]??0)])->all();
    }

    public function prune(): void
    {
        DB::table('arcade_table_launch_nonces')->where('expires_at','<=',now()->utc())->delete();
        DB::table('arcade_table_daily_launches')->where('day','<',now('Asia/Tehran')->subDays(364)->toDateString())->delete();
    }
}
