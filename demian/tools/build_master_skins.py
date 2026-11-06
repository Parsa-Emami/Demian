import argparse
import hashlib
import io
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'public/assets/characters'
DIRECTIONS = ('s','sw','w','nw','n','ne','e','se')
VARIANTS = {'lite':128,'runtime':192,'detail':256}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def atomic(path, data):
    path.parent.mkdir(parents=True,exist_ok=True)
    temporary=path.with_name(f'.{path.name}.{os.getpid()}.work')
    with temporary.open('wb') as stream:
        stream.write(data);stream.flush();os.fsync(stream.fileno())
    temporary.replace(path)


def write_json(path,data):
    atomic(path,(json.dumps(data,ensure_ascii=False,indent=2)+'\n').encode())


def source_views(slug):
    directory=BASE/slug/'source-v14'
    layout=json.loads((directory/'layout.json').read_text())
    image=Image.open(directory/'master.png').convert('RGBA');pixels=np.asarray(image)
    labels,count=ndimage.label(pixels[:,:,3]>48)
    sizes=np.bincount(labels.ravel());boxes=ndimage.find_objects(labels)
    expected=(len(layout['mainRowBounds'])-1)*8
    bodies=sorted(range(1,count+1),key=lambda i:sizes[i],reverse=True)[:expected]
    center=lambda i:((boxes[i-1][1].start+boxes[i-1][1].stop)/2,(boxes[i-1][0].start+boxes[i-1][0].stop)/2)
    bodies.sort(key=lambda i:center(i)[1]);selected=sorted(bodies[:8],key=lambda i:center(i)[0])
    views=[]
    for label in selected:
        mask=labels==label
        for other in range(1,count+1):
            if other in bodies or sizes[other]<sizes[label]*.05:continue
            x,y=center(other)
            nearest=min(bodies,key=lambda i:(center(i)[0]-x)**2+2*(center(i)[1]-y)**2)
            if nearest==label:mask|=labels==other
        alpha=np.where(ndimage.binary_dilation(mask,iterations=1),pixels[:,:,3],0).astype('uint8')
        output=image.copy();output.putalpha(Image.fromarray(alpha));views.append(output.crop(output.getbbox()))
    for target,original in layout.get('turnMirrorFrom',{}).items():
        views[DIRECTIONS.index(target)]=views[DIRECTIONS.index(original)].transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    return views


