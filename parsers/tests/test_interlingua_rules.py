"""Tests for the Interlingua correspondence rules and the generation pipeline."""

from __future__ import annotations

import pytest

from interlingua import iedict, pos
from interlingua.build import build_entry
from interlingua.lexicons import Validation, Validator
from interlingua.rules import ALL_RULES, TARGET_LANGUAGES, predict, rules_for


class TestRuleIntegrity:
    def test_every_rule_computes_its_own_example(self) -> None:
        """The property that keeps the documentation honest.

        A rule's example is displayed to the learner as an illustration of that rule. If
        `apply(example_bridge)` did not equal `example_target`, the app would be showing
        an example the rule cannot actually account for -- which is precisely the failure
        mode of writing the prose first and the regex second.
        """
        for rule in ALL_RULES:
            assert rule.apply(rule.example_bridge) == rule.example_target, rule.code

    def test_every_rule_matches_its_own_example(self) -> None:
        for rule in ALL_RULES:
            assert rule.applies_to(rule.example_bridge), rule.code

    def test_rule_codes_are_unique(self) -> None:
        codes = [rule.code for rule in ALL_RULES]
        assert len(codes) == len(set(codes))

    def test_every_rule_targets_a_known_language(self) -> None:
        for rule in ALL_RULES:
            assert rule.target in TARGET_LANGUAGES, rule.code

    def test_every_rule_cites_a_source_section(self) -> None:
        for rule in ALL_RULES:
            assert rule.source_note.startswith("IED Introduction"), rule.code

    def test_every_target_language_has_rules(self) -> None:
        for language in TARGET_LANGUAGES:
            assert rules_for(language), language

    def test_confidence_is_a_probability(self) -> None:
        for rule in ALL_RULES:
            assert 0.0 < rule.confidence <= 1.0, rule.code


class TestInfinitives:
    @pytest.mark.parametrize(
        "word,target,expected",
        [
            ("cantar", "it", "cantare"),
            ("finir", "it", "finire"),
            ("vender", "it", "vendere"),
            ("cantar", "es", "cantar"),
            ("cantar", "pt", "cantar"),
            ("arrivar", "fr", "arriver"),
            ("tener", "fr", "tenir"),
        ],
    )
    def test_predicts_the_documented_infinitive(
        self, word: str, target: str, expected: str
    ) -> None:
        forms = {p.form for p in predict(word, [target])}
        assert expected in forms

    def test_identity_predictions_are_kept(self) -> None:
        """Spanish keeping -ar unchanged is a correspondence worth telling a learner.

        Filtering predictions where the string did not change would silently empty most
        of the Spanish and Portuguese columns.
        """
        spanish = predict("cantar", ["es"])
        assert any(p.form == "cantar" for p in spanish)

    def test_identity_predictions_still_carry_an_explaining_rule(self) -> None:
        [prediction] = [p for p in predict("cantar", ["es"]) if p.form == "cantar"]
        assert "unchanged" in prediction.rule.description


class TestVowelDevelopments:
    def test_reproduces_the_ied_terra_example(self) -> None:
        # The IED's own worked example: prototype terra, French terre, Spanish tierra,
        # Italian and Portuguese terra.
        spanish = {p.form for p in predict("terra", ["es"])}
        french = {p.form for p in predict("terra", ["fr"])}
        assert "tierra" in spanish
        assert "terre" in french

    def test_reproduces_the_ied_cosa_example_by_composing_two_rules(self) -> None:
        # French chose needs both the palatalisation of initial c- and the reduction of
        # final -a, neither of which reaches it alone.
        french = {p.form for p in predict("cosa", ["fr"])}
        assert "chose" in french

        portuguese = {p.form for p in predict("cosa", ["pt"])}
        assert "cousa" in portuguese

    def test_diphthongises_only_the_stressed_syllable(self) -> None:
        # `porta` diphthongises to `puerta`; the rule must not also fire on an unstressed
        # -o- earlier in a longer word.
        assert "puerta" in {p.form for p in predict("porta", ["es"])}


