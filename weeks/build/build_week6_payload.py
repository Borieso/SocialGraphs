"""
Builds weeks/assets/data/week6_payload.json for the week-6 TF-IDF balance game.

Corpus: the prose of the six course week pages, data/week1.txt ... week6.txt
(see data/README.md), one week = one document, so N = 6.

TF-IDF is the course's version (week 6 page, exercise 6.1), not sklearn's:

    tf(t, d)    = count(t, d) / |d|
    idf(t)      = ln(N / df(t))
    tfidf(t, d) = tf(t, d) * idf(t)

Tokens are the ones from data/6.11_go_nuts_tfidf.ipynb: lowercase, runs of
letters, internal hyphens and apostrophes kept.

The game: in one week, a word found only in that week (df = 1) is set
against a word that also appears in df = 2..5 other weeks. The player
guesses how often the shared word would have to occur in that week to tie.
|d| is the same for both words, so it cancels:

    count_y = count_x * ln(N / 1) / ln(N / df_y)

Both words come from the week's own vocabulary at the top: the df = 1 word
from its 12 most frequent df = 1 words, the shared word from its 20 most
frequent df = 2..5 words, so the pair reads like that week. Not every week
has every df level in its top 20; the browser falls back to the nearest one.

The payload also carries each week's top TOP_RANKED words under both the
course formula and Jurafsky & Martin's (ch. 11), for the figure below the
game that sets the two rankings side by side:

    J&M: tfidf(t, d) = (1 + log10 count(t, d)) * log10(N / df(t))

These lists take every token, with no length filter or DULL list, so the
figure shows what each formula really ranks highest. Ties are broken by
count, then alphabetically; "tied" says how many more words share the
score of the last word shown.

And "cosine": for each formula, the 6 x 6 matrix of cosine similarities
between the weeks' full TF-IDF vectors (every token, as above), for the
week-by-week matrix at the end of the page.

The payload ships only counts per week for the candidate words, never the
text, so it can sit on main (data/ itself cannot, see data/README.md). The
browser assembles the rounds.

Run from Site/ (data/ is on the corpus branch):
    python weeks/build/build_week6_payload.py
"""
import json
import math
import os
import re
from collections import Counter

# The same stop list the topic model uses (sklearn's "english"), so the
# "hide filler words" view on the page and the topics further down agree
# about what counts as a filler word.
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(os.path.dirname(HERE))
DATA = os.path.join(SITE, "data")
if not os.path.isdir(DATA):
    # data/ is deliberately not on main -- GitHub Pages serves main verbatim,
    # so the corpus lives on the `corpus` branch instead (see data/README.md).
    # Fall back to that worktree so this script runs from either checkout.
    DATA = os.path.join(os.path.dirname(SITE), "SocialGraphs-corpus", "data")
OUT = os.path.join(SITE, "weeks", "assets", "data", "week6_payload.json")

TOKEN = re.compile(r"[a-z]+(?:[-'][a-z]+)*")

TITLES = {
    1: "Networks",
    2: "Models and null models",
    3: "Who matters and why",
    4: "Communities and seeing networks",
    5: "From language to numbers",
    6: "From counts to meaning",
}

# Words that survive the length filter but carry no topic, so they make
# dull rounds. Only the shared side needs this: a df = 1 word is topical
# almost by construction.
DULL = set("""
about above after again against almost along already also although always
among another anything around because become becomes before being below
between both cannot could does doing done during each either enough every
everything example first following found given going having here however
instead itself just later least less like likely little look looks made make
makes many maybe might more most much must never next nothing often only other
others otherwise over perhaps rather really same seen several should show shows
since some something still such take takes than that their them then there
these they thing things think this those though three through together under
until upon used uses using very want well were what when where whether which
while whole will with within without would your yours start part parts point
second third means mean case cases kind kinds keep need needs back away read
wrong reading
""".split())

TOP_UNIQUE = 12           # per week: the most frequent df = 1 words
TOP_SHARED = 20           # per week: the most frequent df = 2..5 words
MIN_UNIQUE_COUNT = 3      # a df = 1 word must occur at least this often
TOP_RANKED = 15           # per week and formula: words in the figure
TOP_RAW = 10              # per week: most frequent words, no filtering at all


def tokenize(text):
    return TOKEN.findall(text.lower())


def usable(term):
    return len(term) >= 4 and "'" not in term and term not in DULL


