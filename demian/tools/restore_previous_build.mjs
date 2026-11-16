import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mergeCompatibleAssets } from './compatible_build_assets.mjs';

const root = resolve(import.meta.dirname, '..');
const token = process.env.GH_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
if (!token || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo ?? '')) {
    throw Error('GitHub repository and actions:read token required on main');
}
const headers = { Accept: 'application/vnd.github+json',
    Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28' };
async function api(path) {
    const response = await fetch('https://api.github.com' + path, { headers });
    if (!response.ok) throw Error('GitHub previous-release API returned HTTP ' + response.status);
    return response.json();
}
async function latestSuccessfulArtifact(name) {
    const list = await api('/repos/' + repo + '/actions/artifacts?name='
        + name + '&per_page=100');
    const rows = (list.artifacts ?? []).filter(row =>
        !row.expired && row.workflow_run?.head_branch === 'main'
        && row.workflow_run.id !== Number(process.env.GITHUB_RUN_ID ?? 0))
        .sort((a, b) => b.id - a.id);
    for (const row of rows) {
        const run = await api('/repos/' + repo + '/actions/runs/' + row.workflow_run.id);
        if (run.status === 'completed' && run.conclusion === 'success'
            && run.head_branch === 'main' && run.name === 'Deploy Demian mobile release') {
            return row;
        }
    }
    return null;
}
function download(row, name, directory) {
    mkdirSync(directory, { recursive: true });
    execFileSync('gh', ['run', 'download', String(row.workflow_run.id), '-R', repo,
        '-n', name, '-D', directory], {
        cwd: root, env: process.env, stdio: 'inherit', timeout: 360000,
    });
}
const archive = join(root, '.release-asset-archive');
const modern = await latestSuccessfulArtifact('demian-build-compat');
if (modern) {
    download(modern, 'demian-build-compat', archive);
    if (!existsSync(join(archive, 'compat.json'))) {
        throw Error('Downloaded compatibility history does not include compat.json');
    }
    console.log('Restored previous versioned chunks from run ' + modern.workflow_run.id);
} else {
    let previous = '';
    try {
        previous = execFileSync('git', ['show', 'HEAD^:demian/vite.config.js'], {
            cwd: resolve(root, '..'), encoding: 'utf8', timeout: 15000,
        });
    } catch {
        throw Error('Cannot verify previous deployment mode; refusing to remove old chunks');
    }
    if (!/codeSplitting:\s*false/.test(previous)) {
        throw Error('Previous release used dynamic chunks but compatibility archive is missing');
    }
    const legacy = await latestSuccessfulArtifact('demiancafe-ir-static-site');
    if (!legacy) throw Error('Initial migration requires the last successful atomic release artifact');
    const stage = mkdtempSync(join(tmpdir(), 'demian-legacy-migration-'));
    try {
        download(legacy, 'demiancafe-ir-static-site', stage);
        const files = readdirSync(stage).filter(name => name.endsWith('.tar.gz'));
        if (files.length !== 1) throw Error('Expected exactly one archived static release');
        const extracted = join(stage, 'extracted');
        mkdirSync(extracted, { recursive: true });
        execFileSync('tar', ['-xzf', join(stage, files[0]), '-C', extracted,
            './build/assets', './offline-packs.json'], { timeout: 240000 });
        const releaseId = JSON.parse(readFileSync(join(extracted, 'offline-packs.json'), 'utf8')).release;
        mergeCompatibleAssets({ release: extracted, releaseId });
        cpSync(join(extracted, 'build/assets'), join(archive, 'assets'), { recursive: true });
        copyFileSync(join(extracted, 'build/compat.json'), join(archive, 'compat.json'));
        console.log('Migrated preceding atomic bundle and hashed assets from run ' + legacy.workflow_run.id);
    } finally {
        rmSync(stage, { recursive: true, force: true });
    }
}
