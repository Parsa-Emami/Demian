import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'public/assets/environments/demian-fbx'
manifest = json.loads((ASSETS / 'quality.work.json').read_text())
image = Image.new('RGB', (manifest['width'], manifest['height']))
padding = manifest['padding']
for tile in manifest['tiles']:
    with Image.open(ASSETS / tile['file']) as source:
        crop = source.crop((padding, padding, padding + image.width, padding + tile['height']))
        image.paste(crop, (0, tile['y']))
target = ASSETS / 'floorplan-detail.webp'
image.save(target, quality=94, method=6)
report = {key: value for key, value in manifest.items() if key != 'tiles'}
report.update(image=target.name, sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
              downloadBytes=target.stat().st_size, tileCount=len(manifest['tiles']))
(ASSETS / 'quality-bake.json').write_text(json.dumps(report, indent=2) + '\n')
print(f"Cafe detail bake: {image.width}x{image.height}, {target.stat().st_size} bytes")
