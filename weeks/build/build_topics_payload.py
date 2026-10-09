"""
Builds weeks/assets/data/topics_payload.json — LDA topics over the course's own week pages,
fitted three times at K = 6, 7 and 8.

Source data: data/week1.txt … week6.txt on the `corpus` branch (worktree at
../SocialGraphs-corpus/data, commit da45343). Those files hold the prose
extracted from the six week pages of the course website, one "prose unit"
(a <p>, <li>, heading, <dt>/<dd> or <blockquote>) per line. 1,588 units,
53,266 words. See that directory's README.md for how the text was cleaned —
in particular that every sentence containing math was dropped, unevenly
across weeks (22% of week 2, 2% of week 5).

Pipeline: group consecutive units into ~200-word documents (never crossing a
week boundary, so every document keeps a week label) -> CountVectorizer with
English stop words and min_df=5/max_df=0.5 -> LatentDirichletAllocation at
each of K = 6, 7, 8 -> emit, per K, the same set of views.

Why three K values rather than one. The corpus has six weeks, so K=6 looks
like the obvious choice, and it is the one that fails: weeks 5 and 6 both end
up dominated by the same topic, so five topics cover six weeks. K=7 and K=8
separate all six. Meanwhile perplexity *falls* as K drops and is best at K=4,
which merges two week-pairs — the standard model-selection number rewards
exactly the merging you do not want. The point of shipping all three is that
"ask for six topics, get the six weeks" is false, and you can watch it break.

Topic ids are LDA's own component ordering and are NOT comparable across K:
topic 2 at K=6 is unrelated to topic 2 at K=8. Anything consuming this payload
must key colour and position off `top_week`, never off `id`.

Only short exemplar quotes are emitted (3 per topic, <=200 chars), not the
documents themselves. The corpus is deliberately kept off the published site
(`/data/` is gitignored on `main`); this file must not become a way around that.

Run:
    conda run -n sna python weeks/build/build_topics_payload.py
"""
import json
import os
from collections import Counter
from datetime import date

import numpy as np
from sklearn.decomposition import LatentDirichletAllocation
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.metrics import adjusted_rand_score, normalized_mutual_info_score

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(os.path.dirname(HERE))
OUT_PATH = os.path.join(SITE, "weeks", "assets", "data", "topics_payload.json")

DATA_DIR = os.path.join(SITE, "data")
if not os.path.isdir(DATA_DIR):
    # data/ is deliberately not on main -- GitHub Pages serves main verbatim,
    # so the corpus lives on the `corpus` branch instead (see data/README.md).
    # Fall back to that worktree so this script runs from either checkout.
    DATA_DIR = os.path.join(os.path.dirname(SITE), "SocialGraphs-corpus", "data")

CORPUS_COMMIT = "da45343"
CHUNK_WORDS = 200
RANDOM_STATE = 0
K_VALUES = (6, 7, 8)
SWEEP_K = (4, 5, 6, 7, 8, 10)

VECTORIZER_KWARGS = {"stop_words": "english", "min_df": 5, "max_df": 0.5}

TOP_TERMS = 12
EXEMPLARS = 3
EXEMPLAR_CHARS = 200

# week_topic_mass rows are rounded to MASS_DP before export, so they sum to
# 1 only within rounding error. Anything verifying them needs this tolerance,
# not an exact comparison.
MASS_DP = 4
MASS_TOLERANCE = 1e-3

# Measured on commit da45343. A drifted corpus must fail loudly rather than
# silently reshaping the published numbers.
EXPECTED_UNITS = {"week1": 186, "week2": 272, "week3": 245,
                  "week4": 277, "week5": 302, "week6": 306}
EXPECTED_WORDS_TOTAL = 53_266
EXPECTED_DOCUMENTS = 238
EXPECTED_VOCABULARY = 1_050
EXPECTED_TOKENS = 19_898
EXPECTED_DOCS_PER_WEEK = {"week1": 31, "week2": 39, "week3": 34,
                          "week4": 41, "week5": 49, "week6": 44}


def load_corpus():
    """{week: text} for week1..week6, read from the corpus worktree."""
    weeks = {}
    for n in range(1, 7):
        path = os.path.join(DATA_DIR, f"week{n}.txt")
        with open(path, encoding="utf-8") as f:
            weeks[f"week{n}"] = f.read()
    return weeks


def units_of(text):
    return [line for line in text.splitlines() if line.strip()]


def chunk(week_text, size=CHUNK_WORDS):
    """Group consecutive prose units into documents of >= `size` words.

    Chunks never cross a week boundary, so every document keeps a week label
    and topics can be checked against the syllabus afterwards. A week's final
    chunk is whatever is left over and may be shorter than the budget.
    """
    out = []
    for week in sorted(week_text):
        buf, n = [], 0
        for line in units_of(week_text[week]):
            buf.append(line)
            n += len(line.split())
            if n >= size:
                out.append((week, " ".join(buf)))
                buf, n = [], 0
        if buf:
            out.append((week, " ".join(buf)))
    return out


