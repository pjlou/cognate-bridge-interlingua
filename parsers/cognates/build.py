"""Etymological and similarity-based cognate patches.

Augments existing parsed / rule_generated cognates. Etym links come from a curated
Etymological-Wordnet-style fixture (full de Melo dump is optional under cache/).
Surface-transparent pairs come from MUSE bilingual dictionaries when present, else
from the bundled fixture.

    python -m cognates.build [--offline]
"""

from __future__ import annotations

import argparse
import json
import urllib.request
from pathlib import Path

from cognates.similarity import normalized_levenshtein, transparency

REPO_ROOT = Path(__file__).resolve().parents[2]
CACHE = Path(__file__).resolve().parent / "cache"
FIXTURES = Path(__file__).resolve().parent / "fixtures"
OUT = REPO_ROOT / "parsers" / "out" / "etym_cognates.json"

SIMILARITY_FLOOR = 0.55
MUSE_PAIRS = {
    "de": "https://dl.fbaipublicfiles.com/arrival/dictionaries/en-de.txt",
    "es": "https://dl.fbaipublicfiles.com/arrival/dictionaries/en-es.txt",
    "fr": "https://dl.fbaipublicfiles.com/arrival/dictionaries/en-fr.txt",
    "it": "https://dl.fbaipublicfiles.com/arrival/dictionaries/en-it.txt",
    "pt": "https://dl.fbaipublicfiles.com/arrival/dictionaries/en-pt.txt",
    "nl": "https://dl.fbaipublicfiles.com/arrival/dictionaries/en-nl.txt",
    "ro": "https://dl.fbaipublicfiles.com/arrival/dictionaries/en-ro.txt",
}


def load_etym_fixture() -> dict[str, list[dict]]:
    path = FIXTURES / "etym_links.json"
    return json.loads(path.read_text(encoding="utf-8"))


def load_muse_fixture() -> dict[str, list[tuple[str, str]]]:
    path = FIXTURES / "muse_pairs.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {lang: [tuple(pair) for pair in pairs] for lang, pairs in raw.items()}


def fetch_muse(lang: str, offline: bool) -> list[tuple[str, str]]:
    url = MUSE_PAIRS.get(lang)
    if not url:
        return []
    dest = CACHE / f"muse_en-{lang}.txt"
    if dest.exists():
        text = dest.read_text(encoding="utf-8", errors="replace")
    elif offline:
        return []
    else:
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            with urllib.request.urlopen(url, timeout=120) as response:
                text = response.read().decode("utf-8", errors="replace")
            dest.write_text(text, encoding="utf-8")
        except Exception as exc:  # noqa: BLE001
            print(f"warn: MUSE en-{lang}: {exc}")
            return []

    pairs: list[tuple[str, str]] = []
    for line in text.splitlines():
        parts = line.strip().split()
        if len(parts) < 2:
            continue
        pairs.append((parts[0].lower(), parts[1].lower()))
    return pairs


def build_by_english(offline: bool) -> dict[str, list[dict]]:
    """English lemma → list of {language, word, provenance, confidence, notes?}."""
    by_en: dict[str, list[dict]] = {}

    for en, links in load_etym_fixture().items():
        bucket = by_en.setdefault(en.lower(), [])
        for link in links:
            bucket.append(
                {
                    "language": link["language"],
                    "word": link["word"],
                    "provenance": "curated",
                    "confidence": float(link.get("confidence", 0.9)),
                    "validated_against": "etymological-wordnet-fixture",
                    "notes": link.get("notes"),
                }
            )

    muse = load_muse_fixture()
    for lang in MUSE_PAIRS:
        pairs = fetch_muse(lang, offline=offline) or muse.get(lang, [])
        for en, target in pairs:
            score = transparency(en, target)
            if score < SIMILARITY_FLOOR:
                continue
            bucket = by_en.setdefault(en.lower(), [])
            # Skip if etym already listed the same form.
            if any(
                row["language"] == lang and row["word"].lower() == target.lower()
                for row in bucket
            ):
                continue
            has_etym = any(row["language"] == lang and row["provenance"] == "curated" for row in bucket)
            notes = None
            if not has_etym and score >= 0.85:
                notes = "high surface similarity without etym link; possible false friend"
            bucket.append(
                {
                    "language": lang,
                    "word": target,
                    "provenance": "similarity",
                    "confidence": round(score, 2),
                    "validated_against": "muse-bilingual",
                    "notes": notes,
                }
            )

    return by_en


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", default=True)
    parser.add_argument("--online", action="store_true", help="Attempt MUSE downloads")
    args = parser.parse_args(argv)
    offline = not args.online

    by_en = build_by_english(offline=offline)
    payload = {
        "source": "Etymological Wordnet-style fixture + MUSE bilingual similarity",
        "source_url": "https://www1.icsi.berkeley.edu/~demelo/etymwn/",
        "description": (
            "Augment cognates: curated etym links (curated provenance) and "
            "translation-pair edit-distance matches (similarity provenance)."
        ),
        "stats": {
            "english_lemmas": len(by_en),
            "rows": sum(len(v) for v in by_en.values()),
        },
        "by_english": by_en,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(payload["stats"], indent=2))
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
