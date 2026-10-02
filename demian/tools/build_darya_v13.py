#!/usr/bin/env python3
"""MIT. Dense, normalized, single-silhouette Darya animation pack.
No pose dissolves, square stretching, or jump height baked into artwork.
"""
import json
import cv2
import numpy as np
from scipy import ndimage
from PIL import Image
import build_darya_v12 as source_art
from build_darya_v12 import remove_preview_background, crop_strips, MASTER, CHAR_DIR
# True inter-row gutters: the old 153px first strip clipped the shoes.
source_art.STRIPS = ((0,167,8,'turn'), (167,321,8,'idle'), (321,460,8,'walk'),
                    (460,598,8,'run'), (598,744,8,'celebrate'), (744,879,8,'companion'),
                    (879,1024,8,'sleep'))
VERSION = 13
VARIANTS = {'desktop': 192, 'mobile': 128, 'compact': 96}
DIRECTIONS = ('s', 'sw', 'w', 'nw', 'n', 'ne', 'e', 'se')
COLS, ROWS, WORK_CELL = 24, 19, 192

def normalize(pose):
    factor = min(WORK_CELL*.74/pose.height, WORK_CELL*.98/pose.width)
    sprite = pose.resize((round(pose.width*factor), round(pose.height*factor)), Image.Resampling.LANCZOS)
    result = Image.new('RGBA', (WORK_CELL, WORK_CELL))
    result.alpha_composite(sprite, (round((WORK_CELL-sprite.width)/2), round(WORK_CELL*.95-sprite.height)))
    pixels = np.array(result)
    labels, count = ndimage.label(pixels[:, :, 3] > 32)
    sizes = np.bincount(labels.ravel())
    keep = sizes >= max(45, sizes[1:].max() * .006)
    keep[0] = False
    for component, box in enumerate(ndimage.find_objects(labels), start=1):
        if box:
            height, width = box[0].stop-box[0].start, box[1].stop-box[1].start
            if height < 10 and width > height*3:
                keep[component] = False
    pixels[:, :, 3] = np.where(keep[labels], pixels[:, :, 3], 0)
    return pixels

def flow(a, b):
    def grey(image):
        alpha = image[:, :, 3:4]/255
        rgb = (image[:, :, :3]*alpha+240*(1-alpha)).astype(np.uint8)
        return cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    return np.clip(cv2.calcOpticalFlowFarneback(grey(a), grey(b), None, .5, 4, 25, 5, 7, 1.5, 0), -6, 6)

def dense(source, count, loop=True):
    poses = [normalize(p) for p in source]
    pairs = len(poses) if loop else len(poses)-1
    flows = [(flow(poses[i], poses[(i+1)%len(poses)]), flow(poses[(i+1)%len(poses)], poses[i])) for i in range(pairs)]
    gx, gy = np.meshgrid(np.arange(WORK_CELL, dtype=np.float32), np.arange(WORK_CELL, dtype=np.float32))
    output = []
    for i in range(count):
        position = i/(count if loop else max(1,count-1))*pairs
        k = min(pairs-1, int(position)); t = position-k
        a, b = poses[k], poses[(k+1)%len(poses)]
        source_frame, field, weight = (a,flows[k][0],t) if t < .5 else (b,flows[k][1],1-t)
        warped = cv2.remap(source_frame, gx-field[:,:,0]*weight, gy-field[:,:,1]*weight,
            cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0,0,0,0))
        warped[:,:,3][warped[:,:,3] < 28] = 0
        output.append(Image.fromarray(warped))
    return output

def anim(frames, fps, loop=True, **extra):
    return {'frames':list(frames),'fps':fps,'loop':loop,**extra}

