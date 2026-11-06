import { readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..',process.argv[2]??'public/build');
const manifest=JSON.parse(readFileSync(resolve(root,'manifest.json'),'utf8'));
const referenced=new Set(Object.values(manifest).flatMap(entry=>[entry.file,...(entry.css??[])]));
for(const name of readdirSync(resolve(root,'assets'))){
    if(/^app-[\w-]+\.(js|css)$/.test(name)&&!referenced.has(`assets/${name}`))unlinkSync(resolve(root,'assets',name));
}
