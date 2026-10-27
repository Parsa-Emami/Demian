from pathlib import Path
from PIL import Image
from build_character_pack_v14 import extract

ROOT = Path(__file__).resolve().parents[1] / 'public/assets/characters/amin/source-v14'


def pack(rows, columns, target):
    cell = 384
    sheet = Image.new('RGBA', (columns * cell, len(rows) * cell))
    for row_index, poses in enumerate(rows):
        if len(poses) != columns:
            raise ValueError('Every source row must have the declared pose count')
        for column, pose in enumerate(poses):
            if pose.width > cell - 32 or pose.height > cell - 32:
                raise ValueError('Authored Amin pose exceeds the source cell')
            sheet.alpha_composite(pose, (column * cell + (cell - pose.width) // 2,
                (row_index + 1) * cell - 16 - pose.height))
    sheet.save(ROOT / target, optimize=True)


def prepare():
    with Image.open(ROOT / 'authored-motion.png') as image:
        image = image.convert('RGBA')
        if image.getchannel('A').getextrema()[0] != 0:
            raise ValueError('Amin motion source must have transparent alpha')
        rows = extract(image, [0, 256, 512, 768, 1024])
    pack(rows[:3], 8, 'runner-motion.png')
    pack([rows[3][:4], rows[3][4:]], 4, 'slides.png')


if __name__ == '__main__':
    prepare()
