# data/ — prose of the course week pages

`week1.txt` … `week6.txt`: the prose of the six published week pages of
the course site (https://sunelehmann.com/socialgraphs2026-web/), one file
per week, **one unit of text per line** — a paragraph, list item,
heading, glossary entry or caption. Built for tokenization: every line is
meant to be a piece of language that stands on its own.

Extracted 2026-10-07 by `extract_text.py` from the HTML that
`../../context/refresh.sh` caches in `context/raw/weeks/`. Re-run with
`conda run -n sna python extract_text.py`.

| file | units | words |
|---|---|---|
| week1.txt | 186 | 7,119 |
| week2.txt | 272 | 8,592 |
| week3.txt | 245 | 7,604 |
| week4.txt | 277 | 9,567 |
| week5.txt | 302 | 10,888 |
| week6.txt | 306 | 9,496 |
| **total** | **1,588** | **53,266** |

## Two ideas carry the whole pipeline

**Selection, not exclusion.** The script keeps the elements that hold
prose — `p`, `li`, `h1`–`h6`, `dt`, `dd`, `blockquote`, `figcaption` —
and ignores everything else. Code samples, data tables, iframes,
scripts, the site nav and the table of contents therefore need no rules
of their own; they are never selected. Only the outermost prose element
is taken, so a `<p>` inside an `<li>` is not counted twice.

**Drop, don't repair.** These pages carry no math wrapper elements —
KaTeX scans the raw text for `$` delimiters when the page loads — so
inline math sits bare in the middle of sentences. Stripping it out and
patching the hole leaves sentences that no longer say anything
("Zachary's real split scores."), so instead **any sentence containing
math is discarded whole**. Sentence granularity matters: discarding the
whole *paragraph* would cost 34% of the corpus and over half of weeks
2–4, because one symbol would take hundreds of good words with it.

## The alphabet

After the prose is selected, only these characters survive:

```
A-Z  a-z  0-9  space  .  ,  !  ?  '  -
```

Everything else becomes a space. Sentence enders stay so the corpus can
still be split into sentences (week 6's Word2Vec example needs that);
the apostrophe and hyphen stay because they live *inside* words —
`don't`, `Spider-Man`, `TF-IDF`, `in-degree`.

Before the filter runs, typography is folded to ASCII: curly quotes and
apostrophes become straight ones (otherwise `don’t` would survive as
`don t`), and accents are decomposed and stripped so names stay whole —
`Barabási` → `Barabasi`, `Boguñá` → `Boguna`, `Erdős` → `Erdos`.

Then the gaps a removal leaves are closed, **in this order**: stray
apostrophes, space before punctuation, and only *then* runs of
punctuation — because closing a gap is itself what creates a new run.
Getting this order wrong is what left `distances,,` and `love:,` in an
earlier version.

Finally a unit is emitted only if letters make up at least half its
non-space characters, which catches anything an earlier step hollowed
out.

## Sentence splitting

Splits on `.`, `!`, `?` followed by whitespace, but not after an
abbreviation — `Ch.`, `Fig.`, `pp.`, `et al.`, `e.g.`, `i.e.`, `vs.`, or
a single initial as in `J. R. Firth`. A naive splitter mis-fires there 92
times across 4,386 sentences, and every mis-split risks discarding good
text or keeping a math-bearing fragment.

## What this corpus is not

- **It omits the pages' quantitative claims.** Any sentence that stated
  a value in math is gone, so numbers like `0.358` and `1,784` are
  absent. 979 numeric tokens remain (`303` appears 17 times) — the ones
  written in plain prose. These files are a record of the pages'
  *language*, not of what they assert.
- **Labels merge into their sentences.** The colon is not in the
  alphabet, so "Anecdote 1: The network…" reads as "Anecdote 1 The
  network…". Add `:` to `ALPHABET` in `extract_text.py` if you want the
  structure back.
- **No explorables.** Roughly ten per page, each a separate iframe
  (`../explorables/*.html`); only the caption below each widget is here.
- **No code, no videos, no images.** 19 code blocks in week 5, 10 in
  week 6, none in weeks 1–4 since the network half worked on paper. The
  sentence introducing each block is kept.

## Where this lives in git

`data/` is **not** on `main`: GitHub Pages serves `main` verbatim
(`.nojekyll` disables Jekyll, so there is no exclude list), which would
publish this text at the site URL. It lives on the `corpus` branch
instead, checked out at `../SocialGraphs-corpus`, and `/data/` is ignored
on `main` so it cannot return by accident.
