"""Offline consistency checks for a proposed asset attachment target.

The caller supplies a pinned source inventory and a separately reviewed mapping.
This module does not discover identity, derive a slug, authenticate the evidence,
recompute the record owner's digests, construct a patch, or authorize a write.
The existing strict record preview and shared-person guards remain mandatory.
"""

from __future__ import annotations

import math
import re


MAX_RECORDS = 2000
MAX_FOUNDERS = 30
MAX_ENTITIES = 20000
MAX_EDGES = 100000
MAX_RECORD_JSON_DEPTH = 32
MAX_RECORD_JSON_NODES = 20000
MAX_RECORD_JSON_TEXT = 1000000
HEX40 = re.compile(r"[a-f0-9]{40}\Z")
HEX64 = re.compile(r"[a-f0-9]{64}\Z")
STARTUP_ID = re.compile(r"startup:[a-z0-9]+(?:-[a-z0-9]+)*\Z")
PERSON_ID = re.compile(r"person:[a-z0-9]+(?:-{1,2}[a-z0-9]+)*\Z")
SOURCE_POINTER = re.compile(r"/startups/(0|[1-9][0-9]*)\Z")
FOUNDER_POINTER = re.compile(r"/founders/(0|[1-9][0-9]*)\Z")


class TargetError(ValueError):
    def __init__(self, code, path, message):
        super().__init__(message)
        self.code, self.path, self.message = code, path, message

    def as_dict(self):
        return {"code": self.code, "path": self.path, "message": self.message}


def _fail(code, path, message):
    raise TargetError(code, path, message)


def _object(value, fields, path, *, exact=True):
    if type(value) is not dict:
        _fail("INVALID_TARGET_EVIDENCE", path, "Expected an object.")
    if not set(fields).issubset(value) or (exact and set(value) != set(fields)):
        _fail("INVALID_TARGET_EVIDENCE", path, "Required fields are missing or unsupported fields are present.")


def _text(value, path, maximum=500):
    if type(value) is not str or not value or value != value.strip() or len(value) > maximum:
        _fail("INVALID_TARGET_EVIDENCE", path, "Expected bounded exact nonempty text.")
    if any(ord(c) < 32 or ord(c) == 127 or 0xD800 <= ord(c) <= 0xDFFF for c in value):
        _fail("INVALID_TARGET_EVIDENCE", path, "Control and surrogate characters are not accepted.")


def _token(value, pattern, path):
    if type(value) is not str or len(value) > 240 or not pattern.fullmatch(value):
        _fail("INVALID_REVISION", path, "Expected the exact token for this revision or identifier type.")


def _list(value, maximum, path):
    if type(value) is not list or len(value) > maximum:
        _fail("INVALID_TARGET_EVIDENCE", path, "Expected a bounded list.")


def _founder_person(value, path):
    _token(value, PERSON_ID, path)
    if "--" in value:
        _fail("UNSUPPORTED_PERSON_BINDING", path,
              "Firm-scoped team IDs are distinct from current startup founder IDs. Preserve the asset subject and defer to the record owner's separate identity migration; a supplied mapping cannot authorize that conversion.")


