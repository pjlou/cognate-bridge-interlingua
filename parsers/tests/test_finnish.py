"""Finnish experimental module parser tests."""

from __future__ import annotations

from finnish.lemmas import unique_lemmas
from finnish.patterns import PATTERNS, build
from finnish.build import build_entry, write_et_fixture


REQUIRED_SLUGS = {
    "consonant-gradation",
    "verb-rections",
    "partitive-vs-accusative",
    "locative-cases",
}


def test_unique_lemmas_have_glosses_and_many_et_cognates() -> None:
    lemmas = unique_lemmas()
    assert len(lemmas) >= 200
    with_et = [row for row in lemmas if row.get("et")]
    assert len(with_et) >= 80
    assert all(row["gloss_en"] for row in lemmas)


def test_et_fixture_writer(tmp_path, monkeypatch) -> None:
    import finnish.build as build_mod

    monkeypatch.setattr(build_mod, "ET_FIXTURE", tmp_path / "et_cognates.json")
    lemmas = unique_lemmas()
    write_et_fixture(lemmas)
    text = (tmp_path / "et_cognates.json").read_text(encoding="utf-8")
    assert '"et"' in text
    assert text.count('"fi"') >= 80


def test_build_entry_attaches_et_cognate() -> None:
    entry = build_entry(
        {
            "headword": "vesi",
            "part_of_speech": "n",
            "gloss_en": "water",
            "glosses_en": ["water"],
            "et": "vesi",
        },
        ranks={"vesi": 10},
    )
    assert entry["frequency_hint"] == 10
    assert entry["cognates"][0]["target_language"] == "et"
    assert entry["cognates"][0]["provenance"] == "curated"


def test_required_grammar_sections_present() -> None:
    slugs = {pattern.slug for pattern in PATTERNS}
    assert REQUIRED_SLUGS <= slugs
    assert "vowel-harmony" in slugs
    assert "negation-and-objects" in slugs
    built = build()
    assert all(len(pattern.examples) >= 3 for pattern in built)
