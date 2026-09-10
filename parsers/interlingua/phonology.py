"""Grapheme-to-phoneme for Interlingua, from Gode & Blair §§1-13.

IEDICT has no transcriptions, unlike the Wordbouk's irregulars. Every IPA string here
is derived from the spelling/pronunciation chapter of *Interlingua: A Grammar of the
International Language* (Gode & Blair, 1951; 2nd ed. 1955) and the matching section of
the IED introduction. Facts about how letters are pronounced are not copyrightable; the
module restates the substance of those rules and cites the sections. It does not copy
tables or dictionary respellings.

A derived pass is `derived_phonology` when the spelling is ordinary Interlingua letters.
`uncertain_phonology` is for leftover punctuation, digits, or guest-word diacritics —
IEDICT cannot show the 1951 dictionary's rare stress respellings either, and those stay
on the regular rule rather than being guessed.

Conservative choices where the grammar allows options: `c` before e/i/y is [ts] not [s];
intervocalic `s` and `x` stay voiceless; `j` is [ʒ]; `h` is sounded except after `r`/`t`;
unstressed `ti` + vowel is [tsj] unless `s` precedes it.
"""

from __future__ import annotations

import json
import re
import unicodedata
from collections.abc import Iterable
from pathlib import Path

DIRECT = "direct_phonology"
DERIVED = "derived_phonology"
UNCERTAIN = "uncertain_phonology"

GRAMMAR = (
    "Gode & Blair, Interlingua: A Grammar of the International Language, 2nd ed. 1955"
)
SOURCE_NOTE = f"{GRAMMAR}, §§1–13; IED Introduction, Spelling and Pronunciation"

_VOWELS = set("aeiouy")
_CONS = set("bcdfghjklmnpqrstvwxz")
_DIPHTHONGS = ("ai", "au", "eu")
_SUFFIX_ON_FIRST = ("ifico", "ific")
_SUFFIX_BEFORE = ("ica", "ico", "ide", "ido", "ula", "ulo", "ic")
_AGE = re.compile(r"age$")
_FOLD = str.maketrans({"'": "", "\u2019": "", "\u2018": ""})
_IGNORABLE = set("!?")
_STOP_FRIC = {"b", "d", "f", "g", "k", "p", "t", "v"}
_VOWEL_PHONES = {"a", "e", "i", "o", "u", "ai", "au", "eu"}
_GLIDES = {"j", "w"}


def _fold(word: str) -> str:
    return word.strip().translate(_FOLD).lower()


def _letters_only(word: str) -> str:
    return "".join(char for char in word if char in _VOWELS or char in _CONS)


def _prepare_token(word: str) -> tuple[str, bool]:
    """Letters to transcribe, and whether the spelling is ordinary Interlingua.

    Guest-word diacritics are folded (`café` → `cafe`) so the IPA still has vowels,
    but those rows stay `uncertain_phonology`. Trailing `!`/`?` on an otherwise
    regular word is ignored.
    """
    folded = _fold(word)
    if not folded:
        return "", False
    nfkd = unicodedata.normalize("NFKD", folded)
    stripped = "".join(char for char in nfkd if not unicodedata.combining(char))
    had_diacritic = stripped != folded
    letters = _letters_only(stripped)
    leftover = "".join(
        char for char in stripped if char not in _VOWELS and char not in _CONS
    )
    leftover = "".join(char for char in leftover if char not in _IGNORABLE)
    confident = bool(letters) and not leftover and not had_diacritic
    return letters, confident


def _vle_vowel_index(word: str) -> int | None:
    """Vowel of a final -le/-ne/-re preceded by a vowel, or None."""
    if len(word) >= 3 and word[-2:] in {"le", "ne", "re"} and word[-3] in _VOWELS:
        return len(word) - 3
    return None


def _syllable_nuclei(word: str) -> list[int]:
    """Letter indices of syllabic vowels (diphthongs count as one)."""
    vle = _vle_vowel_index(word)
    nuclei: list[int] = []
    index = 0
    length = len(word)
    while index < length:
        pair = word[index : index + 2]
        if pair in _DIPHTHONGS:
            nuclei.append(index)
            index += 2
            continue
        char = word[index]
        if char in _VOWELS:
            nxt = word[index + 1] if index + 1 < length else ""
            if char in "iuy" and nxt in _VOWELS and index != vle:
                index += 1
                continue
            nuclei.append(index)
        index += 1
    return nuclei


def _last_vowel_index(span: str) -> int | None:
    for index in range(len(span) - 1, -1, -1):
        if span[index] in _VOWELS:
            return index
    return None


def _first_vowel_index(word: str) -> int | None:
    for index, char in enumerate(word):
        if char in _VOWELS:
            return index
    return None


def _last_consonant_index(word: str) -> int | None:
    for index in range(len(word) - 1, -1, -1):
        if word[index] in _CONS:
            return index
    return None


def _suffix_stress(word: str) -> int | None:
    for suffix in _SUFFIX_ON_FIRST:
        if word.endswith(suffix) and len(word) > len(suffix):
            return len(word) - len(suffix)
    for suffix in _SUFFIX_BEFORE:
        if word.endswith(suffix) and len(word) > len(suffix):
            stem = word[: -len(suffix)]
            vowel = _last_vowel_index(stem)
            return vowel if vowel is not None else len(word) - len(suffix)
    return None


