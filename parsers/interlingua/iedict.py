"""Reads IEDICT, the Interlingua-English Dictionary by Paul Denisowski.

CC BY 3.0, so unlike the 1951 IED this can be parsed and redistributed in bulk with
attribution. The format is one entry per line:

    filia : daughter
    filio : son
    filo : thread, yarn, edge (of a knife, razor)
    filo de auro : gold wire

There is no part-of-speech field and no cognate data, which is why `pos.py` infers the
former and `rules.py` generates the latter.
"""

from __future__ import annotations

import re
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

IEDICT_URL = "http://www.denisowski.org/Interlingua/IEDICT/iedict.txt"

REPO_ROOT = Path(__file__).resolve().parents[2]
CACHE = REPO_ROOT / "parsers" / "lexicons" / "iedict.txt"

ATTRIBUTION = (
    "IEDICT (Interlingua-English Dictionary) by Paul Denisowski, CC BY 3.0. "
    "http://www.denisowski.org/Interlingua/IEDICT/iedict.txt"
)

# Header lines and the licence block are prose, not entries.
_COMMENT = re.compile(r"^\s*(#|//|;)")


@dataclass
class IedictEntry:
    headword: str
    glosses: list[str] = field(default_factory=list)

    @property
    def is_multiword(self) -> bool:
        return " " in self.headword


def download(destination: Path = CACHE, url: str = IEDICT_URL) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=60) as response:
        destination.write_bytes(response.read())
    return destination


def load(path: Path = CACHE, *, offline: bool = False) -> list[IedictEntry]:
    if not path.exists():
        if offline:
            raise FileNotFoundError(
                f"{path} is missing and --offline was requested. "
                f"Run without --offline once to download IEDICT."
            )
        download(path)

    # IEDICT is Latin-1 in places despite being mostly ASCII; errors='replace' would
    # silently corrupt headwords, so decode permissively but explicitly.
    text = path.read_text(encoding="utf-8", errors="replace")
    return parse(text)


def parse(text: str) -> list[IedictEntry]:
    entries: list[IedictEntry] = []
    for line in text.splitlines():
        entry = parse_line(line)
        if entry is not None:
            entries.append(entry)
    return entries


def parse_line(line: str) -> IedictEntry | None:
    line = line.strip()
    if not line or _COMMENT.match(line):
        return None

    headword, separator, gloss_text = line.partition(":")
    if not separator:
        return None

    headword = headword.strip()
    gloss_text = gloss_text.strip()
    if not headword or not gloss_text:
        return None

    return IedictEntry(headword=headword, glosses=split_glosses(gloss_text))


def split_glosses(text: str) -> list[str]:
    """Splits an English gloss run on commas, but not inside parentheses.

    `thread, yarn, edge (of a knife, razor)` is three glosses, and the last one keeps its
    parenthetical intact.
    """
    glosses: list[str] = []
    depth = 0
    buffer: list[str] = []

    for char in text:
        if char == "(":
            depth += 1
        elif char == ")":
            depth = max(0, depth - 1)

        if char == "," and depth == 0:
            gloss = "".join(buffer).strip()
            if gloss:
                glosses.append(gloss)
            buffer = []
        else:
            buffer.append(char)

    tail = "".join(buffer).strip()
    if tail:
        glosses.append(tail)
    return glosses
