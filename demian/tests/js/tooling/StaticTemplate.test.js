import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderStaticTemplate } from '../../../tools/static_template.mjs';

const entry = { file: 'assets/app.js', css: ['assets/app.css'] };

test('the real Blade template exports valid JSON-LD and portable asset/API paths', () => {
    const blade = readFileSync(new URL('../../../resources/views/demian.blade.php', import.meta.url), 'utf8');
    const html = renderStaticTemplate(blade, { entry });
    const schema = JSON.parse(html.match(/id="demian-project-schema">([\s\S]*?)<\/script>/)[1]);
    assert.equal(schema['@context'], 'https://schema.org');
    assert.equal(schema['@type'], 'VideoGame');
    assert.equal(schema.creator['@type'], 'Person');
    assert.equal(schema.creator.name, 'Parsa Emami');
    assert.equal(/@verbatim|@endverbatim|@vite|\{\{/.test(html), false);
    assert.ok(html.includes('src="build/assets/app.js"'));
    assert.ok(html.includes('data-api-base="characters.json"'));
    assert.ok(html.includes('name="demian-arcade-api" content=""'));
    assert.ok(renderStaticTemplate(blade, { entry, arcadeApi: 'https://example.com/api/v1/arcade' })
        .includes('name="demian-arcade-api" content="https://example.com/api/v1/arcade"'));
});

test('static export protects literal blocks and rejects unhandled Blade directives', () => {
    assert.equal(renderStaticTemplate('@verbatim{"@context":"schema", "value":"{{ literal }}"}@endverbatim', { entry }),
        '{"@context":"schema", "value":"{{ literal }}"}');
    for (const source of ['@context("key")', '@verbatim missing end', '@endverbatim', '@if(true)', '{{ unknown() }}']) {
        assert.throws(() => renderStaticTemplate(source, { entry }), /Unsupported template directive/);
    }
});
