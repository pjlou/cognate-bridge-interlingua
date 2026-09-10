"""The shape of grammar-pattern output, shared across bridge languages.

Mirrors `grammar_patterns` / `grammar_pattern_examples` / `grammar_pattern_parallels` in
migration 0003 so the seed script is a direct load rather than a translation layer.

Each bridge can arrive here by a different route -- Interlingua's examples are
hand-authored against Gode & Blair, Finnish's are hand-authored against cited grammar
topics -- but they land in the same structure, which is the point of keeping the schema
family-agnostic.
"""

from __future__ import annotations

import difflib
from dataclasses import dataclass, field
from typing import Any

# Enough choices to make a guess unrewarding without turning the drill into a reading
# comprehension exercise.
DISTRACTOR_COUNT = 3
# Below this, two sentences are too dissimilar to be a plausible confusion, and offering
# one as a choice teaches nothing.
MIN_DISTRACTOR_SIMILARITY = 0.35


@dataclass
class Example:
    bridge_text: str
    gloss_en: str
    highlight: str | None = None
    prompt: str | None = None
    answer: str | None = None
    distractors: list[str] = field(default_factory=list)
    note: str | None = None
    # Target-language code to the same sentence in that language.
    parallels: dict[str, str] = field(default_factory=dict)
    # Illustrates the pattern by violating it. Shown, never drilled.
    ungrammatical: bool = False

    def as_json(self, position: int) -> dict[str, Any]:
        return {
            "position": position,
            "bridge_text": self.bridge_text,
            "gloss_en": self.gloss_en,
            "highlight": self.highlight,
            "prompt": self.prompt,
            "answer": self.answer,
            "distractors": self.distractors,
            "note": self.note,
            "parallels": self.parallels,
        }


@dataclass
class Pattern:
    slug: str
    name: str
    family: str
    summary: str
    description: str
    source_note: str
    difficulty_level: int
    examples: list[Example] = field(default_factory=list)
    # `word_order` drills scramble the answer into a word bank; everything else is
    # multiple choice. Stored on the pattern so the client does not have to guess
    # from the slug.
    drill_kind: str = "multiple_choice"

    def as_json(self, position: int) -> dict[str, Any]:
        return {
            "slug": self.slug,
            "name": self.name,
            "family": self.family,
            "summary": self.summary,
            "description": self.description,
            "source_note": self.source_note,
            "difficulty_level": self.difficulty_level,
            "drill_kind": self.drill_kind,
            "position": position,
            "examples": [
                example.as_json(index)
                for index, example in enumerate(self.examples, start=1)
            ],
        }


def assign_sibling_distractors(examples: list[Example]) -> None:
    """Fills each drillable example's distractors from its most similar siblings.

    This exploits how the sources are written rather than inventing wrong answers. Both
    Parke and Gode & Blair teach a pattern through minimal variations on one sentence:
    `Ick at en appel.` sits next to `At ick en appel?`, and `Io le vide.` next to `Io vole
    vider le.` So the nearest sibling of an example is, by construction, a sentence that
    differs from it exactly in the feature the pattern is about -- which is what a good
    distractor is. Generating them instead would mean either producing ungrammatical
    strings or guessing at the grammar of a language the parser does not model.

    Examples marked ungrammatical are offered as distractors but never receive any, since
    they are displayed as counter-examples rather than drilled.
    """
    for example in examples:
        if example.answer is None or example.ungrammatical:
            continue

        scored = []
        for other in examples:
            if other is example or other.bridge_text == example.bridge_text:
                continue
            ratio = difflib.SequenceMatcher(
                None, example.bridge_text, other.bridge_text
            ).ratio()
            if ratio >= MIN_DISTRACTOR_SIMILARITY:
                scored.append((ratio, other.bridge_text))

        # Sort by text as well as score so equal-scoring siblings order deterministically
        # and the emitted JSON does not churn between runs.
        scored.sort(key=lambda pair: (-pair[0], pair[1]))
        example.distractors = [text for _ratio, text in scored[:DISTRACTOR_COUNT]]


def document(bridge_code: str, patterns: list[Pattern]) -> dict[str, Any]:
    return {
        "bridge_language": bridge_code,
        "patterns": [
            pattern.as_json(index) for index, pattern in enumerate(patterns, start=1)
        ],
    }