class TestSuffixes:
    @pytest.mark.parametrize(
        "word,target,expected",
        [
            ("nation", "es", "naci\u00f3n"),
            ("nation", "it", "nazione"),
            ("nation", "pt", "na\u00e7\u00e3o"),
            ("nation", "fr", "nation"),
            ("universitate", "es", "universidad"),
            ("universitate", "fr", "universit\u00e9"),
            ("universitate", "it", "universit\u00e0"),
            ("universitate", "pt", "universidade"),
            ("general", "it", "generale"),
            ("civil", "it", "civile"),
        ],
    )
    def test_predicts_the_documented_suffix_correspondence(
        self, word: str, target: str, expected: str
    ) -> None:
        assert expected in {p.form for p in predict(word, [target])}


class TestPredictionShape:
    def test_predictions_are_deduplicated_per_language(self) -> None:
        predictions = predict("nation")
        keys = [(p.target, p.form) for p in predictions]
        assert len(keys) == len(set(keys))

    def test_a_word_matching_nothing_predicts_nothing(self) -> None:
        assert predict("xyzzyq") == []

    def test_covers_every_language_for_a_regular_verb(self) -> None:
        targets = {p.target for p in predict("cantar")}
        assert targets == set(TARGET_LANGUAGES)


class TestPartOfSpeechInference:
    @pytest.mark.parametrize(
        "headword,glosses,expected",
        [
            ("cantar", ["to sing"], "v"),
            ("filia", ["daughter"], "n"),
            ("nation", ["nation", "country"], "n"),
            ("rapidemente", ["rapidly"], "adv"),
            ("nationalitate", ["nationality"], "n"),
            ("de", ["of", "from"], "prep"),
            ("io", ["I"], "prn"),
        ],
    )
    def test_infers_the_expected_class(
        self, headword: str, glosses: list[str], expected: str
    ) -> None:
        inferred, _ = pos.infer(headword, glosses)
        assert inferred == expected

    def test_a_to_infinitive_gloss_wins_over_morphology(self) -> None:
        # `-ar` is both an infinitive ending and an adjective suffix, so morphology alone
        # mislabels `linear`. The English gloss disambiguates.
        assert pos.infer("linear", ["linear"])[0] != "v"
        assert pos.infer("cantar", ["to sing"])[0] == "v"

    def test_records_how_the_decision_was_made(self) -> None:
        # Both signals agree here: -mente is unambiguously adverbial and so is a gloss
        # ending in -ly.
        assert pos.infer("rapidemente", ["rapidly"])[1] == "agreed"

        # `cantar` is reported as a conflict, and that is the accurate answer rather than
        # a shortcoming. In Interlingua `-ar` is both the first-conjugation infinitive
        # ending and an adjective suffix, so morphology alone says "adjective" while the
        # gloss says "verb". The gloss wins, and the basis records that the call was made
        # over an objection instead of pretending the evidence was unanimous.
        part_of_speech, basis = pos.infer("cantar", ["to sing"])
        assert (part_of_speech, basis) == ("v", "conflict")

        assert pos.infer("xyzzyq", [])[1] == "unknown"

    def test_multiword_headwords_fall_back_to_the_gloss(self) -> None:
        inferred, basis = pos.infer("filo de auro", ["gold wire"])
        assert basis in {"gloss", "unknown"}
        assert inferred != "v"

    def test_returns_none_rather_than_guessing(self) -> None:
        inferred, basis = pos.infer("xyzzyq", ["xyzzyq"])
        assert inferred is None
        assert basis == "unknown"


