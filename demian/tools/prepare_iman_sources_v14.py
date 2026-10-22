from pathlib import Path
from PIL import Image
from build_character_pack_v14 import extract

ROOT = Path(__file__).resolve().parents[1] / 'public/assets/characters/iman/source-v14'


def prepare():
    with Image.open(ROOT / 'authored-walk.png') as image:
        walk = extract(image.convert('RGBA'), [0, 256, 512, 768, 1024])[1]
    with Image.open(ROOT / 'authored-motion.png') as image:
        motion = extract(image.convert('RGBA'), [0, 342, 683, 1024])
    rows = [walk, *motion]
    cell = 384
    sheet = Image.new('RGBA', (8 * cell, len(rows) * cell))
    for row_index, poses in enumerate(rows):
        for column, pose in enumerate(poses):
            if pose.width > cell - 32 or pose.height > cell - 32:
                raise ValueError('Authored Iman pose exceeds the source cell')
            sheet.alpha_composite(pose, (column * cell + (cell - pose.width) // 2,
                (row_index + 1) * cell - 16 - pose.height))
    sheet.save(ROOT / 'runner-motion.png', optimize=True)


if __name__ == '__main__':
    prepare()
