import { resolve, join } from 'node:path';
import { validateReleaseAssets } from './validate_release_assets.mjs';

const root = resolve(import.meta.dirname, '..');
const out = resolve(process.env.DEMIAN_STATIC_RELEASE_DIR ?? join(root, '_site'));
const report = validateReleaseAssets({
    root: out,
    sourceAssets: join(root, 'public/assets'),
    reportPath: join(root, 'docs/mobile-02/release-asset-report.json'),
});
console.log('Mobile-02 static asset validation passed: ' + report.requiredRuntimeFiles +
    ' runtime file references; removed ' + report.removedAssetBytes + ' source bytes.');
