import math

from PIL import Image, ImageChops, ImageDraw, ImageFilter


DIRECTIONS = ('s', 'sw', 'w', 'nw', 'n', 'ne', 'e', 'se')
CELL = 160
GROUND = 150
GROUND_DEPTH = .72
PISHI_CELL = 56
PISHI_GROUND = 49
WALK = (12, 2.45, .56)
RUN = (16, 3.85, .375)
MOTION_COUNTS = {
    'idle': 2, 'start': 2, 'stop': 3,
    'takeoff': 2, 'jump': 3, 'fall': 3, 'land': 4, 'slide': 4, 'wave': 5,
}
SIDE_COUNTS = {**MOTION_COUNTS, 'stop': 2, 'takeoff': 3, 'jump': 4, 'slide': 6}
CONTACTS = {name: {'stride': stride, 'stance': stance, 'count': count}
            for name, (count, stride, stance) in [('walk', WALK), ('run', RUN)]}
VARIANTS = {'desktop': 132, 'mobile': 104, 'compact': 72, 'runtime': 76, 'lite': 44, 'detail': 128}
MOTION_REVISION = '15.1'


def direction_vector(direction):
    angle = DIRECTIONS.index(direction) * math.pi / 4
    return -math.sin(angle), math.cos(angle)


def crop_views(path, cell):
    with Image.open(path) as sheet:
        if sheet.size != (cell * len(DIRECTIONS), cell):
            raise ValueError(f'Sprite turnaround has invalid dimensions: {path}')
        return {direction: sheet.crop((i * cell, 0, (i + 1) * cell, cell)).convert('RGBA')
                for i, direction in enumerate(DIRECTIONS)}


def canonical_darya_views(source, layout):
    row = layout['poses'].index('idle') * CELL
    views = {}
    with Image.open(source / layout['source']) as sheet:
        if sheet.size != (CELL * len(DIRECTIONS), CELL * len(layout['poses'])):
            raise ValueError('The canonical Darya sheet does not match its frame layout')
        for i, direction in enumerate(DIRECTIONS):
            frame = sheet.crop((i * CELL, row, (i + 1) * CELL, row + CELL)).convert('RGBA')
            mask = Image.new('L', (CELL, CELL))
            edge = layout['darya_identity']['companion_edge'][direction]
            outer_x = CELL - 1 if edge['keep'] == 'right' else 0
            inner_x = CELL - 1 - outer_x
            boundary = [tuple(point) for point in edge['points']]
            points = [*boundary, (boundary[-1][0], CELL - 1), (outer_x, CELL - 1),
                      (outer_x, 0), (inner_x, 0), (inner_x, boundary[0][1] - 1)]
            ImageDraw.Draw(mask).polygon(points, fill=255)
            alpha = ImageChops.multiply(frame.getchannel('A'), mask)
            connected = alpha.point(lambda value: 255 if value >= 48 else 0)
            if connected.getpixel((80, 66)) == 0:
                raise ValueError(f'Darya identity mask does not contain the head for {direction}')
            ImageDraw.floodfill(connected, (80, 66), 128)
            outline = connected.point(lambda value: 255 if value == 128 else 0).filter(ImageFilter.MaxFilter(3))
            outline.paste(255, (0, 0, CELL, 100))
            frame.putalpha(ImageChops.multiply(alpha, outline))
            views[direction] = frame
    return views


def ease(value):
    return value * value * (3 - 2 * value)


def gait(phase, travel, stance, lift):
    if phase < stance:
        return (stance * .5 - phase) * travel, 0
    swing = (phase - stance) / (1 - stance)
    return (ease(swing) - .5) * stance * travel, math.sin(math.pi * swing) ** 1.4 * lift


def project(point, direction, *, side=False, origin=(80, GROUND), depth=GROUND_DEPTH):
    lateral, elevation, forward = point
    fx, fz = direction_vector(direction)
    return (origin[0] + lateral * fz + forward * fx,
            origin[1] + (-lateral * fx * .32 + forward * fz * depth) * (not side) - elevation)