def ranked(c, length, df, n_docs, score):
    """The week's top TOP_RANKED words under one formula, plus how many
    further words tie with the last one shown."""
    scored = sorted(
        ((round(score(k, length, df[t], n_docs), 12), t, k) for t, k in c.items()),
        key=lambda x: (-x[0], -x[2], x[1]),
    )
    top = scored[:TOP_RANKED]
    tied = sum(1 for s, _, _ in scored[TOP_RANKED:] if s == top[-1][0])
    words = [{"t": t, "c": k, "df": df[t]} for _, t, k in top]
    return {"words": words, "tied": tied}


def course_score(k, length, df_t, n_docs):
    return k / length * math.log(n_docs / df_t)


def jm_score(k, length, df_t, n_docs):
    return (1 + math.log10(k)) * math.log10(n_docs / df_t)


def cosine_matrix(counts, lengths, df, n_docs, score):
    """Cosine similarity between every pair of weeks' TF-IDF vectors."""
    vecs = {
        w: {t: score(k, lengths[w], df[t], n_docs) for t, k in c.items()}
        for w, c in counts.items()
    }
    norms = {w: math.sqrt(sum(x * x for x in v.values())) for w, v in vecs.items()}
    return [
        [
            round(sum(x * vecs[b].get(t, 0.0) for t, x in vecs[a].items())
                  / (norms[a] * norms[b]), 4)
            for b in vecs
        ]
        for a in vecs
    ]


def main():
    counts = {}
    for w in TITLES:
        with open(os.path.join(DATA, f"week{w}.txt"), encoding="utf-8") as f:
            counts[w] = Counter(tokenize(f.read()))
    n_docs = len(counts)
    lengths = {w: sum(c.values()) for w, c in counts.items()}
    df = Counter(t for c in counts.values() for t in c)

    weeks = []
    for w, c in counts.items():
        unique = [
            {"t": t, "c": k}
            for t, k in c.most_common()
            if df[t] == 1 and k >= MIN_UNIQUE_COUNT and usable(t)
        ][:TOP_UNIQUE]

        top_shared = [
            (t, k) for t, k in c.most_common()
            if 2 <= df[t] < n_docs and usable(t)
        ][:TOP_SHARED]
        shared = {level: [] for level in range(2, n_docs)}
        for t, k in top_shared:
            shared[df[t]].append({
                "t": t,
                "c": k,
                # the weeks the word occurs in, so the page can show where
                "in": [v for v in TITLES if counts[v][t] > 0],
            })

        weeks.append({
            "week": w,
            "title": TITLES[w],
            "length": lengths[w],
            "unique": unique,
            "shared": shared,
            "ranked": {
                "course": ranked(c, lengths[w], df, n_docs, course_score),
                "jm": ranked(c, lengths[w], df, n_docs, jm_score),
            },
        })
        print(f"week {w}: |d| = {lengths[w]:,}, {len(unique)} unique, "
              + ", ".join(f"df{lv}: {len(s)}" for lv, s in shared.items()))

    raw = []
    for w, c in counts.items():
        kept = [(t, k) for t, k in c.most_common() if t not in ENGLISH_STOP_WORDS]
        raw.append({
            "week": w,
            "types": len(c),
            "stop_tokens": sum(k for t, k in c.items() if t in ENGLISH_STOP_WORDS),
            "top": [{"t": t, "c": k} for t, k in c.most_common(TOP_RAW)],
            "top_nostop": [{"t": t, "c": k} for t, k in kept[:TOP_RAW]],
        })

    for field in ("top", "top_nostop"):
        always = set.intersection(*({x["t"] for x in r[field]} for r in raw))
        print(f"raw[{field}]: {len(always)}/{TOP_RAW} shared by every week"
              + (f" ({' '.join(sorted(always))})" if always else ""))
    stop_share = sum(r["stop_tokens"] for r in raw) / sum(lengths.values())
    print(f"raw: filler words are {stop_share:.0%} of all tokens")

    payload = {
        "N": n_docs,
        "raw": raw,
        "vocab": len(df),
        "tokens": sum(lengths.values()),
        "everywhere": sum(1 for n in df.values() if n == n_docs),
        "weeks": weeks,
        "cosine": {
            "course": cosine_matrix(counts, lengths, df, n_docs, course_score),
            "jm": cosine_matrix(counts, lengths, df, n_docs, jm_score),
        },
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))
    print(f"-> {os.path.relpath(OUT, SITE)} ({os.path.getsize(OUT):,} bytes)")


if __name__ == "__main__":
    main()
