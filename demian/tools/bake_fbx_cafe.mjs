/** Bake the converted source model once. Requires a local Playwright Chromium. */
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'..');
const {chromium}=await import(process.env.DEMIAN_PLAYWRIGHT_MODULE?pathToFileURL(process.env.DEMIAN_PLAYWRIGHT_MODULE).href:'playwright');
const mime={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{
    try{
        const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(root,`.${path}`);
        if(!file.startsWith(root+'/'))throw new Error('Outside project');
        res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(await readFile(file));
    }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,
    ...(process.env.DEMIAN_BROWSER_EXECUTABLE?{executablePath:process.env.DEMIAN_BROWSER_EXECUTABLE}:{}),
    args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
    const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/tools/fbx/preview.html`);
    await page.waitForFunction(()=>window.sceneReady,null,{timeout:120000});
    const {bounds}=JSON.parse(await readFile(resolve(root,'public/assets/environments/demian-fbx/layout.work.json'),'utf8'));
    const width=1024,height=Math.round(width*(bounds.maxZ-bounds.minZ)/(bounds.maxX-bounds.minX));
    const image=await page.evaluate(({bounds,width,height})=>window.renderTop(bounds,width,height),{bounds,width,height});
    await writeFile(resolve(root,'public/assets/environments/demian-fbx/bake.work.png'),Buffer.from(image.split(',')[1],'base64'));
    console.log(`FBX orthographic bake: ${width} × ${height}`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
