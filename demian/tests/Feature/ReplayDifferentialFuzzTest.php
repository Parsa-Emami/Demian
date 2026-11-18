<?php

namespace Tests\Feature;

use App\Services\Arcade\CoffeeCrashReplayVerifier;
use App\Services\Arcade\RunnerReplayVerifier;
use Symfony\Component\Process\Process;
use Tests\TestCase;

final class ReplayDifferentialFuzzTest extends TestCase
{
    public function test_seeded_javascript_corpus_matches_php_and_rejects_invalid_mutations(): void
    {
        $process = new Process(['node', base_path('tools/generate_differential_fuzz.mjs')]);
        $process->setTimeout(90);
        $process->mustRun();
        $corpus = json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR);
        $this->assertCount(64, $corpus['runner']);
        $this->assertCount(64, $corpus['coffee']);
        $timings = ['runner' => [], 'coffee' => []];
        foreach ($corpus['runner'] as $case) {
            $started = hrtime(true);
            $actual = app(RunnerReplayVerifier::class)->verify($case['seed'], $case['width'], $case['ticks'], $case['transitions']);
            $timings['runner'][] = (hrtime(true) - $started) / 1e6;
            $this->assertSame($case['expected'], $actual, 'runner seed '.$case['seed']);
            $bad = $case['transitions'];
            $bad[0]['mask'] = 255;
            try {
                app(RunnerReplayVerifier::class)->verify($case['seed'], $case['width'], $case['ticks'], $bad);
                $this->fail('Invalid control mask accepted.');
            } catch (\Illuminate\Validation\ValidationException) { $this->addToAssertionCount(1); }
        }
        foreach ($corpus['coffee'] as $case) {
            $started = hrtime(true);
            $this->assertSame($case['expected'], app(CoffeeCrashReplayVerifier::class)->verify(
                $case['seed'], $case['ticks'], $case['actions']), 'coffee seed '.$case['seed']);
            $timings['coffee'][] = (hrtime(true) - $started) / 1e6;
            $bad = $case['actions'];
            $bad[0]['b'] = $bad[0]['a'];
            try {
                app(CoffeeCrashReplayVerifier::class)->verify($case['seed'], $case['ticks'], $bad);
                $this->fail('Impossible swap accepted.');
            } catch (\Illuminate\Validation\ValidationException) { $this->addToAssertionCount(1); }
        }
        $summary = ['status' => 'passed', 'seed' => '0x51a7cafe', 'validCases' => 128, 'invalidMutations' => 128, 'timings' => []];
        foreach ($timings as $game => $values) {
            sort($values, SORT_NUMERIC);
            $summary['timings'][$game] = ['samples' => count($values), 'p95Ms' => round($values[(int) ceil(count($values) * .95) - 1], 3),
                'maxMs' => round(max($values), 3)];
        }
        $directory = base_path('docs/acceptance-lab');
        if (! is_dir($directory)) mkdir($directory, 0775, true);
        file_put_contents($directory.'/replay-cpu-'.config('database.default').'.json', json_encode($summary, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
    }
}
