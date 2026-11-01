"""Offline V8 component/mapping and retainer evidence. Never run during timings.
Usage: python heap-evidence.py output.json snapshot...
"""
import collections
import json
import re
import sys
from array import array
from pathlib import Path

results = []
for filename in sys.argv[2:]:
    with Path(filename).open(encoding="utf8") as stream:
        heap = json.load(stream)
    meta = heap["snapshot"]["meta"]
    nodes, edges, strings = heap["nodes"], heap["edges"], heap["strings"]
    nf, ef = meta["node_fields"], meta["edge_fields"]
    ns, es = len(nf), len(ef)
    nt, nn, nz, nc = [nf.index(key) for key in ("type", "name", "self_size", "edge_count")]
    et, en, to = [ef.index(key) for key in ("type", "name_or_index", "to_node")]
    ntypes, etypes = meta["node_types"][nt], meta["edge_types"][et]
    offsets, cursor = array("Q"), 0
    for node in range(0, len(nodes), ns):
        offsets.append(cursor)
        cursor += nodes[node + nc] * es

    def kind(node):
        return ntypes[nodes[node + nt]]

    def outgoing(node):
        start = offsets[node // ns]
        return range(start, start + nodes[node + nc] * es, es)

    def properties(node, wanted):
        return {strings[edges[e + en]]: edges[e + to] for e in outgoing(node)
                if etypes[edges[e + et]] == "property" and strings[edges[e + en]] in wanted}

    text_cache = {}

    def string(node, depth=0):
        if node in text_cache:
            return text_cache[node]
        if depth > 16:
            return ""
        typ = kind(node)
        if typ == "string":
            result = strings[nodes[node + nn]]
        elif typ in ("concatenated string", "sliced string"):
            parts = {strings[edges[e + en]]: edges[e + to] for e in outgoing(node)
                     if etypes[edges[e + et]] == "internal"}
            if "first" in parts and "second" in parts:
                result = string(parts["first"], depth + 1) + string(parts["second"], depth + 1)
            elif "actual" in parts:
                result = string(parts["actual"], depth + 1)
            else:
                result = ""
        else:
            result = ""
        text_cache[node] = result
        return result

    components = {"work", "inventory", "deposit", "pile", "transform", "building"}
    wanted = components | {"id", "kind", "byOrdinal"}
    payloads, mappings, holders = [], [], []
    types, largest = collections.Counter(), []
    undecoded = 0
    for node in range(0, len(nodes), ns):
        typ, size = kind(node), nodes[node + nz]
        types[typ] += size
        if size >= 1024 * 1024:
            largest.append({"bytes": size, "nodeOffset": node, "type": typ, "name": strings[nodes[node + nn]]})
        if typ != "object":
            continue
        props = properties(node, wanted)
        if "byOrdinal" in props:
            holders.append({"ownerOffset": node, "arrayOffset": props["byOrdinal"]})
        if "id" not in props or "kind" not in props:
            continue
        tag = string(props["kind"])
        if tag not in {"player", "owner", "processor", "deposit", "pile", "building"}:
            continue
        identity = string(props["id"])
        if not identity:
            undecoded += 1
            continue
        if identity != "player" and not re.fullmatch(r"e\d+r\d+", identity):
            continue
        # Undefined optional components point to Oddballs, not component objects.
        is_payload = any(key in props and kind(props[key]) == "object" for key in components)
        (payloads if is_payload else mappings).append((node, identity))

    by_ordinal = collections.defaultdict(set)
    decoded = {}
    for node, identity in payloads:
        match = re.fullmatch(r"e(\d+)r(\d+)", identity)
        if match:
            ordinal, generation = map(int, match.groups())
            by_ordinal[ordinal].add(generation)
            decoded[node] = (ordinal, generation)
    stale = {node for node, (ordinal, generation) in decoded.items() if generation < max(by_ordinal[ordinal])}
    payload_offsets = {node for node, _ in payloads}
    index_arrays = set()
    for holder in holders:
        source = holder["arrayOffset"]
        sources = {source}
        for e in outgoing(source):
            if etypes[edges[e + et]] == "internal" and strings[edges[e + en]] == "elements":
                sources.add(edges[e + to])
        index_arrays.update(sources)
        members = {edges[e + to] for source in sources for e in outgoing(source) if edges[e + to] in payload_offsets}
        holder["payloadMembers"] = len(members)
        holder["olderGenerationMembers"] = len(members & stale)
    retainers, examples = collections.Counter(), []
    for node in range(0, len(nodes), ns):
        for e in outgoing(node):
            if edges[e + to] not in stale or etypes[edges[e + et]] == "weak":
                continue
            label = "fixture.byOrdinal" if node in index_arrays else strings[nodes[node + nn]]
            retainers[label] += 1
            if len(examples) < 12:
                examples.append({"ownerOffset": node, "owner": label, "targetOffset": edges[e + to], "edgeType": etypes[edges[e + et]]})
    results.append({"file": Path(filename).name, "nodes": len(nodes) // ns,
                    "componentPayloadCopies": len(payloads), "uniquePayloadIds": len({identity for _, identity in payloads}),
                    "idMappings": len(mappings), "undecodedCandidateIds": undecoded,
                    "olderGenerationPayloadCopies": len(stale), "olderGenerationRetainers": dict(retainers),
                    "fixtureIndexes": holders, "retainerExamples": examples,
                    "selfBytesByType": dict(types), "largestNodes": sorted(largest, key=lambda item: item["bytes"], reverse=True)[:12]})
    print(Path(filename).name, "payloads", len(payloads), "mappings", len(mappings), "older", len(stale), flush=True)
    del heap, nodes, edges, strings, offsets
Path(sys.argv[1]).write_text(json.dumps(results, indent=2), encoding="utf8")
