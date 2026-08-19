#!/usr/bin/env python3
"""Shared discovery/profile helpers for Demian character-art build tools.

A character becomes buildable by placing its source assets under
public/assets/characters/<slug>/ and, optionally, a <slug>-character.json profile.
This keeps future character additions data-driven instead of requiring every build
script to maintain a separate hard-coded roster.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
CHARACTER_ROOT = ROOT / "public" / "assets" / "characters"

LEGACY_SPEECH: dict[str, list[str]] = {
    "tiam": ["گی", "کافی فقط بچ کافی", "متالیکا دیگه خز شد", "بریم یه دود بگیریم", "باختم", "صدرا لته آرت تمرین کن", "صدرا بیس تمرین کن", "ستایش بیا اینجا"],
    "ronak": ["روناک وارد شد", "آرکید یعنی همین", "بزن بریم", "این یکی رو من می‌برم", "حرکت بعدی رو ببین", "فول انرژی", "رکورد تازه", "مرحله بعد کجاست؟"],
    "amirreza": ["بال بزن بریم", "از همه سریع‌ترم", "الان وقت های‌اسکوره", "پرواز کوتاه، برد بزرگ", "سرعت یعنی امیررضا", "بزن بریم یه دور سریع", "فول اسپید!", "با بال‌ها می‌بریم"],
    "parsa": ["بزن بریم", "سرعت بالا", "رکورد رو بزن", "این یکی سریع بود", "فول پاور", "مرحله بعد", "گیتار آماده‌ست", "تمومش کنیم"],
}


def character_dir(slug: str) -> Path:
    return CHARACTER_ROOT / str(slug).strip().lower()


def profile_path(slug: str) -> Path:
    normalized = str(slug).strip().lower()
    return character_dir(normalized) / f"{normalized}-character.json"


def load_profile(slug: str) -> dict:
    path = profile_path(slug)
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def character_name(slug: str) -> str:
    profile = load_profile(slug)
    name = str(profile.get("name") or "").strip()
    return name or str(slug).upper()


def speech_payload(slug: str) -> dict[str, object]:
    profile = load_profile(slug)
    speech = profile.get("speech") if isinstance(profile.get("speech"), dict) else {}
    messages = speech.get("messages") if isinstance(speech, dict) else None
    if not isinstance(messages, list) or not messages:
        messages = LEGACY_SPEECH.get(str(slug).lower(), ["بزن بریم", "مرحله بعد", "رکورد تازه"])
    return {
        "duration": float(speech.get("duration", 3.2)) if isinstance(speech, dict) else 3.2,
        "messages": [str(message) for message in messages if str(message).strip()],
    }


def discover_characters(required_templates: Iterable[str]) -> tuple[str, ...]:
    templates = tuple(required_templates)
    if not CHARACTER_ROOT.exists():
        return ()
    found: list[str] = []
    for directory in sorted(path for path in CHARACTER_ROOT.iterdir() if path.is_dir()):
        slug = directory.name.lower()
        if all((directory / template.format(character=slug)).exists() for template in templates):
            found.append(slug)
    return tuple(found)


def resolve_targets(requested: Iterable[str], required_templates: Iterable[str]) -> tuple[str, ...]:
    requested_slugs = tuple(dict.fromkeys(str(value).strip().lower() for value in requested if str(value).strip()))
    if requested_slugs:
        missing: list[str] = []
        valid: list[str] = []
        templates = tuple(required_templates)
        for slug in requested_slugs:
            directory = character_dir(slug)
            if not directory.is_dir() or not all(
                (directory / template.format(character=slug)).exists() for template in templates
            ):
                missing.append(slug)
            else:
                valid.append(slug)
        if missing:
            raise FileNotFoundError(f"Missing required character-art source files for: {', '.join(missing)}")
        return tuple(valid)
    return discover_characters(required_templates)
