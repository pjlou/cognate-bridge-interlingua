"""Orthographic transparency helpers for cognate scoring."""

from __future__ import annotations


def normalized_levenshtein(a: str, b: str) -> float:
    left = a.lower().strip()
    right = b.lower().strip()
    if not left and not right:
        return 0.0
    if not left or not right:
        return 1.0
    rows = len(left) + 1
    cols = len(right) + 1
    previous = list(range(cols))
    for i in range(1, rows):
        current = [i]
        for j in range(1, cols):
            insert = current[j - 1] + 1
            delete = previous[j] + 1
            replace = previous[j - 1] + (0 if left[i - 1] == right[j - 1] else 1)
            current.append(min(insert, delete, replace))
        previous = current
    return previous[-1] / max(len(left), len(right))


def transparency(a: str, b: str) -> float:
    return max(0.0, min(1.0, 1.0 - normalized_levenshtein(a, b)))
