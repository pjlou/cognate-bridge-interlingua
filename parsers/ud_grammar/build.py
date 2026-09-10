"""UD-inspired shared dependency patterns (augment hand-authored grammar).

Universal Dependencies treebanks supply the *inventory and ranking* of frequent
dependency templates. Example sentences are newly written for each bridge — we do
not copy treebank text wholesale.

Full CoNLL-U downloads can be placed under cache/; offline builds use the bundled
fixture counts.

    python -m ud_grammar.build
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from common.patterns import Example, Pattern, assign_sibling_distractors, document

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).resolve().parent / "fixtures"
OUT_DIR = REPO_ROOT / "parsers" / "out"

SOURCE = (
    "Universal Dependencies dependency templates (frequency-ranked); "
    "example sentences newly written for Cognate Bridge"
)

# Fixture: template_id → count across sample treebanks (en/de/es/fr/it).
TEMPLATES = json.loads((FIXTURES / "dependency_templates.json").read_text(encoding="utf-8"))


def _mc(
    bridge_text: str,
    gloss: str,
    highlight: str,
    distractors: list[str],
    note: str,
    parallels: dict[str, str],
) -> Example:
    return Example(
        bridge_text=bridge_text,
        gloss_en=gloss,
        highlight=highlight,
        prompt=gloss,
        answer=bridge_text,
        distractors=distractors,
        note=note,
        parallels=parallels,
    )


def patterns_for(family: str) -> list[Pattern]:
    """Hand-authored drills keyed by UD template frequency order."""
    ordered = sorted(TEMPLATES.items(), key=lambda item: -item[1])
    built: list[Pattern] = []

    catalog: dict[str, Pattern] = {
        "det-noun": Pattern(
            slug="ud-det-noun",
            name="Determiner before noun",
            family=family,
            summary="A determiner (article) precedes its noun across the family.",
            description=(
                "UD treebanks show det→noun as one of the most frequent dependency "
                "arcs in Germanic and Romance. Bridge drills practice the same order."
            ),
            source_note=f"{SOURCE}; template det-noun",
            difficulty_level=1,
            examples=[
                _mc(
                    "la casa",
                    "the house",
                    "la",
                    ["casa la", "lo casa", "las casa"],
                    "Determiner before noun.",
                    {
                        "es": "la casa",
                        "fr": "la maison",
                        "it": "la casa",
                        "pt": "a casa",
                        "de": "das Haus",
                        "nl": "het huis",
                    },
                ),
                _mc(
                    "lo libro",
                    "the book",
                    "lo",
                    ["libro lo", "la libro", "los libro"],
                    "Same arc with another noun.",
                    {
                        "es": "el libro",
                        "fr": "le livre",
                        "it": "il libro",
                        "pt": "o livro",
                        "de": "das Buch",
                        "nl": "het boek",
                    },
                ),
                _mc(
                    "una porta",
                    "a door",
                    "una",
                    ["porta una", "un porta", "unas porta"],
                    "Indefinite determiner still precedes.",
                    {
                        "es": "una puerta",
                        "fr": "une porte",
                        "it": "una porta",
                        "pt": "uma porta",
                        "de": "eine Tür",
                        "nl": "een deur",
                    },
                ),
                _mc(
                    "los amigos",
                    "the friends",
                    "los",
                    ["amigos los", "lo amigos", "las amigo"],
                    "Plural determiner + plural noun.",
                    {
                        "es": "los amigos",
                        "fr": "les amis",
                        "it": "gli amici",
                        "pt": "os amigos",
                        "de": "die Freunde",
                        "nl": "de vrienden",
                    },
                ),
            ],
        ),
        "nsubj-verb": Pattern(
            slug="ud-nsubj-verb",
            name="Subject before finite verb",
            family=family,
            summary="Declarative clauses put the nominal subject before the finite verb.",
            description=(
                "nsubj→verb is ubiquitous in UD for SVO languages in both families. "
                "Learners practise recognising subject–verb order in simple clauses."
            ),
            source_note=f"{SOURCE}; template nsubj-verb",
            difficulty_level=2,
            examples=[
                _mc(
                    "Io canta.",
                    "I sing.",
                    "Io",
                    ["Canta io.", "Io cantando.", "Canta Io."],
                    "Subject then finite verb.",
                    {
                        "es": "Yo canto.",
                        "fr": "Je chante.",
                        "it": "Io canto.",
                        "pt": "Eu canto.",
                        "de": "Ich singe.",
                        "nl": "Ik zing.",
                    },
                ),
                _mc(
                    "Maria lege.",
                    "Maria reads.",
                    "Maria",
                    ["Lege Maria.", "Maria legendo.", "Leg Maria."],
                    "Proper-name subject.",
                    {
                        "es": "María lee.",
                        "fr": "Maria lit.",
                        "it": "Maria legge.",
                        "pt": "Maria lê.",
                        "de": "Maria liest.",
                        "nl": "Maria leest.",
                    },
                ),
                _mc(
                    "Los canes dormen.",
                    "The dogs sleep.",
                    "canes",
                    ["Dormen los canes.", "Los dormen canes.", "Canes los dormen."],
                    "Plural subject.",
                    {
                        "es": "Los perros duermen.",
                        "fr": "Les chiens dorment.",
                        "it": "I cani dormono.",
                        "pt": "Os cães dormem.",
                        "de": "Die Hunde schlafen.",
                        "nl": "De honden slapen.",
                    },
                ),
                _mc(
                    "Nos mangia.",
                    "We eat.",
                    "Nos",
                    ["Mangia nos.", "Nos mangiando.", "Mangia Nos."],
                    "Pronominal subject.",
                    {
                        "es": "Nosotros comemos.",
                        "fr": "Nous mangeons.",
                        "it": "Noi mangiamo.",
                        "pt": "Nós comemos.",
                        "de": "Wir essen.",
                        "nl": "Wij eten.",
                    },
                ),
            ],
        ),
        "aux-participle": Pattern(
            slug="ud-aux-participle",
            name="Auxiliary before participle",
            family=family,
            summary="Perfect and passive compounds put the auxiliary before the participle.",
            description=(
                "aux→participle (or aux:pass) is frequent in UD Romance and Germanic. "
                "Bridge drills focus on recognising the compound order."
            ),
            source_note=f"{SOURCE}; template aux-participle",
            difficulty_level=3,
            examples=[
                _mc(
                    "Ha cantato.",
                    "Has sung.",
                    "Ha",
                    ["Cantato ha.", "Ha cantando.", "Cantato Ha."],
                    "Auxiliary then participle.",
                    {
                        "es": "Ha cantado.",
                        "fr": "A chanté.",
                        "it": "Ha cantato.",
                        "pt": "Tem cantado.",
                        "de": "Hat gesungen.",
                        "nl": "Heeft gezongen.",
                    },
                ),
                _mc(
                    "Èst andato.",
                    "Has gone / is gone.",
                    "Èst",
                    ["Andato èst.", "Èst andando.", "Andato Èst."],
                    "Be-auxiliary compounds follow the same order.",
                    {
                        "es": "Ha ido.",
                        "fr": "Est allé.",
                        "it": "È andato.",
                        "pt": "Foi.",
                        "de": "Ist gegangen.",
                        "nl": "Is gegaan.",
                    },
                ),
                _mc(
                    "Havo leìto.",
                    "I have read.",
                    "Havo",
                    ["Leìto havo.", "Havo legendo.", "Leìto Havo."],
                    "First-person auxiliary.",
                    {
                        "es": "He leído.",
                        "fr": "J’ai lu.",
                        "it": "Ho letto.",
                        "pt": "Li.",
                        "de": "Ich habe gelesen.",
                        "nl": "Ik heb gelezen.",
                    },
                ),
                _mc(
                    "La porta èst aperta.",
                    "The door is open / opened.",
                    "èst",
                    [
                        "Aperta èst la porta.",
                        "La aperta èst porta.",
                        "Porta la èst aperta.",
                    ],
                    "Passive / result state.",
                    {
                        "es": "La puerta está abierta.",
                        "fr": "La porte est ouverte.",
                        "it": "La porta è aperta.",
                        "pt": "A porta está aberta.",
                        "de": "Die Tür ist offen.",
                        "nl": "De deur is open.",
                    },
                ),
            ],
        ),
        "amod-noun": Pattern(
            slug="ud-amod-noun",
            name="Attributive adjective with noun",
            family=family,
            summary="An adjectival modifier attaches to its noun (postposed in Romance bridges).",
            description=(
                "amod→noun is high-frequency in UD. Romance bridges normally postpose the "
                "adjective; Germanic often preposes — drills highlight the bridge’s order."
            ),
            source_note=f"{SOURCE}; template amod-noun",
            difficulty_level=2,
            examples=[
                _mc(
                    "casa bòna",
                    "good house",
                    "bòna",
                    ["bòna casa", "casa bòno", "casas bòna"],
                    "Adjective attached to the noun.",
                    {
                        "es": "casa buena",
                        "fr": "bonne maison",
                        "it": "casa buona",
                        "pt": "casa boa",
                        "de": "gutes Haus",
                        "nl": "goed huis",
                    },
                ),
                _mc(
                    "libro nòvo",
                    "new book",
                    "nòvo",
                    ["nòvo libro", "libro nòva", "libros nòvo"],
                    "Another amod pair.",
                    {
                        "es": "libro nuevo",
                        "fr": "livre nouveau",
                        "it": "libro nuovo",
                        "pt": "livro novo",
                        "de": "neues Buch",
                        "nl": "nieuw boek",
                    },
                ),
                _mc(
                    "acqua frìdda",
                    "cold water",
                    "frìdda",
                    ["frìdda acqua", "acqua frìddo", "acque frìdda"],
                    "Agreement cues may appear on the adjective.",
                    {
                        "es": "agua fría",
                        "fr": "eau froide",
                        "it": "acqua fredda",
                        "pt": "água fria",
                        "de": "kaltes Wasser",
                        "nl": "koud water",
                    },
                ),
                _mc(
                    "amicos fìdeles",
                    "faithful friends",
                    "fìdeles",
                    ["fìdeles amicos", "amico fìdeles", "amicos fìdele"],
                    "Plural adjective with plural noun.",
                    {
                        "es": "amigos fieles",
                        "fr": "amis fidèles",
                        "it": "amici fedeli",
                        "pt": "amigos fiéis",
                        "de": "treue Freunde",
                        "nl": "trouwe vrienden",
                    },
                ),
            ],
        ),
    }

    position = 100
    for template_id, _count in ordered:
        pattern = catalog.get(template_id)
        if not pattern:
            continue
        # Clone with bridge-specific position after hand-authored patterns.
        pattern.examples = list(pattern.examples)
        assign_sibling_distractors(pattern.examples)
        built.append(pattern)
        position += 1

    return built


def write_bridge(code: str, family: str, filename: str) -> dict:
    built = patterns_for(family)
    # Re-number positions high so seed order places them after hand-authored ones
    # when concatenated by position.
    payload = document(code, built)
    for index, pattern in enumerate(payload["patterns"], start=1):
        pattern["position"] = 100 + index
    payload["source"] = SOURCE
    payload["stats"] = {
        "patterns": len(built),
        "examples": sum(len(p.examples) for p in built),
    }
    out = OUT_DIR / filename
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    return payload["stats"]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args(argv)

    stats = {
        "ia": write_bridge("ia", "Romance", "ud_interlingua_grammar.json"),
    }
    print(json.dumps(stats, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
