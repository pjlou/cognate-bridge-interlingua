"""Correspondence rules from Interlingua prototypes to the Romance control languages.

Interlingua was built by taking the forms a word has across the Romance languages and
normalising away everything specific to any one of them. The Introduction to the
*Interlingua-English Dictionary* (IALA, dir. Alexander Gode, 1951) states which features
are "specifically French" or "typically Spanish" developments. Running those statements
*backwards* -- prototype to variant -- predicts the cognate in each target language.

That is the whole idea of this project made executable: a rule is not prose sitting next
to the data, it is the thing that produced the data.

Licensing note. The IED's copyright renewal status could not be established, so it is not
copied. Facts about a language are not copyrightable; a particular expression of them is.
Each rule below records the substance of a derivation, restated, plus a citation to the
section it came from. See docs/SOURCES.md.

Two properties are worth knowing before reading the rules:

* **Every rule's example is what the rule actually computes.** `apply(example_bridge)`
  must equal `example_target`, and a test enforces it. So an example is never the
  textbook cognate unless this rule alone gets there -- French *chanter* needs both the
  infinitive rule and the palatalisation rule, so the infinitive rule's example is
  `arrivar` to *arriver* instead.
* **Rules over-generate on purpose.** Initial `c-` to `ch-` is true of `cosa`/*chose* and
  false of `casa`/*casa*, and nothing here knows the difference. That is safe because
  `lexicons.py` discards any predicted form that is not actually attested. A rule's job
  is to propose; the validator decides.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Sections of the IED Introduction that rules are drawn from, named as they appear there
# so a reader can go and check.
FORM_OF_WORDS = "IED Introduction, Method and Techniques: Form of International Words"
TERMINATIONS = "IED Introduction, Method and Techniques: Terminations"
INFINITIVES = "IED Introduction, Method and Techniques: Termination of Infinitives"
DERIVATIONAL = "IED Introduction, Method and Techniques: Forms in Derivational Series"


@dataclass(frozen=True)
class Rule:
    """One executable correspondence rule.

    `pattern_from` is a regex over the Interlingua headword and `pattern_to` its
    replacement, so `apply` is a plain `re.sub`. Both are stored verbatim in the
    `correspondence_rules` table, which is what lets the API show a learner the rule that
    generated a given form.
    """

    code: str
    target: str
    description: str
    source_note: str
    pattern_from: str
    pattern_to: str
    example_bridge: str
    example_target: str
    #: Prior confidence before lexicon validation. Lower where the rule is known to be
    #: narrower than the pattern that triggers it.
    confidence: float = 0.9

    def applies_to(self, word: str) -> bool:
        return re.search(self.pattern_from, word) is not None

    def apply(self, word: str) -> str:
        return re.sub(self.pattern_from, self.pattern_to, word)

    @property
    def is_identity(self) -> bool:
        """True for rules that state a target language keeps the prototype unchanged.

        These matter as much as the rules that change something: "Spanish keeps -ar" is
        exactly what a learner needs to be told about `cantar`.
        """
        return self.apply(self.example_bridge) == self.example_bridge


# --- Infinitive terminations -------------------------------------------------------
#
# The IED: "The prototype procedure outlined above would yield infinitives in -are,
# -ere, and -ire. As in the case of -al and -il, it is again only Italian that retains
# the final -e systematically... Thus the prototype forms of the infinitive terminations
# appear as -ar, -er, and -ir."
#
# So Italian restores the final -e, Spanish and Portuguese already match the prototype,
# and French shifts -ar to -er. The IED separately gives `tener` as the prototype of
# Italian tenere, Spanish tener and French tenir, which is why prototype -er maps to
# French -ir.

INFINITIVE_RULES = [
    Rule(
        code="ia.inf-ar.ita",
        target="it",
        description=(
            "Italian is the one control language that keeps the Latin final -e on "
            "infinitives, so a prototype in -ar reappears as -are."
        ),
        source_note=INFINITIVES,
        pattern_from=r"ar$",
        pattern_to="are",
        example_bridge="cantar",
        example_target="cantare",
        confidence=0.95,
    ),
    Rule(
        code="ia.inf-er.ita",
        target="it",
        description="A prototype infinitive in -er takes Italian's retained final -e: -ere.",
        source_note=INFINITIVES,
        pattern_from=r"er$",
        pattern_to="ere",
        example_bridge="vender",
        example_target="vendere",
        confidence=0.9,
    ),
    Rule(
        code="ia.inf-ir.ita",
        target="it",
        description="A prototype infinitive in -ir takes Italian's retained final -e: -ire.",
        source_note=INFINITIVES,
        pattern_from=r"ir$",
        pattern_to="ire",
        example_bridge="finir",
        example_target="finire",
        confidence=0.95,
    ),
    Rule(
        code="ia.inf-ar.spa",
        target="es",
        description=(
            "The prototype infinitive terminations were chosen to follow the Iberian "
            "languages rather than Italian, so Spanish keeps -ar unchanged."
        ),
        source_note=INFINITIVES,
        pattern_from=r"ar$",
        pattern_to="ar",
        example_bridge="cantar",
        example_target="cantar",
        confidence=0.95,
    ),
    Rule(
        code="ia.inf-ir.spa",
        target="es",
        description="Spanish keeps the prototype infinitive termination -ir unchanged.",
        source_note=INFINITIVES,
        pattern_from=r"ir$",
        pattern_to="ir",
        example_bridge="partir",
        example_target="partir",
        confidence=0.9,
    ),
    Rule(
        code="ia.inf-ar.por",
        target="pt",
        description="Portuguese, like Spanish, keeps the prototype termination -ar unchanged.",
        source_note=INFINITIVES,
        pattern_from=r"ar$",
        pattern_to="ar",
        example_bridge="cantar",
        example_target="cantar",
        confidence=0.95,
    ),
    Rule(
        code="ia.inf-ir.por",
        target="pt",
        description="Portuguese keeps the prototype infinitive termination -ir unchanged.",
        source_note=INFINITIVES,
        pattern_from=r"ir$",
        pattern_to="ir",
        example_bridge="partir",
        example_target="partir",
        confidence=0.9,
    ),
    Rule(
        code="ia.inf-ar.fra",
        target="fr",
        description=(
            "French first-conjugation infinitives end in -er, which the IED calls a "
            "typically French development; the prototype behind it is -ar."
        ),
        source_note=FORM_OF_WORDS,
        pattern_from=r"ar$",
        pattern_to="er",
        example_bridge="arrivar",
        example_target="arriver",
        confidence=0.85,
    ),
    Rule(
        code="ia.inf-er.fra",
        target="fr",
        description=(
            "French shifts a prototype -er infinitive to -ir: the IED gives tener as the "
            "prototype of Italian tenere, Spanish tener and French tenir."
        ),
        source_note=DERIVATIONAL,
        pattern_from=r"er$",
        pattern_to="ir",
        example_bridge="tener",
        example_target="tenir",
        confidence=0.7,
    ),
    Rule(
        code="ia.inf-ir.fra",
        target="fr",
        description="A prototype infinitive in -ir is unchanged in French.",
        source_note=INFINITIVES,
        pattern_from=r"ir$",
        pattern_to="ir",
        example_bridge="finir",
        example_target="finir",
        confidence=0.9,
    ),
]


# --- Vowel and final-syllable developments ----------------------------------------
#
# The IED: "If the Spanish word for 'earth' is tierra, the international form of it must
# not contain the diphthong -ie- which is a typically Spanish development... the
# prototype of French terre, Spanish tierra, Portuguese and Italian terra is terra. The
# French final -e and the Spanish diphthong are specifically French and Spanish
# developments from the original neutral final -a and the original neutral monophthong
# -e- respectively."
#
# And on causa/cosa: "the French initial ch- and final -e as well as the Portuguese
# diphthong -ou are peculiarly French and Portuguese deviations."

VOWEL_RULES = [
    Rule(
        code="ia.stressed-e-to-ie.spa",
        target="es",
        description=(
            "Spanish diphthongises the prototype's neutral stressed -e- to -ie-, which is "
            "why prototype terra corresponds to Spanish tierra."
        ),
        source_note=FORM_OF_WORDS,
        # Only the stressed syllable diphthongises. In a word ending in a vowel the stress
        # falls on the penult, so the target is the -e- before the final syllable.
        pattern_from=r"e([^aeiou]+)([aeiou])$",
        pattern_to=r"ie\1\2",
        example_bridge="terra",
        example_target="tierra",
        confidence=0.6,
    ),
    Rule(
        code="ia.stressed-o-to-ue.spa",
        target="es",
        description=(
            "Spanish diphthongises a stressed neutral -o- to -ue- by the same development "
            "that gives -ie- from -e-."
        ),
        source_note=FORM_OF_WORDS,
        pattern_from=r"o([^aeiou]+)([aeiou])$",
        pattern_to=r"ue\1\2",
        example_bridge="porta",
        example_target="puerta",
        confidence=0.55,
    ),
    Rule(
        code="ia.final-a-to-e.fra",
        target="fr",
        description=(
            "French reduces the prototype's neutral final -a to -e, which is why prototype "
            "terra corresponds to French terre."
        ),
        source_note=FORM_OF_WORDS,
        pattern_from=r"a$",
        pattern_to="e",
        example_bridge="terra",
        example_target="terre",
        confidence=0.7,
    ),
    Rule(
        code="ia.o-to-ou.por",
        target="pt",
        description=(
            "Where the prototype has -o- from Latin -au-, Portuguese has the diphthong "
            "-ou-: prototype cosa, Portuguese cousa."
        ),
        source_note=FORM_OF_WORDS,
        pattern_from=r"^([^aeiou]*)o",
        pattern_to=r"\1ou",
        example_bridge="cosa",
        example_target="cousa",
        confidence=0.4,
    ),
    Rule(
        code="ia.initial-c-to-ch.fra",
        target="fr",
        description=(
            "French palatalises an initial c- before a back vowel to ch-, which the IED "
            "cites as a peculiarly French deviation: prototype cosa, French chose."
        ),
        source_note=FORM_OF_WORDS,
        pattern_from=r"^c(?=[ao])",
        pattern_to="ch",
        example_bridge="carbon",
        example_target="charbon",
        confidence=0.4,
    ),
]


# --- Suffix terminations ------------------------------------------------------------
#
# The IED: "Like all other formative elements, suffixes too appear in fixed prototype
# forms which do not vary erratically from one case to another. If it is an historical
# fact that the suffix in English agile and that in fossil are the same... then the
# English difference between this particular -ile and this particular -il must leave no
# trace in the international forms."
#
# The same "only Italian keeps the final -e" observation applies to -al and -il.

SUFFIX_RULES = [
    Rule(
        code="ia.suffix-al.ita",
        target="it",
        description="Italian restores the final -e on the prototype suffix -al, giving -ale.",
        source_note=TERMINATIONS,
        pattern_from=r"al$",
        pattern_to="ale",
        example_bridge="general",
        example_target="generale",
        confidence=0.8,
    ),
    Rule(
        code="ia.suffix-il.ita",
        target="it",
        description="Italian restores the final -e on the prototype suffix -il, giving -ile.",
        source_note=TERMINATIONS,
        pattern_from=r"il$",
        pattern_to="ile",
        example_bridge="civil",
        example_target="civile",
        confidence=0.8,
    ),
    Rule(
        code="ia.suffix-tion.spa",
        target="es",
        description=(
            "The prototype suffix -tion appears in Spanish as -ci\u00f3n, one of the most "
            "regular correspondences in the derivational series."
        ),
        source_note=DERIVATIONAL,
        pattern_from=r"tion$",
        pattern_to="ci\u00f3n",
        example_bridge="nation",
        example_target="naci\u00f3n",
        confidence=0.9,
    ),
    Rule(
        code="ia.suffix-tion.ita",
        target="it",
        description="The prototype suffix -tion appears in Italian as -zione.",
        source_note=DERIVATIONAL,
        pattern_from=r"tion$",
        pattern_to="zione",
        example_bridge="nation",
        example_target="nazione",
        confidence=0.9,
    ),
    Rule(
        code="ia.suffix-tion.por",
        target="pt",
        description="The prototype suffix -tion appears in Portuguese as -\u00e7\u00e3o.",
        source_note=DERIVATIONAL,
        pattern_from=r"tion$",
        pattern_to="\u00e7\u00e3o",
        example_bridge="nation",
        example_target="na\u00e7\u00e3o",
        confidence=0.9,
    ),
    Rule(
        code="ia.suffix-tion.fra",
        target="fr",
        description="The prototype suffix -tion is unchanged in French.",
        source_note=DERIVATIONAL,
        pattern_from=r"tion$",
        pattern_to="tion",
        example_bridge="nation",
        example_target="nation",
        confidence=0.95,
    ),
    Rule(
        code="ia.suffix-itate.spa",
        target="es",
        description="The prototype abstract-noun suffix -itate appears in Spanish as -idad.",
        source_note=DERIVATIONAL,
        pattern_from=r"itate$",
        pattern_to="idad",
        example_bridge="universitate",
        example_target="universidad",
        confidence=0.85,
    ),
    Rule(
        code="ia.suffix-itate.ita",
        target="it",
        description="The prototype suffix -itate appears in Italian as -it\u00e0.",
        source_note=DERIVATIONAL,
        pattern_from=r"itate$",
        pattern_to="it\u00e0",
        example_bridge="universitate",
        example_target="universit\u00e0",
        confidence=0.85,
    ),
    Rule(
        code="ia.suffix-itate.fra",
        target="fr",
        description="The prototype suffix -itate appears in French as -it\u00e9.",
        source_note=DERIVATIONAL,
        pattern_from=r"itate$",
        pattern_to="it\u00e9",
        example_bridge="universitate",
        example_target="universit\u00e9",
        confidence=0.85,
    ),
    Rule(
        code="ia.suffix-itate.por",
        target="pt",
        description="The prototype suffix -itate appears in Portuguese as -idade.",
        source_note=DERIVATIONAL,
        pattern_from=r"itate$",
        pattern_to="idade",
        example_bridge="universitate",
        example_target="universidade",
        confidence=0.85,
    ),
    Rule(
        code="ia.suffix-mente.spa",
        target="es",
        description="Prototype adverbs in -mente keep that ending in Spanish.",
        source_note=DERIVATIONAL,
        pattern_from=r"mente$",
        pattern_to="mente",
        example_bridge="finalmente",
        example_target="finalmente",
        confidence=0.7,
    ),
    Rule(
        code="ia.suffix-mente.ita",
        target="it",
        description="Prototype adverbs in -mente keep that ending in Italian.",
        source_note=DERIVATIONAL,
        pattern_from=r"mente$",
        pattern_to="mente",
        example_bridge="finalmente",
        example_target="finalmente",
        confidence=0.7,
    ),
]


ALL_RULES: list[Rule] = [*INFINITIVE_RULES, *VOWEL_RULES, *SUFFIX_RULES]

TARGET_LANGUAGES = {
    "es": "Spanish",
    "fr": "French",
    "it": "Italian",
    "pt": "Portuguese",
}


def rules_for(target: str) -> list[Rule]:
    return [rule for rule in ALL_RULES if rule.target == target]


@dataclass(frozen=True)
class Prediction:
    target: str
    form: str
    rule: Rule


def predict(word: str, targets: list[str] | None = None) -> list[Prediction]:
    """Runs every applicable rule over one headword and returns the distinct predictions.

    Identity predictions are kept. "Spanish keeps the prototype -ar unchanged" is a real
    correspondence and the single most useful thing to tell a learner looking at `cantar`;
    dropping it because the string did not change would hide most of the Iberian column.

    A word can also trigger several rules for one language -- `cosa` gets both the French
    final-vowel rule and the palatalisation rule, and needs both to reach *chose* -- so
    predictions are composed pairwise as well. Composition is one level deep only;
    chaining further mostly produces noise the validator would reject anyway, at real
    cost in generated volume.
    """
    wanted = targets or list(TARGET_LANGUAGES)
    predictions: list[Prediction] = []
    seen: set[tuple[str, str]] = set()

    def offer(target: str, form: str, rule: Rule) -> None:
        if (target, form) in seen:
            return
        seen.add((target, form))
        predictions.append(Prediction(target=target, form=form, rule=rule))

    for target in wanted:
        applicable = [rule for rule in rules_for(target) if rule.applies_to(word)]

        for rule in applicable:
            offer(target, rule.apply(word), rule)

        for first in applicable:
            for second in applicable:
                if first is second:
                    continue
                composed = second.apply(first.apply(word))
                if composed == word:
                    continue
                # Attribute a composed prediction to the rule applied last: its
                # description is what explains the difference from the other candidates.
                offer(target, composed, second)

    return predictions