def stressed_letter(word: str) -> int | None:
    """Index of the stressed vowel letter, or None if the word has no vowel.

    The plural -s does not move stress, so a final vowel+s is ignored when locating it.
    Suffix rules beat the antepenult -le/-ne/-re pattern, which beats the default
    "vowel before the last consonant".
    """
    if len(word) > 2 and word[-1] == "s" and word[-2] in _VOWELS:
        stem = word[:-1]
        index = stressed_letter(stem)
        return index
    suffix = _suffix_stress(word)
    if suffix is not None:
        return suffix
    if _vle_vowel_index(word) is not None:
        nuclei = _syllable_nuclei(word)
        if len(nuclei) >= 3:
            return nuclei[-3]
    last_cons = _last_consonant_index(word)
    if last_cons is not None:
        vowel = _last_vowel_index(word[:last_cons])
        if vowel is not None:
            return vowel
    return _first_vowel_index(word)


def _palatal_ti(word: str, index: int, stressed: int | None) -> bool:
    """Unstressed `ti` + vowel, not after `s`."""
    if index + 2 >= len(word):
        return False
    if word[index] != "t" or word[index + 1] != "i":
        return False
    if word[index + 2] not in _VOWELS:
        return False
    if index > 0 and word[index - 1] == "s":
        return False
    return stressed != index + 1


def _n_assimilates(word: str, index: int) -> bool:
    """`n` becomes [ŋ] before a [g] or [k] sound."""
    nxt = word[index + 1] if index + 1 < len(word) else ""
    if nxt in {"g", "k", "q"}:
        return True
    if nxt == "c":
        after = word[index + 2] if index + 2 < len(word) else ""
        return after not in {"e", "i", "y"}
    return False


def _emit_graphemes(word: str, stressed: int | None) -> list[tuple[str, int, int]]:
    """Returns (ipa, letter_index, letter_length) tokens."""
    tokens: list[tuple[str, int, int]] = []
    index = 0
    length = len(word)
    while index < length:
        char = word[index]
        nxt = word[index + 1] if index + 1 < length else ""
        nxt2 = word[index + 2] if index + 2 < length else ""

        if char == "p" and nxt == "h":
            tokens.append(("f", index, 2))
            index += 2
            continue
        if char == "q" and nxt == "u":
            tokens.append(("kw", index, 2))
            index += 2
            continue
        if char == "c" and nxt == "h":
            tokens.append(("k", index, 2))
            index += 2
            continue
        if char == "t" and nxt == "h":
            tokens.append(("t", index, 2))
            index += 2
            continue
        if char == "r" and nxt == "h":
            tokens.append(("r", index, 2))
            index += 2
            continue
        if char == "s" and nxt == "s":
            tokens.append(("s", index, 2))
            index += 2
            continue
        if char == "c" and nxt == "c":
            if nxt2 in {"e", "i", "y"}:
                tokens.append(("k", index, 1))
                index += 1
                continue
            tokens.append(("k", index, 2))
            index += 2
            continue
        if char in _CONS and nxt == char:
            tokens.append((char if char != "x" else "ks", index, 2))
            index += 2
            continue
        if _palatal_ti(word, index, stressed):
            tokens.append(("ts", index, 1))
            tokens.append(("j", index + 1, 1))
            index += 2
            continue
        if char == "c":
            tokens.append(("ts" if nxt in {"e", "i", "y"} else "k", index, 1))
            index += 1
            continue
        if char == "g" and _AGE.search(word) and index == length - 2:
            tokens.append(("ʒ", index, 1))
            index += 1
            continue
        if char == "n":
            tokens.append(("ŋ" if _n_assimilates(word, index) else "n", index, 1))
            index += 1
            continue
        if char == "j":
            tokens.append(("ʒ", index, 1))
            index += 1
            continue
        if char == "x":
            tokens.append(("ks", index, 1))
            index += 1
            continue
        if char == "h":
            tokens.append(("h", index, 1))
            index += 1
            continue
        if word[index : index + 2] in _DIPHTHONGS:
            pair = word[index : index + 2]
            tokens.append((pair, index, 2))
            index += 2
            continue
        if char in "iuy" and nxt in _VOWELS and index != stressed:
            tokens.append(("j" if char in "iy" else "w", index, 1))
            index += 1
            continue
        if char == "y":
            tokens.append(("i", index, 1))
            index += 1
            continue
        if char in _VOWELS:
            tokens.append((char, index, 1))
            index += 1
            continue
        if char in _CONS:
            tokens.append((char, index, 1))
            index += 1
            continue
        index += 1
    return tokens


def _is_vowel_phone(phone: str) -> bool:
    return phone in _VOWEL_PHONES


def _is_cons_phone(phone: str) -> bool:
    return phone not in _VOWEL_PHONES and phone not in {"ˈ", " "}


