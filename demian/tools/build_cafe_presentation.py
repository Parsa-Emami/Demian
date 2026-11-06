import hashlib
import json
import math
import io
import os
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public/assets/environments/demian-fbx'
OUTPUT = ASSETS / 'polished-v1'
manifest = json.loads((ASSETS / 'polished.work.json').read_text())
source = Image.new('RGB', (manifest['width'], manifest['height']))
padding = manifest['padding']
for tile in manifest['tiles']:
    with Image.open(ASSETS / tile['file']) as image:
        source.paste(image.crop((padding, padding, padding + source.width, padding + tile['height'])), (0, tile['y']))
OUTPUT.mkdir(exist_ok=True)
files = []

def save(image, path):
    buffer = io.BytesIO()
    image.save(buffer, format='WEBP', quality=90, method=6)
    raw = buffer.getvalue()
    target = OUTPUT / path
    temporary = target.with_suffix('.work.webp')
    with temporary.open('wb') as handle:
        handle.write(raw)
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(target)
    files.append({'file': path, 'width': image.width, 'height': image.height, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})

preview = source.resize((512, round(source.height * 512 / source.width)), Image.Resampling.LANCZOS)
save(preview, 'preview.webp')
levels = []
for width in [1024, 1536, 2048]:
    height = round(source.height * width / source.width)
    image = source.resize((width, height), Image.Resampling.LANCZOS)
    directory = f'lod-{width}'
    (OUTPUT / directory).mkdir(exist_ok=True)
    for y in range(0, height, 512):
        for x in range(0, width, 512):
            w, h = min(512, width - x), min(512, height - y)
            crop = image.crop((max(0, x - 2), max(0, y - 2), min(width, x + w + 2), min(height, y + h + 2)))
            left, top = max(0, 2 - x), max(0, 2 - y)
            padded = Image.new('RGB', (w + 4, h + 4))
            padded.paste(crop, (left, top))
            if left: padded.paste(crop.crop((0, 0, 1, crop.height)).resize((left, crop.height)), (0, top))
            if top: padded.paste(padded.crop((0, top, padded.width, top + 1)).resize((padded.width, top)), (0, 0))
            right = padded.width - left - crop.width
            bottom = padded.height - top - crop.height
            if right: padded.paste(padded.crop((padded.width - right - 1, 0, padded.width - right, padded.height)).resize((right, padded.height)), (padded.width - right, 0))
            if bottom: padded.paste(padded.crop((0, padded.height - bottom - 1, padded.width, padded.height - bottom)).resize((padded.width, bottom)), (0, padded.height - bottom))
            save(padded, f'{directory}/{y // 512}-{x // 512}.webp')
    levels.append({'width': width, 'height': height, 'columns': math.ceil(width / 512), 'rows': math.ceil(height / 512)})
contract = {'version': 'cafe-polished-v1', 'root': 'assets/environments/demian-fbx/polished-v1/',
            'tileSize': 512, 'gutter': 2, 'sourceSha256': manifest['sourceSha256'],
            'preview': {'file': 'preview.webp', 'width': preview.width, 'height': preview.height}, 'levels': levels}
(ROOT / 'resources/game/cafe-art.json').write_text(json.dumps(contract, indent=2) + '\n')
report = {**contract, 'surfaceFinish': manifest['surfaceFinish'], 'renderer': manifest['renderer'],
          'geometryChanged': False, 'ambientOcclusion': 'GTAO', 'files': files, 'totalDownloadBytes': sum(f['bytes'] for f in files)}
(OUTPUT / 'manifest.json').write_text(json.dumps(report, indent=2) + '\n')
print(f"Cafe presentation: {len(files)} images, {report['totalDownloadBytes']} bytes")
