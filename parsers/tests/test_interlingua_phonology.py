"""Interlingua grapheme-to-phoneme, against Gode & Blair §§1-13 examples."""

from __future__ import annotations

from interlingua.phonology import (
    DERIVED,
    SOURCE_NOTE,
    UNCERTAIN,
    annotate_entry,
    stressed_letter,
    transcribe,
)


class TestStress:
    def test_default_is_the_vowel_before_the_last_consonant(self) -> None:
        assert "lingua"[stressed_letter("lingua")] == "i"
        assert "cantar"[stressed_letter("cantar")] == "a"
        assert "esser"[stressed_letter("esser")] == "e"
        assert "action"[stressed_letter("action")] == "o"

    def test_plural_s_does_not_move_stress(self) -> None:
        assert stressed_letter("lingua") == stressed_letter("linguas")
        assert stressed_letter("illa") == stressed_letter("illas")

    def test_antepenult_on_vowel_plus_le_ne_re(self) -> None:
        assert "fragile"[stressed_letter("fragile")] == "a"
        assert "ordine"[stressed_letter("ordine")] == "o"
        assert "tempore"[stressed_letter("tempore")] == "e"
        assert "automobile"[stressed_letter("automobile")] == "o"
        # au-to-mo-bi-le: the o of -mo- is letter index 5.
        assert stressed_letter("automobile") == 5

    def test_suffixes_stress_the_syllable_before_them(self) -> None:
        assert "politic"[stressed_letter("politic")] == "i"
        assert "musica"[stressed_letter("musica")] == "u"
        assert "historico"[stressed_letter("historico")] == "o"
        assert "rapide"[stressed_letter("rapide")] == "a"
        assert "formula"[stressed_letter("formula")] == "o"

    def test_ific_is_stressed_on_its_first_i(self) -> None:
        word = "scientific"
        index = stressed_letter(word)
        assert word[index : index + 4] == "ific"

    def test_no_consonant_stresses_the_first_vowel(self) -> None:
        assert stressed_letter("io") == 0
        assert stressed_letter("via") == 1


