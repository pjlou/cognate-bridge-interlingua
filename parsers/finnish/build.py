"""Build finnish.json — experimental Finnish core with Estonian cognates.

    python -m finnish.build [--offline]

Vocabulary is a curated pedagogical core (not a full dictionary). Frequency ranks
come from OpenSubtitles FrequencyWords `fi` when available.
"""

from __future__ import annotations

import argparse
import json
import urllib.request
from collections import Counter
from pathlib import Path

from finnish.lemmas import unique_lemmas

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO_ROOT / "parsers" / "out" / "finnish.json"
FREQ_CACHE = REPO_ROOT / "parsers" / "frequency" / "cache" / "fi_50k.txt"
FREQ_URL = (
    "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/fi/fi_50k.txt"
)
ET_FIXTURE = Path(__file__).resolve().parent / "fixtures" / "et_cognates.json"

SOURCE_REF = (
    "Cognate Bridge experimental Finnish core; spoken ranks from OpenSubtitles "
    "FrequencyWords (fi). Estonian cognates are curated pedagogical pairs."
)


def load_frequency_ranks(offline: bool) -> dict[str, int]:
    if FREQ_CACHE.exists():
        text = FREQ_CACHE.read_text(encoding="utf-8", errors="replace")
    elif offline:
        return {}
    else:
        FREQ_CACHE.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(FREQ_URL, timeout=120) as response:
            text = response.read().decode("utf-8", errors="replace")
        FREQ_CACHE.write_text(text, encoding="utf-8")

    ranks: dict[str, int] = {}
    for line in text.splitlines():
        parts = line.strip().split()
        if len(parts) < 2:
            continue
        lemma = parts[0].lower()
        if lemma in ranks:
            continue
        ranks[lemma] = len(ranks) + 1
    return ranks


def write_et_fixture(lemmas: list[dict]) -> None:
    pairs = [
        {
            "fi": row["headword"],
            "et": row["et"],
            "gloss_en": row["gloss_en"],
            "pos": row["part_of_speech"],
        }
        for row in lemmas
        if row.get("et")
    ]
    # Stable unique by Finnish headword.
    by_fi: dict[str, dict] = {}
    for pair in pairs:
        by_fi.setdefault(pair["fi"].lower(), pair)
    payload = {"description": "Curated Finnish–Estonian cognate pairs for experimental module", "pairs": list(by_fi.values())}
    ET_FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    ET_FIXTURE.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")


def build_entry(row: dict, ranks: dict[str, int]) -> dict:
    cognates = []
    if row.get("et"):
        cognates.append(
            {
                "target_language": "et",
                "target_word": row["et"],
                "rule_code": None,
                "provenance": "curated",
                "confidence": 0.9,
                "validated_against": "finnish-et-cognate-fixture",
            }
        )
    rank = ranks.get(row["headword"].lower())
    return {
        "headword": row["headword"],
        "part_of_speech": row["part_of_speech"],
        "gloss_en": row["gloss_en"],
        "glosses_en": row["glosses_en"],
        "is_multiword": " " in row["headword"],
        "frequency_hint": rank,
        "cognates": cognates,
        "source_ref": SOURCE_REF,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args(argv)

    lemmas = unique_lemmas()
    write_et_fixture(lemmas)
    ranks = load_frequency_ranks(offline=args.offline)

    entries = [build_entry(row, ranks) for row in lemmas]
    # Prefer higher-frequency lemmas first in the file (seed still sorts by its own scores).
    entries.sort(key=lambda e: (e["frequency_hint"] is None, e["frequency_hint"] or 10**9, e["headword"]))

    by_lang: Counter[str] = Counter()
    for entry in entries:
        for cognate in entry["cognates"]:
            by_lang[cognate["target_language"]] += 1

    payload = {
        "language": {
            "code": "fin",
            "name": "Finnish",
            "family": "Uralic",
            "description": (
                "Experimental Finnish study track for Cognate Bridge. Flashcards teach "
                "Finnish; Estonian cognates are shown as the correspondence layer. Hidden "
                "by default (ENABLE_EXPERIMENTAL_BRIDGES=fin)."
            ),
            "source_url": "https://en.wikibooks.org/wiki/Suomen_kieli_ulkomaalaisille",
            "license_note": (
                "Experimental pedagogical core authored for Cognate Bridge. Spoken ranks "
                "from OpenSubtitles FrequencyWords (fi). Grammar cites Wikibooks topics "
                "(CC BY-SA) without bulk copying. Not a production bridge."
            ),
        },
        "source": SOURCE_REF,
        "stats": {
            "entries": len(entries),
            "entries_with_cognates": sum(1 for e in entries if e["cognates"]),
            "cognate_pairs": sum(by_lang.values()),
            "cognates_by_language": dict(sorted(by_lang.items())),
            "with_frequency_rank": sum(1 for e in entries if e["frequency_hint"] is not None),
        },
        "rules": [],
        "entries": entries,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(payload["stats"], indent=2))
    print(f"Wrote {args.out}")
    print(f"Wrote {ET_FIXTURE} ({payload['stats']['cognate_pairs']} et pairs)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