def build_matrix(docs):
    vectorizer = CountVectorizer(**VECTORIZER_KWARGS)
    X = vectorizer.fit_transform(docs)
    return X, vectorizer.get_feature_names_out(), vectorizer


def fit(X, k):
    lda = LatentDirichletAllocation(n_components=k, random_state=RANDOM_STATE)
    theta = lda.fit_transform(X)
    return lda, theta


def week_topic_mass(theta, chunked, weeks, tokens):
    """6 x K matrix: each week's topic mixture, weighted by document size.

    Rows are normalised to sum to 1, so a week with more text does not simply
    dominate. Weighting by token count stops a 40-word leftover chunk from
    counting as much as a full 200-word one.
    """
    index = {w: i for i, w in enumerate(weeks)}
    mass = np.zeros((len(weeks), theta.shape[1]))
    for i, (week, _) in enumerate(chunked):
        mass[index[week]] += theta[i] * max(tokens[i], 1)
    return mass / mass.sum(axis=1, keepdims=True)


def agreement(theta, chunked, weeks):
    """How well the chunk->topic grouping matches the chunk->week labels.

    `distinct_weeks` says *whether* the mapping breaks; these say how far off
    it is. All three stay well short of 1.0 — the topics track the syllabus
    without reproducing it, which is the finding, not a defect.
    """
    truth = [weeks.index(week) for week, _ in chunked]
    pred = theta.argmax(axis=1).tolist()

    # Purity: share of chunks whose topic's majority week is their own week.
    majority = {}
    for k in set(pred):
        members = [truth[i] for i, p in enumerate(pred) if p == k]
        majority[k] = Counter(members).most_common(1)[0][0]
    hits = sum(majority[p] == t for p, t in zip(pred, truth))

    return {
        "nmi": round(float(normalized_mutual_info_score(truth, pred)), 4),
        "ari": round(float(adjusted_rand_score(truth, pred)), 4),
        "purity": round(hits / len(truth), 4),
    }


def quote(text, limit=EXEMPLAR_CHARS):
    """First <= `limit` characters of `text`, cut at a word boundary.

    A hard character slice ends every quote mid-word, which reads badly on a
    page. Back up to the last space instead; the consumer adds its own
    ellipsis.
    """
    if len(text) <= limit:
        return text.rstrip()
    cut = text[:limit]
    if " " in cut:
        cut = cut[:cut.rindex(" ")]
    return cut.rstrip()


def merged_weeks(dominant, weeks):
    """Groups of weeks that share a dominant topic, i.e. the model fused them."""
    groups = {}
    for i, topic in enumerate(dominant):
        groups.setdefault(int(topic), []).append(weeks[i])
    return [g for g in groups.values() if len(g) > 1]


def summarise(lda, theta, vocab, chunked, tokens, weeks, X):
    """The per-K dict. Identical structure at every K so the page can swap keys."""
    k = theta.shape[1]
    mass = week_topic_mass(theta, chunked, weeks, tokens)
    dominant_week = mass.argmax(axis=1)

    # Share of each topic's mass that sits in each week (column-normalised),
    # which is what "this topic belongs to week N" actually means.
    share = mass / mass.sum(axis=0, keepdims=True)

    assigned = theta.argmax(axis=1)
    topics = []
    for t in range(k):
        order = lda.components_[t].argsort()[::-1][:TOP_TERMS]
        total = lda.components_[t].sum()

        members = np.flatnonzero(assigned == t)
        # Ties at theta = 1.00 are common; break them on token mass so the
        # exemplars are substantial documents rather than whichever chunk
        # happened to come first in the corpus.
        ranked = members[np.lexsort((tokens[members], theta[members, t]))[::-1]]

        topics.append({
            "id": t,
            "n_docs": int(members.size),
            "terms": [{"word": str(vocab[i]),
                       "weight": round(float(lda.components_[t][i] / total), 6)}
                      for i in order],
            "week_share": [round(float(v), MASS_DP) for v in share[:, t]],
            "top_week": weeks[int(share[:, t].argmax())],
            "concentration": round(float(share[:, t].max()), 4),
            "exemplars": [{"week": chunked[i][0],
                           "theta": round(float(theta[i, t]), 4),
                           "text": quote(chunked[i][1])}
                          for i in ranked[:EXEMPLARS]],
        })

    return {
        "k": k,
        "perplexity": round(float(lda.perplexity(X)), 1),
        "mean_confidence": round(float(theta.max(axis=1).mean()), 4),
        "distinct_weeks": len(set(dominant_week.tolist())),
        "merged": merged_weeks(dominant_week, weeks),
        **agreement(theta, chunked, weeks),
        "week_topic_mass": [[round(float(v), MASS_DP) for v in row] for row in mass],
        "week_dominant": [int(v) for v in dominant_week],
        "topics": topics,
    }


