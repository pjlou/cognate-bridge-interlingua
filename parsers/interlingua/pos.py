"""Infers a part of speech for an Interlingua headword.

IEDICT has no part-of-speech field, but the schema needs one and the flashcards read much
better with it. Interlingua is regular enough that this is tractable: it was designed so
that word class is largely readable off the ending, and the English gloss supplies a
second, independent signal.

The inference is deliberately conservative. Where the two signals disagree or neither is
decisive it returns `None` rather than guessing, and `build.py` records the result so the
proportion of unlabelled entries is visible rather than hidden behind a default of "noun".
"""

from __future__ import annotations

import re

# Gode & Blair describe the three infinitive classes -ar, -er, -ir. An infinitive is the
# clearest ending in the language.
_VERB_ENDING = re.compile(r"(ar|er|ir)$")

# Suffixes from the IED's list of active affixes whose word class is fixed.
_NOUN_SUFFIXES = (
    "ation",
    "ition",
    "tion",
    "sion",
    "mento",
    "itate",
    "tate",
    "eria",
    "ero",
    "ista",
    "ismo",
    "essa",
    "ura",
    "antia",
    "entia",
    "itia",
    "ata",
    "ade",
)
_ADJECTIVE_SUFFIXES = (
    "abile",
    "ibile",
    "ose",
    "ive",
    "ari",
    "ori",
    "ic",
    "al",
    "ar",
    "il",
    "ide",
    "ante",
    "ente",
)
_ADVERB_SUFFIXES = ("mente", "modo")

# The gloss shape is a strong signal in English: "to sing" is a verb, and a gloss opening
# with an article is a noun.
_GLOSS_VERB = re.compile(r"^to\s+\w")
_GLOSS_NOUN = re.compile(r"^(a|an|the)\s+\w")
_GLOSS_ADVERB = re.compile(r"ly$")

# Closed classes, small enough to list. Guessing these from morphology is hopeless
# (`e` "and" looks like nothing) and getting them wrong is conspicuous.
_CLOSED_CLASS = {
    "e": "conj",
    "o": "conj",
    "ma": "conj",
    "si": "adv",
    "no": "adv",
    "non": "adv",
    "ni": "conj",
    "que": "conj",
    "si\u00e0": "conj",
    "ma\u00eds": "conj",
    "de": "prep",
    "a": "prep",
    "in": "prep",
    "con": "prep",
    "per": "prep",
    "pro": "prep",
    "sur": "prep",
    "sub": "prep",
    "ante": "prep",
    "post": "prep",
    "inter": "prep",
    "contra": "prep",
    "sin": "prep",
    "durante": "prep",
    "verso": "prep",
    "usque": "prep",
    "io": "prn",
    "tu": "prn",
    "ille": "prn",
    "illa": "prn",
    "illo": "prn",
    "nos": "prn",
    "vos": "prn",
    "illes": "prn",
    "illas": "prn",
    "illos": "prn",
    "me": "prn",
    "te": "prn",
    "se": "prn",
    "le": "prn",
    "la": "prn",
    "lo": "prn",
    "les": "prn",
    "las": "prn",
    "los": "prn",
    "qui": "prn",
    "que": "prn",
    "iste": "prn",
    "illo": "prn",
    "un": "art",
    "le": "art",
}


def from_gloss(glosses: list[str]) -> str | None:
    if not glosses:
        return None
    first = glosses[0].strip().lower()
    if _GLOSS_VERB.match(first):
        return "v"
    if _GLOSS_NOUN.match(first):
        return "n"
    if _GLOSS_ADVERB.search(first) and " " not in first:
        return "adv"
    return None


def from_morphology(headword: str) -> str | None:
    word = headword.strip().lower()
    if not word:
        return None

    # Adverbs first: -mente ends in -e, which several other tests would also match.
    if word.endswith(_ADVERB_SUFFIXES):
        return "adv"
    if word.endswith(_NOUN_SUFFIXES):
        return "n"
    if word.endswith(_ADJECTIVE_SUFFIXES):
        return "a"
    if _VERB_ENDING.search(word):
        return "v"
    # Bare -o and -a nominals: `filio`, `filia`. Weak, but the most common shape in the
    # dictionary and consistent with Interlingua's noun endings.
    if word.endswith(("o", "a")):
        return "n"
    return None


def infer(headword: str, glosses: list[str]) -> tuple[str | None, str]:
    """Returns (part_of_speech, how_it_was_decided).

    The second element is kept in the output so the seed data records the basis for each
    label. `agreed` is the high-confidence case; `gloss` and `morphology` mean only one
    signal fired; `conflict` means they disagreed and neither was trusted.
    """
    word = headword.strip()

    if " " not in word and word.lower() in _CLOSED_CLASS:
        return _CLOSED_CLASS[word.lower()], "closed-class"

    # A multiword headword like `filo de auro` is a phrase; the gloss is the only usable
    # signal, since the ending belongs to the last word rather than to the whole.
    if " " in word:
        return from_gloss(glosses), "gloss" if from_gloss(glosses) else "unknown"

    by_gloss = from_gloss(glosses)
    by_morphology = from_morphology(word)

    if by_gloss and by_morphology:
        if by_gloss == by_morphology:
            return by_gloss, "agreed"
        # The gloss wins a disagreement. "to cantar" style errors are rare, whereas the
        # morphological rules genuinely overlap: `ar` is both an infinitive ending and an
        # adjective suffix, so `linear` looks like a verb to it.
        return by_gloss, "conflict"

    if by_gloss:
        return by_gloss, "gloss"
    if by_morphology:
        return by_morphology, "morphology"
    return None, "unknown"