def _valid_cluster(left: str, right: str) -> bool:
    if right in {"l", "r"} and left in _STOP_FRIC:
        return True
    if left == "ts" and right == "j":
        return True
    if right == "w" and left in {"g", "k", "s"}:
        return True
    return False


def _place_stress(phones: list[str], vowel_at: int) -> str:
    vowel_count = sum(1 for phone in phones if _is_vowel_phone(phone))
    if vowel_count <= 1:
        return "".join(phones)
    insert_at = vowel_at
    while insert_at > 0 and phones[insert_at - 1] in _GLIDES:
        insert_at -= 1
    if insert_at > 0 and _is_cons_phone(phones[insert_at - 1]):
        cons = insert_at - 1
        if phones[cons] == "ks":
            pass
        elif phones[cons] == "ŋ":
            pass
        elif cons > 0 and _is_cons_phone(phones[cons - 1]) and _valid_cluster(
            phones[cons - 1], phones[cons]
        ):
            insert_at = cons - 1
        else:
            insert_at = cons
    phones = phones[:]
    phones.insert(insert_at, "ˈ")
    return "".join(phones)


def transcribe_word(word: str) -> tuple[str | None, bool]:
    """IPA and confidence for a single Interlingua token."""
    letters, confident = _prepare_token(word)
    if not letters:
        return None, False
    stressed = stressed_letter(letters)
    tokens = _emit_graphemes(letters, stressed)
    if not tokens:
        return None, False
    phones = [ipa for ipa, _, _ in tokens]
    vowel_at: int | None = None
    if stressed is not None:
        for offset, (ipa, start, span) in enumerate(tokens):
            if _is_vowel_phone(ipa) and start <= stressed < start + span:
                vowel_at = offset
                break
    ipa = _place_stress(phones, vowel_at) if vowel_at is not None else "".join(phones)
    return ipa, confident


def transcribe(headword: str) -> tuple[str | None, bool]:
    """IPA for an IEDICT headword, including phrases and hyphenated compounds."""
    raw = headword.strip()
    if not raw:
        return None, False
    parts = [part for part in re.split(r"[\s-]+", raw) if part]
    if not parts:
        return None, False
    pieces: list[str] = []
    confident = True
    skipped = False
    for part in parts:
        letters, _ok = _prepare_token(part)
        if not letters:
            skipped = True
            continue
        ipa, ok = transcribe_word(part)
        if not ipa:
            skipped = True
            continue
        confident = confident and ok
        pieces.append(ipa)
    if not pieces:
        return None, False
    if skipped:
        confident = False
    if " " in raw:
        return " ".join(pieces), confident
    return "".join(pieces), confident


def _with_ipa(entry: dict, ipa: str | None, source: str) -> dict:
    ordered: dict = {}
    placed = False
    for key, value in entry.items():
        if key in {"ipa", "ipa_source"}:
            continue
        ordered[key] = value
        if key == "glosses_en":
            ordered["ipa"] = ipa
            ordered["ipa_source"] = source
            placed = True
    if not placed:
        ordered["ipa"] = ipa
        ordered["ipa_source"] = source
    return ordered


def annotate_entry(entry: dict) -> dict:
    """Fills `ipa` and `ipa_source` on one parser record.

    Idempotent: a later pass does not promote derived IPA to `direct_phonology`.
    """
    source = entry.get("ipa_source")
    existing = entry.get("ipa")
    if source == DIRECT or (existing and source not in {DERIVED, UNCERTAIN}):
        return _with_ipa(entry, str(existing), DIRECT)

    ipa, confident = transcribe(entry.get("headword") or "")
    return _with_ipa(entry, ipa, DERIVED if confident and ipa else UNCERTAIN)


def annotate_entries(entries: list[dict]) -> list[dict]:
    return [annotate_entry(entry) for entry in entries]


def ipa_stats(entries: Iterable[dict]) -> dict[str, int]:
    counts = {DIRECT: 0, DERIVED: 0, UNCERTAIN: 0, "with_ipa": 0}
    for entry in entries:
        source = entry.get("ipa_source")
        if source in counts:
            counts[source] += 1
        if entry.get("ipa"):
            counts["with_ipa"] += 1
    return counts


def annotate_document(payload: dict) -> dict:
    entries = annotate_entries(payload.get("entries") or [])
    stats = dict(payload.get("stats") or {})
    stats["ipa"] = ipa_stats(entries)
    return {**payload, "stats": stats, "entries": entries}


def annotate_json_file(path: Path) -> None:
    payload = json.loads(path.read_text(encoding="utf-8"))
    annotated = annotate_document(payload)
    text = json.dumps(annotated, ensure_ascii=False, indent=1)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def main(argv: list[str] | None = None) -> int:
    import argparse
    import sys

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--in",
        dest="source",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "out" / "interlingua.json",
    )
    args = parser.parse_args(argv)
    if not args.source.exists():
        print(f"JSON not found: {args.source}", file=sys.stderr)
        return 1
    annotate_json_file(args.source)
    payload = json.loads(args.source.read_text(encoding="utf-8"))
    print(json.dumps(payload.get("stats", {}).get("ipa", {}), indent=2), file=sys.stderr)
    print(f"Annotated {args.source}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
