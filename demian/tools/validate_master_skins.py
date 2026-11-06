import hashlib
import json
from pathlib import Path
from PIL import Image

root=Path(__file__).resolve().parents[1];base=root/'public/assets/characters'
contract=json.loads((root/'resources/game/character-motion.json').read_text());inventory=json.loads((base/'master-skins-v2/manifest.json').read_text())
assert inventory['wardrobeSourceSha256']==hashlib.sha256((root/'resources/game/character-skins.json').read_bytes()).hexdigest()
assert [r['slug']for r in inventory['characters']]==[r['slug']for r in contract['characters']]
count=0
for entry in contract['characters']:
    for variant in ('lite','runtime','detail'):
        directory=base/'master-skins-v2'/entry['slug'];descriptor=directory/f'{variant}.json';data=json.loads(descriptor.read_text())
        record=next(row for row in inventory['characters']if row['slug']==entry['slug'])['variants'][variant]
        assert record['sha256']==hashlib.sha256(descriptor.read_bytes()).hexdigest()
        image=Image.open(directory/data['image']);image.load()
        assert list(image.size)==data['size']
        assert image.width*image.height*4==data['decodedBytes']<=4*1024*1024
        assert data['imageSha256']==hashlib.sha256((directory/data['image']).read_bytes()).hexdigest()
        assert data['sourceSha256']==hashlib.sha256((base/entry['slug']/'source-v14/master.png').read_bytes()).hexdigest()
        assert data['identitySha256']==hashlib.sha256((base/entry['slug']/f"manifests/{entry['slug']}_identity_contract.json").read_bytes()).hexdigest()
        assert set(data['views'])==set(('n','ne','e','se','s','sw','w','nw'))
        for direction,view in data['views'].items():
            assert 'head'in view and 'torso'in view,(entry['slug'],direction)
            for name,part in view.items():
                x,y,w,h=part['frame'];assert x>=0 and y>=0 and w>0 and h>0 and x+w<=image.width and y+h<=image.height
                assert image.crop((x,y,x+w,y+h)).getchannel('A').getextrema()[1]>0
            for accessory in entry['accessories']:
                if accessory['kind']=='wings':assert view.get('wingLeft')or view.get('wingRight')
                else:assert accessory['kind']in view
        count+=1
print(f'Master skins validated: {count} atlases, eight authored directions, source/identity hashes, nonempty layers and bounded decoded memory.')