def build():
    poses = crop_strips(remove_preview_background(Image.open(MASTER)))
    # One source turn pose omitted Pishi. Repair this deterministic asset at
    # build time using the companion from the adjacent matching side pose.
    side = poses['turn'][5]
    cat = side.crop((round(side.width*.64), round(side.height*.52), side.width, side.height))
    human = poses['turn'][6]
    complete = Image.new('RGBA', (human.width+cat.width+2, max(human.height,cat.height)))
    complete.alpha_composite(human, (0, complete.height-human.height))
    complete.alpha_composite(cat, (human.width+2, complete.height-cat.height))
    poses['turn'][6] = complete
    seq = {'idle':dense(poses['idle'],32), 'walk_e':dense(poses['walk'],48),
        'run_e':dense(poses['run'],64), 'jump_e':dense(poses['run'][2:6],32,False),
        'land_e':dense([poses['turn'][6],poses['turn'][6]],16,False),
        'celebrate':dense(poses['celebrate'],32), 'emote':dense(poses['companion'],32),
        'hop_e':dense(poses['run'][2:6],16,False),
        'turn':[Image.fromarray(normalize(p)) for p in poses['turn']]}
    for key in ('walk','run','jump','land','hop'):
        seq[f'{key}_w'] = [p.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for p in seq[f'{key}_e']]
    names = {key:[f'{key}_{i:03}' for i in range(len(v))] for key,v in seq.items()}
    assert sum(map(len,seq.values())) == COLS*ROWS == 456
    def directional(key,fps,loop=True):
        east,west = names[f'{key}_e'],names[f'{key}_w']
        return anim(east,fps,loop,framesRight=east,framesLeft=west,
            framesByDirection={d:west if 'w' in d else east for d in DIRECTIONS},motion=key)
    idle_map = {d:[names['turn'][i]]*32 for i,d in enumerate(DIRECTIONS)}
    animations = {
        'idle':anim(names['idle'],32,framesByDirection=idle_map),
        'breathe':anim(names['idle'],32),'blink':anim(names['idle'],32),'ready':anim(names['idle'],32),
        'walk':directional('walk',48),'tiptoe':directional('walk',36),
        'run':directional('run',64),'sprint':directional('run',72),
        'jump':directional('jump',60,False),'takeoff':directional('jump',72,False),
        'fall':directional('jump',48),'hover':directional('jump',40),
        'land':directional('land',60,False),'hop':directional('hop',60,False),
        'dash':directional('run',80),'skid':directional('run',48,False),
        'slide':directional('run',48,False),'dodge':directional('hop',60,False),
        'turn':anim(names['turn'],24,False), 'win':anim(names['celebrate'],32),
        'celebrate':anim(names['celebrate'],40),'dance':anim(names['celebrate'],48),
        'wave':anim(names['celebrate'],32),'salute':anim(names['celebrate'],32,False),
        'laugh':anim(names['celebrate'],32),'pose':anim(names['emote'],32),
        'crouch':anim(names['emote'],32),'spin':anim(names['emote'],32),
        'sleep':anim(names['emote'],16),'taunt':anim(names['celebrate'],32),'companion':anim(names['emote'],32)}
    for variant,cell in VARIANTS.items():
        sheet=Image.new('RGBA',(COLS*cell,ROWS*cell));frames={};index=0
        for key,sequence in seq.items():
            for i,pose in enumerate(sequence):
                x,y=index%COLS*cell,index//COLS*cell
                sheet.paste(pose.resize((cell,cell),Image.Resampling.LANCZOS),(x,y))
                frames[names[key][i]]={'x':x,'y':y,'w':cell,'h':cell};index+=1
        atlas={'meta':{'name':'DARYA / دریا','version':VERSION,'variant':variant,
            'image':f'darya-spritesheet-v13-{variant}.png','size':{'w':sheet.width,'h':sheet.height},
            'frameSize':{'w':cell,'h':cell},'grid':{'columns':COLS,'rows':ROWS},
            'generatedFrameCount':len(frames),'animationCount':len(animations),'directions':list(DIRECTIONS),
            'artIntegrity':'valid','sourceVersion':12,'interpolation':'single-source-optical-flow','license':'MIT'},
            'frames':frames,'animations':animations,'fallbacks':{'guitar':'dance','guitar_loop':'dance'},
            'pivot':{'x':.5,'y':.95},'display':{'worldWidth':3.75,'worldHeight':3.75},
            'companion':{'id':'pishi','bakedIntoEveryFrame':True,'alwaysVisible':True,'collisionIndependent':True},
            'motion':{'directionDepthScale':0,'northSouthScale':1,'diagonalScale':1},
            'render':{'referenceBodyHeightRatio':.74,'referenceBodyWidthRatio':.82,
                'preserveAspectRatio':True,'frameBlend':False,'lockBodyScale':True,
                'singleSilhouette':True,'physicsOwnsJumpHeight':True}}
        sheet.save(CHAR_DIR/atlas['meta']['image'],optimize=True)
        (CHAR_DIR/f'darya-atlas-v13-{variant}.json').write_text(json.dumps(atlas,ensure_ascii=False,indent=2)+'\n')
        print(f'Darya V13 {variant}: {len(frames)} frames / {len(animations)} states / {sheet.size}',flush=True)
    manifest_dir=CHAR_DIR/'manifests'
    m=json.loads((manifest_dir/'darya_animation_manifest.json').read_text());m['pack_version']=13
    m['source_atlas']={'pack_version':13,'files':[f'darya-atlas-v13-{v}.json' for v in VARIANTS],'note':'Generated together with V13; 456 packed frames, some semantic states share cycles.'}
    m['grid']={'columns':COLS,'rows':ROWS}
    m['variant_frame_size']={v:{'w':c,'h':c} for v,c in VARIANTS.items()}
    m['states']={name:{'frames':len(a['frames']),'fps':a['fps'],'loop':a['loop']} for name,a in animations.items()}
    (manifest_dir/'darya_animation_manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
    def upgrade(obj):
        if isinstance(obj,dict):return {k:13 if k=='pack_version' else upgrade(v) for k,v in obj.items()}
        if isinstance(obj,list):return [upgrade(v) for v in obj]
        return obj.replace('-v12-','-v13-') if isinstance(obj,str) else obj
    p=manifest_dir/'character_manifest_v4.json';p.write_text(json.dumps(upgrade(json.loads(p.read_text())),ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':build()
