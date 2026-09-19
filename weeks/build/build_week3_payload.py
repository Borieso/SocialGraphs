"""
Builds weeks/assets/data/week3_payload.json for the week-3 speedrun game.

Source data: week1_nodes.tsv / week1_edges.tsv (the 303-node, 1,784-edge
Marvel Wikipedia snapshot, frozen 2026-08-26; see
/Users/jasper/School/DTU/socialgrapfs/context/data.md).

Pipeline: build the directed graph (nodes added before edges so the 17
isolates are counted even though they get discarded below) -> take the
largest strongly connected component (229 nodes) -> emit index-positional
node list + adjacency list. No shortest-path matrix is shipped; the browser
does one BFS per game (sub-millisecond at this size).

The dataset's `description` column is nearly useless as game-card text: all
303 rows are one templated Wikidata sentence ("X is a [fictional] character
appearing in American comic books published by Marvel Comics[, ...]"), and
only 4 of them name a team. So instead of the blurb, each node gets a
TF-IDF-flavoured "connected to" list: its neighbours ranked by
idf(v) = log(N / degree(v)), same idea as downweighting a word that appears
in every document. A hub like Spider-Man sits in most nodes' neighbour
lists and tells you nothing about any one of them; a rare, low-degree
neighbour is what's actually distinctive about a given character.

This list is only 3 of a character's real links (most have far more), and
it is not tied to the move that is actually being made in a given game, so
it will not always explain why a card is the right (or wrong) one. That is
a known, documented limitation, not a bug: see the "Caveats" popup on the
page itself.

Run:
    conda run -n sna python weeks/build/build_week3_payload.py
"""
import json
import math
import os

import networkx as nx
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
WEEK1_DIR = os.path.join(HERE, "..", "..", "..", "week1")
OUT_PATH = os.path.join(HERE, "..", "assets", "data", "week3_payload.json")

EXPECTED_DIST_HISTOGRAM = {
    1: 1636, 2: 8873, 3: 19757, 4: 15244, 5: 5071,
    6: 1254, 7: 312, 8: 60, 9: 4, 10: 1,
}

# --- 1. Load the network ---
nodes = pd.read_csv(os.path.join(WEEK1_DIR, "week1_nodes.tsv"), sep="\t", comment="#")
edges = pd.read_csv(
    os.path.join(WEEK1_DIR, "week1_edges.tsv"), sep="\t", comment="#", header=None,
    names=["source", "target"],
)

G = nx.DiGraph()
G.add_nodes_from(nodes.node_id)
G.add_edges_from(edges.itertuples(index=False, name=None))
assert G.number_of_nodes() == 303
assert G.number_of_edges() == 1784

name_of = dict(zip(nodes.node_id, nodes.name))

# Undirected degree over the FULL 303-node graph (not just the SCC) is the
# "document frequency" stand-in: how many other characters' neighbourhoods a
# given character shows up in.
Gu = G.to_undirected()
degree_of = dict(Gu.degree())
N_TOTAL = G.number_of_nodes()


def join_names(names):
    if len(names) == 1:
        return names[0]
    return ", ".join(names[:-1]) + " and " + names[-1]


def connections_text(node_id):
    """The 3 rarest (highest-idf) neighbours, as a short sentence."""
    neighbors = list(Gu.neighbors(node_id))
    rare = sorted(neighbors, key=lambda v: math.log(N_TOTAL / degree_of[v]), reverse=True)[:3]
    if not rare:
        return ""
    return f"Connected to {join_names([name_of[v] for v in rare])}."


# --- 2. Scope to the largest strongly connected component ---
scc = max(nx.strongly_connected_components(G), key=len)
S = G.subgraph(scc).copy()
assert S.number_of_nodes() == 229

# --- 3. Verify the distance-distribution headline numbers ---
# (Catches a silently-changed upstream snapshot, same reasoning as week 1's
# hard-coded component-size assert.)
dist_hist = {}
total_pairs = 0
for _src, lengths in nx.all_pairs_shortest_path_length(S):
    for target_node, d in lengths.items():
        if d == 0:
            continue
        dist_hist[d] = dist_hist.get(d, 0) + 1
        total_pairs += 1

