"""Builds interlingua.json: IEDICT entries plus rule-generated, validated cognates.

    python -m interlingua.build [--offline] [--limit N] [--no-validate]

The pipeline is: read IEDICT, infer a part of speech, run every applicable correspondence
rule to predict target-language forms, then keep the predictions an open lexicon actually
attests. Each surviving cognate carries the rule that produced it, so the app can explain
itself rather than just assert.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

from interlingua import iedict, lexicons, pos
from interlingua.phonology import annotate_entries as annotate_ipa
from interlingua.phonology import ipa_stats
from interlingua.rules import ALL_RULES, TARGET_LANGUAGES, predict

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO_ROOT / "parsers" / "out" / "interlingua.json"

# Confidence applied when no lexicon was available to check a prediction against. Kept
# well below the validated floor so the UI can distinguish "confirmed" from "predicted".
UNVALIDATED_CONFIDENCE = 0.35

# Predictions below this survive only if attested. A rule with a low prior that produces
# an attested form is still trustworthy -- attestation is the stronger evidence.
VALIDATED_FLOOR = 0.75


def build_entry(entry: iedict.IedictEntry, validator: lexicons.Validator | None) -> dict:
    part_of_speech, basis = pos.infer(entry.headword, entry.glosses)

    cognates: list[dict] = []
    # Several rules can predict the same form for one language; keep the best-evidenced.
    best: dict[tuple[str, str], dict] = {}

    for prediction in predict(entry.headword):
        if validator is None:
            attested, lexicon = False, None
        else:
            result = validator.check(prediction.target, prediction.form)
            attested, lexicon = result.attested, result.lexicon

        if lexicon is None:
            confidence = round(prediction.rule.confidence * UNVALIDATED_CONFIDENCE, 2)
        elif attested:
            confidence = round(max(prediction.rule.confidence, VALIDATED_FLOOR), 2)
        else:
            # Checked and not found. Discard: an unattested prediction is exactly what
            # validation exists to remove, and keeping it would put invented words in
            # front of a learner.
            continue

        record = {
            "target_language": prediction.target,
            "target_word": prediction.form,
            "rule_code": prediction.rule.code,
            "provenance": "rule_generated",
            "confidence": confidence,
            "validated_against": lexicon if attested else None,
        }

        key = (prediction.target, prediction.form)
        existing = best.get(key)
        if existing is None or record["confidence"] > existing["confidence"]:
            best[key] = record

    cognates = sorted(best.values(), key=lambda c: (c["target_language"], -c["confidence"]))

    return {
        "headword": entry.headword,
        "part_of_speech": part_of_speech,
        "part_of_speech_basis": basis,
        "gloss_en": entry.glosses[0],
        "glosses_en": entry.glosses,
        "is_multiword": entry.is_multiword,
        "cognates": cognates,
        "source_ref": "IEDICT (Denisowski, 2019)",
    }


def summarise(records: list[dict], validator: lexicons.Validator | None) -> dict:
    by_language: Counter[str] = Counter()
    validated = 0
    for record in records:
        for cognate in record["cognates"]:
            by_language[cognate["target_language"]] += 1
            if cognate["validated_against"]:
                validated += 1

    pos_basis = Counter(record["part_of_speech_basis"] for record in records)
    total_cognates = sum(by_language.values())

    return {
        "entries": len(records),
        "entries_with_cognates": sum(1 for r in records if r["cognates"]),
        "cognate_pairs": total_cognates,
        "validated_cognate_pairs": validated,
        "cognates_by_language": dict(sorted(by_language.items())),
        "part_of_speech_basis": dict(pos_basis.most_common()),
        "entries_without_part_of_speech": sum(
            1 for r in records if r["part_of_speech"] is None
        ),
        "lexicon_sizes": validator.sizes() if validator else {},
        "rules": len(ALL_RULES),
    }


def rule_rows() -> list[dict]:
    """The rules as they will be seeded into `correspondence_rules`."""
    return [
        {
            "code": rule.code,
            "target_language": rule.target,
            "description": rule.description,
            "source_note": rule.source_note,
            "pattern_from": rule.pattern_from,
            "pattern_to": rule.pattern_to,
            "example_bridge": rule.example_bridge,
            "example_target": rule.example_target,
        }
        for rule in ALL_RULES
    ]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Fail rather than download IEDICT; use the cached copy.",
    )
    parser.add_argument(
        "--no-validate",
        action="store_true",
        help="Skip lexicon validation. Every prediction is kept at reduced confidence.",
    )
    parser.add_argument("--limit", type=int, help="Process only the first N entries.")
    args = parser.parse_args(argv)

    print("Loading IEDICT...", file=sys.stderr)
    entries = iedict.load(offline=args.offline)
    if args.limit:
        entries = entries[: args.limit]
    print(f"  {len(entries)} entries", file=sys.stderr)

    validator: lexicons.Validator | None = None
    if not args.no_validate:
        languages = list(TARGET_LANGUAGES)
        missing = [language for language in languages if lexicons.load(language) is None]
        for language in missing:
            print(f"Fetching {lexicons.LEXICON_NAMES[language]} lexicon...", file=sys.stderr)
            try:
                lexicons.fetch(language)
            except Exception as error:  # noqa: BLE001 - a download failure must not be fatal
                print(f"  could not fetch {language}: {error}", file=sys.stderr)

        validator = lexicons.Validator(languages)
        print(f"  lexicons available: {validator.available_languages}", file=sys.stderr)

    records = annotate_ipa([build_entry(entry, validator) for entry in entries])
    stats = summarise(records, validator)
    stats["ipa"] = ipa_stats(records)

    payload = {
        "language": {
            "code": "ia",
            "name": "Interlingua",
            "family": "Romance",
            "description": (
                "The international auxiliary language published by IALA in 1951. Its "
                "vocabulary is the set of prototypes standing behind the forms that "
                "international words take across the Romance languages and English."
            ),
            "license_note": "Vocabulary from IEDICT by Paul Denisowski, CC BY 3.0",
        },
        "source": iedict.ATTRIBUTION,
        "stats": stats,
        "rules": rule_rows(),
        "entries": records,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")

    print(json.dumps(stats, indent=2, ensure_ascii=False), file=sys.stderr)
    print(f"Wrote {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
