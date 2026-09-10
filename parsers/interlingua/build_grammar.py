"""Writes interlingua_grammar.json from the hand-authored patterns.

There is no PDF to read here. The module exists so the seed script consumes both bridges
the same way, and so the pattern data goes through the same JSON contract and the same
review as the parsed content.

    python -m interlingua.build_grammar [--out PATH]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from common.patterns import document
from interlingua import patterns

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO_ROOT / "parsers" / "out" / "interlingua_grammar.json"

SOURCE_TITLE = (
    "Gode & Blair, Interlingua: A Grammar of the International Language, 2nd ed. 1955 "
    "(cited by section; not reproduced)"
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
        "parallel_rows": sum(
            len(example.parallels) for pattern in built for example in pattern.examples
        ),
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")

    print(json.dumps(payload["stats"], indent=2))
    print(f"Wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
