"""Shared V14 motion metadata; does not alter any artwork or sprite rectangles."""
from copy import deepcopy
from math import isfinite


def apply_animation_timing(atlas, cycle_counts=None, locomotion_profile=None):
    cycles = cycle_counts or {}
    animations = atlas['animations']
    for name in ('walk', 'tiptoe', 'run', 'sprint', 'skid', 'dash'):
        if name in animations:
            family = 'walk' if name in ('walk', 'tiptoe') else 'run'
            animations[name]['cycleCount'] = max(1, min(4, int(cycles.get(name, cycles.get(family, 1)))))
    # The source sequence begins with anticipation and ends in standing.
    # Airborne clips use push-off, tuck and leg extension; landing has its own clip.
    for name, start, end, fps in [('takeoff', 12, 24, 72), ('jump', 24, 32, 32), ('fall', 32, 43, 44)]:
        animation = animations[name]
        east = [f'jump_e_{i:03}' for i in range(start, end)]
        west = [f'jump_w_{i:03}' for i in range(start, end)]
        if not all(frame in atlas['frames'] for frame in east + west):
            raise ValueError(f'Missing authored jump poses for {name}')
        animation.update(frames=east, framesRight=east, framesLeft=west, fps=fps,
                         loop=False, progressDriver='vertical-velocity')
        animation['framesByDirection'] = {
            direction: west if 'w' in direction else east for direction in atlas['meta']['directions']
        }
    # Tiam's semantic aliases share the corrected clips too.
    for name, animation in list(animations.items()):
        source = animation.get('sharedFrameSource')
        if source in ('walk', 'run', 'jump'):
            animations[name] = {**deepcopy(animations[source]), 'sharedFrameSource': source}
    atlas['motion']['timingVersion'] = 'natural-locomotion-v2'
    atlas['motion']['jumpProgressDriver'] = 'vertical-velocity'
    winged = atlas.get('movement', {}).get('style') == 'wing-assisted'
    atlas['motion']['locomotionProfile'] = {
        'id': 'uzudi-wing-assisted-v2' if winged else 'shared-ground-v2',
        'referenceCharacter': 'uzudi' if winged else None,
        'phaseDriver': 'travelled-distance',
        'strideLengths': {'walk': 3.4, 'run': 6, 'sprint': 6.4},
        'maxStrideHz': 1.55, 'landingSeconds': .16,
        'jumpBufferSeconds': .14, 'coyoteSeconds': .11,
        'heldApexGravity': .65, 'releasedRiseGravity': 1.65,
        'recoveryInterruptible': True,
    }
    # Authored presentation can change stride cadence without changing gameplay
    # velocity, jump physics or input forgiveness for any character.
    if locomotion_profile:
        allowed = {'id', 'strideLengths', 'maxStrideHz'}
        if not isinstance(locomotion_profile, dict) or set(locomotion_profile) - allowed:
            raise ValueError('Unsupported locomotion presentation field')
        profile = atlas['motion']['locomotionProfile']
        identity = locomotion_profile.get('id', profile['id'])
        if not isinstance(identity, str) or not identity.strip():
            raise ValueError('Locomotion profile id must be non-empty')
        strides = locomotion_profile.get('strideLengths', profile['strideLengths'])
        if not isinstance(strides, dict) or set(strides) != {'walk', 'run', 'sprint'}:
            raise ValueError('Stride lengths must define walk, run and sprint')
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not isfinite(v) or not 0 < v <= 20 for v in strides.values()):
            raise ValueError('Stride lengths must be finite and positive')
        maximum = locomotion_profile.get('maxStrideHz', profile['maxStrideHz'])
        if isinstance(maximum, bool) or not isinstance(maximum, (int, float)) or not isfinite(maximum) or not .4 <= maximum <= 1.55:
            raise ValueError('Stride frequency must stay within .4–1.55 Hz')
        profile.update(id=identity, strideLengths=deepcopy(strides), maxStrideHz=maximum)
    return atlas
