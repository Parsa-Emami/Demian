#!/usr/bin/env python3
"""Cap open cutaway walls using the exact collision silhouettes; encode WebP."""
from pathlib import Path
from PIL import Image
import numpy as np
root=Path('public/assets/environments/demian-fbx')
image=Image.open(root/'bake.work.png').convert('RGB')
physics=Image.open(root/'physics.work.png').convert('RGB').resize(image.size,resample=Image.Resampling.NEAREST)
mask=np.asarray(physics);solid=(mask[:,:,0]<110)&(mask[:,:,0]>0)
alpha=Image.fromarray((solid*32).astype('uint8'))
image=Image.composite(Image.new('RGB',image.size,(51,58,54)),image,alpha)
image.save(root/'floorplan.webp',quality=91,method=6)
print('FBX floorplan:',(root/'floorplan.webp').stat().st_size,'bytes')
