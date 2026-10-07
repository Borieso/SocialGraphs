# data/ — a prose corpus of the course week pages

Six plain-text files, `week1.txt` … `week6.txt`, holding the prose of the
six published week pages of the course site
(https://sunelehmann.com/socialgraphs2026-web/). Built to be tokenized:
every line is a piece of language that stands on its own.

This README is the methods record. Weeks 5 and 6 of the course both
insist that preprocessing *is* part of the model and has to be stated and
defended, so every choice below is written down with what it cost.

- **Source HTML**: `../../context/raw/weeks/week{1..6}.html`, fetched by
  `../../context/refresh.sh` on **2026-10-07**.
- **Build**: `conda run -n sna python extract_text.py` (env `sna`,
  needs `beautifulsoup4`). Deterministic — same HTML in, same text out.
- **Format**: one unit of text per line. A unit is one paragraph, list
  item, heading, glossary entry, blockquote or figure caption.

## The corpus in numbers

| week | prose units found | `<main>` chars | selected | coverage | sentences | dropped (math) | units out | words out |
|---|---|---|---|---|---|---|---|---|
| 1 | 193 | 47,761 | 47,569 | 100% | 566 | 57 | 186 | 7,119 |
| 2 | 294 | 73,167 | 72,874 | 100% | 798 | 173 | 272 | 8,592 |
| 3 | 262 | 63,151 | 62,572 | 99% | 677 | 129 | 245 | 7,604 |
| 4 | 303 | 79,337 | 78,696 | 99% | 798 | 166 | 277 | 9,567 |
| 5 | 308 | 68,568 | 65,445 | 95% | 789 | 13 | 302 | 10,888 |
| 6 | 322 | 65,605 | 60,185 | 92% | 686 | 44 | 306 | 9,496 |
| **all** | | | | | **4,314** | **582 (13.5%)** | **1,588** | **53,266** |

"Coverage" is the share of the text inside `<main>` that the prose
selection reaches. The 5–8% it misses in weeks 5 and 6 is Python code,
which is not wanted here.

## The pipeline, stage by stage

### 1. Scope to `<main>`

`BeautifulSoup(html, "html.parser").find("main")`.

The pages put `nav.site-nav`, `nav.page-toc`, `main.wrap`, `footer` and
three `<script>` tags as siblings in `<body>`, so taking `<main>` alone
discards the site nav, the per-page table of contents, the footer and
every script in one move, with no filtering rules. Verified before
relying on it: inside `<main>` there are 0 chars of `<script>`/`<style>`
text and 0 `<img>`, `<svg>` or `<figure>` elements.

### 2. Select prose elements — selection, not exclusion

```python
PROSE = ("h1","h2","h3","h4","h5","h6",
         "p","li","dt","dd","blockquote","figcaption")
NOT_PROSE = ("pre", "table")

for element in main_el.find_all(PROSE):
    if element.find_parent(PROSE) or element.find_parent(NOT_PROSE):
        continue
```

The script names what it *wants* rather than what it rejects. Code
samples, data tables, iframes and scripts therefore need no rules of
their own — they are simply never selected. Two guards: skip an element
that has a prose ancestor, so a `<p>` inside an `<li>` is not emitted
twice; and skip one inside `<pre>`/`<table>`, since a prose tag can
appear inside a code sample or a data table.

What this silently leaves out, per page:

| week | `<pre>` code blocks | `<table>` | `<iframe>` |
|---|---|---|---|
| 1 | 0 | 0 | 6 |
| 2 | 0 | 0 | 13 |
| 3 | 0 | 2 | 7 |
| 4 | 0 | 2 | 8 |
| 5 | 19 | 1 | 10 |
| 6 | 10 | 0 | 12 |

Weeks 1–4 contain no code at all, which matches week 5's own
announcement that the network half worked on paper and the language half
moves to notebooks.

Text is read with `element.get_text()` and **no separator argument**.
Inline elements are contiguous with their text in the source, so a
separator invents spaces that were never there: `<code>out</code>-degree`
came out as `out -degree` under `get_text(" ")`. Four such cases existed.

### 3. Fold typography to ASCII — before any filtering

```python
QUOTES = (("\xa0", " "), ("‘", "'"), ("’", "'"), ("“", '"'), ("”", '"'))
text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
```

Order is critical: this runs *before* the alphabet filter, or information
is destroyed rather than normalized.

- Curly apostrophes become straight ones. Otherwise the filter would
  delete them and leave `don t`. (This also makes contractions tokenize
  identically everywhere, which matters because spaCy splits `don't`
  into `do` + `n't`.)
- `NFKD` decomposes an accented letter into base + combining mark, and
  `encode("ascii", "ignore")` then drops only the mark — so the letter
  survives: `Barabási` → `Barabasi`, `Boguñá` → `Boguna`, `Erdős` →
  `Erdos`. There are 72 accented-letter occurrences, all in author
  names; filtering them out directly would have mangled every one.

### 4. Split into sentences, with an abbreviation guard

```python
ABBREVIATIONS = ("Ch","Fig","Eq","Sec","pp","vol","al","cf",
                 "vs", r"e\.g", r"i\.e", "Dr","Mr","Mrs","Prof")
SENTENCE = re.compile(r"(?<=[.!?])\s+")
```

Each abbreviation's full stop is swapped for a `\x00` sentinel before the
split and restored afterwards, which sidesteps Python's fixed-width
lookbehind limitation. A single capital initial is also protected, for
names like `J. R. Firth`.

Measured: a naive splitter mis-fires after an abbreviation **92 times
across 4,386 sentences (2.1%)**. Each mis-split matters because the next
stage decides what to keep *per sentence* — a bad boundary either
discards good text or keeps a math-bearing fragment.

### 5. Drop any sentence containing `$` — drop, don't repair

This is the central decision. These pages carry **no math wrapper
elements at all** — KaTeX scans raw text for `$` delimiters when the page
loads — so inline math sits bare in the middle of sentences and no choice
of elements can avoid it. There are 2,008 `$` characters in the prose.

Earlier versions stripped the math and patched the hole. That produced
text that was clean but meaningless:

| was | became |
|---|---|
| `Zachary's real split scores $Q = 0.358$.` | `Zachary's real split scores.` |
| `…nodes $i$ and $j$ under that null is $k_ik_j/2m$.` | `…nodes and under that null is .` |
| `…all distances, $d$, the diameter…` | `…all distances,, the diameter…` |

So a sentence containing math is now discarded whole. The wreckage is
never created, so it never needs repairing — which deleted both math
regexes, a hyphen rule and an empty-bracket rule from the script.

**Why sentences and not paragraphs.** Both were measured:

| granularity | corpus kept | weeks 2–4 kept |
|---|---|---|
| drop the whole paragraph | 43,512 words (66%) | 46–50% |
| **drop only the sentence** | **53,266 words (81%)** | **69–72%** |

A long explanatory paragraph often carries a single `$Q$`; discarding the
paragraph throws away hundreds of good words for one symbol. Sentence
granularity costs 15 percentage points less for the same cleanliness.

### 6. Apply the alphabet

```python
ALPHABET = re.compile(r"[^A-Za-z0-9 .,!?'-]+")   # -> single space
```

Surviving characters are letters, digits, space, and `. , ! ? ' -`.

- Sentence enders stay so the corpus can still be split into sentences —
  week 6's Word2Vec example needs sentence units.
- The apostrophe and hyphen stay because they live *inside* words:
  `don't`, `Spider-Man`, `TF-IDF`, `in-degree`, `k-clique`.
- Everything else becomes a space. This single rule subsumes what used
  to be an emoji regex plus handling for `—`, `–`, `·`, `→`, and every
  leftover `\`, `_`, `{`, `}`, `^`, `=`.

The characters it removes, by frequency in the prose:

| count | char | what it was |
|---|---|---|
| 2,008 | `$` | math delimiters |
| 642 | `\` | LaTeX commands |
| 307 | `_` | subscripts |
| 299 / 168 | `—` `–` | em/en dashes |
| 297 / 297 | `{` `}` | LaTeX groups |
| 251 | `=` | equations |
| 129 | emoji | exercise-mode markers |
| 110 | `/` | fractions, URLs |
| 104 | `·` | header separators |
| 66 / 55 | `+` `^` | operators, superscripts |
| 45 / 33 | `[` `]` `&` | brackets, citations |

### 7. Close the gaps — order is load-bearing

```python
text = ALPHABET.sub(" ", text)
text = STRAY_APOSTROPHE.sub("", text)      # (?<![A-Za-z])'|'(?![A-Za-z])
text = SPACE_BEFORE_PUNCT.sub(r"\1", text) # " ([.,!?])"
text = PUNCT_RUN.sub(r"\1", text)          # ([.,!?'-])[.,!?'-]+
text = LEADING_PUNCT.sub("", text)
text = re.sub(r"\s+", " ", text).strip()
```

**Closing a gap creates new runs, so runs must collapse afterwards.**
This ordering was got wrong twice during development, each time leaving
artifacts that a narrow verification missed:

1. Collapsing empty brackets *after* the space-before-punctuation fix
   reintroduced ` .` — 3 cases.
2. Collapsing punctuation runs *before* that fix left `,,` and `,.` —
   0–3 per file.

With the order above, all six files contain zero punctuation runs.

### 8. Reject hollowed-out units

```python
MIN_LETTER_RATIO = 0.5
```

A unit is emitted only if it contains a letter and letters are at least
half its non-space characters. This is the safety net for anything the
earlier stages emptied — a glossary term that was purely a symbol, a
caption that was mostly numbers.

### 9. Write one unit per line

Chosen over blank-line-separated blocks so downstream code can iterate
with `for line in open(path)` and treat each line as an independent
document or sentence group.

## Verification

Run after every rebuild. Every count must be **0**:

```bash
for f in week*.txt; do
  printf "%s %s %s %s %s %s\n" $f \
    $(grep -cE '[.,!?]{2,}' $f)            `# punctuation runs` \
    $(grep -cE '[.,;:!?] [.,;:!?]' $f)     `# punctuation across a space` \
    $(grep -c '  ' $f)                     `# double spaces` \
    $(grep -cE "[^A-Za-z0-9 .,!?'-]" $f)   `# outside the alphabet` \
    $(grep -c '\$' $f)                     `# surviving math`
done
```

Then confirm nothing good was destroyed:

```bash
grep -ohE "Spider-Man|TF-IDF|k-clique|in-degree|out-degree|don't|X-Men" week*.txt | sort | uniq -c
grep -ohE "Barabasi|Boguna|Erdos" week*.txt | sort | uniq -c
```

Current results: all artifact counts 0. Preserved — `TF-IDF` 36,
`Spider-Man` 28, `out-degree` 15, `X-Men` 14, `in-degree` 14, `don't` 13,
`k-clique` 4. Accents transliterated — `Barabasi` 21, `Erdos` 6,
`Boguna` 2, with no mangled remnants.

Finally, read a sample by eye and check every line is a sentence that
stands alone — the automated checks cannot see meaning:

```bash
awk 'length>60' week4.txt | sort -R | head -12
```

## What this corpus cannot support

- **It omits the pages' quantitative claims.** Any sentence that stated
  a value inside math is gone, so `0.358` is absent, and `1,784` went
  with it because it shared a sentence with `$n = 303$`. 979 numeric
  tokens remain — the ones written in plain prose, like the 17
  occurrences of `303`. **These files record the pages' language, not
  what they assert.** Do not use them to cite a figure.
- **13.5% of sentences are missing**, unevenly: 22% of week 2 and 20% of
  week 4, against 2% of week 5. Any cross-week comparison of corpus
  size, vocabulary growth or topic coverage is confounded by this, and
  the confound correlates with how mathematical a week was.
- **Labels merge into their sentences.** The colon is not in the
  alphabet, so `Anecdote 1: The network…` reads as
  `Anecdote 1 The network…`. Add `:` to `ALPHABET` to restore it.
- **Case is preserved.** Lowercasing is deliberately *not* done here —
  week 5 makes the point that it is a modeling choice, so it belongs in
  the analysis, not baked into the corpus.
- **No explorables.** Roughly ten per page, each a separate iframe
  (`../explorables/*.html`); only the caption below each widget is here,
  never the numbers or text inside the widget.
- **No code, no video transcripts, no images.**

## Reproducibility

The source HTML is a snapshot: the course site is live and the pages do
change (weeks 3 and 4 both changed between the 2026-09-23 and 2026-10-07
fetches). `refresh.sh` **overwrites `context/raw/` in place**, and
`context/` is not under version control, so there is no previous copy to
diff against afterwards. Copy `context/raw/weeks/` aside before
refreshing if you need to know what changed.

## Git layout

`data/` is **not** on `main`. GitHub Pages serves `main` verbatim —
`.nojekyll` disables Jekyll, so no exclude list exists — and anything on
that branch is reachable at the site URL. The corpus lives on the
**`corpus`** branch instead, which Pages does not serve, checked out as a
worktree at `../SocialGraphs-corpus`. `/data/` is ignored on `main` so it
cannot return by accident.