def sweep(X, chunked, tokens, weeks, ks=SWEEP_K):
    """One row per K for the model-selection table."""
    rows = []
    for k in ks:
        lda, theta = fit(X, k)
        mass = week_topic_mass(theta, chunked, weeks, tokens)
        dominant = mass.argmax(axis=1)
        rows.append({
            "k": k,
            "perplexity": round(float(lda.perplexity(X)), 1),
            "mean_confidence": round(float(theta.max(axis=1).mean()), 4),
            "distinct_weeks": len(set(dominant.tolist())),
            **agreement(theta, chunked, weeks),
        })
    return rows


def build_payload(verbose=True):
    week_text = load_corpus()
    weeks = sorted(week_text)

    units = {w: len(units_of(week_text[w])) for w in weeks}
    words = {w: len(week_text[w].split()) for w in weeks}
    assert units == EXPECTED_UNITS, f"unit counts drifted: {units}"
    assert sum(words.values()) == EXPECTED_WORDS_TOTAL, \
        f"word count drifted: {sum(words.values())}"

    chunked = chunk(week_text)
    docs = [text for _, text in chunked]
    X, vocab, _ = build_matrix(docs)
    tokens = np.asarray(X.sum(axis=1)).ravel()

    docs_per_week = {w: sum(1 for a, _ in chunked if a == w) for w in weeks}
    assert X.shape[0] == EXPECTED_DOCUMENTS, f"documents drifted: {X.shape[0]}"
    assert X.shape[1] == EXPECTED_VOCABULARY, f"vocabulary drifted: {X.shape[1]}"
    assert int(X.sum()) == EXPECTED_TOKENS, f"tokens drifted: {int(X.sum())}"
    assert docs_per_week == EXPECTED_DOCS_PER_WEEK, \
        f"chunks per week drifted: {docs_per_week}"

    before_df = len(CountVectorizer(stop_words="english").fit(docs)
                    .get_feature_names_out())

    runs = {}
    for k in K_VALUES:
        lda, theta = fit(X, k)
        runs[str(k)] = summarise(lda, theta, vocab, chunked, tokens, weeks, X)
        if verbose:
            r = runs[str(k)]
            print(f"  K={k}  perplexity {r['perplexity']:>6.1f}  "
                  f"nmi {r['nmi']:.3f}  purity {r['purity']:.3f}  "
                  f"{r['distinct_weeks']}/6 weeks distinct"
                  + (f"  merged {r['merged']}" if r["merged"] else ""))

    return {
        "meta": {
            "generated": date.today().isoformat(),
            "source": f"data/week{{1..6}}.txt @ corpus branch {CORPUS_COMMIT}",
            "chunk_words": CHUNK_WORDS,
            "random_state": RANDOM_STATE,
            "vectorizer": dict(VECTORIZER_KWARGS),
            "note": ("Topic ids are LDA's own component ordering and are not "
                     "comparable across K. Key off top_week, not id."),
        },
        "corpus": {
            "weeks": weeks,
            "units": units,
            "units_total": sum(units.values()),
            "words": words,
            "words_total": sum(words.values()),
            "documents": int(X.shape[0]),
            "documents_per_week": docs_per_week,
            "vocabulary": int(X.shape[1]),
            "vocabulary_before_df": before_df,
            "tokens": int(X.sum()),
            "density": round(float(X.nnz / (X.shape[0] * X.shape[1])), 4),
        },
        "k_sweep": sweep(X, chunked, tokens, weeks),
        "runs": runs,
    }


def main():
    print("fitting:")
    payload = build_payload()

    body = json.dumps(payload, separators=(",", ":"))
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write(body)

    quoted = sum(len(e["text"])
                 for run in payload["runs"].values()
                 for t in run["topics"]
                 for e in t["exemplars"])

    print(f"\nwrote {os.path.relpath(OUT_PATH, SITE)}")
    print(f"payload size: {len(body):,} bytes  "
          f"({quoted:,} of it exemplar text)")
    print("\ntopic -> week, per K:")
    for k in K_VALUES:
        run = payload["runs"][str(k)]
        print(f"  K={k}")
        for t in run["topics"]:
            terms = " ".join(x["word"] for x in t["terms"][:6])
            print(f"    t{t['id']}  {t['concentration']:4.0%} in "
                  f"{t['top_week']:7s}  {terms}")


if __name__ == "__main__":
    main()
