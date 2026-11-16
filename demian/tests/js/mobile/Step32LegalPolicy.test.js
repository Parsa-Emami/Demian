import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import policy from '../../../resources/legal/policy.json' with { type: 'json' };
import { LEGAL_VERSION } from '../../../resources/js/game/leaderboard/LegalConsent.js';
import { buildLegalPages } from '../../../tools/build_legal_pages.mjs';

test('step32 version is identical in API policy source and consent client', () => {
    assert.match(policy.version, /^\d{4}-\d{2}-\d{2}-v\d+$/);
    assert.equal(LEGAL_VERSION, policy.version);
    assert.equal(policy.public_origin, 'https://demiancafe.ir');
    assert.equal(policy.api_origin, 'https://api.demiancafe.ir');
    assert.equal(policy.status, 'draft-pending-legal-review');
    const php = readFileSync(resolve('config/demian-legal.php'), 'utf8');
    assert.match(php, /legal\/policy\.json/);
});

test('step32 static pages are self-contained, noindexed until review, and linked', () => {
    const dir = mkdtempSync(join(tmpdir(), 'demian-legal-'));
    const previous = process.env.DEMIAN_LEGAL_PUBLICATION_APPROVED;
    process.env.DEMIAN_LEGAL_PUBLICATION_APPROVED = 'false';
    try {
        const result = buildLegalPages(dir);
        assert.equal(result.status, 'draft');
        for (const slug of ['privacy', 'terms', 'competition-rules']) {
            const file = join(dir, slug, 'index.html');
            assert.equal(existsSync(file), true);
            const html = readFileSync(file, 'utf8');
            assert.match(html, /lang="fa" dir="rtl"/);
            assert.match(html, /name="robots" content="noindex,nofollow"/);
            assert.match(html, new RegExp('2026-11-16-v1'));
            assert.match(html, /href="\.\.\/privacy\/"/);
            assert.match(html, /href="\.\.\/terms\/"/);
            assert.match(html, /href="\.\.\/competition-rules\/"/);
            assert.match(html, /پیش‌نویس/);
        }
        assert.match(readFileSync(join(dir, 'privacy/index.html'), 'utf8'), /حذف/);
        assert.match(readFileSync(join(dir, 'competition-rules/index.html'), 'utf8'), /شنبه/);
        assert.match(readFileSync(join(dir, 'terms/index.html'), 'utf8'), /امتیاز/);
    } finally {
        if (previous === undefined) delete process.env.DEMIAN_LEGAL_PUBLICATION_APPROVED;
        else process.env.DEMIAN_LEGAL_PUBLICATION_APPROVED = previous;
        rmSync(dir, { recursive: true, force: true });
    }
});

test('step32 does not permit a CI/operator variable to certify unreviewed content', () => {
    const dir = mkdtempSync(join(tmpdir(), 'demian-legal-'));
    const previous = process.env.DEMIAN_LEGAL_PUBLICATION_APPROVED;
    process.env.DEMIAN_LEGAL_PUBLICATION_APPROVED = 'true';
    try {
        assert.throws(() => buildLegalPages(dir), /requires reviewed policy status/);
    } finally {
        if (previous === undefined) delete process.env.DEMIAN_LEGAL_PUBLICATION_APPROVED;
        else process.env.DEMIAN_LEGAL_PUBLICATION_APPROVED = previous;
        rmSync(dir, { recursive: true, force: true });
    }
});

test('step32 service worker precaches concrete HTML paths without ambiguous directory redirects', () => {
    const sw = readFileSync(resolve('tools/templates/service-worker.js'), 'utf8');
    assert.match(sw, /'privacy\/index\\.html'/);
    assert.match(sw, /'terms\/index\\.html'/);
    assert.match(sw, /'competition-rules\/index\\.html'/);
    assert.match(sw, /legalIndex \? await cache\.match\(legalIndex\)/);
    assert.doesNotMatch(sw, /cache\.addAll\(\[offlineURL, manifestURL, \.\.\.iconURLs, \.\.\.\['privacy\/']/);
});
