import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME_CATALOG } from '../../resources/js/game/catalog/GameCatalog.js';
import { BUILTIN_CHARACTER_SLUGS } from '../../resources/js/game/characters/CharacterVisualContract.js';

const read = relativePath => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const blade = read('../../resources/views/demian.blade.php');
const playable = read('../../../playable/index.html');
const selection = read('../../resources/js/game/shell/screens/GameSelectionScreen.js');
const workflow = read('../../../.github/workflows/deploy-demian-pages.yml');

test('Phase 0: the seven published games are unique, playable and reflected by the live selection count', () => {
    assert.equal(GAME_CATALOG.length, 7, 'New games require an explicit catalog/design review.');
    assert.equal(new Set(GAME_CATALOG.map(game => game.id)).size, GAME_CATALOG.length);
    assert.equal(GAME_CATALOG.filter(game => game.available).length, GAME_CATALOG.length);
    assert.ok(BUILTIN_CHARACTER_SLUGS.length > 0);
    assert.equal(new Set(BUILTIN_CHARACTER_SLUGS).size, BUILTIN_CHARACTER_SLUGS.length);
    assert.match(selection, /this\.catalog\.filter\(game => game\.available\)/);
    assert.match(selection, /count\.textContent = `\$\{playableCount/);
    for (const html of [blade, playable]) {
        assert.match(html, /data-game-library-count/);
        assert.match(html, /data-shell-action="play"/);
        assert.doesNotMatch(html, /data-game-library-summary|class="cafe-menu__footer"/);
    }
});

test('Phase 0: GitHub Pages is gated on backend, frontend, release QA and an exact build SHA', () => {
    for (const command of ['npm ci', 'npm run test:ci', 'npm run validate:final',
        'npm run validate:ui-layers', 'npm run validate:characters:v14',
        'npm run build:static', 'npm run validate:static-assets']) {
        assert.ok(workflow.includes(command), `Missing release step: ${command}`);
    }
    assert.match(workflow, /pull_request:\s*\n\s*branches: \[main\]/);
    assert.match(workflow, /needs: \[build, backend\]/);
    assert.match(workflow, /step31_verify\.mjs/);
    assert.match(workflow, /DEMIAN_QA_BUILD_RESULT: \$\{\{ needs\.build\.result \}\}/);
    assert.match(workflow, /DEMIAN_QA_BACKEND_RESULT: \$\{\{ needs\.backend\.result \}\}/);
    assert.match(workflow, /needs: \[release-qa\]/);
    assert.match(workflow, /github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/);
    assert.match(workflow, /step31-qa-\$\{\{ github\.sha \}\}/);
    assert.ok(workflow.indexOf('run: npm run test:ci') < workflow.indexOf('run: npm run build:static'),
        'Build must not precede the failing-unit-test gate.');
});
