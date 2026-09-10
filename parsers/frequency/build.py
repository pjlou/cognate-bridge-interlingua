"""Build spoken-register lemma ranks from subtitle corpora.

Primary source: OpenSubtitles FrequencyWords (Hermit Dave) — subtitle-derived
counts that approximate conversational spoken language (same design goal as
SUBTLEX). When a local SUBTLEX-US export is present, prefer it for English.

Raw downloads live under parsers/frequency/cache/ (gitignored). The seed reads
server/data/spoken_frequency.json.

    python -m frequency.build [--offline] [--max-lemmas N]
"""

from __future__ import annotations

import argparse
import json
import math
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CACHE = Path(__file__).resolve().parent / "cache"
OUT = REPO_ROOT / "server" / "data" / "spoken_frequency.json"

FREQ_URLS = {
    "en": "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt",
    "de": "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/de/de_50k.txt",
    "nl": "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/nl/nl_50k.txt",
    "da": "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/da/da_50k.txt",
    "no": "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/no/no_50k.txt",
    "sv": "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/sv/sv_50k.txt",
    "fr": "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/fr/fr_50k.txt",
    "es": "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/es/es_50k.txt",
    "it": "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/it/it_50k.txt",
    "pt": "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/pt/pt_50k.txt",
    "ca": "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/ca/ca_50k.txt",
    "ro": "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/ro/ro_50k.txt",
    "fi": "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/fi/fi_50k.txt",
}

SOURCE = "OpenSubtitles FrequencyWords (Hermit Dave) / SUBTLEX-US when present"
SOURCE_URL = "https://github.com/hermitdave/FrequencyWords"
NOTICE = (
    "Spoken/subtitle lemma ranks for Cognate Bridge. OpenSubtitles FrequencyWords "
    "are derived from OpenSubtitles.org. Prefer SUBTLEX exports when available locally; "
    "Leipzig lists can be added under cache/leipzig/ as fallback for missing languages."
)


def parse_frequency_words(text: str, max_lemmas: int | None) -> dict[str, int]:
    counts: list[tuple[str, int]] = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        word, raw = parts[0], parts[1]
        try:
            count = int(raw)
        except ValueError:
            continue
        lemma = word.lower().strip()
        if not lemma or not any(c.isalpha() for c in lemma):
            continue
        counts.append((lemma, count))

    by_lemma: dict[str, int] = {}
    for lemma, count in counts:
        by_lemma[lemma] = by_lemma.get(lemma, 0) + count

    ordered = sorted(by_lemma.items(), key=lambda item: (-item[1], item[0]))
    if max_lemmas is not None:
        ordered = ordered[:max_lemmas]
    return {lemma: rank for rank, (lemma, _count) in enumerate(ordered, start=1)}


def parse_subtlex_us(text: str, max_lemmas: int | None) -> dict[str, int]:
    lines = text.splitlines()
    if not lines:
        return {}
    header = lines[0].replace(";", "\t").split("\t")
    header_l = [h.strip().lower() for h in header]
    try:
        word_i = next(i for i, h in enumerate(header_l) if h in ("word", "spelling"))
    except StopIteration:
        return {}
    freq_i = next(
        (i for i, h in enumerate(header_l) if h in ("freqcount", "freq", "frequency", "cdcount")),
        None,
    )
    if freq_i is None:
        return {}

    counts: dict[str, int] = {}
    for line in lines[1:]:
        parts = line.replace(";", "\t").split("\t")
        if len(parts) <= max(word_i, freq_i):
            continue
        lemma = parts[word_i].strip().lower()
        try:
            freq = int(float(parts[freq_i].replace(",", "")))
        except ValueError:
            continue
        if not lemma:
            continue
        counts[lemma] = max(counts.get(lemma, 0), freq)

    ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    if max_lemmas is not None:
        ordered = ordered[:max_lemmas]
    return {lemma: rank for rank, (lemma, _count) in enumerate(ordered, start=1)}


def coverage_rank_cutoff(ranks: dict[str, int], coverage: float = 0.95) -> int | None:
    if not ranks:
        return None
    n = max(ranks.values())
    weights = [1.0 / (r * math.log(n + 1)) for r in range(1, n + 1)]
    total = sum(weights)
    if total <= 0:
        return None
    running = 0.0
    for rank, weight in enumerate(weights, start=1):
        running += weight
        if running / total >= coverage:
            return rank
    return n


def fetch(url: str, dest: Path, offline: bool) -> str | None:
    if dest.exists():
        return dest.read_text(encoding="utf-8", errors="replace")
    if offline:
        return None
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        with urllib.request.urlopen(url, timeout=120) as response:
            data = response.read().decode("utf-8", errors="replace")
        dest.write_text(data, encoding="utf-8")
        return data
    except Exception as exc:  # noqa: BLE001
        print(f"warn: could not fetch {url}: {exc}")
        return None


def build_languages(offline: bool, max_lemmas: int | None) -> dict[str, dict[str, int]]:
    languages: dict[str, dict[str, int]] = {}

    subtlex = CACHE / "SUBTLEX-US.txt"
    if subtlex.exists():
        en = parse_subtlex_us(subtlex.read_text(encoding="utf-8", errors="replace"), max_lemmas)
        if en:
            languages["en"] = en
            print(f"en: {len(en)} lemmas from local SUBTLEX-US")

    for code, url in FREQ_URLS.items():
        if code in languages:
            continue
        text = fetch(url, CACHE / f"{code}_50k.txt", offline=offline)
        if not text:
            continue
        ranks = parse_frequency_words(text, max_lemmas)
        if ranks:
            languages[code] = ranks
            print(f"{code}: {len(ranks)} lemmas from FrequencyWords")

    return languages


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--max-lemmas", type=int, default=20_000)
    args = parser.parse_args(argv)

    languages = build_languages(offline=args.offline, max_lemmas=args.max_lemmas)
    if "en" not in languages:
        raise SystemExit(
            "No English spoken ranks available. Fetch FrequencyWords or place "
            "SUBTLEX-US.txt under parsers/frequency/cache/."
        )

    coverage_95 = coverage_rank_cutoff(languages["en"], 0.95)
    payload = {
        "source": SOURCE,
        "source_url": SOURCE_URL,
        "corpus": "OpenSubtitles subtitle word frequencies (spoken register)",
        "notice": NOTICE,
        "description": (
            "Per-language lemma ranks from subtitle corpora (OpenSubtitles FrequencyWords; "
            "SUBTLEX-US when present). Rank 1 = most frequent. English ranks drive "
            "bridge_vocabulary.frequency_rank at seed."
        ),
        "band_size": 500,
        "coverage_95_rank_en": coverage_95,
        "languages": {
            code: {
                "lemma_count": len(ranks),
                "max_rank": max(ranks.values()) if ranks else 0,
                "lemmas": ranks,
            }
            for code, ranks in sorted(languages.items())
        },
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} languages={list(languages)} coverage_95_en={coverage_95}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
