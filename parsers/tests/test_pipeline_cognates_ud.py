"""Cognate augmentation and UD grammar smoke tests."""

from __future__ import annotations

from cognates.build import build_by_english
from cognates.similarity import normalized_levenshtein, transparency
from ud_grammar.build import patterns_for


def test_similarity_floor_and_identity() -> None:
    assert normalized_levenshtein("water", "water") == 0
    assert transparency("water", "water") == 1


def test_etym_fixture_yields_curated_rows() -> None:
    by_en = build_by_english(offline=True)
    assert "father" in by_en
    assert any(row["provenance"] == "curated" for row in by_en["father"])


def test_ud_patterns_prefixed_and_drillable() -> None:
    patterns = patterns_for("Romance")
    assert len(patterns) >= 4
    assert all(pattern.slug.startswith("ud-") for pattern in patterns)
    for pattern in patterns:
        drillable = [ex for ex in pattern.examples if ex.answer]
        assert len(drillable) >= 4
