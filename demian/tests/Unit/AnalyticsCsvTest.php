<?php

namespace Tests\Unit;

use App\Services\Arcade\AnalyticsCsv;
use PHPUnit\Framework\TestCase;

final class AnalyticsCsvTest extends TestCase
{
    public function test_csv_preserves_types_and_neutralizes_untrusted_strings(): void
    {
        $stream=fopen('php://temp','w+');
        AnalyticsCsv::write($stream,['text'=>' =2+2','unsafe'=>'+cmd','negative'=>-10,'null'=>null,
            'zero'=>0,'empty'=>[],'f'=>false,'unicode'=>'شعبه اصلی']);
        rewind($stream);
        self::assertSame("\xEF\xBB\xBF",fread($stream,3));
        self::assertSame(['metric_path','value','type'],fgetcsv($stream,0,',','"',''));
        $rows=[];
        while(($row=fgetcsv($stream,0,',','"',''))!==false)$rows[$row[0]]=[$row[1],$row[2]];
        fclose($stream);
        self::assertSame(["' =2+2",'string'],$rows['text']);
        self::assertSame(["'+cmd",'string'],$rows['unsafe']);
        self::assertSame(['-10','integer'],$rows['negative']);
        self::assertSame(['','null'],$rows['null']);
        self::assertSame(['0','integer'],$rows['zero']);
        self::assertSame(['','empty_array'],$rows['empty']);
        self::assertSame(['false','boolean'],$rows['f']);
        self::assertSame(['شعبه اصلی','string'],$rows['unicode']);
    }
}
