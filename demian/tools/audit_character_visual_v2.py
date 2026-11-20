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
CONTRACT = json.loads((ROOT / 'resources/game/character-visual-standard-v2.json').read_text())
MOTION = json.loads((ROOT / 'resources/game/character-motion.json').read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def portrait_box(m):
    c = CONTRACT['portrait']
    ex, ey, chin, left, top, right = m
    size = math.ceil(max(c['minCrop'], (chin-ey)/c['eyeToChin'],
                         (ey-top)/(c['eyeY']-c['safeInset']),
                         (ex-left)/(c['eyeX']-c['safeInset']),
                         (right-ex)/(1-c['eyeX']-c['safeInset'])))
    x = math.floor(ex-size*c['eyeX']+.5)
    y = math.floor(ey-size*c['eyeY']+.5)
    assert 0 <= x <= x+size <= c['referenceSize'] and 0 <= y <= y+size <= c['referenceSize']
    assert x <= left <= right <= x+size and y <= top <= chin <= y+size
    return x, y, x+size, y+size


def frame_crop(atlas, sheet, name):
    f = atlas['frames'][name]
    x, y, w, h = (f[k] for k in ('x','y','w','h'))
    assert x >= 0 and y >= 0 and x+w <= sheet.width and y+h <= sheet.height and w == h
    return sheet.crop((x,y,x+w,y+h))


def measure(image):
    alpha = image.getchannel('A')
    box = alpha.point(lambda v: 255 if v > 32 else 0).getbbox()
    assert box is not None
    x, y, right, bottom = box
    assert x > 0 and y > 0 and right < image.width and bottom < image.height
    px = list(image.getdata())
    opaque = sum(a >= 224 for _,_,_,a in px)
    edge = sum(32 < a < 224 for _,_,_,a in px)
    dark = sum(a >= 224 and max(r,g,b) <= 72 for r,g,b,a in px)
    return {'height': (bottom-y)/image.height, 'width': (right-x)/image.width,
            'foot': bottom/image.height, 'semi_alpha': edge/max(1,opaque+edge),
            'dark_pixel_share': dark/max(1,opaque)}


def average(rows):
    return {k: round(median([r[k] for r in rows]), 5) for k in rows[0]}


def composite(canvas, img, x, y, size):
    img = img.resize((size,size), Image.Resampling.NEAREST)
    canvas.alpha_composite(img, (x,y))


def audit(out):
    out.mkdir(parents=True, exist_ok=True)
    policy = CONTRACT['atlas']
    roster = {c['slug']:c for c in MOTION['characters']}
    assert set(roster) == set(CONTRACT['characters'])
    assert CONTRACT['canonicalRig'] == MOTION['skeleton']
    official = json.loads((ASSETS / 'character-manifest-v4.json').read_text())
    assert set(roster) == {c['slug'] for c in official['characters']}
    records = {}
    portraits = {}
    sampled = {}
    for slug, rule in CONTRACT['characters'].items():
        assert rule['family'] == roster[slug]['family']
        assert rule['accessories'] == [a['kind'] for a in roster[slug]['accessories']]
        d = ASSETS / slug
        source = d / f'{slug}-preview-v14.png'
        identity = d / 'manifests' / f'{slug}_identity_contract.json'
        with Image.open(source) as original:
            poster = original.convert('RGBA')
        assert poster.size == (224,224) and poster.getchannel('A').getextrema()[0] == 0
        box = portrait_box(rule['landmarks'])
        cropped = poster.crop(box)
        assert cropped.getchannel('A').getbbox()
        portraits[slug] = (poster, cropped)
        atlas_path = d / f'{slug}-atlas-v14-mobile.json'
        atlas = json.loads(atlas_path.read_text())
        img_path = d / atlas['meta']['image']
        assert atlas['meta']['imageRevision'] == digest(img_path)
        assert atlas['pivot'] == policy['pivot']
        assert atlas['display']['worldHeight'] == atlas['display']['worldWidth'] == policy['worldSize']
        assert atlas['render']['lockBodyScale'] and not atlas['render']['frameBlend']
        assert set(policy['requiredStates']) <= set(atlas['animations'])
        with Image.open(img_path) as original:
            image = original.convert('RGBA')
        clips = {}
        sampled[slug] = {}
        for state in policy['sampleStates']:
            names = atlas['animations'][state]['frames']
            assert names
            unique = list(dict.fromkeys(names))
            frames = [frame_crop(atlas,image,name) for name in unique]
            clips[state] = {'frames': len(names), 'unique': len(unique),
                            **average([measure(frame) for frame in frames])}
            sampled[slug][state] = frames[len(frames)//2]
        ex, ey, chin, left, top, right = rule['landmarks']
        records[slug] = {'family': rule['family'], 'reference': CONTRACT['families'][rule['family']]['reference'],
                         'identity_sha256': digest(identity), 'poster_sha256': digest(source),
                         'mobile_atlas_sha256': digest(atlas_path), 'mobile_raster_sha256': digest(img_path),
                         'portrait_crop': box, 'eye_chin_ratio': round((chin-ey)/(box[2]-box[0]),5),
                         'portrait_head_width_ratio': round((right-left)/224,5),
                         'body_reference_ratio': atlas['render']['referenceBodyHeightRatio'],
                         'clips': clips, 'review_flags': [],
                         'manual_gate': 'pending_art_review'}
    for slug, record in records.items():
        base = records[record['reference']]
        thresholds = CONTRACT['reviewThresholds']
        def flag(code, value, threshold):
            if abs(value) > threshold:
                record['review_flags'].append({'code':code, 'delta':round(value,5), 'tolerance':threshold})
        flag('standing_silhouette_height', record['clips']['idle']['height']-base['clips']['idle']['height'], thresholds['standingHeightDelta'])
        flag('portrait_head_width_proxy', record['portrait_head_width_ratio']/base['portrait_head_width_ratio']-1, thresholds['headWidthRatioDelta'])
        for state in ('walk','run','jump','land','slide','crouch'):
            v = record['clips'][state]['height']/record['clips']['idle']['height']
            target = base['clips'][state]['height']/base['clips']['idle']['height']
            flag(state+'_silhouette_ratio',v-target,thresholds['gaitHeightRatioDelta'])
    for family, info in CONTRACT['families'].items():
        slugs = [info['reference']] + [s for s,r in records.items() if r['family'] == family and s != info['reference']]
        states = policy['sampleStates']
        size, label, width = 112, 34, (2+len(states))*124
        canvas = Image.new('RGBA',(width,45+len(slugs)*(size+label)),(231,228,221,255))
        draw = ImageDraw.Draw(canvas)
        for column, name in enumerate(['poster','crop-v2',*states]):
            draw.text((column*124+6,10),name,fill='#212529')
        for row, slug in enumerate(slugs):
            y = 40+row*(size+label)
            draw.text((6,y),slug + (' (reference)' if slug == info['reference'] else ''),fill='#212529')
            for col, img in enumerate([*portraits[slug],*[sampled[slug][s] for s in states]]):
                composite(canvas,img,col*124+6,y+22,size)
        canvas.convert('RGB').save(out / (family+'.png'),optimize=True)
    report = {'schema':2,'standard':CONTRACT['version'],'automated_checks':'passed',
              'manual_art_acceptance':'pending','physical_device_verified':False,
              'roster_count':len(records),'characters':records,
              'limits':['Alpha silhouettes include costume/hair/accessories: not anatomical landmark measurements.',
                        'Dark-pixel share and semi-alpha are diagnostics, not outline thickness or pixel-art certification.',
                        'Hands, feet, head/body and line weight require visual comparison and authored correction.']}
    (out / 'character-visual-v2.json').write_text(json.dumps(report,indent=2)+'\n')
    print(f"V2 raster audit: {len(records)} characters; {sum(bool(r['review_flags']) for r in records.values())} flagged for review; manual acceptance pending")


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,default=ROOT/'docs/character-standards/v2-generated')
    audit(parser.parse_args().output)