assert total_pairs == 52212, f"expected 52212 ordered pairs, got {total_pairs}"
assert dist_hist == EXPECTED_DIST_HISTOGRAM, f"distance histogram drifted: {dist_hist}"

diameter = max(dist_hist.keys())
mean_d = sum(k * v for k, v in dist_hist.items()) / total_pairs

# --- 4. Pick a handful of recognisable opening pairs ---
# A fresh player's first rounds should not be two characters neither of them
# has heard of. There is no popularity field in the data (and the dataset is
# scoped to Category:Marvel Comics superheroes, which does not even include
# the main Iron Man / Captain America / Thor pages), so degree in the full
# graph stands in for fame: a character many other pages link to is one a
# casual Marvel fan is more likely to recognise. Pick pairs among the most
# famous characters whose distance lands near 3 (never a 1-hop giveaway,
# never a slog), preferring higher combined fame, and never reusing a
# character across the picks so the 5 rounds feel varied. All of this is
# computed, not hand-typed, so it stays correct if the snapshot changes.
FAME_POOL = 20
STARTER_PAIR_COUNT = 5
PAR_RANGE = (2, 4)

fame_rank = sorted(S.nodes(), key=lambda n: degree_of[n], reverse=True)[:FAME_POOL]
candidate_pairs = []
for a in fame_rank:
    lengths = nx.single_source_shortest_path_length(S, a)
    for b in fame_rank:
        if a == b:
            continue
        d = lengths.get(b)
        if d is not None and PAR_RANGE[0] <= d <= PAR_RANGE[1]:
            candidate_pairs.append((d, degree_of[a] + degree_of[b], a, b))
# Closest to par 3 first, then highest combined fame; node ids break ties so
# the ordering (and therefore the final picks) is fully deterministic.
candidate_pairs.sort(key=lambda t: (abs(t[0] - 3), -t[1], t[2], t[3]))

starter_pairs = []
used = set()
for _d, _fame, a, b in candidate_pairs:
    if a in used or b in used:
        continue
    starter_pairs.append((a, b))
    used.add(a)
    used.add(b)
    if len(starter_pairs) == STARTER_PAIR_COUNT:
        break

assert len(starter_pairs) == STARTER_PAIR_COUNT, (
    f"only found {len(starter_pairs)} starter pairs; widen FAME_POOL or PAR_RANGE"
)

# --- 5. Export: index-positional node list + adjacency list ---
node_ids = sorted(S.nodes())  # stable order across regenerations
index_of = {node_id: i for i, node_id in enumerate(node_ids)}

out_nodes = []
for node_id in node_ids:
    out_nodes.append({
        "id": node_id,
        "name": name_of[node_id],
        "blurb": connections_text(node_id),
    })

out_adj = []
for node_id in node_ids:
    out_adj.append([index_of[v] for v in S.successors(node_id)])

out_starter_pairs = [[index_of[a], index_of[b]] for a, b in starter_pairs]

data = {
    "nodes": out_nodes,
    "adj": out_adj,
    "starterPairs": out_starter_pairs,
    "stats": {
        "scc": S.number_of_nodes(),
        "edges": S.number_of_edges(),
        "mean_d": round(mean_d, 4),
        "diameter": diameter,
        "dist": {str(k): v for k, v in sorted(dist_hist.items())},
    },
}

data_json = json.dumps(data, separators=(",", ":"))

os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
with open(OUT_PATH, "w", encoding="utf-8") as f:
    f.write(data_json)

print(f"wrote {OUT_PATH}")
print(f"nodes={len(out_nodes)} edges={S.number_of_edges()} mean_d={mean_d:.3f} diameter={diameter}")
print(f"payload size: {len(data_json):,} bytes")
print("starter pairs:")
for a, b in starter_pairs:
    print(f"  {name_of[a]} -> {name_of[b]}")
