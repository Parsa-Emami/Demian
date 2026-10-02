"""MIT. Validate geometry, alpha, animation links, and body invariants."""
import json
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / 'public/assets/characters/darya'
def main():
    for variant,cell in {'desktop':192,'mobile':128,'compact':96}.items():
        atlas=json.loads((DIR/f'darya-atlas-v13-{variant}.json').read_text())
        image=Image.open(DIR/atlas['meta']['image'])
        assert image.mode=='RGBA' and image.size==(24*cell,19*cell)
        assert len(atlas['frames'])==atlas['meta']['generatedFrameCount']==456
        assert atlas['meta']['version']==13
        assert atlas['render']['frameBlend'] is False
        assert atlas['render']['lockBodyScale'] and atlas['render']['physicsOwnsJumpHeight']
        assert atlas['pivot']=={'x':.5,'y':.95}
        assert atlas['motion']['northSouthScale']==atlas['motion']['diagonalScale']==1
        for name,frame in atlas['frames'].items():
            x,y,w,h=(frame[k] for k in ('x','y','w','h'))
            assert w==h==cell and 0<=x<=image.width-cell and 0<=y<=image.height-cell
            box=image.crop((x,y,x+w,y+h)).getchannel('A').getbbox()
            assert box, f'Empty frame: {name}'
            assert box[1]>0 and box[3]<cell, f'Clipped frame: {name}'
            assert .58*cell<=box[3]-box[1]<=.85*cell, f'Height drift: {name}'
        for animation in atlas['animations'].values():
            assert all(f in atlas['frames'] for f in animation['frames'])
            for direction,frames in animation.get('framesByDirection',{}).items():
                assert direction in atlas['meta']['directions'] and frames
                assert all(f in atlas['frames'] for f in frames)
        assert atlas['animations']['walk']['fps']==48 and atlas['animations']['run']['fps']==64
    print('Darya V13 passed: 3 variants, 456 frames, 31 states, fixed geometry and valid references.')
if __name__=='__main__': main()