def capsule(draw, a, b, start, end, fill, outline):
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = max(.01, math.hypot(dx, dy))
    nx, ny = -dy / length, dx / length
    polygon = [(x + nx * radius * sign, y + ny * radius * sign)
               for (x, y), radius, sign in ((a, start, 1), (b, end, 1), (b, end, -1), (a, start, -1))]
    draw.polygon(polygon, fill=fill, outline=outline, width=2)
    for (x, y), radius in ((a, start), (b, end)):
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill, outline=outline, width=2)
    draw.polygon(polygon, fill=fill)
    draw.line([polygon[0], polygon[1]], fill=outline, width=2)
    draw.line([polygon[2], polygon[3]], fill=outline, width=2)


def prepare_upper_body(frame, direction):
    cut = {'s': 114, 'sw': 114, 'w': 112, 'nw': 115, 'n': 116, 'ne': 115, 'e': 113, 'se': 116}[direction]
    top = frame.crop((0, 0, CELL, cut))
    alpha = top.getchannel('A')
    draw = ImageDraw.Draw(alpha)
    sleeves = {
        's': [(61, 105, 69), (94, 105, 104)], 'sw': [(60, 105, 69), (92, 105, 103)],
        'w': [(59, 104, 75)], 'nw': [(52, 104, 64)], 'n': [(58, 109, 66), (92, 109, 100)],
        'ne': [(67, 109, 73), (94, 106, 107)], 'e': [(88, 104, 106)], 'se': [(72, 105, 81), (101, 105, 109)],
    }
    for left, y, right in sleeves[direction]:
        draw.rectangle((left, y, right, cut), fill=0)
    top.putalpha(alpha)
    upper = Image.new('RGBA', (CELL, CELL))
    upper.paste(top)
    return upper


def standing_heel_x(frame):
    left, _, right, _ = frame.getchannel('A').crop((0, 140, CELL, GROUND)).point(
        lambda alpha: 255 if alpha > 64 else 0).getbbox()
    return (left + right - 1) / 2


def pose_parameters(state, phase):
    if state in ('walk', 'run'):
        _, stride, stance = WALK if state == 'walk' else RUN
        travel = stride * CELL * .7 / 3.75
        running = state == 'run'
        lift = 15 if running else 11
        feet = [gait((phase + shift) % 1, travel, stance, lift) for shift in (0, .5)]
        pump = math.sin(phase * math.tau + math.pi / 2)
        bob = (1 - math.cos(phase * math.tau * 2)) * (1.55 if running else .95)
        return feet, 36 + bob - 3 * running, 5 if running else 1, pump, 0

    t = ease(phase)
    if state == 'slide':
        tuck = math.sin(phase * math.pi / 2)
        return [(16 + 9 * tuck, 0), (6 + 12 * tuck, 0)], 8.5 - 3 * tuck, -4, -.5 - .3 * t, -.8
    if state == 'takeoff':
        return [(3 + 7 * t, 4 * t), (-4, 7 * t)], 28 + 8 * t, 3 + 3 * t, .7, .35
    if state == 'jump':
        return [(10, 14 + 3 * t), (-6 + 8 * t, 17 + 2 * t)], 32 + 2 * t, 3, .6, .65
    if state == 'fall':
        return [(10 - 5 * t, 14 - 11 * t), (-5 + 2 * t, 17 - 14 * t)], 33 + 2 * t, 0, -.45, .28
    if state == 'land':
        return [(4 * (1 - t), 0), (-3 * (1 - t), 0)], 9.5 + 26.5 * phase ** .78, 5 * (1 - t), -.7 * (1 - t), -.35 * (1 - t)
    if state == 'start':
        return [(12 * t, 7 * t), (-6 * t, 0)], 36 - 3 * t, 4 * t, .8 * t, 0
    if state == 'stop':
        return [(14 * (1 - t), 0), (-10 * (1 - t), 3 * (1 - t))], 31 + 5 * t, 3 * (1 - t), -.6 * (1 - t), 0
    if state == 'wave':
        return [(0, 0), (0, 0)], 36, 0, .24 * math.sin(phase * math.tau * 2), math.sin(math.pi * phase)
    return [(0, 0), (0, 0)], 36 + math.sin(phase * math.pi) * .85, 0, 0, 0


