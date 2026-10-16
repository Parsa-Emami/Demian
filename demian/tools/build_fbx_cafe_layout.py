#!/usr/bin/env python3
"""Derive floor and solid footprints from the very same converted FBX triangles."""
import json,math
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
from scipy import ndimage

OUT=Path('public/assets/environments/demian-fbx')
data=np.load(OUT/'geometry.work.npz');vertices=data['vertices'];triangles=data['triangles'];overhead=data['overhead']
# Quantize only physics, at 9 cm per cell; rendering retains source precision.
CELL=.36;PIXEL=.12
b={'minX':-20.16,'maxX':20.16,'minZ':-174.24,'maxZ':14.04}
W=round((b['maxX']-b['minX'])/PIXEL);H=round((b['maxZ']-b['minZ'])/PIXEL)
floor=Image.new('1',(W,H));solid=Image.new('1',(W,H));fd=ImageDraw.Draw(floor);sd=ImageDraw.Draw(solid)
def points(poly):return [((float(p[0])-b['minX'])/PIXEL,(float(p[2])-b['minZ'])/PIXEL) for p in poly]
def clip(poly,height,above):
    result=[]
    for a,c in zip(poly,np.roll(poly,-1,axis=0)):
        insideA=a[1]>=height if above else a[1]<=height
        insideC=c[1]>=height if above else c[1]<=height
        if insideA:result.append(a)
        if insideA!=insideC:result.append(a+(c-a)*((height-a[1])/(c[1]-a[1])))
    return np.array(result)
for i,t in enumerate(triangles):
    if overhead[i]:continue
    p=vertices[t];low,high=p[:,1].min(),p[:,1].max()
    if high<.60 and low>-.65 and np.ptp(p[:,1])<.16:
        a=p[1,[0,2]]-p[0,[0,2]];c=p[2,[0,2]]-p[0,[0,2]];area=abs(a[0]*c[1]-a[1]*c[0])
        if area>.002:fd.polygon(points(p),fill=1)
    if high<.60 or low>6.8:continue
    poly=clip(p,.60,True)
    if len(poly)>1:poly=clip(poly,6.8,False)
    if len(poly)>1:
        pts=points(poly)
        if len(poly)>2:sd.polygon(pts,fill=1)
        sd.line(pts+[pts[0]],fill=1,width=1)
# Close sub-texel seams in source meshes without filling apertures.
floor=np.array(floor,dtype=bool);solid=np.array(solid,dtype=bool)
floor=ndimage.binary_closing(floor,iterations=2)
solid=ndimage.binary_closing(solid,iterations=1)
ratio=round(CELL/PIXEL);cols=W//ratio;rows=H//ratio
floor=floor[:rows*ratio,:cols*ratio];solid=solid[:rows*ratio,:cols*ratio]
# Require most of a cell to have actual floor; any substantial solid blocks it.
floorGrid=floor.reshape(rows,ratio,cols,ratio).mean((1,3))>=.45
solidGrid=solid.reshape(rows,ratio,cols,ratio).any((1,3))
blocked=(~floorGrid)|solidGrid
# Greedy vertical coalescing keeps the immutable collision set compact.
rects=[];active={}
for z in range(rows+1):
    runs=[]
    if z<rows:
        row=blocked[z];edges=np.diff(np.r_[False,row,False].astype(int));runs=list(zip(np.flatnonzero(edges==1),np.flatnonzero(edges==-1)))
    current=set(runs)
    for span,start in list(active.items()):
        if span not in current:rects.append((*span,start,z));del active[span]
    for span in runs:active.setdefault(span,z)
colliders=[]
for i,(x0,x1,z0,z1) in enumerate(rects):
    colliders.append({'id':f'fbx-solid-{i}','kind':'wall' if (x1-x0>3*(z1-z0) or z1-z0>3*(x1-x0)) else 'fixture',
      'position':{'x':round(b['minX']+(x0+x1)*CELL/2,5),'z':round(b['minZ']+(z0+z1)*CELL/2,5)},
      'halfExtents':{'x':round((x1-x0)*CELL/2,5),'z':round((z1-z0)*CELL/2,5)},'height':6.8})
# Diagnostic: gray floor, solid furniture/walls, black exterior.
color=np.zeros((rows,cols,3),dtype='uint8');color[floorGrid]=[216,207,186];color[solidGrid]=[71,80,73]
Image.fromarray(color).resize((cols*5,rows*5)).save(OUT/'physics.work.png')
layout={'bounds':b,'cellSize':CELL,'columns':cols,'rows':rows,'colliders':colliders,'walkableCells':int((~blocked).sum()),
 'sourceTriangleCount':len(triangles),'floorRows':[''.join('1' if p else '0' for p in row) for row in floorGrid]}
(OUT/'layout.work.json').write_text(json.dumps(layout,separators=(',',':')))
print(json.dumps({k:v for k,v in layout.items() if k not in ['colliders','floorRows']},indent=2));print('colliders',len(colliders))

report=json.loads((OUT/'import-report.json').read_text())
module={'sourceSha256':report['sha256'],'assetVersion':'fbx-2026-10-16-v1','bounds':b,'cellSize':CELL,'columns':cols,'rows':rows,'colliders':colliders,'floorRows':layout['floorRows'],'modelCounts':report['counts']}
Path('resources/js/game/shared/cafe/FbxCafeData.js').write_text('// Generated from the supplied FBX. Rebuild with tools/build_fbx_cafe_layout.py.\nexport default '+json.dumps(module,separators=(',',':'))+';\n')
