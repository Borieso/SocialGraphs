#!/usr/bin/env python
"""Extract prose from the course week pages, one unit of text per line.

Input:  ../../context/raw/weeks/week{1..6}.html  (fetched by context/refresh.sh)
Output: week{1..6}.txt next to this script.

Two ideas carry the whole script:

  Selection, not exclusion. Keep the elements that hold prose and ignore
  everything else, so code samples, tables, embeds and nav need no rules.

  Drop, don't repair. A sentence containing math is discarded whole rather
  than stripped and patched, because patching leaves sentences that no
  longer say anything ("Zachary's real split scores."). Then a strict
  alphabet removes whatever symbols are left.

See README.md. Re-run: conda run -n sna python extract_text.py
"""
import pathlib
import re
import sys
import unicodedata

from bs4 import BeautifulSoup

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE.parent.parent / "context" / "raw" / "weeks"

# The elements that carry prose. Everything else on the page is ignored.
PROSE = ("h1", "h2", "h3", "h4", "h5", "h6",
         "p", "li", "dt", "dd", "blockquote", "figcaption")

# A prose tag can still appear inside a code sample or a data table.
NOT_PROSE = ("pre", "table")

# Curly punctuation must become ASCII before the alphabet filter runs, or
# "don't" would survive as "don t".
QUOTES = (("\xa0", " "), ("‘", "'"), ("’", "'"),
          ("“", '"'), ("”", '"'))

# Abbreviations whose full stop does not end a sentence. Left as literal
# alternatives (so "e\.g" matches "e.g.") plus any single initial, as in
# "J. R. Firth". A naive splitter mis-fires here 92 times in 4,386 sentences.
ABBREVIATIONS = (r"Ch", r"Fig", r"Eq", r"Sec", r"pp", r"vol", r"al", r"cf",
                 r"vs", r"e\.g", r"i\.e", r"Dr", r"Mr", r"Mrs", r"Prof")
ABBREV = re.compile(r"\b(?:" + "|".join(ABBREVIATIONS) + r")\.|\b[A-Z]\.")
PROTECTED = "\x00"

SENTENCE = re.compile(r"(?<=[.!?])\s+")
MATH = "$"          # KaTeX scans raw text for these at page load

# The alphabet: letters, digits, and the punctuation worth keeping. Sentence
# enders stay so the corpus can still be split into sentences; the apostrophe
# and hyphen stay because they live inside words (don't, Spider-Man, TF-IDF).
ALPHABET = re.compile(r"[^A-Za-z0-9 .,!?'-]+")
STRAY_APOSTROPHE = re.compile(r"(?<![A-Za-z])'|'(?![A-Za-z])")
SPACE_BEFORE_PUNCT = re.compile(r" ([.,!?])")
PUNCT_RUN = re.compile(r"([.,!?'-])[.,!?'-]+")
LEADING_PUNCT = re.compile(r"^[.,!?'\- ]+")

MIN_LETTER_RATIO = 0.5


def to_ascii(text):
    """Fold the page's typography down to ASCII, keeping words whole."""
    for curly, plain in QUOTES:
        text = text.replace(curly, plain)
    # Barabasi, not Barabsi: decompose first, then drop the combining marks.
    text = unicodedata.normalize("NFKD", text)
    return text.encode("ascii", "ignore").decode("ascii")


def sentences(text):
    """Split on sentence enders, without splitting after an abbreviation."""
    guarded = ABBREV.sub(lambda m: m.group(0).replace(".", PROTECTED), text)
    for sentence in SENTENCE.split(guarded):
        yield sentence.replace(PROTECTED, ".")


def tidy(text):
    """Apply the alphabet, then close the gaps removals leave behind.

    The order matters: closing a space before punctuation can create a new
    punctuation run, so runs have to collapse afterwards, not before.
    """
    text = ALPHABET.sub(" ", text)
    text = STRAY_APOSTROPHE.sub("", text)
    text = SPACE_BEFORE_PUNCT.sub(r"\1", text)
    text = PUNCT_RUN.sub(r"\1", text)
    text = LEADING_PUNCT.sub("", text)
    return re.sub(r"\s+", " ", text).strip()


def is_prose(text):
    """Reject anything an earlier step hollowed out."""
    letters = sum(character.isalpha() for character in text)
    solid = len(text.replace(" ", ""))
    return bool(letters) and letters / solid >= MIN_LETTER_RATIO


def prose_units(main_el):
    for element in main_el.find_all(PROSE):
        if element.find_parent(PROSE) or element.find_parent(NOT_PROSE):
            continue                                  # outermost unit only
        raw = to_ascii(element.get_text())
        kept = [s for s in sentences(raw) if MATH not in s]
        text = tidy(" ".join(kept))
        if is_prose(text):
            yield text


def main():
    if not SRC.is_dir():
        sys.exit(f"no raw HTML at {SRC} — run context/refresh.sh first")

    for week in range(1, 7):
        html = (SRC / f"week{week}.html").read_text(encoding="utf-8")
        main_el = BeautifulSoup(html, "html.parser").find("main")
        lines = list(prose_units(main_el))
        text = "\n".join(lines) + "\n"
        (HERE / f"week{week}.txt").write_text(text, encoding="utf-8")
        print(f"week{week}.txt  {len(lines):4d} units  "
              f"{len(text.split()):6d} words  {len(text):7d} chars")


if __name__ == "__main__":
    main()