def support_depth(feet, phase, stance, forward_z):
    step_phase = phase % .5
    index = int(phase >= .5)
    primary, secondary = feet[index][0], feet[1 - index][0]
    if stance > .5 and step_phase < stance - .5:
        t = ease(step_phase / (stance - .5))
        primary = secondary + (primary - secondary) * t
    elif stance < .5 and step_phase > stance:
        t = ease((step_phase - stance) / (.5 - stance))
        primary = primary + (secondary - primary) * t
    return (1 - GROUND_DEPTH) * forward_z * primary


def paint_darya(seed, upper, heel_x, direction, state, phase, *, side=False):
    if (phase == 0 and state in ('idle', 'start', 'wave')) or (phase == 1 and state in ('land', 'stop', 'wave')):
        return seed, 0
    if state == 'idle':
        breathing = seed.copy()
        breathing.paste(seed.crop((0, 0, CELL, 117)), (0, -1))
        return breathing, 0

    feet, hip, lean, pump, gesture = pose_parameters(state, phase)
    fx, fz = direction_vector(direction)
    origin = (heel_x, GROUND if side else GROUND - 23)
    scale = 2
    frame = Image.new('RGBA', (CELL * scale, CELL * scale))
    draw = ImageDraw.Draw(frame)

    def p(point):
        return tuple(v * scale for v in project(point, direction, side=side, origin=origin,
                                                depth=.31 if state == 'slide' else GROUND_DEPTH))

    legs = sorted(zip((-7.8, 7.8), feet), key=lambda leg: leg[1][0] * fz - leg[0] * fx * .32)
    for depth, (lateral, (step, lift)) in enumerate(legs):
        pelvis = (lateral * .8, hip + 1, lean * .22)
        ankle = (lateral, lift + 5, step - 2.2)
        bend = 4 + min(7, lift * .36) + (3 if state == 'slide' else 0)
        knee = (lateral, (hip + lift + 5) * .48, (step + lean) * .49 + bend)
        a, b, c = p(pelvis), p(knee), p(ankle)
        outline = '#252322'
        fabric = ('#46403c', '#514944')[depth]
        capsule(draw, a, b, 13, 10, fabric, outline)
        capsule(draw, b, c, 10, 9, fabric, outline)
        draw.line([(a[0] - 5, a[1] + 4), (b[0] - 4, b[1]), (c[0] - 3, c[1] - 4)],
                  fill=('#514944', '#60544c')[depth], width=3)
        draw.line([(b[0], b[1] + 5), (b[0] + 6, b[1] + 6)], fill='#3a3532', width=2)
        toe = p((lateral, lift + 3, step + 4))
        heel = p((lateral, lift + 4, step - 5))
        capsule(draw, heel, toe, 10, 9, '#2b2928', '#1b1715')
        draw.line([(heel[0] - 7, heel[1] + 6), (toe[0] + fx * 5 + 3, toe[1] + 6)], fill='#ded6c6', width=3)
        cap_y = toe[1] - 3
        draw.ellipse((toe[0] - 6, cap_y, toe[0] + 6, cap_y + 8), fill='#f5eddf' if fz >= -.2 else '#8f877c')

    arms = sorted((-1, 1), key=lambda sign: -sign * fx)

    def arm(draw, sign):
        shoulder = (sign * 13.7, hip + 13.5, lean + 1)
        counter = sign * pump
        bend = state in ('run', 'takeoff', 'jump', 'fall')
        elbow = (sign * (15.2 + abs(gesture) * 4), hip + 5 + 5 * bend + 4 * gesture,
                 lean + counter * (8 if bend else 4) - 1)
        end = (sign * (15.5 + abs(gesture) * 7), hip + 1 + 12 * bend + 18 * max(0, gesture),
               lean + counter * (13 if bend else 7) + 4 * bend)
        a, b, c = p(shoulder), p(elbow), p(end)
        capsule(draw, a, b, 9, 7, '#292a2e', '#1e1b1b')
        capsule(draw, b, c, 5.5, 6.5, '#d99771', '#512e23')
        draw.ellipse((c[0] - 3, c[1] - 3, c[0] + 3, c[1] + 2), fill='#efb38e')

    arm(draw, arms[0])
    composite = frame.resize((CELL, CELL), Image.Resampling.LANCZOS)
    upper_x = round(fx * lean)
    upper_y = round(36 - hip + origin[1] - GROUND + fz * lean * .45)
    composite.alpha_composite(upper, (upper_x, upper_y))
    if fz > -.9 or state == 'wave':
        foreground = Image.new('RGBA', frame.size)
        draw = ImageDraw.Draw(foreground)
        arm(draw, arms[1])
        if fz <= -.9:
            arm(draw, arms[0])
        composite.alpha_composite(foreground.resize((CELL, CELL), Image.Resampling.LANCZOS))
    frame = composite
    bounds = frame.getchannel('A').point(lambda alpha: 255 if alpha > 32 else 0).getbbox()
    if not bounds:
        raise ValueError(f'Empty Darya pose: {direction}/{state}/{phase}')
    if side and state not in ('slide', 'land'):
        return frame, 0
    if state not in ('walk', 'run'):
        return frame.transform(frame.size, Image.Transform.AFFINE, (1, 0, 0, 0, 1, bounds[3] - GROUND)), 0
    shift = min(18, 155 - bounds[3])
    if shift:
        frame = frame.transform(frame.size, Image.Transform.AFFINE, (1, 0, 0, 0, 1, -shift))
    return frame, 23 - shift + support_depth(feet, phase, CONTACTS[state]['stance'], fz)


