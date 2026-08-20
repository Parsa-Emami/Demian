#!/usr/bin/env python3
"""
Apply the two large-file edits that cannot safely be shipped as partial replacement files.

Run from the repository root AFTER extracting this ZIP:
    python3 apply_latest_c938504_hotfix.py

The script is intentionally marker-based and aborts instead of guessing if the
working tree no longer looks like commit c938504.
"""
from __future__ import annotations

import subprocess
from pathlib import Path

BASE_COMMIT = "c938504"
ROOT = Path.cwd()


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    source = path.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(
            f"ERROR: {label}: expected exactly one c938504 marker in {path}; found {count}. "
            "The file may have changed after this hotfix was generated."
        )
    path.write_text(source.replace(old, new, 1), encoding="utf-8")
    print(f"patched {path}: {label}")


def current_head() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=ROOT,
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        return "unknown"


head = current_head()
if head != "unknown" and not BASE_COMMIT.startswith(head) and not head.startswith(BASE_COMMIT):
    print(
        f"WARNING: HEAD is {head}, hotfix was authored against {BASE_COMMIT}. "
        "Marker checks will still prevent unsafe edits."
    )

manager = ROOT / "demian/resources/js/game/managers/CharacterManager.js"
workflow = ROOT / ".github/workflows/deploy-demian-pages.yml"

# ----- CharacterManager.js -----
manager_anchor = """    Object.freeze({
        id: 'builtin-uzudi',
        name: 'UZUDI / اوزودی',
        slug: 'uzudi',
        is_active: false,
        settings: {
            walk_speed: 3.75,
            run_speed: 7.1,
            sprint_speed: 7.85,
            jump_force: 7.15,
            air_control: 0.66,
            scale: 1,
            role_title: 'DARK ANGEL',
            tagline: 'Black feathered wings · Night fighter',
            speed_rating: 'A',
            power_rating: 'A+',
            signature_action: 'dark_angel',
        },
    }),
]);"""

manager_replacement = """    Object.freeze({
        id: 'builtin-uzudi',
        name: 'UZUDI / اوزودی',
        slug: 'uzudi',
        is_active: false,
        settings: {
            walk_speed: 3.75,
            run_speed: 7.1,
            sprint_speed: 7.85,
            jump_force: 7.15,
            air_control: 0.66,
            scale: 1,
            role_title: 'DARK ANGEL',
            tagline: 'Black feathered wings · Night fighter',
            speed_rating: 'A',
            power_rating: 'A+',
            signature_action: 'dark_angel',
        },
    }),
    Object.freeze({
        id: 'builtin-darya',
        name: 'DARYA / دریا',
        slug: 'darya',
        is_active: false,
        settings: {
            walk_speed: 3.55,
            run_speed: 6.9,
            sprint_speed: 7.6,
            jump_force: 6.8,
            air_control: 0.58,
            scale: 1,
            role_title: 'CAT COMPANION',
            tagline: 'Darya + Pishi · always together',
            signature_action: 'companion',
            companion: 'pishi',
            companion_always_visible: true,
        },
    }),
    Object.freeze({
        id: 'builtin-iman',
        name: 'IMAN / ایمان',
        slug: 'iman',
        is_active: false,
        settings: {
            walk_speed: 3.75,
            run_speed: 7.15,
            sprint_speed: 7.9,
            jump_force: 6.95,
            air_control: 0.60,
            scale: 1,
            role_title: 'ANCHOR / CORE',
            tagline: 'Reliable, strong, and team-first',
            signature_action: 'guard',
        },
    }),
    Object.freeze({
        id: 'builtin-setayesh',
        name: 'SETAYESH / ستایش',
        slug: 'setayesh',
        is_active: false,
        settings: {
            walk_speed: 3.4,
            run_speed: 6.6,
            sprint_speed: 7.25,
            jump_force: 6.7,
            air_control: 0.55,
            scale: 1,
            role_title: 'CURL SPARK',
            tagline: 'Style · Speed · Spark',
            speed_rating: 'A-',
            power_rating: 'B+',
        },
    }),
]);"""

replace_once(manager, manager_anchor, manager_replacement, "register Darya, Iman and Setayesh")

replace_once(
    manager,
    "ارتباط دیتابیس برقرار نبود؛ تیام، روناک، امیررضا، پارسا و اوزودی از فایل‌های داخلی اجرا شدند.",
    "ارتباط دیتابیس برقرار نبود؛ همهٔ کاراکترهای داخلی از فایل‌های بسته‌بندی‌شده اجرا شدند.",
    "update built-in fallback warning",
)

replace_once(
    manager,
    """            parsa: '#ef4444',
            uzudi: '#8b5cf6',
        }[record.slug] ?? '#a78bfa';""",
    """            parsa: '#ef4444',
            darya: '#fb7185',
            iman: '#f59e0b',
            uzudi: '#8b5cf6',
            setayesh: '#f43f5e',
        }[record.slug] ?? '#a78bfa';""",
    "add fallback palette entries",
)

# ----- GitHub Pages workflow -----
replace_once(
    workflow,
    "php artisan db:seed --class=TiamCharacterSeeder --force",
    "php artisan db:seed --class=BuiltinCharacterSeeder --force",
    "seed the complete built-in roster",
)