def _validate_record_json(value, path):
    """Bound captured JSON without imposing or hashing the record schema."""
    budget = {"nodes": 0, "text": 0}
    ancestors = set()

    def visit(item, location, depth):
        budget["nodes"] += 1
        if depth > MAX_RECORD_JSON_DEPTH or budget["nodes"] > MAX_RECORD_JSON_NODES:
            _fail("INVALID_TARGET_EVIDENCE", location, "Captured record JSON exceeds its depth or node bound.")
        kind = type(item)
        if kind is str:
            budget["text"] += len(item)
            if budget["text"] > MAX_RECORD_JSON_TEXT or any(0xD800 <= ord(c) <= 0xDFFF for c in item):
                _fail("INVALID_TARGET_EVIDENCE", location, "Captured record text exceeds its bound or contains a surrogate.")
            return
        if item is None or kind is bool:
            return
        if kind is int:
            if item.bit_length() > 1024:
                _fail("INVALID_TARGET_EVIDENCE", location, "Captured JSON integer exceeds the numeric evidence bound.")
            return
        if kind is float:
            if not math.isfinite(item):
                _fail("INVALID_TARGET_EVIDENCE", location, "Non-finite numbers are not JSON evidence.")
            return
        if kind not in (dict, list):
            _fail("INVALID_TARGET_EVIDENCE", location, "Captured records may contain only JSON value types.")
        if id(item) in ancestors:
            _fail("INVALID_TARGET_EVIDENCE", location, "Cyclic objects are not JSON evidence.")
        if len(item) > MAX_RECORD_JSON_NODES:
            _fail("INVALID_TARGET_EVIDENCE", location, "Captured JSON container exceeds the node bound.")
        ancestors.add(id(item))
        try:
            if kind is dict:
                for key, child in item.items():
                    if type(key) is not str or len(key) > 512:
                        _fail("INVALID_TARGET_EVIDENCE", location, "JSON object keys must be bounded strings.")
                    visit(key, location, depth + 1)
                    escaped = key.replace("~", "~0").replace("/", "~1")
                    visit(child, location + "/" + escaped, depth + 1)
            else:
                for index, child in enumerate(item):
                    visit(child, location + f"/{index}", depth + 1)
        finally:
            ancestors.remove(id(item))

    visit(value, path, 0)


def _same_record_json(left, right, left_path, right_path):
    # This compares JSON types and values, not record digests. JSON has one
    # numeric type, so 1 and 1.0 compare alike; booleans never compare as numbers.
    _validate_record_json(left, left_path)
    _validate_record_json(right, right_path)

    def equal(a, b):
        if type(a) in (int, float) and type(b) in (int, float):
            return a == b
        if type(a) is not type(b):
            return False
        if type(a) is dict:
            return a.keys() == b.keys() and all(equal(a[key], b[key]) for key in a)
        if type(a) is list:
            return len(a) == len(b) and all(equal(x, y) for x, y in zip(a, b))
        return a == b

    return equal(left, right)


def _index(pointer, pattern, length, path):
    match = pattern.fullmatch(pointer) if type(pointer) is str and len(pointer) <= 64 else None
    if match is None:
        _fail("INVALID_TARGET", path, "Supply an exact supported source pointer, without aliases or traversal.")
    number = int(match.group(1))
    if number >= length:
        _fail("TARGET_NOT_FOUND", path, "The pointer does not select an existing source item.")
    return number