def build_darya_art(source, layout):
    views = canonical_darya_views(source, layout)
    uppers = {direction: prepare_upper_body(view, direction) for direction, view in views.items()}
    heel_x = {direction: standing_heel_x(view) for direction, view in views.items()}
    art, offsets, animations, side_animations = {}, {}, {}, {}
    for side, facing, motions, clips in [
        (False, DIRECTIONS, MOTION_COUNTS, animations),
        (True, ('e', 'w'), SIDE_COUNTS, side_animations),
    ]:
        space = 'side' if side else 'world'
        counts = {**motions, 'walk': WALK[0], 'run': RUN[0]}
        for state, count in counts.items():
            loop = state in ('idle', 'walk', 'run')
            sequences = {}
            for direction in facing:
                sequence = []
                for i in range(count):
                    phase = i / (count if loop else max(1, count - 1))
                    name = f'{space}_{direction}_{state}-{i:02}' if not side else f'side_{state}_{direction}_{i:02}'
                    art[name], y = paint_darya(views[direction], uppers[direction], heel_x[direction],
                                               direction, state, phase, side=side)
                    if y:
                        offsets[name] = round(y / CELL, 6)
                    sequence.append(name)
                sequences[direction] = sequence
            fps = {'idle': 3, 'walk': 14, 'run': 24, 'start': 15, 'stop': 16, 'turn': 16,
                   'takeoff': 16, 'jump': 16, 'fall': 16, 'land': 25, 'slide': 14, 'wave': 10}[state]
            clip = {'frames': sequences['e'], 'framesByDirection': sequences, 'fps': fps, 'loop': loop}
            if state in CONTACTS:
                clip.update(cycleCount=1, contactFrames=[0, count // 2], groundContact=CONTACTS[state])
            clips[state] = clip
        clips['sprint'] = {**clips['run'], 'fps': 30, 'sharedFrameSource': 'run'}
        clips['dash'] = {**clips['run'], 'fps': 33, 'sharedFrameSource': 'run'}
        crouch = {direction: [clip[3]] for direction, clip in clips['slide']['framesByDirection'].items()}
        clips['crouch'] = {'frames': crouch['e'], 'framesByDirection': crouch, 'fps': 1, 'loop': False,
                           'sharedFrameSource': 'slide'}
        aliases = {'breathe': 'idle', 'blink': 'idle', 'ready': 'idle', 'tiptoe': 'walk',
                   'hop': 'jump', 'hover': 'jump', 'dodge': 'slide', 'salute': 'wave', 'turn': 'idle',
                   'skid': 'stop', 'celebrate': 'wave', 'win': 'wave'}
        clips.update({alias: {**clips[target], 'sharedFrameSource': target} for alias, target in aliases.items()})
        clips['turn'].update(fps=16, loop=False)
    return art, offsets, animations, side_animations


def paint_pishi(seed, direction, state, phase):
    if state == 'idle':
        rise = (0, .9, 1.35, .55)[int(phase * 4)]
        factor = 1 - rise / 36
        return seed.transform(seed.size, Image.Transform.AFFINE, (1, 0, 0, 0, factor, (1 - factor) * PISHI_GROUND),
                              Image.Resampling.BICUBIC)
    fx, fz = direction_vector(direction)
    gait_name = {'walk': (30, .58, 5), 'run': (46, .38, 8)}
    lift = math.sin(phase * math.tau * 2) if state in gait_name else 0
    crouch = {'takeoff': 2.4 - 2 * phase, 'jump': -.8, 'fall': -.2,
              'land': 3 - 3 * phase, 'crouch': 2 + 1.7 * phase}.get(state, 0)
    body_offset = round(crouch - lift * 1.15 + .5 * math.sin(phase * math.tau))
    upper = seed.crop((0, 0, PISHI_CELL, 42))
    frame = Image.new('RGBA', (PISHI_CELL * 2, PISHI_CELL * 2))
    draw = ImageDraw.Draw(frame)

    def paw(lateral, height, forward):
        x = 28 + fz * lateral + fx * forward
        y = PISHI_GROUND + .35 * (fz * forward - fx * lateral) - height
        return (x * 2, y * 2)

    if state in gait_name:
        travel, stance, clearance = gait_name[state]
        steps = [gait((phase + offset) % 1, travel, stance, clearance) for offset in (0, .5, .62, .12)]
    else:
        front_lift = max(0, 5 - 2 * phase) if state in ('jump', 'fall') else 0
        rear_lift = max(0, 6 - 3 * phase) if state == 'jump' else 0
        stride = 6 * phase if state in ('takeoff', 'jump', 'fall') else 0
        steps = [(stride, front_lift)] * 2 + [(-stride, rear_lift)] * 2
    legs = sorted(zip((8, 8, -8, -8), (-4.4, 4.4, -4.4, 4.4), steps),
                  key=lambda leg: leg[0] * fz - leg[1] * fx)
    for longitudinal, lateral, (step, height) in legs:
        a = paw(lateral, 11 - body_offset, longitudinal)
        b = paw(lateral, 5 + height, longitudinal + step * .56)
        c = paw(lateral, 2.6 + height, longitudinal + step)
        capsule(draw, a, b, 5, 4.6, '#6e5848', '#463428')
        capsule(draw, b, c, 3.9, 4.8, '#e1d0bd', '#524235')
        draw.line((c[0] - 2.5, c[1] + 1, c[0] + 2, c[1] + 1), fill='#f9ebd5', width=2)
    frame.alpha_composite(upper.resize((PISHI_CELL * 2, 84), Image.Resampling.LANCZOS), (0, body_offset * 2))
    return frame.resize((PISHI_CELL, PISHI_CELL), Image.Resampling.LANCZOS)


def build_pishi_art(source, layout):
    views = crop_views(source / layout['motion_art']['pishi'], PISHI_CELL)
    counts = {'idle': (4, 5, True), 'walk': (8, 12, True), 'run': (10, 18, True),
              'takeoff': (2, 15, False), 'jump': (3, 18, False), 'fall': (2, 18, False),
              'land': (3, 25, False), 'crouch': (2, 12, False)}
    art, animations = {}, {}
    for state, (count, fps, loop) in counts.items():
        sequences = {}
        for direction, view in views.items():
            frames = []
            for index in range(count):
                name = f'{direction}_{state}-{index:02}'
                art[name] = paint_pishi(view, direction, state, index / (count if loop else count - 1))
                frames.append(name)
            sequences[direction] = frames
        animations[state] = {'frames': sequences['e'], 'framesByDirection': sequences, 'fps': fps, 'loop': loop}
    return art, animations
