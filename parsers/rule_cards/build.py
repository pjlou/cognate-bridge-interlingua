"""Hand-authored sound-correspondence rule cards.

Content comes from docs/sound-correspondence-rule-cards.md. Cards are synchronic
decoders (not diachronic history lessons). Rollout order: Romance c-split →
prosthetic vowel.

    python -m rule_cards.build [--out PATH]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO_ROOT / "parsers" / "out" / "rule_cards.json"

SOURCE = (
    "Cognate Bridge sound-correspondence rule cards "
    "(docs/sound-correspondence-rule-cards.md); synchronic decoder frames"
)

CARDS: list[dict] = [
    {
        "slug": "romance-c-palatalization",
        "name": "Romance c-palatalization split",
        "tier": 1,
        "position": 1,
        "difficulty_level": 2,
        "teaching_frame": (
            "Hear a French word with a soft s- where you'd expect a hard c-? Try swapping "
            "in 'ch' (Italian) or 'th' (European Spanish) mentally — they're often the same root."
        ),
        "pattern_summary": (
            "Latin c before a front vowel (e, i) split three ways across Romance: "
            "Italian [tʃ], French [s], European Spanish [θ] (Latin American Spanish [s])."
        ),
        "description": (
            "Learning this one three-way split lets you mentally de-palatalize any Romance "
            "word back to a shared shape. The classic test word is 'hundred': "
            "cento / cent / cien(to)."
        ),
        "caveat": (
            "Not every soft c/s/th triad is this root — verify before trusting the decoder. "
            "cielo / ciel share the Latin root; English heaven does not."
        ),
        "source_note": SOURCE,
        "sound_law_prefixes": [],
        "mappings": [
            {"position": 1, "from_label": "Latin ce-/ci-", "to_label": "Italian [tʃ] (“ch”)", "notation": "ce → [tʃ]"},
            {"position": 2, "from_label": "Latin ce-/ci-", "to_label": "French [s]", "notation": "ce → [s]"},
            {"position": 3, "from_label": "Latin ce-/ci-", "to_label": "Spanish [θ] / [s]", "notation": "ce → [θ]/[s]"},
        ],
        "examples": [
            {
                "position": 1,
                "mapping_position": 1,
                "prompt": "Italian cento. Which French form is the same Latin root?",
                "answer": "cent",
                "distractors": ["chant", "compte", "côte"],
                "note": "cento / cent / cien(to) — the hundred test.",
                "forms": {"la": "centum", "it": "cento", "fr": "cent", "es": "ciento", "en": "hundred"},
            },
            {
                "position": 2,
                "mapping_position": 1,
                "prompt": "French ciel. Which Italian form is the same Latin root?",
                "answer": "cielo",
                "distractors": ["cello", "cena", "ciclo"],
                "note": "cielo / ciel / cielo — sky; English heaven is not cognate.",
                "forms": {"la": "caelum", "it": "cielo", "fr": "ciel", "es": "cielo"},
            },
            {
                "position": 3,
                "mapping_position": 2,
                "prompt": "Spanish ciudad. Which French form is the same Latin root?",
                "answer": "cité",
                "distractors": ["suite", "côté", "chute"],
                "note": "ciudad / cité / città.",
                "forms": {"la": "civitatem", "es": "ciudad", "fr": "cité", "it": "città", "en": "city"},
            },
            {
                "position": 4,
                "mapping_position": 2,
                "prompt": "Italian centro. Which Spanish form is the same Latin root?",
                "answer": "centro",
                "distractors": ["cuento", "canto", "cerro"],
                "note": "centre / centro / centro.",
                "forms": {"la": "centrum", "it": "centro", "es": "centro", "fr": "centre", "en": "center"},
            },
            {
                "position": 5,
                "mapping_position": 3,
                "prompt": "French cent. Which European Spanish pronunciation shape matches the split?",
                "answer": "cien / ciento (with [θ] in Europe)",
                "distractors": ["canto", "cuanto", "cerca"],
                "note": "Same root; Spanish writes c but Europe says [θ].",
                "forms": {"fr": "cent", "es": "ciento", "it": "cento", "en": "hundred"},
            },
            {
                "position": 6,
                "mapping_position": 1,
                "prompt": "Italian cielo and English heaven — does this rule connect them?",
                "answer": "No — heaven is not cognate",
                "distractors": ["Yes — sky words always match", "Yes — via the prosthetic-vowel rule", "Yes — Latin caelum borrowed into English"],
                "note": "False friend for the decoder: cielo/ciel share Latin caelum; heaven does not.",
                "false_friend": True,
                "forms": {"it": "cielo", "fr": "ciel", "en": "heaven"},
            },
        ],
    },
    {
        "slug": "romance-prosthetic-s",
        "name": "Prosthetic vowel before s+consonant",
        "tier": 2,
        "position": 2,
        "difficulty_level": 2,
        "teaching_frame": (
            "A French or Spanish word starting with é-/es- followed by a consonant-cluster "
            "shape may correspond to an English or Italian word with st-, sp-, or sc- at "
            "the start — just strip the vowel."
        ),
        "pattern_summary": (
            "Latin words beginning with s + consonant (st-, sp-, sc-) gained a prothetic "
            "vowel in French, Spanish, and Portuguese, but not in Italian or English."
        ),
        "description": (
            "High-yield for beginners because it affects common nouns (school, state, "
            "space). Strip the leading é-/es- and look for the familiar s-cluster cognate."
        ),
        "caveat": None,
        "source_note": SOURCE,
        "sound_law_prefixes": [],
        "mappings": [
            {"position": 1, "from_label": "Latin / Italian / English st- sp- sc-", "to_label": "French é-", "notation": "st- → é-"},
            {"position": 2, "from_label": "Latin / Italian / English st- sp- sc-", "to_label": "Spanish / Portuguese es-", "notation": "st- → es-"},
        ],
        "examples": [
            {
                "position": 1,
                "mapping_position": 1,
                "prompt": "English school. Which French form added the prosthetic vowel?",
                "answer": "école",
                "distractors": ["scuole", "échelle", "écoute"],
                "forms": {"la": "schola", "en": "school", "it": "scuola", "fr": "école", "es": "escuela"},
            },
            {
                "position": 2,
                "mapping_position": 2,
                "prompt": "Italian scuola. Which Spanish form shows es- + cluster?",
                "answer": "escuela",
                "distractors": ["scuela", "escola (Catalan)", "échelle"],
                "forms": {"it": "scuola", "es": "escuela", "pt": "escola", "fr": "école", "en": "school"},
            },
            {
                "position": 3,
                "mapping_position": 1,
                "prompt": "English state. Which French form added the prosthetic vowel?",
                "answer": "état",
                "distractors": ["statue", "stade", "étage"],
                "forms": {"la": "status", "en": "state", "it": "stato", "fr": "état", "es": "estado"},
            },
            {
                "position": 4,
                "mapping_position": 2,
                "prompt": "Italian spada. Which Spanish form shows es- + cluster?",
                "answer": "espada",
                "distractors": ["spada", "épée", "espátula"],
                "forms": {"la": "spatha", "it": "spada", "es": "espada", "fr": "épée", "en": "sword"},
            },
            {
                "position": 5,
                "mapping_position": 1,
                "prompt": "English space. Which French form added the prosthetic vowel?",
                "answer": "espace",
                "distractors": ["espèce", "spasme", "espada"],
                "forms": {"en": "space", "fr": "espace", "es": "espacio", "it": "spazio"},
            },
            {
                "position": 6,
                "mapping_position": 2,
                "prompt": "Strip the prosthetic vowel from Spanish estado. What English word remains?",
                "answer": "state",
                "distractors": ["status", "stadium", "estate"],
                "forms": {"es": "estado", "en": "state", "it": "stato", "fr": "état"},
            },
        ],
    },
]


def _english_rank(forms: dict, ranks: dict[str, int]) -> int:
    en = (forms.get("en") or "").lower().strip()
    if not en:
        return 10**9
    return ranks.get(en, 10**9)


def build() -> dict:
    ranks: dict[str, int] = {}
    spoken = REPO_ROOT / "server" / "data" / "spoken_frequency.json"
    if spoken.exists():
        payload = json.loads(spoken.read_text(encoding="utf-8"))
        ranks = payload.get("languages", {}).get("en", {}).get("lemmas", {})

    cards = []
    for card in CARDS:
        examples = list(card["examples"])
        if ranks:
            examples = sorted(
                examples,
                key=lambda ex: (_english_rank(ex.get("forms") or {}, ranks), ex["position"]),
            )
            for index, example in enumerate(examples, start=1):
                example = {**example, "position": index}
                examples[index - 1] = example
        cards.append({**card, "examples": examples})

    return {
        "source": SOURCE,
        "stats": {
            "cards": len(cards),
            "examples": sum(len(card["examples"]) for card in cards),
            "mappings": sum(len(card["mappings"]) for card in cards),
        },
        "cards": cards,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args(argv)

    payload = build()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(payload["stats"], indent=2))
    print(f"Wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
