"""Validation lexicons for generated Romance cognates.

The rule engine over-generates on purpose, so something has to decide which predictions
are real words. That is this module: it loads a word list per target language and answers
a membership question, nothing more.

**This is a membership test, not a data source.** Apertium is GPL v3 and Wiktionary is
CC BY-SA 4.0, both copyleft. Redistributing their content would pull those terms onto the
whole derived dataset. So the lexicon files stay out of the repository (they are
gitignored), nothing from them is copied into the output, and what gets stored is only
the boolean fact "this form was attested in lexicon X" plus the lexicon's name in
`validated_against`. The target word itself is one this project generated from a stated
rule. See docs/SOURCES.md.

Apertium's monolingual dictionaries are the default source because they are plain XML
with one `lm` attribute per lemma, which needs no NLP toolchain to read.
"""

from __future__ import annotations

import re
import urllib.request
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
LEXICON_DIR = REPO_ROOT / "parsers" / "lexicons"

_RAW = "https://raw.githubusercontent.com/apertium"


@dataclass(frozen=True)
class Source:
    name: str
    url: str
    #: How lemmas are laid out in this file.
    #:   "lm"   monolingual: <e lm="cantar"><i>cant</i>...</e>
    #:   "left" bilingual, wanted language on the left: <l>maison<s n="n"/></l>
    #:   "right" bilingual, wanted language on the right
    layout: str


# Apertium dictionaries, GPL v3. Not every language has a monolingual .dix: Spanish and
# French are maintained as HFST lexc, so their lemmas are taken from a bilingual pair
# dictionary instead. Hence the per-language layout rather than one shared parser.
APERTIUM_SOURCES: dict[str, Source] = {
    "es": Source(
        name="apertium-eng-spa",
        url=f"{_RAW}/apertium-eng-spa/master/apertium-eng-spa.spa.dix",
        layout="lm",
    ),
    "fr": Source(
        name="apertium-fra-cat",
        url=f"{_RAW}/apertium-fra-cat/master/apertium-fra-cat.fra-cat.dix",
        layout="left",
    ),
    "it": Source(
        name="apertium-ita",
        url=f"{_RAW}/apertium-ita/master/apertium-ita.ita.dix",
        layout="lm",
    ),
    "pt": Source(
        name="apertium-por",
        url=f"{_RAW}/apertium-por/master/apertium-por.por.dix",
        layout="lm",
    ),
}

LEXICON_NAMES = {language: source.name for language, source in APERTIUM_SOURCES.items()}

# <e lm="cantar"><i>cant</i><par n="cant__vblex"/></e>
_LEMMA = re.compile(r'\blm="([^"]+)"')
# <l>maison<s n="n"/><s n="f"/></l> -- the lemma is the text, the <s> tags are features.
_SIDE = {
    "left": re.compile(r"<l>(.*?)</l>", re.DOTALL),
    "right": re.compile(r"<r>(.*?)</r>", re.DOTALL),
}
_TAG = re.compile(r"<[^>]*>")


def _lemmas(raw: str, layout: str) -> set[str]:
    if layout == "lm":
        return {lemma.strip().lower() for lemma in _LEMMA.findall(raw) if lemma.strip()}

    lemmas: set[str] = set()
    for chunk in _SIDE[layout].findall(raw):
        # <b/> encodes a space inside a multiword lemma; every other tag is a feature.
        text = _TAG.sub(lambda match: " " if match.group(0) == "<b/>" else "", chunk)
        text = text.strip().lower()
        if text:
            lemmas.add(text)
    return lemmas


def _wordlist_path(language: str) -> Path:
    return LEXICON_DIR / f"{language}.txt"


def fetch(language: str) -> Path:
    """Downloads a dictionary and reduces it to a newline-delimited lemma list.

    Only the lemma list is kept on disk, and it is gitignored. The .dix source is
    discarded after extraction so the working tree never holds a redistributable copy of
    a GPL dictionary.
    """
    source = APERTIUM_SOURCES[language]
    LEXICON_DIR.mkdir(parents=True, exist_ok=True)

    with urllib.request.urlopen(source.url, timeout=300) as response:
        raw = response.read().decode("utf-8", errors="replace")

    lemmas = _lemmas(raw, source.layout)
    if not lemmas:
        raise ValueError(f"no lemmas found in {source.url} using layout {source.layout!r}")

    destination = _wordlist_path(language)
    destination.write_text("\n".join(sorted(lemmas)), encoding="utf-8")
    return destination


def load(language: str) -> set[str] | None:
    path = _wordlist_path(language)
    if not path.exists():
        return None
    return {
        line.strip().lower()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    }


@dataclass
class Validation:
    attested: bool
    lexicon: str | None


class Validator:
    """Answers whether a predicted form is attested, per target language.

    A language with no lexicon available is reported as `attested=False, lexicon=None`,
    which `build.py` distinguishes from a genuine miss: unvalidated predictions are kept
    at reduced confidence rather than discarded, so a missing download degrades coverage
    quality instead of silently emptying a whole column.
    """

    def __init__(self, languages: list[str]) -> None:
        self._lexicons: dict[str, set[str] | None] = {
            language: load(language) for language in languages
        }

    def available(self, language: str) -> bool:
        return self._lexicons.get(language) is not None

    @property
    def available_languages(self) -> list[str]:
        return [language for language in self._lexicons if self.available(language)]

    def check(self, language: str, form: str) -> Validation:
        lexicon = self._lexicons.get(language)
        if lexicon is None:
            return Validation(attested=False, lexicon=None)
        return Validation(
            attested=form.strip().lower() in lexicon,
            lexicon=LEXICON_NAMES.get(language, language),
        )

    def sizes(self) -> dict[str, int]:
        return {
            language: len(lexicon)
            for language, lexicon in self._lexicons.items()
            if lexicon is not None
        }