def validate_target(plan, authority):
    """Return a non-authorizing candidate from supplied offline evidence.

    ``authority`` is a fixture/capture format, not a newly accepted MCP schema.
    Its complete source-to-read inventory prevents a graph projection being used
    as an editable record. Record revision tokens are compared opaquely: only the
    record implementation may compute or authenticate those values. No result
    from this checker substitutes for a fresh strict record preview.
    """
    _object(plan, ("edited_record_id", "expected_record_revision", "expected_snapshot_revision",
                   "asset_repository_commit", "subject_id", "role", "target"), "/plan")
    _object(authority, ("mode", "snapshot_revision", "repository_commit", "research",
                        "record_reads", "graph", "graph_read_revision", "graph_origin", "mapping"), "/authority")
    if authority["mode"] not in ("hosted", "local"):
        _fail("INVALID_TARGET_EVIDENCE", "/authority/mode", "Use hosted or local source evidence explicitly.")
    hosted = authority["mode"] == "hosted"
    snapshot_pattern = HEX40 if hosted else HEX64
    _token(authority["snapshot_revision"], snapshot_pattern, "/authority/snapshot_revision")
    _token(plan["expected_snapshot_revision"], snapshot_pattern, "/plan/expected_snapshot_revision")
    _token(authority["repository_commit"], HEX40, "/authority/repository_commit")
    _token(plan["asset_repository_commit"], HEX40, "/plan/asset_repository_commit")
    if hosted and authority["repository_commit"] != authority["snapshot_revision"]:
        _fail("REVISION_MISMATCH", "/authority/repository_commit", "Hosted source reads must be pinned to their exact repository commit.")
    if plan["expected_snapshot_revision"] != authority["snapshot_revision"]:
        _fail("STALE_SNAPSHOT", "/plan/expected_snapshot_revision", "Re-read the source snapshot; do not merely replace its token.")
    _token(plan["expected_record_revision"], HEX64, "/plan/expected_record_revision")
    _token(plan["edited_record_id"], STARTUP_ID, "/plan/edited_record_id")
    if len(plan["edited_record_id"]) > 200:
        _fail("INVALID_TARGET", "/plan/edited_record_id", "The current strict record ID exceeds its bound.")
    if plan["role"] not in ("logo", "portrait"):
        _fail("INVALID_TARGET", "/plan/role", "Only an explicit logo or portrait target is supported.")
    if plan["role"] == "logo":
        _token(plan["subject_id"], STARTUP_ID, "/plan/subject_id")
    else:
        _founder_person(plan["subject_id"], "/plan/subject_id")
    if len(plan["subject_id"]) > 240:
        _fail("INVALID_TARGET", "/plan/subject_id", "The asset subject exceeds its bound.")

    # Every authoritative read is supplied explicitly. Equality with its selected
    # source object is checked, but no ID is derived from that object's name.
    _object(authority["research"], ("startups",), "/authority/research", exact=False)
    startups = authority["research"]["startups"]
    reads = authority["record_reads"]
    _list(startups, MAX_RECORDS, "/authority/research/startups")
    _list(reads, MAX_RECORDS, "/authority/record_reads")
    if len(reads) != len(startups):
        _fail("INCOMPLETE_SOURCE_INVENTORY", "/authority/record_reads", "Supply one authoritative read for every source record before checking person sharing.")
    records, covered = {}, set()
    expected_origin = "repository" if hosted else "local_repository"
    for position, binding in enumerate(reads):
        prefix = f"/authority/record_reads/{position}"
        _object(binding, ("source_pointer", "read"), prefix)
        index = _index(binding["source_pointer"], SOURCE_POINTER, len(startups), prefix + "/source_pointer")
        read = binding["read"]
        _object(read, ("id", "record", "recordRevision", "revision", "origin", "sourceFile", "schemaVersion", "published"), prefix + "/read", exact=False)
        _token(read["id"], STARTUP_ID, prefix + "/read/id")
        if len(read["id"]) > 200:
            _fail("INVALID_TARGET_EVIDENCE", prefix + "/read/id", "The current strict record ID exceeds its bound.")
        _token(read["recordRevision"], HEX64, prefix + "/read/recordRevision")
        if read["id"] in records or index in covered:
            _fail("AMBIGUOUS_TARGET", prefix, "The source inventory has a duplicate ID or source pointer.")
        if read["revision"] != authority["snapshot_revision"] or read["origin"] != expected_origin:
            _fail("REVISION_MISMATCH", prefix + "/read", "All source reads must come from the same declared transport snapshot.")
        if read["sourceFile"] != "data/startup-research.json" or read["schemaVersion"] != "startup-edit-v1" or read["published"] is not False:
            _fail("INVALID_TARGET_EVIDENCE", prefix + "/read", "Supply the current authoritative source-read contract, not a projection or publication claim.")
        if type(read["record"]) is not dict or not _same_record_json(
                read["record"], startups[index], prefix + "/read/record", f"/authority/research/startups/{index}"):
            _fail("SOURCE_MISMATCH", prefix + "/read/record", "The complete authoritative record does not match its source pointer.")
        _text(read["record"].get("name"), prefix + "/read/record/name", 200)
        founders = read["record"].get("founders", [])
        _list(founders, MAX_FOUNDERS, prefix + "/read/record/founders")
        for founder_index, founder in enumerate(founders):
            if type(founder) is not dict:
                _fail("INVALID_TARGET_EVIDENCE", prefix + "/read/record/founders", "Founder source items must be objects.")
            _text(founder.get("name"), prefix + f"/read/record/founders/{founder_index}/name", 200)
        records[read["id"]] = read
        covered.add(index)
    selected = records.get(plan["edited_record_id"])
    if selected is None:
        _fail("TARGET_NOT_FOUND", "/plan/edited_record_id", "A graph-only entity does not provide an editable source record.")
    if selected["recordRevision"] != plan["expected_record_revision"]:
        _fail("STALE_RECORD", "/plan/expected_record_revision", "The whole startup record revision differs; reconcile the record before another preview.")

    # Graph evidence has an independent retrieval pin. Its embedded build revision
    # may be historical; the reviewed map must use these exact supplied contents.
    graph_origin = "repository_snapshot" if hosted else "local_snapshot"
    if authority["graph_origin"] != graph_origin or authority["graph_read_revision"] != authority["snapshot_revision"]:
        _fail("UNPINNED_GRAPH", "/authority/graph_read_revision", "Use graph evidence from the declared source snapshot; published projections cannot silently substitute.")
    _object(authority["graph"], ("entities", "edges"), "/authority/graph", exact=False)
    entities, edges = authority["graph"]["entities"], authority["graph"]["edges"]
    _list(entities, MAX_ENTITIES, "/authority/graph/entities")
    _list(edges, MAX_EDGES, "/authority/graph/edges")
    nodes = {}
    for index, entity in enumerate(entities):
        _object(entity, ("id", "kind", "name"), f"/authority/graph/entities/{index}", exact=False)
        _text(entity["id"], f"/authority/graph/entities/{index}/id", 240)
        _text(entity["name"], f"/authority/graph/entities/{index}/name", 500)
        if entity["id"] in nodes:
            _fail("AMBIGUOUS_TARGET", "/authority/graph/entities", "Duplicate graph identifiers require identity review.")
        nodes[entity["id"]] = entity
    founded = set()
    for index, edge in enumerate(edges):
        _object(edge, ("from", "to", "kind"), f"/authority/graph/edges/{index}", exact=False)
        for key in ("from", "to", "kind"):
            _text(edge[key], f"/authority/graph/edges/{index}/{key}", 240)
        if edge["kind"] == "founded":
            founded.add((edge["from"], edge["to"]))
    node = nodes.get(selected["id"])
    if node is None or node["kind"] != "startup" or node["name"] != selected["record"]["name"]:
        _fail("IDENTITY_CONFLICT", "/authority/graph/entities", "The selected source and graph startup identity must agree exactly.")

    mapping = authority["mapping"]
    _object(mapping, ("schema", "source_snapshot_revision", "graph_read_revision", "review", "founders"), "/authority/mapping")
    if mapping["schema"] != "atlas.asset-target-mapping.v0":
        _fail("INVALID_TARGET_EVIDENCE", "/authority/mapping/schema", "Unsupported mapping contract.")
    if mapping["source_snapshot_revision"] != authority["snapshot_revision"] or mapping["graph_read_revision"] != authority["graph_read_revision"]:
        _fail("UNPINNED_MAPPING", "/authority/mapping", "The reviewed mapping must name these exact source and graph snapshot pins.")
    review = mapping["review"]
    _object(review, ("status", "reviewer", "evidence"), "/authority/mapping/review")
    if review["status"] != "reviewed":
        _fail("UNREVIEWED_MAPPING", "/authority/mapping/review", "A candidate graph association is insufficient; supply the separately reviewed adapter mapping.")
    _text(review["reviewer"], "/authority/mapping/review/reviewer", 200)
    _text(review["evidence"], "/authority/mapping/review/evidence", 4000)
    _list(mapping["founders"], MAX_RECORDS * MAX_FOUNDERS, "/authority/mapping/founders")
    by_pointer = {}
    expected_pointers = {(record_id, f"/founders/{index}")
                         for record_id, read in records.items()
                         for index in range(len(read["record"].get("founders", [])))}
    for index, binding in enumerate(mapping["founders"]):
        prefix = f"/authority/mapping/founders/{index}"
        _object(binding, ("record_id", "founder_pointer", "founder_name", "person_id"), prefix)
        _token(binding["record_id"], STARTUP_ID, prefix + "/record_id")
        if binding["record_id"] not in records:
            _fail("SOURCE_MISMATCH", prefix + "/record_id", "Every mapping entry must identify an authoritative startup read.")
        founders = records[binding["record_id"]]["record"].get("founders", [])
        founder_index = _index(binding["founder_pointer"], FOUNDER_POINTER, len(founders), prefix + "/founder_pointer")
        _founder_person(binding["person_id"], prefix + "/person_id")
        if binding["founder_name"] != founders[founder_index]["name"]:
            _fail("IDENTITY_CONFLICT", prefix + "/founder_name", "Use the exact source founder spelling; no normalized-name selection is performed.")
        key = (binding["record_id"], binding["founder_pointer"])
        if key in by_pointer:
            _fail("AMBIGUOUS_TARGET", prefix, "A founder source pointer has multiple mappings.")
        person = nodes.get(binding["person_id"])
        if person is None or person["kind"] != "person" or person["name"] != binding["founder_name"] or (binding["person_id"], binding["record_id"]) not in founded:
            _fail("IDENTITY_CONFLICT", prefix, "The explicit person mapping must match a person node and founded edge at the pinned graph read.")
        by_pointer[key] = binding
    if set(by_pointer) != expected_pointers:
        _fail("INCOMPLETE_PERSON_MAPPING", "/authority/mapping/founders", "Supply every source founder occurrence so sharing cannot be hidden by omission.")

    target = plan["target"]
    if plan["role"] == "logo":
        _object(target, ("kind",), "/plan/target")
        if target["kind"] != "startup-logo" or plan["subject_id"] != selected["id"]:
            _fail("SUBJECT_MISMATCH", "/plan/target", "A startup logo must bind the edited startup itself.")
        pointer = "/logo"
    else:
        _object(target, ("kind", "founder_pointer", "founder_name"), "/plan/target")
        if target["kind"] != "founder-portrait":
            _fail("ROLE_MISMATCH", "/plan/target/kind", "A portrait must select an existing nested founder.")
        founders = selected["record"].get("founders", [])
        index = _index(target["founder_pointer"], FOUNDER_POINTER, len(founders), "/plan/target/founder_pointer")
        binding = by_pointer[(selected["id"], target["founder_pointer"])]
        if target["founder_name"] != founders[index]["name"] or plan["subject_id"] != binding["person_id"]:
            _fail("SUBJECT_MISMATCH", "/plan/target", "The exact nested source item, reviewed person mapping and asset subject must agree.")
        same_person = [entry for entry in by_pointer.values() if entry["person_id"] == plan["subject_id"]]
        same_name = [entry for entry in by_pointer.values() if entry["founder_name"] == target["founder_name"]]
        if len(same_person) != 1 or len(same_name) != 1 or any(person == plan["subject_id"] and startup != selected["id"] for person, startup in founded):
            _fail("SHARED_PERSON_REQUIRES_MIGRATION", "/plan/target", "This single-startup candidate cannot change a shared or ambiguous person; preserve the record owner's person-scoped review guard.")
        pointer = target["founder_pointer"] + "/photo_url"

    return {
        "schema": "atlas.asset-target-candidate.v0",
        "state": "candidate",
        "edited_record_id": selected["id"],
        "subject_id": plan["subject_id"],
        "role": plan["role"],
        "target_pointer": pointer,
        "expected_record_revision": selected["recordRevision"],
        "expected_snapshot_revision": authority["snapshot_revision"],
        "source_repository_commit": authority["repository_commit"],
        "asset_repository_commit": plan["asset_repository_commit"],
        "evidence": "supplied-offline-snapshot-only",
        "authorization": "none",
        "strict_record_preview_required": True,
        "record_edit_constructed": False,
        "published": False,
    }
