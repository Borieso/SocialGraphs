#!/usr/bin/env python
"""Extract prose from the course week pages, one unit of text per line.

Input:  ../../context/raw/weeks/week{1..6}.html  (fetched by context/refresh.sh)
Output: week{1..6}.txt next to this script.

Selection, not exclusion: we keep the elements that hold prose and ignore
everything else, so code samples, tables, embeds and nav need no rules of
their own. See README.md. Re-run: conda run -n sna python extract_text.py
"""
import pathlib
import re
import sys

from bs4 import BeautifulSoup

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE.parent.parent / "context" / "raw" / "weeks"

# The elements that carry prose. Everything else on the page is ignored.
PROSE = ("h1", "h2", "h3", "h4", "h5", "h6",
         "p", "li", "dt", "dd", "blockquote", "figcaption")

# A prose tag can still appear inside a code sample or a data table.
NOT_PROSE = ("pre", "table")

# Math has no wrapper element on these pages -- KaTeX scans the raw text for
# $ delimiters at load time -- so it has to come out with a regex. Display
# equations get their own paragraph, which then drops out as having no words.
DISPLAY_MATH = re.compile(r"\$\$.*?\$\$", re.DOTALL)
INLINE_MATH = re.compile(r"\$[^$\n]*\$-?")   # -? eats "$k$-cliques"

HAS_WORD = re.compile(r"[A-Za-z]")

# Left behind when a removed expression was the only thing inside brackets,
EMPTY_BRACKET = re.compile(r"[(\[]\s*[.,;:!?]*\s*[)\]]")


def normalize(text):
    for bad, good in (
        ("\xa0", " "), (" ", " "), (" ", " "),       # fixed-width spaces
        ("​", ""), ("‌", ""), ("﻿", ""),        # zero-width
        ("‘", "'"), ("’", "'"), ("“", '"'), ("”", '"'),
        ("…", "..."),
    ):
        text = text.replace(bad, good)
    return EMOJI.sub(" ", text)


EMOJI = re.compile(
    "[\U0001f000-\U0001faff\U00002600-\U000027bf️⃣]+"
)


def clean(text):
    text = INLINE_MATH.sub(" ", DISPLAY_MATH.sub(" ", text))
    text = normalize(text)
    text = re.sub(r"\s+", " ", text)
    text = EMPTY_BRACKET.sub("", text)                # "($m = 8$.)" -> ""
    text = re.sub(r" ([.,;:!?)\]])", r"\1", text)   # space left by a removal
    return re.sub(r" {2,}", " ", text).strip()


def is_nav(element):
    """A paragraph that is nothing but one link, e.g. the back-link."""
    links = element.find_all("a")
    return (len(links) == 1
            and element.get_text(strip=True) == links[0].get_text(strip=True))


def prose_units(main_el):
    for element in main_el.find_all(PROSE):
        if element.find_parent(PROSE) or element.find_parent(NOT_PROSE):
            continue                                 # outermost unit only
        if is_nav(element):
            continue
        text = clean(element.get_text())
        if HAS_WORD.search(text):                    # drops emptied math blocks
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
