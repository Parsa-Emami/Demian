import hashlib
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

from build_character_pack_v14 import CHARACTERS, read_json, write_json


CAST = ('taher-db', 'sorkhi')
CELL = 288


def extract_pose(source, box, boundary=None, clear_navy=None):
    rgb = np.asarray(source.crop(tuple(box))).copy()
    mask = np.zeros(rgb.shape[:2], np.uint8)
    if boundary:
        shape = np.zeros_like(mask)
        cv2.fillPoly(shape, [np.asarray(boundary, np.int32)], 1)
        mask = np.where(shape, cv2.GC_PR_FGD, cv2.GC_PR_BGD).astype(np.uint8)
        mask[~ndimage.binary_dilation(shape, iterations=4)] = cv2.GC_BGD
        mask[ndimage.binary_erosion(shape, iterations=5)] = cv2.GC_FGD
    else:
        edges = np.concatenate([rgb[:, :5], rgb[:, -5:]], axis=1)
        background = ndimage.median_filter(np.median(edges, axis=1), size=(11, 1))
        difference = np.max(np.abs(rgb.astype(float) - background[:, None]), axis=2)
        mask = np.where(difference > 15, cv2.GC_PR_FGD, cv2.GC_PR_BGD).astype(np.uint8)
        mask[difference < 6.3] = cv2.GC_BGD
        mask[ndimage.binary_erosion(difference > 36)] = cv2.GC_FGD
    if clear_navy:
        x0, y0, x1, y1 = clear_navy
        crop = rgb[y0:y1, x0:x1].astype(int)
        navy = (crop[..., 2] > crop[..., 0] + 6) & (crop[..., 2] > crop[..., 1] + 4)
        mask[y0:y1, x0:x1][navy] = cv2.GC_BGD
    mask[[0, -1], :] = cv2.GC_BGD
    mask[:, [0, -1]] = cv2.GC_BGD
    cv2.setRNGSeed(14)
    cv2.grabCut(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), mask, None,
                np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64), 4, cv2.GC_INIT_WITH_MASK)
    labels, _ = ndimage.label(np.isin(mask, [cv2.GC_FGD, cv2.GC_PR_FGD]), structure=np.ones((3, 3)))
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    if sizes.max() <= 700:
        raise ValueError(f'No full-body pose in {box}')
    alpha = labels == sizes.argmax()
    holes, _ = ndimage.label(ndimage.binary_fill_holes(alpha) & ~alpha)
    alpha |= (holes > 0) & (np.bincount(holes.ravel())[holes] < 75)
    rgb[~alpha] = 0
    pose = Image.fromarray(np.dstack([rgb, alpha.astype(np.uint8) * 255]))
    return pose.crop(pose.getbbox())


def resize_pose(pose, factor):
    return pose.resize((round(pose.width * factor), round(pose.height * factor)), Image.Resampling.LANCZOS)


def waist_axis(pose, waist):
    scanline = pose.getchannel('A').crop((0, waist, pose.width, waist + 1)).getbbox()
    if not scanline:
        raise ValueError('Missing waist anchor in pose')
    return (scanline[0] + scanline[2]) / 2


def bent_torso(pose, fraction, degrees):
    waist = round(pose.height * fraction)
    margin = 96
    size = (pose.width + 2 * margin, pose.height + 2 * margin)
    axis = (margin + waist_axis(pose, waist), margin + waist)
    body = Image.new('RGBA', size)
    body.alpha_composite(pose.crop((0, waist - 5, pose.width, pose.height)), (margin, margin + waist - 5))
    torso = Image.new('RGBA', size)
    torso.alpha_composite(pose.crop((0, 0, pose.width, waist + 5)), (margin, margin))
    body.alpha_composite(torso.rotate(degrees, resample=Image.Resampling.BICUBIC, center=axis))
    return body.crop(body.getbbox())


def stride_pose(pose, fraction, reach, reversed_step):
    waist = round(pose.height * fraction)
    axis = waist_axis(pose, waist)
    legs = pose.crop((0, waist, pose.width, pose.height))
    if reversed_step:
        legs = legs.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    legs = legs.resize((round(legs.width * reach), legs.height), Image.Resampling.BICUBIC)
    reference = (pose.width - axis if reversed_step else axis) * reach
    margin = 64
    combined = Image.new('RGBA', (pose.width + 2 * margin, pose.height))
    combined.alpha_composite(legs, (round(margin + axis - reference), waist))
    combined.alpha_composite(pose.crop((0, 0, pose.width, waist)), (margin, 0))
    return combined.crop(combined.getbbox())


