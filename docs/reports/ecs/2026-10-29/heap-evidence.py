"""Inspect V8 retained objects; no instrumentation or live workloads are run."""
import collections
import json
import sys
from pathlib import Path

results = []
for filename in sys.argv[1:]:
    path = Path(filename)
    with path.open(encoding="utf8") as stream:
        heap = json.load(stream)
    meta = heap["snapshot"]["meta"]
    nf, ef = meta["node_fields"], meta["edge_fields"]
    ns, es = len(nf), len(ef)
    nodes, edges, strings = heap["nodes"], heap["edges"], heap["strings"]
    ni = {key: nf.index(key) for key in ["name", "type", "self_size", "edge_count"]}
    ei = {key: ef.index(key) for key in ["type", "name_or_index", "to_node"]}
    edge_types = meta["edge_types"][ei["type"]]
    node_types = meta["node_types"][ni["type"]]
    cursor = 0
    offsets = {}
    sparse_edges = []
    payloads = 0
    payload_candidates = []
    wanted_properties = {"id", "kind", "position", "slots", "input", "output", "recipe"}
    largest = []
    type_totals = collections.Counter()
    for n in range(0, len(nodes), ns):
        offsets[n] = cursor
        kind = node_types[nodes[n + ni["type"]]]
        size = nodes[n + ni["self_size"]]
        type_totals[kind] += size
        if size > 1024 * 1024:
            largest.append((size, n, strings[nodes[n + ni["name"]]]))
        properties = set()
        id_target = None
        for edge in range(cursor, cursor + nodes[n + ni["edge_count"]] * es, es):
            if edge_types[edges[edge + ei["type"]]] != "property":
                continue
            name = strings[edges[edge + ei["name_or_index"]]]
            if name in wanted_properties:
                properties.add(name)
            if name == "id":
                id_target = edges[edge + ei["to_node"]]
            if name == "_sparse":
                sparse_edges.append((n, edges[edge + ei["to_node"]]))
        if kind == "object" and properties == wanted_properties:
            payload_candidates.append(id_target)
        cursor += nodes[n + ni["edge_count"]] * es
    def has_entity_prefix(n, depth=0):
        if n is None or depth > 12:
            return False
        kind = node_types[nodes[n + ni["type"]]]
        if kind == "string":
            return strings[nodes[n + ni["name"]]].startswith("entity-")
        if kind != "concatenated string":
            return False
        at = offsets[n]
        for edge in range(at, at + nodes[n + ni["edge_count"]] * es, es):
            if edge_types[edges[edge + ei["type"]]] == "internal" and strings[edges[edge + ei["name_or_index"]]] == "first":
                return has_entity_prefix(edges[edge + ei["to_node"]], depth + 1)
        return False
    payloads = sum(has_entity_prefix(n) for n in payload_candidates)
    sparse = []
    wanted = {target for _, target in sparse_edges}
    for source, array in sparse_edges:
        backing = []
        at = offsets[array]
        for edge in range(at, at + nodes[array + ni["edge_count"]] * es, es):
            kind = edge_types[edges[edge + ei["type"]]]
            name = edges[edge + ei["name_or_index"]]
            if kind == "internal" and strings[name] == "elements":
                target = edges[edge + ei["to_node"]]
                backing.append({"name": strings[nodes[target + ni["name"]]], "bytes": nodes[target + ni["self_size"]], "nodeOffset": target})
        sparse.append({"owner": strings[nodes[source + ni["name"]]], "ownerOffset": source, "arrayOffset": array, "backing": backing})
    sparse_owners = {source for source, _ in sparse_edges}
    incoming = []
    cursor = 0
    for n in range(0, len(nodes), ns):
        for edge in range(cursor, cursor + nodes[n + ni["edge_count"]] * es, es):
            target = edges[edge + ei["to_node"]]
            if target not in sparse_owners:
                continue
            kind = edge_types[edges[edge + ei["type"]]]
            name = edges[edge + ei["name_or_index"]]
            if kind in {"property", "internal"}:
                incoming.append({"owner": strings[nodes[n + ni["name"]]], "property": strings[name], "targetOffset": target})
        cursor += nodes[n + ni["edge_count"]] * es
    results.append({"file": str(path), "nodes": len(nodes) // ns, "retainedSyntheticPayloads": payloads, "selfBytesByType": dict(type_totals), "largestNodes": sorted(largest, reverse=True)[:12], "sparseSets": sparse, "sparseSetIncoming": incoming})
    del heap, nodes, edges, strings, offsets
Path("tmp/ecs-bench/heap-evidence.json").write_text(json.dumps(results, indent=2), encoding="utf8")
print(json.dumps([{k: value[k] for k in ["file", "retainedSyntheticPayloads", "sparseSets", "sparseSetIncoming"]} for value in results]))
