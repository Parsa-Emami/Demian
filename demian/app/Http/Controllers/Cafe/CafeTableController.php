<?php

namespace App\Http\Controllers\Cafe;

use App\Http\Controllers\Controller;
use App\Services\Arcade\CafeAccess;
use App\Services\Arcade\CafeTableService;
use App\Services\Arcade\TableQr;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpFoundation\Response;

final class CafeTableController extends Controller
{
    private function actor(Request $request): object
    {
        $staff=$request->attributes->get('cafe_staff');
        CafeAccess::authorize($staff,'report.global');
        return $staff;
    }

    private function stepUp(Request $request): object
    {
        $staff=$this->actor($request);
        $data=$request->validate(['password'=>['required','string','max:256'],'confirmed'=>['accepted']]);
        abort_unless(Hash::check($data['password'],$staff->password_hash),403);
        return $staff;
    }

    public function index(Request $request,CafeTableService $service): Response
    {
        return response()->view('cashier.tables',['staff'=>$this->actor($request),'ready'=>$service->available(),
            'tables'=>$service->report(),'branches'=>DB::table('arcade_cashier_staff')->where('is_active',true)
                ->distinct()->orderBy('branch_id')->limit(500)->pluck('branch_id')]);
    }

    public function create(Request $request,CafeTableService $service): Response
    {
        $actor=$this->stepUp($request);
        $data=$request->validate(['branch'=>['required','string','max:40'],
            'label'=>['required','string','max:40','regex:/^[\p{L}\p{N} _-]+$/u']]);
        $service->create((int)$actor->id,(int)$request->session()->get('cafe_staff_version'),$data['branch'],$data['label']);
        return redirect()->route('cashier.tables')->with('notice','میز ثبت شد.');
    }

    public function change(Request $request,int $tableId,string $action,CafeTableService $service): Response
    {
        $actor=$this->stepUp($request);
        $service->change((int)$actor->id,(int)$request->session()->get('cafe_staff_version'),$tableId,$action);
        return redirect()->route('cashier.tables')->with('notice','تغییر ثبت شد؛ در صورت تعویض کد، نسخه قبلی دیگر معتبر نیست.');
    }

    public function print(Request $request,int $tableId,CafeTableService $service): Response
    {
        $this->actor($request);
        $table=DB::table('arcade_cafe_tables')->where('id',$tableId)->where('active',true)->first();
        abort_unless($table,404);
        $link=$service->link($table);
        return response()->view('cashier.table-print',['table'=>$table,'link'=>$link,'path'=>TableQr::path($link)]);
    }
}
