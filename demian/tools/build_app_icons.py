"""MIT. Original geometric D icon, reproducible without external artwork/fonts."""
from pathlib import Path
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parents[1] / 'public/icons'
root.mkdir(exist_ok=True)
for size in (192, 512):
    scale = 4
    image = Image.new('RGB', (size*scale, size*scale), '#263b2d')
    draw = ImageDraw.Draw(image)
    def rect(box, fill, radius=0):
        box = tuple(round(v*size*scale) for v in box)
        draw.rounded_rectangle(box, radius=round(radius*size*scale), fill=fill)
    rect((.24,.21,.78,.79), '#d7e8a2', .20)
    rect((.35,.32,.65,.68), '#263b2d', .12)
    rect((.21,.21,.39,.79), '#d7e8a2', .025)
    rect((.22,.86,.78,.88), '#8da46e', .01)
    image.resize((size,size), Image.Resampling.LANCZOS).save(root/f'demian-{size}.png')
