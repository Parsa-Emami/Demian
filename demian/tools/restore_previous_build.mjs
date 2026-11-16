import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const token = process.env.GH_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const artifactName = 'demian-build-compat';
if (!token || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo ?? '')) {
    throw Error('GitHub repository and actions:read token are required for main deployment');
}
const headers = { Accept: 'application/vnd.github+json',
    Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28' };
async function api(path) {
    const response = await fetch('https://api.github.com' + path, { headers });
    if (!response.ok) throw Error('GitHub previous-release API returned HTTP ' + response.status);
    return response.json();
}
const target = resolve(root, '.release-asset-archive');
const list = await api('/repos/' + repo + '/actions/artifacts?name='
    + artifactName + '&per_page=100');
const choices = (list.artifacts ?? []).filter(row =>
    !row.expired && row.workflow_run?.head_branch === 'main'
    && row.workflow_run.id !== Number(process.env.GITHUB_RUN_ID ?? 0))
    .sort((a, b) => b.id - a.id);
let chosen = null;
for (const row of choices) {
    const run = await api('/repos/' + repo + '/actions/runs/' + row.workflow_run.id);
    if (run.status === 'completed' && run.conclusion === 'success'
        && run.head_branch === 'main' && run.name === 'Deploy Demian mobile release') {
        chosen = row;
        break;
    }
}
if (chosen) {
    mkdirSync(target, { recursive: true });
    execFileSync('gh', ['run', 'download', String(chosen.workflow_run.id), '-R', repo,
        '-n', artifactName, '-D', target], {
        cwd: root, env: process.env, stdio: 'inherit', timeout: 120000,
    });
    console.log('Preserved compatible assets from successful run ' + chosen.workflow_run.id);
} else {
    let previous = '';
    try {
        previous = execFileSync('git', ['show', 'HEAD^:demian/vite.config.js'],
            { cwd: resolve(root, '..'), encoding: 'utf8', timeout: 15000 });
    } catch {
        throw Error('Cannot verify previous deployment mode. Refusing to drop old chunks.');
    }
    if (!/codeSplitting:\s*false/.test(previous)) {
        throw Error('Previous version used code splitting but its compatibility archive is missing');
    }
    console.log('First migration from atomic bundle; no historical chunk archive is needed.');
}
