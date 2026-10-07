# data/ — plain text of the course week pages

`week1.txt` … `week6.txt`: the prose of the six published week pages of
the course site (https://sunelehmann.com/socialgraphs2026-web/), one file
per week, cleaned for tokenization. Extracted 2026-10-07 by
`extract_text.py` from the HTML that `../../context/refresh.sh` caches in
`context/raw/weeks/`. Re-run with
`conda run -n sna python extract_text.py`.

| file | words (`wc -w`) |
|---|---|
| week1.txt | 8,315 |
| week2.txt | 12,151 |
| week3.txt | 10,423 |
| week4.txt | 13,190 |
| week5.txt | 11,096 |
| week6.txt | 9,916 |

## Preprocessing choices

Kept: everything inside the page's `<main>` — headings, paragraphs,
lists, definition lists, figure captions, exercises, the Essentials and
"On Test N" bands, Goodies.

Removed:

- **Page chrome** — site nav, the table of contents, the footer and the
  "All weeks" back-link. (`<main>` only.)
- **Code samples** (`<pre>`) — 19 blocks in week 5, 10 in week 6; weeks
  1–4 have none, since the network half worked on paper. The sentence
  introducing each block is kept, which is why some lines still end in a
  colon.
- **LaTeX.** The site renders math client-side with KaTeX, so the source
  arrives raw. Display equations (`$$…$$`) are dropped outright. Inline
  math is kept **only when it is already plain symbols and numbers** —
  `$Q = 0.358$` becomes `Q = 0.358`, so quantitative claims survive —
  and dropped when it carries real markup (commands, subscripts,
  superscripts, groups), since `\frac{1}{2m}\sum_{ij}` has no sensible
  word form. A bare Greek command becomes its name (`\alpha` → `alpha`).
- **Numeric tables** (`<table>`) — rows of figures, no useful word
  tokens. 2 tables each in weeks 3 and 4, 1 in week 5, none elsewhere.
- **Emoji** — the 🧠 / 🚀 / 🔬 exercise-mode markers and friends.
- **`<iframe>` embeds** — see below.

Normalized: non-breaking and fixed-width spaces to plain spaces,
zero-width characters deleted, curly quotes and apostrophes to ASCII
(so `don't` tokenizes the same way everywhere), `…` to `...`, whitespace
runs collapsed, blank runs capped at one. Dashes, arrows and middots are
left alone — a tokenizer tags them as punctuation and you can filter
them downstream.

**Known cost of dropping markup math:** a few sentences in the
network weeks lose their point mid-clause, e.g. "Why does modularity
subtract?" was "subtract $k_ik_j/2m$". Weeks 1–4 are math-heavy
(~550 inline spans in week 4), weeks 5–6 barely affected.

## Not in these files at all

- The **interactive explorables** — roughly ten per page, each a separate
  iframe (`../explorables/*.html`). Only the caption below each widget is
  here, never the numbers or text inside it.
- **Embedded YouTube videos** (iframe, no transcript).
- Images: there are none in the page body.

## Before you commit this

These are verbatim copies of someone else's course pages, and this repo
is published as a GitHub Pages site — anything committed here becomes
publicly reachable at the site URL. Consider keeping `data/` out of git
(`echo 'data/' >> ../.gitignore`) and treating it as a local working
corpus, or committing `extract_text.py` alone so the corpus is
reproducible without republishing the text.
