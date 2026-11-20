#!/usr/bin/env python3
import argparse
import hashlib
import json
import math
from pathlib import Path
from statistics import median
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public/assets/characters'
STANDARD = json.loads((ROOT/'resources/game/sprite-animation-standard-v2.json').read_text())
VISUAL = json.loads((ROOT/'resources/game/character-visual-standard-v2.json').read_text())


def rectangle(frame):
    return tuple(frame[k] for k in ('x','y','w','h'))


def bounds(sheet, rect):
    x,y,w,h = rect
    assert w == h and 0 <= x <= sheet.width-w and 0 <= y <= sheet.height-h
    box = sheet.crop((x,y,x+w,y+h)).getchannel('A').point(lambda a:255 if a>32 else 0).getbbox()
    assert box and box[0]>0 and box[1]>0 and box[2]<w and box[3]<h
    return ((box[3]-box[1])/h, box[3]/h, (box[0]+box[2])/(2*w))


def deltas(values, loop):
    pairs = list(zip(values,values[1:]))
    if loop and len(values)>1:
        pairs.append((values[-1],values[0]))
    return [round(max((abs(a[i]-b[i]) for a,b in pairs),default=0),5) for i in range(3)]


def sheet_for(slug, atlas, image, out):
    names = list(atlas['frames'])
    size, stride, columns = 64, 68, 24
    canvas = Image.new('RGB',(columns*stride, math.ceil(len(names)/columns)*stride+30),(233,230,222))
    draw = ImageDraw.Draw(canvas)
    draw.text((6,6),f'{slug} / all {len(names)} logical mobile frames (native identity)',fill='#23272a')
    for i,name in enumerate(names):
        x,y,w,h = rectangle(atlas['frames'][name])
        pose=image.crop((x,y,x+w,y+h)).resize((size,size),Image.Resampling.NEAREST)
        canvas.paste(pose,(i%columns*stride+2,i//columns*stride+27),pose)
    canvas.save(out/(slug+'-all-frames.png'), optimize=True)


def audit(out):
    out.mkdir(parents=True,exist_ok=True)
    records={}
    failures=[]
    for slug, char in VISUAL['characters'].items():
        records[slug]={'family':char['family'],'reference':STANDARD['families'][char['family']],
                       'variants':{},'authored_crawl':False,'manual_acceptance':'pending'}
        folder=ASSETS/slug
        canonical=None
        for variant in STANDARD['variants']:
            try:
                atlas=json.loads((folder/f'{slug}-atlas-v14-{variant}.json').read_text())
                image_path=folder/atlas['meta']['image']
                assert hashlib.sha256(image_path.read_bytes()).hexdigest()==atlas['meta']['imageRevision']
                assert atlas['pivot']==STANDARD['pivot']
                assert len(atlas['frames'])==STANDARD['logicalFrames']
                assert atlas['render']['lockBodyScale'] and not atlas['render']['frameBlend']
                profile=atlas['motion']['locomotionProfile']
                assert profile['strideLengths']==STANDARD['strideLengths']
                assert profile['maxStrideHz']==STANDARD['maxStrideHz'] and profile['landingSeconds']==STANDARD['landingSeconds']
                assert profile['phaseDriver']=='travelled-distance'
                if canonical is None: canonical=atlas['animations']
                else: assert atlas['animations']==canonical, 'logical clips differ by atlas resolution'
                with Image.open(image_path) as img:
                    image=img.convert('RGBA')
                assert image.size==(atlas['meta']['size']['w'],atlas['meta']['size']['h'])
                geometry={}
                cache={}
                for name, frame in atlas['frames'].items():
                    rect=rectangle(frame)
                    if rect not in cache: cache[rect]=bounds(image,rect)
                    geometry[name]=cache[rect]
                clips={}
                flags=[]
                for state, rule in STANDARD['states'].items():
                    clip=atlas['animations'][state]
                    frames=clip['frames']
                    assert len(frames)==rule['frames'] and clip['fps']==rule['fps'] and clip['loop']==rule['loop'], state
                    if 'cycles' in rule: assert clip['cycleCount'] in rule['cycles']
                    if 'jumpRange' in rule:
                        start,end=rule['jumpRange']
                        assert frames==[f'jump_e_{i:03}' for i in range(start,end)], state
                        assert clip['framesLeft']==[f'jump_w_{i:03}' for i in range(start,end)], state
                    directions=clip.get('framesByDirection',{})
                    assert all(len(seq)==len(frames) and all(n in geometry for n in seq) for seq in directions.values())
                    allseq=[frames,*directions.values(),clip.get('framesLeft',frames),clip.get('framesRight',frames)]
                    worst=[0,0,0]
                    for seq in allseq:
                        d=deltas([geometry[n] for n in seq],rule['loop'])
                        worst=[max(a,b) for a,b in zip(worst,d)]
                    clips[state]={'frame_count':len(frames),'unique_cells':len({rectangle(atlas['frames'][n]) for n in frames}),
                                  'fps':rule['fps'],'cycles':clip.get('cycleCount'),
                                  'median_height':round(median([geometry[n][0] for n in frames]),5),
                                  'max_adjacent_height_delta':worst[0],'max_adjacent_foot_delta':worst[1],
                                  'max_adjacent_center_delta':worst[2]}
                    limits=STANDARD['review']
                    for code,value,threshold in zip(('height','foot','center'),worst,
                         (limits['maxAdjacentHeightDelta'],limits['maxAdjacentFootDelta'],limits['maxAdjacentCenterDelta'])):
                        if value>threshold:
                            flags.append({'state':state,'kind':code,'value':value,'threshold':threshold})
                assert not set(atlas['animations']['slide']['frames']) & set(atlas['animations']['run']['frames'])
                assert atlas['animations']['crouch']['frames'][0] in atlas['animations']['slide']['frames']
                if 'dodge' in atlas['animations']:
                    assert atlas['animations']['dodge']['frames']==atlas['animations']['slide']['frames']
                records[slug]['variants'][variant]={'logical_frames':len(geometry),'physical_cells':len(cache),
                    'raster_sha256':atlas['meta']['imageRevision'],'clips':clips,'review_flags':flags}
                if variant=='mobile': sheet_for(slug,atlas,image,out)
            except Exception as error:
                failures.append({'slug':slug,'variant':variant,'reason':str(error) or type(error).__name__})
        records[slug]['family_flags']=[]
    for slug, record in records.items():
        reference=records[record['reference']]
        if 'mobile' not in record['variants'] or 'mobile' not in reference['variants']: continue
        for state in ('walk','run','jump','land','slide'):
            c=record['variants']['mobile']['clips']
            r=reference['variants']['mobile']['clips']
            delta=c[state]['median_height']/c['idle']['median_height']-r[state]['median_height']/r['idle']['median_height']
            if abs(delta)>STANDARD['review']['referenceHeightRatioDelta']:
                record['family_flags'].append({'state':state,'height_ratio_delta':round(delta,5)})
    report={'standard':STANDARD['version'],'status':'failed' if failures else 'passed',
            'roster_count':len(records),'variant_count':sum(len(r['variants']) for r in records.values()),
            'logical_frame_count':sum(v['logical_frames'] for r in records.values() for v in r['variants'].values()),
            'authored_crawl_available':False,
            'manual_art_acceptance':'pending','physical_device_verified':False,
            'failures':failures,'characters':records}
    (out/'animation-v2-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(f"Animation V2: {report['variant_count']} variants, {report['logical_frame_count']} logical frames, {len(failures)} hard failures; artistic review pending")
    if failures: raise SystemExit(1)


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,default=ROOT/'docs/character-standards/v2-animation-generated')
    audit(parser.parse_args().output)