class TestGuideExamples:
    def test_u_before_a_vowel_is_a_glide(self) -> None:
        ipa, ok = transcribe("lingua")
        assert ok
        assert ipa == "ˈliŋgwa"

    def test_i_before_a_vowel_is_a_glide(self) -> None:
        ipa, ok = transcribe("filia")
        assert ok
        assert ipa == "ˈfilja"
        ipa, ok = transcribe("filio")
        assert ok
        assert ipa == "ˈfiljo"

    def test_infinitive_stresses_the_ending(self) -> None:
        ipa, ok = transcribe("cantar")
        assert ok
        assert ipa == "kanˈtar"
        ipa, ok = transcribe("esser")
        assert ok
        assert ipa == "eˈser"

    def test_antepenult_nouns(self) -> None:
        assert transcribe("fragile") == ("ˈfragile", True)
        assert transcribe("ordine") == ("ˈordine", True)
        assert transcribe("tempore") == ("ˈtempore", True)
        assert transcribe("automobile") == ("autoˈmobile", True)

    def test_ic_family_suffixes(self) -> None:
        assert transcribe("politic") == ("poˈlitik", True)
        assert transcribe("musica") == ("ˈmusika", True)
        assert transcribe("rapide") == ("ˈrapide", True)
        assert transcribe("formula") == ("ˈformula", True)

    def test_hiatus_when_i_is_stressed_before_a_vowel(self) -> None:
        ipa, ok = transcribe("via")
        assert ok
        assert ipa == "ˈvia"
        ipa, ok = transcribe("io")
        assert ok
        assert ipa == "ˈio"
        ipa, ok = transcribe("garantia")
        assert ok
        # Regular last-consonant stress is the a before t; the i of -tia is then
        # unstressed, so ti + vowel palatalises. The grammar's garantia example is
        # an IED stress respelling, which IEDICT does not carry.
        assert ipa == "gaˈrantsja"

    def test_c_is_ts_before_front_vowels_and_k_otherwise(self) -> None:
        assert transcribe("cento") == ("ˈtsento", True)
        assert transcribe("casa") == ("ˈkasa", True)

    def test_ch_is_k(self) -> None:
        assert transcribe("echo") == ("ˈeko", True)

    def test_qu_is_kw(self) -> None:
        assert transcribe("que") == ("kwe", True)

    def test_j_is_the_sound_of_azure(self) -> None:
        assert transcribe("junio") == ("ˈʒunjo", True)

    def test_unstressed_ti_before_a_vowel_is_tsj(self) -> None:
        assert transcribe("action") == ("akˈtsjon", True)
        assert transcribe("nation") == ("naˈtsjon", True)

    def test_ti_after_s_stays_t(self) -> None:
        ipa, ok = transcribe("question")
        assert ok
        assert ipa == "kwesˈtjon"

    def test_age_has_the_azure_g(self) -> None:
        assert transcribe("avantage") == ("avanˈtaʒe", True)

    def test_double_consonants_merge(self) -> None:
        assert transcribe("terra") == ("ˈtera", True)

    def test_n_assimilates_before_g_and_k(self) -> None:
        ipa, ok = transcribe("angulo")
        assert ok
        assert "ŋ" in ipa
        ipa, ok = transcribe("banco")
        assert ok
        assert ipa == "ˈbaŋko"

    def test_ph_is_f_and_h_after_r_or_t_is_silent(self) -> None:
        ipa, ok = transcribe("philosophia")
        assert ok
        # Last consonant is the `ph`; the i of -ia is after it, so the regular
        # rule stresses `o` and the following i is a glide.
        assert ipa == "filoˈsofja"
        ipa, ok = transcribe("rhythmo")
        assert ok
        assert ipa == "ˈritmo"

    def test_diphthongs_keep_both_vowel_qualities(self) -> None:
        assert transcribe("auro") == ("ˈauro", True)
        ipa, ok = transcribe("europa")
        assert ok
        assert ipa == "euˈropa"

    def test_function_words_are_unstressed_monosyllables(self) -> None:
        assert transcribe("le") == ("le", True)
        assert transcribe("de") == ("de", True)
        assert transcribe("e") == ("e", True)

    def test_phrases_are_transcribed_word_by_word(self) -> None:
        ipa, ok = transcribe("filo de auro")
        assert ok
        assert ipa == "ˈfilo de ˈauro"


class TestAnnotate:
    def test_ordinary_headword_is_derived(self) -> None:
        entry = annotate_entry({"headword": "filia", "gloss_en": "daughter"})
        assert entry["ipa_source"] == DERIVED
        assert entry["ipa"] == "ˈfilja"

    def test_phrase_is_derived(self) -> None:
        entry = annotate_entry({"headword": "filo de auro", "is_multiword": True})
        assert entry["ipa_source"] == DERIVED
        assert entry["ipa"] == "ˈfilo de ˈauro"

    def test_guest_diacritic_is_uncertain(self) -> None:
        entry = annotate_entry({"headword": "kümmel"})
        assert entry["ipa_source"] == UNCERTAIN
        assert entry["ipa"] == "kuˈmel"

    def test_accented_guest_word_keeps_its_vowels(self) -> None:
        entry = annotate_entry({"headword": "café"})
        assert entry["ipa_source"] == UNCERTAIN
        assert entry["ipa"] == "ˈkafe"

    def test_exclamation_is_ordinary_interlingua(self) -> None:
        entry = annotate_entry({"headword": "Ave!"})
        assert entry["ipa_source"] == DERIVED
        assert entry["ipa"] == "ˈave"

    def test_second_pass_does_not_promote_derived_to_direct(self) -> None:
        first = annotate_entry({"headword": "lingua"})
        assert first["ipa_source"] == DERIVED
        second = annotate_entry(first)
        assert second["ipa_source"] == DERIVED
        assert second["ipa"] == first["ipa"]


class TestCitation:
    def test_names_the_grammar_sections(self) -> None:
        assert "§§1–13" in SOURCE_NOTE
        assert "Gode & Blair" in SOURCE_NOTE