def skin_layers(image,slug,direction):
    pixels=np.array(image);h,w=image.height,image.width;yy,xx=np.mgrid[:h,:w];alpha=pixels[:,:,3]>0
    head=(yy>h*.15)&(yy<h*.34)&alpha;cx=float(np.median(xx[head]))
    r,g,b=[pixels[:,:,i].astype(float) for i in range(3)]
    face=(yy<h*.46)&(yy>h*.18)&alpha&(r>145)&(g>75)&(r>g*1.1)&(g>b*1.02)
    groups,count=ndimage.label(ndimage.binary_closing(face,iterations=2))
    if count and 'n' not in direction:
        sizes=np.bincount(groups.ravel());sizes[0]=0;ys,xs=np.where(groups==sizes.argmax())
        if len(xs)>max(12,h*h*.004):cx=float(np.median(xs[ys>np.quantile(ys,.6)]))
    masks={};layers={};body=pixels.copy()
    if slug=='darya':
        sign=1 if 'n' in direction else -1
        threshold=.145 if direction=='n' else .20 if 'n' in direction else .235
        masks['pishi']=(yy>h*.54)&((xx-cx)*sign>h*threshold)&alpha
        opened=ndimage.binary_opening(masks['pishi'],iterations=max(1,round(h*.008)))
        groups,n=ndimage.label(opened)
        if n:
            sizes=np.bincount(groups.ravel());sizes[0]=0
            ys,xs=np.where(groups==sizes.argmax())
            masks['pishi']&=(xx>=xs.min()-1)&(xx<=xs.max()+1)&(yy>=ys.min()-1)&(yy<=ys.max()+1)
    if slug in ('uzudi','amirreza'):
        wing=(yy>h*.26)&(yy<h*.9)&(abs(xx-cx)>h*.155)&alpha
        if slug=='uzudi':wing&=(b>r*.94)&(g>r*.94)&(np.max(pixels[:,:,:3],axis=2)<135)
        else:
            rgb=pixels[:,:,:3].astype(float)
            pale=(rgb.min(axis=2)>115)&(rgb.max(axis=2)-rgb.min(axis=2)<65)
            wing&=ndimage.binary_dilation(pale,iterations=2)
        masks['wingLeft']=wing&(xx<cx);masks['wingRight']=wing&(xx>=cx)
    if slug=='tiam':
        orange=(r>140)&(r>g*1.5)&(g>b*1.25)&(abs(xx-cx)>h*.08)&(yy>h*.27)&(yy<h*.55)
        groups,count=ndimage.label(ndimage.binary_dilation(orange,iterations=2))
        if count:
            sizes=np.bincount(groups.ravel());sizes[0]=0;ys,xs=np.where(groups==sizes.argmax())
            masks['homayoun']=(xx>=xs.min()-1)&(xx<=xs.max()+1)&(yy>=ys.min()-2)&(yy<=ys.max()+1)&alpha
    def append(name,layer):
        output=Image.fromarray(layer);box=output.getbbox()
        if box:
            layers[name]={'image':output.crop(box),'bounds':[round((box[0]-cx)/h,6),round(1-box[1]/h,6),round((box[2]-box[0])/h,6),round((box[3]-box[1])/h,6)]}
    for name,mask in masks.items():
        layer=pixels.copy();layer[:,:,3]=np.where(mask,pixels[:,:,3],0);append(name,layer);body[:,:,3][mask]=0
    hair=(r>g*1.12)&(r>b*1.45)&(r<190)&(yy<h*.7)&alpha
    groups,count=ndimage.label(ndimage.binary_closing(hair,iterations=max(1,round(h/150))))
    ids=np.unique(groups[(yy<h*.35)&hair]);long_hair=np.isin(groups,ids[ids>0])&(yy>=h*.41)
    for name,mask in {'head':yy<h*.42,'hair':long_hair,'torso':(yy>=h*.48)&(yy<h*.63)&(abs(xx-cx)<h*.055)&~long_hair}.items():
        layer=body.copy();layer[:,:,3]=np.where(mask,layer[:,:,3],0)
        if name=='torso':
            edge=ndimage.distance_transform_edt(layer[:,:,3]>0)
            layer[:,:,3]=(layer[:,:,3]*np.minimum(1,edge/max(2,h*.02))).astype('uint8')
        append(name,layer)
    for name,rect in {'fabricLeg':(-.075,.725,.075,.915),'fabricSleeve':(-.06,.49,.06,.61)}.items():
        x0,y0,x1,y1=rect;box=(max(0,round(cx+x0*h)),round(y0*h),min(w,round(cx+x1*h)),round(y1*h))
        surface=np.array(Image.fromarray(body).crop(box));rgb=surface[:,:,:3].astype(float)
        skin=(rgb[:,:,0]>145)&(rgb[:,:,0]>rgb[:,:,1]*1.13)&(rgb[:,:,1]>rgb[:,:,2]*1.02)
        mask=(surface[:,:,3]>100)&~skin
        if mask.any():
            _,nearest=ndimage.distance_transform_edt(~mask,return_indices=True)
            surface[:,:,:3]=surface[nearest[0],nearest[1],:3];surface[:,:,3]=255
            layers[name]={'image':Image.fromarray(surface),'bounds':[0,0,surface.shape[1]/h,surface.shape[0]/h]}
    for name,sign in [('shoeLeft',-1),('shoeRight',1)]:
        layer=body.copy();mask=(yy>=h*.925)&((xx-cx)*sign>=0)&(abs(xx-cx)<h*.18)
        layer[:,:,3]=np.where(mask,layer[:,:,3],0);append(name,layer)
    return layers


