<?php

namespace App\Http\Controllers\Cafe;

use App\Http\Controllers\Controller;
use App\Services\Arcade\CafeAccess;
use App\Services\Arcade\CommercialPilot;
use App\Services\Arcade\PilotPreflight;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpFoundation\Response;

final class CafePilotController extends Controller
{
    private function actor(Request $r): object
    {
        $staff=$r->attributes->get('cafe_staff');
        CafeAccess::authorize($staff,'operations.readiness');return $staff;
    }

    private function credentials(Request $r): array
    {
        $s=$this->actor($r);
        $d=$r->validate(['password'=>['required','string','max:256'],'confirmed'=>['accepted'],
            'evidence_ref'=>['required','string','regex:/^[A-Za-z0-9][A-Za-z0-9._:-]{3,79}$/D']]);
        abort_unless(Hash::check($d['password'],$s->password_hash),403);
        return [(int)$s->id,(int)$r->session()->get('cafe_staff_version'),$d['evidence_ref']];
    }

    public function index(Request $r,CommercialPilot $pilot,PilotPreflight $preflight): Response
    {
        $staff=$this->actor($r);
        $data=$r->validate(['id'=>['sometimes','integer','min:1']]);
        return response()->view('cashier.pilot',['staff'=>$staff,'plans'=>$pilot->listing(),'preflight'=>$preflight->inspect(),
            'detail'=>isset($data['id'])?$pilot->detail((int)$data['id']):null,
            'branches'=>DB::table('arcade_cashier_staff')->where('is_active',true)->distinct()->orderBy('branch_id')->limit(500)->pluck('branch_id')]);
    }

    public function create(Request $r,CommercialPilot $pilot): Response
    {
        [$a,$v,$ref]=$this->credentials($r);
        $d=$r->validate(['branch_id'=>['required','string','max:40'],'mode'=>['required','in:live,rehearsal'],
            'pilot_start'=>['required','date_format:Y-m-d'],'days'=>['required','integer','in:7,14,28'],'currency'=>['required','regex:/^[A-Z]{3}$/D'],
            'discount_budget_minor'=>['required','integer','min:1','max:200000000000000'],
            'minimum_receipts'=>['required','integer','min:20','max:10000'],'target_uplift_bps'=>['required','integer','min:0','max:10000']]);
        $id=$pilot->create($a,$v,[...$d,'evidence_ref'=>$ref]);return redirect()->route('cashier.pilot',['id'=>$id]);
    }

    public function mutate(Request $r,int $pilotId,string $operation,CommercialPilot $pilot): Response
    {
        [$a,$v,$ref]=$this->credentials($r);
        if($operation==='record'){
            $d=$r->validate(['day'=>['required','date_format:Y-m-d'],'receipts'=>['required','integer','min:0','max:100000'],
                'net_sales_minor'=>['required','integer','min:0','max:100000000000000'],
                'variable_cost_minor'=>['required','integer','min:0','max:100000000000000'],
                'operating_cost_minor'=>['required','integer','min:0','max:100000000000000'],
                'incidents'=>['required','integer','min:0','max:1000']]);
            $pilot->record($a,$v,$pilotId,[...$d,'evidence_ref'=>$ref]);
        }elseif($operation==='start')$pilot->start($a,$v,$pilotId,$ref);
        elseif($operation==='action'){
            $d=$r->validate(['category'=>['required','in:'.implode(',',CommercialPilot::CATEGORIES)],
                'success_metric'=>['required','in:'.implode(',',CommercialPilot::METRICS)],'due_day'=>['required','date_format:Y-m-d']]);
            $pilot->action($a,$v,$pilotId,[...$d,'evidence_ref'=>$ref]);
        }elseif($operation==='resolve'){
            $d=$r->validate(['action_id'=>['required','integer','min:1']]);
            $pilot->resolve($a,$v,$pilotId,(int)$d['action_id'],$ref);
        }else $pilot->transition($a,$v,$pilotId,$operation,$ref);
        return redirect()->route('cashier.pilot',['id'=>$pilotId]);
    }
}