old_compat = """          root = Path('public/assets/characters')
          for slug in ('tiam', 'ronak', 'amirreza', 'parsa'):
              directory = root / slug
              v5_atlas = directory / f'{slug}-atlas-v5-mobile.json'
              v5_sheet = directory / f'{slug}-spritesheet-v5-mobile.png'
              legacy_atlas = directory / f'{slug}-atlas.json'
              legacy_sheet = directory / f'{slug}-spritesheet-v4.png'
              if not v5_atlas.is_file() or not v5_sheet.is_file():
                  raise SystemExit(
                      f'ERROR: V5 mobile assets are missing for {slug}: '
                      f'{v5_atlas} / {v5_sheet}'
                  )
              # A cached V4 bundle may still request the legacy filenames for a
              # short time after deployment. Keep a matching compatibility pair
              # so that rollout never ends in a 404 or a mixed atlas/sheet pair.
              if not legacy_atlas.is_file() or not legacy_sheet.is_file():
                  shutil.copy2(v5_sheet, legacy_sheet)
                  payload = json.loads(v5_atlas.read_text(encoding='utf-8'))
                  payload.setdefault('meta', {})['image'] = legacy_sheet.name
                  payload['meta']['compatibilityAlias'] = True
                  legacy_atlas.write_text(
                      json.dumps(payload, ensure_ascii=False, indent=2),
                      encoding='utf-8',
                  )
              print(f'Character assets ready: {slug}')"""

new_compat = """          root = Path('public/assets/characters')
          pack_versions = {
              'tiam': 5,
              'ronak': 5,
              'amirreza': 5,
              'parsa': 5,
              'darya': 5,
              'iman': 5,
              'uzudi': 6,
              'setayesh': 5,
          }
          for slug, pack_version in pack_versions.items():
              directory = root / slug
              atlas = directory / f'{slug}-atlas-v{pack_version}-mobile.json'
              sheet = directory / f'{slug}-spritesheet-v{pack_version}-mobile.png'
              legacy_atlas = directory / f'{slug}-atlas.json'
              legacy_sheet = directory / f'{slug}-spritesheet-v4.png'
              if not atlas.is_file() or not sheet.is_file():
                  raise SystemExit(
                      f'ERROR: V{pack_version} mobile assets are missing for {slug}: '
                      f'{atlas} / {sheet}'
                  )
              # Cached bundles may still request legacy filenames. Publish a
              # matching pair, never a mixed atlas/sheet version.
              if not legacy_atlas.is_file() or not legacy_sheet.is_file():
                  shutil.copy2(sheet, legacy_sheet)
                  payload = json.loads(atlas.read_text(encoding='utf-8'))
                  payload.setdefault('meta', {})['image'] = legacy_sheet.name
                  payload['meta']['compatibilityAlias'] = True
                  legacy_atlas.write_text(
                      json.dumps(payload, ensure_ascii=False, indent=2),
                      encoding='utf-8',
                  )
              print(f'Character assets ready: {slug} (V{pack_version})')"""

replace_once(workflow, old_compat, new_compat, "make Pages compatibility roster/version aware")

replace_once(
    workflow,
    "for slug in ('tiam', 'ronak', 'amirreza', 'parsa'):",
    "for slug in ('tiam', 'ronak', 'amirreza', 'parsa', 'darya', 'iman', 'uzudi', 'setayesh'):",
    "prefix every built-in asset URL for project Pages",
)

replace_once(
    workflow,
    """          expected_slugs = {'tiam', 'ronak', 'amirreza'}
          bundled_slugs = expected_slugs | {'parsa'}""",
    """          expected_slugs = {'tiam', 'ronak', 'amirreza', 'parsa', 'darya', 'iman', 'uzudi', 'setayesh'}
          bundled_slugs = expected_slugs
          pack_versions = {
              'tiam': 5,
              'ronak': 5,
              'amirreza': 5,
              'parsa': 5,
              'darya': 5,
              'iman': 5,
              'uzudi': 6,
              'setayesh': 5,
          }""",
    "validate the complete exported roster",
)

replace_once(
    workflow,
    """          # Validate both V5 files and the V4 compatibility filenames. This is
          # what prevents the mobile 404 seen while an older bundle is cached.
          for slug in sorted(bundled_slugs):
              directory = site / 'assets' / 'characters' / slug
              required = (
                  directory / f'{slug}-atlas-v5-mobile.json',
                  directory / f'{slug}-spritesheet-v5-mobile.png',
                  directory / f'{slug}-atlas.json',
                  directory / f'{slug}-spritesheet-v4.png',
              )""",
    """          # Validate each character's declared production pack plus V4 aliases.
          for slug in sorted(bundled_slugs):
              directory = site / 'assets' / 'characters' / slug
              pack_version = pack_versions[slug]
              required = (
                  directory / f'{slug}-atlas-v{pack_version}-mobile.json',
                  directory / f'{slug}-spritesheet-v{pack_version}-mobile.png',
                  directory / f'{slug}-atlas.json',
                  directory / f'{slug}-spritesheet-v4.png',
              )""",
    "validate mixed V5/V6 asset pairs instead of assuming V5",
)

print("\nLarge-file hotfix applied successfully.")
print("Next: cd demian && php artisan test && npm run test:ci && npm run validate:final && npm run build")
