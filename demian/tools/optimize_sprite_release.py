#!/usr/bin/env python3
"""Release-only, pixel-exact character atlas optimization.

Only runtime/detail variants are candidates. PNG source art and the repository
are immutable. A WebP replaces a shipped PNG only if it is strictly smaller
and decoded RGBA pixels remain identical. No lossy quality settings.
"""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops

VARIANTS = ("runtime", "detail")
MIN_SAVINGS = 0.02
Image.MAX_IMAGE_PIXELS = 32_000_000


def optimize_release(release: Path) -> dict:
    release = release.resolve(strict=True)
    characters = json.loads((release / "characters.json").read_text(encoding="utf-8"))["data"]
    if not isinstance(characters, list) or not characters:
        raise ValueError("Empty character roster")
    report = {
        "schema": 1, "strategy": "lossless-webp-pixel-exact",
        "variants": list(VARIANTS), "candidates": 0, "converted": 0,
        "inputBytes": 0, "outputBytes": 0, "savedBytes": 0,
        "skippedBytes": 0, "entries": [],
    }
    for row in characters:
        slug = row["slug"]
        if not isinstance(slug, str) or not slug.isascii() or not slug.replace("-", "").isalnum() or slug.lower() != slug:
            raise ValueError("Unsafe character slug")
        base = release / "assets" / "characters" / slug
        for variant in VARIANTS:
            atlases = list(base.glob(f"{slug}-atlas-v*-{variant}.json"))
            if len(atlases) != 1:
                raise ValueError(f"Expected exactly one {slug}/{variant} atlas, found {len(atlases)}")
            atlas_path = atlases[0]
            atlas = json.loads(atlas_path.read_text(encoding="utf-8"))
            image_name = f"{atlas_path.name.removesuffix('.json').replace('-atlas-', '-spritesheet-')}.png"
            if atlas.get("meta", {}).get("image") != image_name:
                raise ValueError(f"Unexpected original atlas image for {slug}/{variant}")
            png_path = base / image_name
            webp_path = png_path.with_suffix(".webp")
            if not png_path.is_file() or webp_path.exists():
                raise ValueError(f"Missing/ambiguous PNG source for {slug}/{variant}")
            report["candidates"] += 1
            original_bytes = png_path.stat().st_size
            report["inputBytes"] += original_bytes
            # method 3 balances output size and CPU time in CI. exact=True
            # preserves even transparent pixels' invisible RGB payload.
            with Image.open(png_path) as image:
                if image.format != "PNG" or image.mode not in ("RGBA", "RGB"):
                    raise ValueError(f"Unsupported sprite input format: {png_path.name}")
                expected = atlas["meta"]["size"]
                if (image.width, image.height) != (expected["w"], expected["h"]):
                    raise ValueError(f"Atlas dimensions mismatch: {png_path.name}")
                image.save(webp_path, "WEBP", lossless=True, exact=True, method=3)
                with Image.open(webp_path) as decoded:
                    if (image.size != decoded.size
                        or ImageChops.difference(image.convert("RGB"), decoded.convert("RGB")).getbbox()
                        or ImageChops.difference(image.getchannel("A") if image.mode == "RGBA"
                            else Image.new("L", image.size, 255),
                            decoded.convert("RGBA").getchannel("A")).getbbox()):
                        webp_path.unlink(missing_ok=True)
                        raise ValueError(f"Lossless pixel round trip failed: {png_path.name}")
            candidate_bytes = webp_path.stat().st_size
            if candidate_bytes >= original_bytes * (1 - MIN_SAVINGS):
                webp_path.unlink()
                report["skippedBytes"] += original_bytes
                report["outputBytes"] += original_bytes
                report["entries"].append({
                    "slug": slug, "variant": variant, "format": "png",
                    "inputBytes": original_bytes, "outputBytes": original_bytes,
                })
                continue
            blob = webp_path.read_bytes()
            atlas["meta"]["image"] = webp_path.name
            atlas["meta"]["imageRevision"] = hashlib.sha256(blob).hexdigest()
            # No geometry/UVs, frame list, timing, palette, or animation metadata changes.
            atlas_path.write_text(json.dumps(atlas, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            png_path.unlink()
            # Keep every public manifest URL in sync with the transformed
            # atlas: TextureAtlasLoader reads the manifest's atlas_targets.
            manifest_path = base / "manifests" / "character_manifest_v4.json"
            if manifest_path.exists():
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                target = manifest.get("runtime", {}).get("atlas_targets", {}).get(variant)
                if target is not None:
                    expected_target = "../" + image_name
                    if target.get("image") != expected_target:
                        raise ValueError(f"Manifest/atlas mismatch for {slug}/{variant}")
                    target["image"] = "../" + webp_path.name
                    manifest_path.write_text(
                        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")),
                        encoding="utf-8"
                    )
            report["converted"] += 1
            report["outputBytes"] += candidate_bytes
            report["savedBytes"] += original_bytes - candidate_bytes
            report["entries"].append({
                "slug": slug, "variant": variant, "format": "webp",
                "inputBytes": original_bytes, "outputBytes": candidate_bytes,
            })
    report["savingsFraction"] = round(report["savedBytes"] / report["inputBytes"], 5) if report["inputBytes"] else 0
    (release / "sprite-optimization-report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--release", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(optimize_release(args.release), sort_keys=True))