class TestIedictParsing:
    def test_parses_the_documented_format(self) -> None:
        text = "\n".join(
            [
                "# a comment line",
                "",
                "filia : daughter",
                "filio : son",
                "filo : thread, yarn, edge (of a knife, razor)",
                "filo de auro : gold wire",
                "malformed line with no separator",
            ]
        )
        entries = iedict.parse(text)
        assert [entry.headword for entry in entries] == [
            "filia",
            "filio",
            "filo",
            "filo de auro",
        ]

    def test_keeps_a_parenthetical_gloss_intact(self) -> None:
        [entry] = iedict.parse("filo : thread, yarn, edge (of a knife, razor)")
        assert entry.glosses == ["thread", "yarn", "edge (of a knife, razor)"]

    def test_flags_multiword_headwords(self) -> None:
        entries = iedict.parse("filo de auro : gold wire\nfilo : thread")
        assert entries[0].is_multiword
        assert not entries[1].is_multiword


class FakeValidator(Validator):
    """A validator with a hand-built lexicon, so generation is tested without downloads."""

    def __init__(self, attested: dict[str, set[str]]) -> None:  # noqa: D107
        self._attested = attested

    def available(self, language: str) -> bool:
        return language in self._attested

    @property
    def available_languages(self) -> list[str]:
        return list(self._attested)

    def check(self, language: str, form: str) -> Validation:
        if language not in self._attested:
            return Validation(attested=False, lexicon=None)
        return Validation(attested=form in self._attested[language], lexicon=f"test-{language}")

    def sizes(self) -> dict[str, int]:
        return {language: len(words) for language, words in self._attested.items()}


class TestGeneration:
    def test_keeps_an_attested_prediction_and_records_its_lexicon(self) -> None:
        validator = FakeValidator({"it": {"cantare"}})
        record = build_entry(iedict.IedictEntry("cantar", ["to sing"]), validator)

        italian = [c for c in record["cognates"] if c["target_language"] == "it"]
        assert [c["target_word"] for c in italian] == ["cantare"]
        assert italian[0]["validated_against"] == "test-it"
        assert italian[0]["confidence"] >= 0.75
        assert italian[0]["rule_code"] == "ia.inf-ar.ita"

    def test_discards_a_prediction_the_lexicon_rejects(self) -> None:
        # `cantere` is a form the -er rule would produce from a different prototype; a
        # lexicon that knows only `cantare` must remove everything else.
        validator = FakeValidator({"it": {"cantare"}})
        record = build_entry(iedict.IedictEntry("cantar", ["to sing"]), validator)
        forms = {c["target_word"] for c in record["cognates"] if c["target_language"] == "it"}
        assert forms == {"cantare"}

    def test_generates_nothing_for_a_language_whose_lexicon_rejects_everything(self) -> None:
        validator = FakeValidator({"it": set(), "es": set(), "fr": set(), "pt": set()})
        record = build_entry(iedict.IedictEntry("cantar", ["to sing"]), validator)
        assert record["cognates"] == []

    def test_keeps_unvalidated_predictions_at_low_confidence(self) -> None:
        # No lexicon for any language: predictions survive but are visibly less trusted,
        # so a failed download degrades quality instead of emptying the dataset.
        validator = FakeValidator({})
        record = build_entry(iedict.IedictEntry("cantar", ["to sing"]), validator)
        assert record["cognates"]
        for cognate in record["cognates"]:
            assert cognate["validated_against"] is None
            assert cognate["confidence"] < 0.5

    def test_every_generated_cognate_names_the_rule_that_made_it(self) -> None:
        validator = FakeValidator({"it": {"cantare"}, "es": {"cantar"}})
        record = build_entry(iedict.IedictEntry("cantar", ["to sing"]), validator)
        assert record["cognates"]
        for cognate in record["cognates"]:
            assert cognate["rule_code"]
            assert cognate["provenance"] == "rule_generated"

    def test_carries_the_gloss_through(self) -> None:
        record = build_entry(
            iedict.IedictEntry("filo", ["thread", "yarn"]), FakeValidator({})
        )
        assert record["gloss_en"] == "thread"
        assert record["glosses_en"] == ["thread", "yarn"]
