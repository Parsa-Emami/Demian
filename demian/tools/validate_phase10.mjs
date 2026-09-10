import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..'); const required=['resources/js/game/network/ClientPrediction.js','resources/js/game/network/SessionReplication.js','resources/js/game/security/ReplayIntegrity.js','resources/js/game/observability/TelemetryUploader.js','tests/js/phase10/ProductionRuntime.test.js','PHASE10-MANIFEST.json'];
const errors=[]; for(const file of required)if(!existsSync(resolve(root,file)))errors.push(`Missing ${file}`);
for(const file of required.filter(f=>f.endsWith('.js'))) { const s=readFileSync(resolve(root,file),'utf8'); if(/TODO|FIXME|debugger|console\.log/.test(s))errors.push(`Debug marker in ${file}`); }
if(errors.length){console.error(errors.join('\n'));process.exit(1)} console.log('Phase 10 source validation passed: production runtime hardening modules and tests present.');
