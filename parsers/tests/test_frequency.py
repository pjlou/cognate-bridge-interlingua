"""Frequency builder unit tests (offline fixtures)."""

from __future__ import annotations

from frequency.build import coverage_rank_cutoff, parse_frequency_words, parse_subtlex_us


def test_parse_frequency_words_ranks_by_count() -> None:
    text = "the 1000\nhouse 50\nthe 20\napple 10\n"
    ranks = parse_frequency_words(text, max_lemmas=10)
    assert ranks["the"] == 1
    assert ranks["house"] == 2
    assert ranks["apple"] == 3


def test_parse_subtlex_header() -> None:
    text = "Word\tFREQcount\nthe\t500\nhouse\t40\n"
    ranks = parse_subtlex_us(text, max_lemmas=10)
    assert ranks["the"] == 1
    assert ranks["house"] == 2


def test_coverage_cutoff_is_positive() -> None:
    ranks = {f"w{i}": i for i in range(1, 101)}
    cutoff = coverage_rank_cutoff(ranks, 0.95)
    assert cutoff is not None
    assert 1 <= cutoff <= 100