def gait(pose, waist):
    return [stride_pose(pose, waist, reach, reverse)
            for reverse in (False, True) for reach in (.71, 1, .88, .63)]


def write_sheet(path, rows, columns=8):
    sheet = Image.new('RGBA', (columns * CELL, len(rows) * CELL))
    for row_index, row in enumerate(rows):
        if len(row) != columns:
            raise ValueError(f'Unexpected pose count in {path.name}')
        for index, pose in enumerate(row):
            if max(pose.size) > CELL - 24:
                raise ValueError(f'{path.name} pose exceeds cell: {pose.size}')
            sheet.alpha_composite(pose, (index * CELL + (CELL - pose.width) // 2,
                                        (row_index + 1) * CELL - 14 - pose.height))
    sheet.save(path, optimize=True)


def prepare(slug):
    folder = CHARACTERS / slug / 'source-v14'
    reference = folder / 'reference.jpg'
    spec = read_json(folder / 'sheet-map.json')
    with Image.open(reference) as image:
        image = image.convert('RGB')
        front, quarter, side, back = [extract_pose(image, box) for box in spec['turn']]
        idle, walk, run, jump, lean, win = [
            extract_pose(image, item['box'], item['boundary'], item.get('clearNavy')) for item in spec['action']
        ]
    turn_scale = idle.height / front.height
    front, quarter, side, back = [resize_pose(pose, turn_scale) for pose in (front, quarter, side, back)]
    mirror = Image.Transpose.FLIP_LEFT_RIGHT
    turn = [front, quarter, side, back, back, back, side.transpose(mirror), quarter.transpose(mirror)]
    idle_cycle = [bent_torso(idle, .68, angle) for angle in (0, -.4, -.9, -1.2, -.9, -.4, 0, .3)]
    jump_cycle = [idle, bent_torso(idle, .68, -9), jump, bent_torso(jump, .67, -4),
                  jump, bent_torso(jump, .67, 4), bent_torso(idle, .68, -5), idle]
    celebrate = [idle, bent_torso(idle, .68, -5), win, bent_torso(win, .69, -3),
                 win, bent_torso(win, .69, 3), win, win]
    land = [idle, bent_torso(lean, .68, -20), bent_torso(lean, .68, -14),
            bent_torso(lean, .68, -9), bent_torso(idle, .68, -6),
            bent_torso(idle, .68, -3), idle, idle]
    slide = [bent_torso(lean, .68, angle) for angle in (-49, -52, -55, -57, -56, -54, -52, -50)]
    write_sheet(folder / 'master.png', [turn, idle_cycle, jump_cycle, celebrate])
    write_sheet(folder / 'runner-motion.png', [gait(walk, spec['walkWaist']), gait(run, spec['runWaist']), land])
    write_sheet(folder / 'slides.png', [slide[:4], slide[4:]], columns=4)
    write_json(folder / 'layout.json', {
        'mainStates': ['turn', 'idle', 'jump', 'celebrate'],
        'mainRowBounds': [i * CELL for i in range(5)],
        'motionColumns': 8,
        'motionRowBounds': [i * CELL for i in range(4)],
        'motionRowStates': ['walk', 'run', 'land'],
        'referenceAsset': '../source-v14/reference.jpg',
        'referenceInputs': [{'name': 'reference.jpg', 'role': 'supplied-identity-sheet-and-key-poses',
                             'sha256': hashlib.sha256(reference.read_bytes()).hexdigest()}],
        'identity': spec['identity'],
        'bodyScaleReferencePoses': {'walk': list(range(8)), 'run': list(range(8)), 'jump': [7]},
        'locomotionCycleCounts': {'walk': 1, 'run': 1},
        'faceSkinRedGreenRatio': 1.1,
    })


if __name__ == '__main__':
    cv2.setNumThreads(2)
    for character in CAST:
        prepare(character)