def build(slug):
    views=source_views(slug)
    layers={direction:skin_layers(view,slug,direction)for direction,view in zip(DIRECTIONS,views)}
    companion=None
    if slug=='darya':
        companion=json.loads((ROOT/'resources/game/companion-skins.json').read_text())['pishi']
        front=views[companion['frontView']].copy();back=views[companion['backView']].copy()
        assert list(front.size)==companion['frontSize'] and list(back.size)==companion['backSize']
        mask=Image.new('L',front.size);ImageDraw.Draw(mask).polygon([tuple(p) for p in companion['frontPolygon']],fill=255)
        array=np.array(front);array[:,:,3]=np.minimum(array[:,:,3],np.asarray(mask));front=Image.fromarray(array);front=front.crop(front.getbbox())
        back=back.crop(tuple(companion['backRect']));back=back.crop(back.getbbox())
        for direction,source in companion['directionSources'].items():
            image=(back if source=='back' else front).copy()
            if source.endswith('mirrored'):image=image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            height=companion['bodyHeight'];width=height*image.width/image.height
            layers[direction]['pishi']={'image':image,'bounds':[-width/2,height,width,height]}
    actions={}
    if slug=='negar':
        atlas=json.loads((BASE/slug/f'{slug}-atlas-v14-desktop.json').read_text());sheet=Image.open(BASE/slug/f'{slug}-spritesheet-v14-desktop.png').convert('RGBA')
        names=atlas['animations']['smile_bloom']['frames'];ratio=atlas['render']['referenceBodyHeightRatio'];pivot=atlas['pivot'];actions['smile_bloom']=[]
        for i in range(16):
            key=f'authored_smile_{i:02d}';f=atlas['frames'][names[round(i*(len(names)-1)/15)]]
            layers['e'][key]={'image':sheet.crop((f['x'],f['y'],f['x']+f['w'],f['y']+f['h'])),'bounds':[-pivot['x']/ratio,pivot['y']/ratio,1/ratio,1/ratio]};actions['smile_bloom'].append(key)
    directory=BASE/'master-skins-v2'/slug
    for variant,height in VARIANTS.items():
        width=512 if height<256 else 768;x,y,row=2,2,0;packed=[]
        for direction,parts in layers.items():
            for name,part in parts.items():
                raster=min(height,112)if name.startswith('authored_')else height
                size=(max(1,round(part['bounds'][2]*raster)),max(1,round(part['bounds'][3]*raster)))
                image=part['image'].resize(size,Image.Resampling.LANCZOS)
                if x+image.width+2>width:x,y,row=2,y+row+4,0
                packed.append((direction,name,part,image,x,y));x+=image.width+4;row=max(row,image.height)
        sheet=Image.new('RGBA',(width,y+row+2));data={'version':'master-skin-v2','slug':slug,'variant':variant,'sourceSha256':digest(BASE/slug/'source-v14/master.png'),'identitySha256':digest(BASE/slug/f'manifests/{slug}_identity_contract.json'),'sourceDirections':list(DIRECTIONS),'authoredActions':actions,'views':{d:{}for d in DIRECTIONS}}
        for direction,name,part,image,x,y in packed:
            sheet.alpha_composite(image,(x,y));data['views'][direction][name]={'bounds':part['bounds'],'frame':[x,y,image.width,image.height]}
        if companion:data['companionSourceSha256']=digest(ROOT/'resources/game/companion-skins.json');data['companionDirections']=companion['directionSources']
        buffer=io.BytesIO();sheet.save(buffer,format='PNG',optimize=True);path=directory/f'{variant}.png';atomic(path,buffer.getvalue())
        data.update(image=path.name,imageSha256=digest(path),size=list(sheet.size),decodedBytes=sheet.width*sheet.height*4);write_json(directory/f'{variant}.json',data)
    print(f'{slug}: master-skin-v2 / eight authored views')


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--characters',nargs='+');args=parser.parse_args();contract=json.loads((ROOT/'resources/game/character-motion.json').read_text())
    for entry in contract['characters']:
        if not args.characters or entry['slug']in args.characters:build(entry['slug'])
    inventory=[]
    for entry in contract['characters']:
        variants={}
        for variant in VARIANTS:
            path=BASE/'master-skins-v2'/entry['slug']/f'{variant}.json';data=json.loads(path.read_text())
            variants[variant]={'descriptor':f"{entry['slug']}/{variant}.json",'sha256':digest(path),'imageSha256':data['imageSha256'],'decodedBytes':data['decodedBytes']}
        inventory.append({'slug':entry['slug'],'family':entry['family'],'variants':variants})
    write_json(BASE/'master-skins-v2/manifest.json',{'version':'master-skin-v2','rigVersion':contract['rigVersion'],'wardrobeSourceSha256':digest(ROOT/'resources/game/character-skins.json'),'characters':inventory})


if __name__=='__main__':main()
