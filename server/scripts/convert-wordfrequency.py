"""Converts the COCA frequency TSV into the JSON the seed reads.

The converted file keeps the required attribution to www.wordfrequency.info.
"""

from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SRC = REPO / "docs" / "COCA English word frequency list.txt"
OUT = REPO / "server" / "data" / "wordfrequency.json"

NOTICE = (
    "If you re-post the list on the web, you must clearly indicate "
    "www.wordfrequency.info as the source of the data."
)


def main() -> None:
    lemmas: dict[str, int] = {}
    started = False
    for line in SRC.read_text(encoding="utf-8").splitlines():
        if not started:
            if line.startswith("rank") and "lemma" in line:
                started = True
            continue
        parts = line.split("\t")
        if len(parts) < 2:
            continue
        try:
            rank = int(parts[0])
        except ValueError:
            continue
        lemma = parts[1].strip().lower()
        if not lemma:
            continue
        previous = lemmas.get(lemma)
        if previous is None or rank < previous:
            lemmas[lemma] = rank

    payload = {
        "source": "www.wordfrequency.info",
        "source_url": "https://www.wordfrequency.info",
        "corpus": "Corpus of Contemporary American English (COCA)",
        "corpus_url": "https://www.english-corpora.org/coca",
        "notice": NOTICE,
        "description": (
            "Lemma ranks from the COCA word-frequency lists published at "
            "www.wordfrequency.info. Where a lemma appears more than once "
            "(different parts of speech), the lowest rank is kept."
        ),
        "lemma_count": len(lemmas),
        "max_rank": max(lemmas.values()) if lemmas else 0,
        "lemmas": lemmas,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} ({len(lemmas)} lemmas, max rank {payload['max_rank']})")


if __name__ == "__main__":
    main()
