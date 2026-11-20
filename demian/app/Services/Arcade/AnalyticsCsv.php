<?php

namespace App\Services\Arcade;

final class AnalyticsCsv
{
    private static function cell(string $value): string
    {
        return preg_match('/^[\s\x00-\x1f\x7f]*[=+@-]|^[\x00-\x1f\x7f]/u',$value) ? "'".$value : $value;
    }

    public static function write($stream,array $report): void
    {
        fwrite($stream,"\xEF\xBB\xBF");
        fputcsv($stream,['metric_path','value','type'],',','"','');
        self::walk($stream,'',$report);
    }

    private static function walk($stream,string $path,mixed $value): void
    {
        if(is_array($value)&&$value!==[]) {
            foreach($value as $k=>$v) self::walk($stream,$path===''?(string)$k:$path.'.'.$k,$v);
            return;
        }
        $type=match(true){$value===null=>'null',is_bool($value)=>'boolean',is_int($value)=>'integer',
            is_float($value)=>'number',is_array($value)=>'empty_array',default=>'string'};
        $cell=match($type){'null','empty_array'=>'','boolean'=>$value?'true':'false','string'=>self::cell($value),default=>(string)$value};
        fputcsv($stream,[self::cell($path),$cell,$type],',','"','');
    }
}
