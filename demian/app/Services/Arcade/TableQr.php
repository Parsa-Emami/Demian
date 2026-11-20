<?php

namespace App\Services\Arcade;

use InvalidArgumentException;

final class TableQr
{
    private static function mul(int $x,int $y): int
    {
        $z=0;
        while($y) {
            if($y&1) $z^=$x;
            $y>>=1;$x<<=1;if($x&256)$x^=285;
        }
        return $z;
    }

    public static function matrix(string $text): array
    {
        if(strlen($text)>134) throw new InvalidArgumentException('QR payload too long.');
        $data=array_values(unpack('C*',$text)?:[]);
        $bits=[];
        $put=static function(int $v,int $n) use (&$bits): void {
            for($i=$n-1;$i>=0;$i--) $bits[]=($v>>$i)&1;
        };
        $put(4,4);$put(count($data),8);foreach($data as $b)$put($b,8);
        $put(0,min(4,1088-count($bits)));while(count($bits)%8)$bits[]=0;
        $bytes=[];
        foreach(array_chunk($bits,8) as $chunk){$v=0;foreach($chunk as $b)$v=$v*2+$b;$bytes[]=$v;}
        for($pad=0;count($bytes)<136;$pad++)$bytes[]=$pad%2?17:236;
        $gen=[1];$root=1;
        for($i=0;$i<18;$i++){
            $tmp=array_fill(0,count($gen)+1,0);
            foreach($gen as $j=>$v){$tmp[$j]^=$v;$tmp[$j+1]^=self::mul($v,$root);}
            $gen=$tmp;$root=self::mul($root,2);
        }
        $blocks=array_chunk($bytes,68);$ecc=[];
        foreach($blocks as $block){
            $out=array_merge($block,array_fill(0,18,0));
            for($i=0;$i<68;$i++){$factor=$out[$i];foreach($gen as $j=>$v)$out[$i+$j]^=self::mul($v,$factor);}
            $ecc[]=array_slice($out,68);
        }
        $words=[];
        for($i=0;$i<68;$i++)foreach($blocks as $b)$words[]=$b[$i];
        for($i=0;$i<18;$i++)foreach($ecc as $b)$words[]=$b[$i];
        $n=41;$m=array_fill(0,$n,array_fill(0,$n,null));
        $set=static function(int $x,int $y,int|bool $b) use (&$m,$n): void {
            if($x>=0&&$y>=0&&$x<$n&&$y<$n)$m[$y][$x]=(int)(bool)$b;
        };
        foreach([[3,3],[37,3],[3,37]] as [$cx,$cy])
            for($y=-4;$y<=4;$y++)for($x=-4;$x<=4;$x++){
                $d=max(abs($x),abs($y));$set($cx+$x,$cy+$y,$d!==2&&$d!==4);
            }
        for($i=0;$i<$n;$i++){if($m[6][$i]===null)$set($i,6,$i%2===0);if($m[$i][6]===null)$set(6,$i,$i%2===0);}
        for($y=-2;$y<=2;$y++)for($x=-2;$x<=2;$x++)$set(34+$x,34+$y,max(abs($x),abs($y))!==1);
        $f=static fn(int $i): int => (0x77c4>>$i)&1;
        for($i=0;$i<6;$i++)$set(8,$i,$f($i));$set(8,7,$f(6));$set(8,8,$f(7));$set(7,8,$f(8));
        for($i=9;$i<15;$i++)$set(14-$i,8,$f($i));
        for($i=0;$i<8;$i++)$set($n-1-$i,8,$f($i));
        for($i=8;$i<15;$i++)$set(8,$n-15+$i,$f($i));$set(8,$n-8,1);
        $pos=0;
        for($right=$n-1;$right>=1;$right-=2){
            if($right===6)$right=5;$up=(($right+1)&2)===0;
            for($vert=0;$vert<$n;$vert++){
                $y=$up?$n-1-$vert:$vert;
                for($j=0;$j<2;$j++){
                    $x=$right-$j;if($m[$y][$x]!==null)continue;
                    $b=$pos<count($words)*8?(($words[$pos>>3]>>(7-($pos&7)))&1):0;
                    $set($x,$y,$b^(int)(($x+$y)%2===0));$pos++;
                }
            }
        }
        return $m;
    }

    public static function path(string $text): string
    {
        $path='';
        foreach(self::matrix($text) as $y=>$row)foreach($row as $x=>$bit)
            if($bit)$path.='M'.($x+4).' '.($y+4).'h1v1h-1z';
        return $path;
    }
}
