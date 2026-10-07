#!/usr/bin/env python
"""Extract tokenization-ready plain text from the course week pages.

Input:  ../../context/raw/weeks/week{1..6}.html  (fetched by context/refresh.sh)
Output: week{1..6}.txt next to this script.

Every choice below is a preprocessing choice; see README.md for the list.
Re-run with: conda run -n sna python extract_text.py
"""
import pathlib
import re
import sys

from bs4 import BeautifulSoup

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE.parent.parent / "context" / "raw" / "weeks"

# Elements whose text is not prose: code samples, numeric tables, embeds.
DROP_TAGS = ("script", "style", "pre", "table", "iframe", "noscript")

# Block-level elements get a newline on each side so sentences never run together.
BLOCK = {
    "p", "div", "section", "article", "li", "ul", "ol",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "blockquote", "dl", "dt", "dd", "figure", "figcaption",
    "details", "summary", "br", "hr",
}

# Inline math that is already plain symbols and numbers ($Q$, $Q = 0.358$,
# $m = 8$) is kept verbatim so the sentence and its values survive. Anything
# carrying real LaTeX markup -- a command, a subscript, a superscript, a group
# -- is an expression we cannot render as words, so it goes.
LATEX_MARKUP = re.compile(r"[\\_^{}]")
PLAIN_MATH = re.compile(r"[A-Za-z0-9 .,=+\-/<>()%'\u2248\u00d7\u2212]+")
# ...except a bare Greek (or similar) command, which is just a word: \alpha -> alpha.
GREEK_COMMAND = re.compile(r"\\([A-Za-z]{2,12})")

EMOJI = re.compile(
    "["
    "\U0001f300-\U0001faff"  # pictographs, emoticons, symbols
    "\U00002600-\U000027bf"  # misc symbols + dingbats
    "\U0001f000-\U0001f2ff"
    "️⃣"           # variation selector, keycap
    "]+"
)

PUNCT_FIXES = [
    (re.compile(r"[ \t]+([.,;:!?)\]])"), r"\1"),   # space left before punctuation
    (re.compile(r"([(\[])[ \t]+"), r"\1"),         # space left after an opener
    (re.compile(r"\(\s*\)|\[\s*\]"), ""),          # parens emptied by a removal
    (re.compile(r"[ \t]{2,}"), " "),
    (re.compile(r"(?m)^[\s.,;:!?·—–\-()\[\]]*$"), ""),  # punctuation-only lines
]


def strip_math(text):
    """Remove LaTeX source. KaTeX renders client-side, so it reaches us raw."""
    text = re.sub(r"\$\$.*?\$\$", " ", text, flags=re.DOTALL)

    def inline(match):
        body = match.group(1).strip()
        greek = GREEK_COMMAND.fullmatch(body)
        if greek:
            return f" {greek.group(1)} "
        if not LATEX_MARKUP.search(body) and PLAIN_MATH.fullmatch(body):
            return f" {body} "
        return " "

    return re.sub(r"\$([^$\n]*)\$", inline, text)


def normalize(text):
    for bad, good in (
        ("\xa0", " "), (" ", " "), (" ", " "),       # fixed-width spaces
        ("​", ""), ("‌", ""), ("﻿", ""),        # zero-width
        ("‘", "'"), ("’", "'"),                      # curly single quotes
        ("“", '"'), ("”", '"'),                      # curly double quotes
        ("…", "..."),
    ):
        text = text.replace(bad, good)
    return EMOJI.sub(" ", text)


def to_text(node):
    parts = []

    def walk(element):
        for child in element.children:
            name = getattr(child, "name", None)
            if name is None:
                parts.append(str(child))
                continue
            if name in DROP_TAGS:
                continue
            if name in BLOCK:
                parts.append("\n")
            walk(child)
            if name in BLOCK:
                parts.append("\n")

    walk(node)
    return "".join(parts)


def clean(text):
    text = normalize(strip_math(text))
    for pattern, replacement in PUNCT_FIXES:
        text = pattern.sub(replacement, text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() + "\n"


def main():
    if not SRC.is_dir():
        sys.exit(f"no raw HTML at {SRC} — run context/refresh.sh first")

    for week in range(1, 7):
        source = SRC / f"week{week}.html"
        soup = BeautifulSoup(source.read_text(encoding="utf-8"), "html.parser")
        main_el = soup.find("main") or soup.body

        for tag in main_el.find_all(DROP_TAGS):
            tag.decompose()
        for link in main_el.find_all("a"):          # "<- All weeks" page nav
            if "All weeks" in link.get_text():
                link.decompose()

        text = clean(to_text(main_el))
        (HERE / f"week{week}.txt").write_text(text, encoding="utf-8")
        print(f"week{week}.txt  {len(text.split()):6d} words  {len(text):7d} chars")


if __name__ == "__main__":
    main()
