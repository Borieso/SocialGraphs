# data/ — prose of the course week pages

`week1.txt` … `week6.txt`: the prose of the six published week pages of
the course site (https://sunelehmann.com/socialgraphs2026-web/), one file
per week, **one unit of text per line** — a paragraph, list item,
heading, glossary entry or caption. Extracted 2026-10-07 by
`extract_text.py` from the HTML that `../../context/refresh.sh` caches in
`context/raw/weeks/`. Re-run with
`conda run -n sna python extract_text.py`.

| file | units | words |
|---|---|---|
| week1.txt | 191 | 8,234 |
| week2.txt | 291 | 11,946 |
| week3.txt | 255 | 10,262 |
| week4.txt | 298 | 12,912 |
| week5.txt | 301 | 11,068 |
| week6.txt | 309 | 9,894 |

## How it works: selection, not exclusion

The script keeps the elements that hold prose — `p`, `li`, `h1`–`h6`,
`dt`, `dd`, `blockquote`, `figcaption` — and ignores everything else on
the page. Code samples, data tables, iframes, scripts, the site nav and
the table of contents therefore need no rules of their own; they are
simply never selected. Only the outermost prose element is taken, so a
`<p>` inside an `<li>` is not counted twice, and prose tags sitting
inside a `<pre>` or `<table>` are skipped.

This covers 92–100% of the text in `<main>`. The missing few percent in
weeks 5 and 6 is the Python code, which is not wanted here.

## What still needs handling, and why

- **Math.** These pages carry no math wrapper elements at all — KaTeX
  scans the raw text for `$` delimiters when the page loads — so inline
  math sits bare inside prose paragraphs and no choice of elements can
  avoid it. Two regexes remove it: `$$…$$` and `$…$`. **All math is
  dropped**, values included. Display equations get their own paragraph,
  which is then discarded for containing no words.
- **Links** are left where they are: link text is part of the sentence
  ("…see Gaby (2012)"). A paragraph that consists of *only* a link is
  navigation, not prose, and is dropped — that is the "All weeks"
  back-link.
- **Normalization**: non-breaking and fixed-width spaces to plain spaces,
  zero-width characters deleted, curly quotes and apostrophes to ASCII
  (so `don't` tokenizes the same way everywhere), `…` to `...`,
  whitespace runs collapsed, and the space a removal leaves before
  punctuation closed up. Emoji (the exercise-mode markers) removed.
  Dashes, arrows and middots are left alone — a tokenizer tags them as
  punctuation and you can filter them downstream.
- **The holes a removal leaves.** A hyphen glued to removed math goes
  with it (`$k$-cliques` → `cliques`), handled inside the math pattern
  so that real hyphens — `Spider-Man`, `TF-IDF`, `conda install -c` —
  are never touched. Brackets left holding nothing (`($m = 8$.)`) are
  deleted, and that runs *before* the space-before-punctuation tidy,
  since collapsing a bracket creates exactly that artifact.
- Text is read with `get_text()` and no separator. Inline elements are
  contiguous with their text in the source, so a separator invented
  spaces that were never there (`<code>out</code>-degree` came out as
  `out -degree`).

## Known cost

Removing all math leaves some sentences in the network weeks hanging
mid-clause: "Zachary's real split scores." was "scores $Q = 0.358$".
Weeks 1–4 are math-heavy (111 affected paragraphs in week 2, 100 in
week 4); weeks 5–6 have almost none. This is deliberate — the math is
not wanted in this corpus — but it means these files are a corpus of the
pages' *language*, not a faithful record of their claims.

## Not in these files at all

- The **interactive explorables** — roughly ten per page, each a separate
  iframe (`../explorables/*.html`). Only the caption below each widget is
  here, never the numbers or text inside it.
- **Embedded YouTube videos** (iframe, no transcript).
- **Python code samples** — 19 blocks in week 5, 10 in week 6; weeks 1–4
  have none, since the network half worked on paper. The sentence
  introducing each block is kept, which is why some lines end in a colon.
- Images: there are none in the page body.

## Where this lives in git

`data/` is **not** on `main`: GitHub Pages serves `main` verbatim
(`.nojekyll` disables Jekyll, so there is no exclude list), which would
publish this text at the site URL. It lives on the `corpus` branch
instead, and `/data/` is ignored on `main` so it cannot return by
accident.
