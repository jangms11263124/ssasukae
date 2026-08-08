"""Text handling primitives for reference lyrics.

The functions in this module intentionally avoid language-specific runtime
dependencies.  They provide deterministic behaviour for mixed Korean/Latin
lyrics while leaving pronunciation-aware work (G2P and forced alignment) to
an alignment backend.
"""

from __future__ import annotations

from dataclasses import dataclass
from difflib import SequenceMatcher
import unicodedata


@dataclass(frozen=True)
class LyricLine:
    """A retained line from a reference lyric document.

    ``index`` is dense among retained lines. ``source_line`` is the zero-based
    line number in the input, so callers can still point back to an original
    file when blank lines were discarded.
    """

    index: int
    source_line: int
    text: str
    normalized: str


@dataclass(frozen=True)
class DisplayUnit:
    """A highlightable portion of one lyric line.

    Hangul syllable blocks are individual units. Latin text is kept as words;
    guessing English syllables without a pronunciation lexicon is less stable
    than using a word as the display unit. ``char_start`` and ``char_end`` are
    half-open offsets in the original line.
    """

    index: int
    line_index: int
    text: str
    normalized: str
    char_start: int
    char_end: int
    kind: str


@dataclass(frozen=True)
class TextMatch:
    """Character-level match between two normalized strings."""

    reference: str
    hypothesis: str
    score: float
    # Index by reference character; the value is a hypothesis character index.
    character_map: tuple[int | None, ...]

    @property
    def exact(self) -> bool:
        return self.reference == self.hypothesis


def normalize_text(text: str, *, keep_spaces: bool = False) -> str:
    """Normalize Korean/English text for deterministic matching.

    The result is Unicode NFKC + casefolded. Letters, combining marks and
    numbers are retained; punctuation is ignored. By default whitespace is
    removed as Korean lyric spacing and ASR word boundaries often disagree.
    When ``keep_spaces`` is true, every whitespace run becomes one ASCII space.
    """

    if not isinstance(text, str):
        raise TypeError("text must be a string")

    normalized = unicodedata.normalize("NFKC", text).casefold()
    output: list[str] = []
    pending_space = False

    for character in normalized:
        if character.isspace():
            if keep_spaces and output:
                pending_space = True
            continue

        category = unicodedata.category(character)
        if category[0] in {"L", "N", "M"}:
            if pending_space:
                output.append(" ")
            output.append(character)
            pending_space = False

    return "".join(output)


def parse_reference_lyrics(
    text: str,
    *,
    keep_blank: bool = False,
) -> list[LyricLine]:
    """Parse a plain-text lyric document without reordering its lines.

    Surrounding whitespace is removed from display text. Empty lines are
    discarded by default, but their original positions remain observable via
    ``source_line``. A UTF-8 BOM on the first line is ignored.
    """

    if not isinstance(text, str):
        raise TypeError("lyrics must be supplied as text")

    source_lines = text.splitlines()
    retained: list[LyricLine] = []
    for source_index, raw_line in enumerate(source_lines):
        if source_index == 0:
            raw_line = raw_line.removeprefix("\ufeff")
        display_text = raw_line.strip()
        if not display_text and not keep_blank:
            continue
        retained.append(
            LyricLine(
                index=len(retained),
                source_line=source_index,
                text=display_text,
                normalized=normalize_text(display_text),
            )
        )
    return retained


def match_text(reference: str, hypothesis: str) -> TextMatch:
    """Return a stable character alignment for mixed Korean/English text."""

    normalized_reference = normalize_text(reference)
    normalized_hypothesis = normalize_text(hypothesis)
    matcher = SequenceMatcher(
        None,
        normalized_reference,
        normalized_hypothesis,
        autojunk=False,
    )
    mapping: list[int | None] = [None] * len(normalized_reference)
    for reference_start, hypothesis_start, size in matcher.get_matching_blocks():
        for offset in range(size):
            mapping[reference_start + offset] = hypothesis_start + offset

    if not normalized_reference and not normalized_hypothesis:
        score = 1.0
    else:
        score = matcher.ratio()
    return TextMatch(
        reference=normalized_reference,
        hypothesis=normalized_hypothesis,
        score=score,
        character_map=tuple(mapping),
    )


def text_similarity(reference: str, hypothesis: str) -> float:
    """Return normalized character similarity in the inclusive range 0..1."""

    return match_text(reference, hypothesis).score


def _is_hangul_syllable(character: str) -> bool:
    return "\uac00" <= character <= "\ud7a3"


def _is_latin_letter(character: str) -> bool:
    return unicodedata.category(character).startswith("L") and "LATIN" in unicodedata.name(
        character, ""
    )


def split_display_units(text: str, *, line_index: int = 0) -> list[DisplayUnit]:
    """Split a lyric line into deterministic highlightable display units.

    * each precomposed Hangul syllable block becomes one unit;
    * a Latin word, including an internal apostrophe or hyphen, becomes one;
    * a run of digits becomes one;
    * letters from other scripts become individual units;
    * whitespace and punctuation outside words are not highlightable.

    Raw character offsets allow a renderer to retain punctuation between units.
    """

    if not isinstance(text, str):
        raise TypeError("text must be a string")
    if line_index < 0:
        raise ValueError("line_index cannot be negative")

    units: list[DisplayUnit] = []
    cursor = 0
    while cursor < len(text):
        character = text[cursor]
        kind: str | None = None
        end = cursor + 1

        if _is_hangul_syllable(character):
            kind = "hangul_syllable"
        elif _is_latin_letter(character):
            kind = "latin_word"
            while end < len(text):
                following = text[end]
                if _is_latin_letter(following) or unicodedata.category(following).startswith("M"):
                    end += 1
                    continue
                if (
                    following in {"'", "’", "-"}
                    and end + 1 < len(text)
                    and _is_latin_letter(text[end + 1])
                ):
                    end += 1
                    continue
                break
        elif character.isdecimal():
            kind = "number"
            while end < len(text) and text[end].isdecimal():
                end += 1
        elif unicodedata.category(character).startswith("L"):
            kind = "character"
            while end < len(text) and unicodedata.category(text[end]).startswith("M"):
                end += 1

        if kind is not None:
            raw_unit = text[cursor:end]
            unit_normalized = normalize_text(raw_unit)
            if unit_normalized:
                units.append(
                    DisplayUnit(
                        index=len(units),
                        line_index=line_index,
                        text=raw_unit,
                        normalized=unit_normalized,
                        char_start=cursor,
                        char_end=end,
                        kind=kind,
                    )
                )
            cursor = end
        else:
            cursor += 1

    return units


__all__ = [
    "DisplayUnit",
    "LyricLine",
    "TextMatch",
    "match_text",
    "normalize_text",
    "parse_reference_lyrics",
    "split_display_units",
    "text_similarity",
]
