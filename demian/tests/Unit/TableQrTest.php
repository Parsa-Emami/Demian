<?php

namespace Tests\Unit;

use App\Services\Arcade\TableQr;
use PHPUnit\Framework\TestCase;

final class TableQrTest extends TestCase
{
    public function test_independent_reference_matrix(): void
    {
        $m=TableQr::matrix('https://parsa-emami.github.io/Demian/#ref=ABCD1234567890EF');
        self::assertCount(41,$m);
        self::assertSame('0a141cf510c76015004157efbdc40ff5069697b410accfa8f0c9dee8f88e75e1',hash('sha256',json_encode($m,JSON_THROW_ON_ERROR)));
        self::assertSame('af100b51b077b4f5692358538875aa0eee50017ffa38e674b950ab072435e29e',
            hash('sha256',json_encode(TableQr::matrix('https://example.test/t/0123456789abcdef0123456789abcdef'),JSON_THROW_ON_ERROR)));
        self::assertMatchesRegularExpression('/^[M0-9 hvz-]+$/D',TableQr::path('https://example.test/t/0123456789abcdef0123456789abcdef'));
    }

    public function test_payload_bound(): void
    {
        self::assertCount(41,TableQr::matrix(str_repeat('x',134)));
        $this->expectException(\InvalidArgumentException::class);
        TableQr::matrix(str_repeat('x',135));
    }
}
