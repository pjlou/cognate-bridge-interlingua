"""Writes finnish_grammar.json from hand-authored patterns.

    python -m finnish.build_grammar [--out PATH]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from common.patterns import document
from finnish import patterns

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO_ROOT / "parsers" / "out" / "finnish_grammar.json"

SOURCE_TITLE = (
    "Wikibooks Suomen kieli ulkomaalaisille (CC BY-SA; cited by topic); "
    "example sentences newly written for Cognate Bridge experimental Finnish module"
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args(argv)

    built = patterns.build()
    payload = document(patterns.BRIDGE_CODE, built)
    payload["source"] = SOURCE_TITLE
    payload["stats"] = {
        "patterns": len(built),
        "examples": sum(len(pattern.examples) for pattern in built),
        "with_parallels": sum(
            1 for pattern in built for example in pattern.examples if example.parallels
        ),
        "slugs": [pattern.slug for pattern in built],
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(payload["stats"], indent=2))
    print(f"Wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
