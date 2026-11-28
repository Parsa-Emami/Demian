#!/usr/bin/env python3
import argparse
import hashlib
import json
from pathlib import Path
from statistics import median
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public/assets/characters'
STANDARD = json.loads((ROOT/'resources/game/character-animation-standard-v2.json').read_text())
VISUAL = json.loads((ROOT/'resources/game/character-visual-standard-v2.json').read_text())
ALPHA_LUT = [0]*33 + [255]*223


def read(path):
    return json.loads(path.read_text())


def geometry(atlas, image):
    boxes, physical = {}, {}
    for name, f in atlas['frames'].items():
        key = tuple(f[k] for k in ('x','y','w','h'))
        if key not in physical:
            x,y,w,h = key
            assert 0 <= x < x+w <= image.width and 0 <= y < y+h <= image.height and w == h
            box = image.crop((x,y,x+w,y+h)).getchannel('A').point(ALPHA_LUT).getbbox()
            assert box and box[0] > 0 and box[1] > 0 and box[2] < w and box[3] < h, name
            physical[key] = [v/w for v in box]
        boxes[name] = physical[key]
    return boxes,len(physical)


def delta(a,b):
    return (abs((a[3]-a[1])-(b[3]-b[1])),
            abs((a[0]+a[2]-b[0]-b[2])/2))


def standing_height_ratios(atlas, boxes):
    def height(frame):
        return boxes[frame][3] - boxes[frame][1]

    idle = atlas['animations']['idle']
    side_idle = atlas.get('sideViewAnimations', atlas['animations'])['idle']
    side_frames = dict.fromkeys(frame for direction in ('e', 'w')
                                for frame in side_idle['framesByDirection'][direction])
    return {
        'world': median(height(sequence[0]) for sequence in idle['framesByDirection'].values()),
        'sideView': median(height(frame) for frame in side_frames),
    }


def audit(output):
    output.mkdir(parents=True,exist_ok=True)
    report = {'schema':2,'version':STANDARD['version'],'status':'pending',
              'art_review':'pending','source_redraw_verified':False,'characters':[]}
    roster = read(ASSETS/'character-manifest-v4.json')['characters']
    assert {c['slug'] for c in roster} == set(VISUAL['characters'])
    shipped = {c['slug']: c['pack_version'] for c in roster}
    for family in VISUAL['families'].values():
        assert shipped[family['reference']] == family['referencePackVersion']
    for character in roster:
        slug, version = character['slug'], character['pack_version']
        definition = VISUAL['characters'][slug]
        directory = ASSETS/slug
        base = read(directory/f'{slug}-atlas-v{version}-mobile.json')
        revision = base['meta'].get('motionRevision', str(version))
        pack = STANDARD['packs'][revision]
        row = {'slug':slug,'pack_version':version,'reference':VISUAL['families'][definition['family']]['reference'],
               'variants':[]}
        for variant in STANDARD['variants']:
            atlas = read(directory/f'{slug}-atlas-v{version}-{variant}.json')
            assert atlas['meta'].get('motionRevision', str(version)) == revision
            assert atlas['animations'] == base['animations'], f'{slug}/{variant}: animation variants diverge'
            assert atlas.get('sideViewAnimations') == base.get('sideViewAnimations')
            assert len(atlas['frames']) == atlas['meta']['generatedFrameCount'] == pack['logicalFrames']
            assert atlas['pivot'] == VISUAL['atlas']['pivot']
            assert atlas['render']['lockBodyScale'] and not atlas['render']['frameBlend']
            assert atlas['render']['physicsOwnsJumpHeight']
            profile = atlas['motion']['locomotionProfile']
            assert profile == base['motion']['locomotionProfile']
            assert profile['phaseDriver'] == 'travelled-distance'
            p = directory/atlas['meta']['image']
            assert hashlib.sha256(p.read_bytes()).hexdigest() == atlas['meta']['imageRevision']
            with Image.open(p) as img:
                image = img.convert('RGBA')
            boxes, physical = geometry(atlas,image)
            standing = standing_height_ratios(atlas, boxes)
            for view, height in standing.items():
                calibrated = definition['standingHeightRatios'][view]
                assert abs(height / calibrated - 1) <= .035, (slug, variant, view, height, calibrated)
            for side in atlas.get('sideViewAnimations', {}).values():
                assert all(frame in boxes for direction in ('frames', 'framesLeft', 'framesRight')
                           for frame in side.get(direction, []))
            states = {}
            for state,spec in pack['clips'].items():
                anim = atlas['animations'][state]
                assert (len(anim['frames']), anim['fps'], anim['loop']) == (spec['frames'],spec['fps'],spec['loop']), (slug,variant,state)
                if 'range' in spec:
                    a,b = spec['range']
                    assert anim['frames'] == [f'jump_e_{i:03}' for i in range(a,b)]
                    assert anim['framesLeft'] == [f'jump_w_{i:03}' for i in range(a,b)]
                if state in ('walk','run','sprint'):
                    assert anim['cycleCount'] in (1,2)
                names = anim['frames']
                assert set(anim['framesByDirection']) == set(STANDARD['directions'])
                routes = {**anim.get('framesByDirection',{}),'default':names}
                heights,centers,feet = [],[],[]
                jumps = []
                for direction, seq in routes.items():
                    assert len(seq) == spec['frames'] and all(f in boxes for f in seq), (slug,variant,state,direction)
                    pairs = list(zip(seq,seq[1:]))
                    if spec['loop']:
                        pairs.append((seq[-1],seq[0]))
                    for a,b in pairs:
                        h,c = delta(boxes[a],boxes[b])
                        heights.append(h); centers.append(c)
                        if h > STANDARD['frameReview']['maxAdjacentHeightChangeRatio'] or c > STANDARD['frameReview']['maxAdjacentCenterChangeRatio']:
                            jumps.append([direction,a,b,round(h,5),round(c,5)])
                    if state in ('idle','walk','run','sprint','slide','crouch'):
                        feet.extend(abs(boxes[f][3]-atlas['pivot']['y']) for f in seq)
                states[state] = {'logical_frames':len(names),'physical_frames':len({tuple(atlas['frames'][f].values()) for f in names}),
                                 'max_adjacent_height_delta':round(max(heights,default=0),5),
                                 'max_adjacent_center_delta':round(max(centers,default=0),5),
                                 'max_foot_delta':round(max(feet,default=0),5),
                                 'transition_review_count':len(jumps),'transition_review_examples':jumps[:8],
                                 'foot_review':max(feet,default=0)>STANDARD['frameReview']['maxFootDriftRatio']}
            row['variants'].append({'variant':variant,'logical_frames':len(boxes),'physical_frames':physical,
                                    'standingHeightRatios': standing, 'states':states})
        report['characters'].append(row)
        print(slug, f"{len(STANDARD['variants'])} variants / {len(STANDARD['variants'])*pack['logicalFrames']} logical frames audited",flush=True)
    report['status']='passed'
    report['logical_frame_checks']=sum(v['logical_frames'] for r in report['characters'] for v in r['variants'])
    report['limits']=['Raster silhouettes include costumes and pets.',
                      'Threshold exceedances require human review, not image warping.',
                      'Crawl is a static crouch fallback; dodge shares the real slide frames.',
                      'Original authored source pixels are unchanged.']
    (output/'animation-v2.json').write_text(json.dumps(report,indent=2)+'\n')
    print('Unified animation V2:',report['logical_frame_checks'],'logical frame checks; manual art gate pending.')


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,default=ROOT/'docs/character-standards/animation-v2-generated')
    audit(parser.parse_args().output)
