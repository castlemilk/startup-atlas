"""Offline, source-scoped coverage/checkpoint contract; not wired to the crawler.

Only Python's standard library is used. No transport, catalogue write, scheduler,
review authority or publication capability is provided. See the companion contract.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3


VERSION = 1
MAX_SCOPES = 128
MAX_ITEMS = 10_000
MAX_EVENTS = 256
MAX_STATE_BYTES = 16 * 1024 * 1024
FAILURES = frozenset({
    "network_dns", "network_timeout", "http_rate_limited", "http_server_error",
    "access_blocked", "source_unavailable", "parser_error", "identity_unresolved",
})
MANUAL_FAILURES = frozenset({"access_blocked", "parser_error", "identity_unresolved"})
REQUEUE_REASONS = FAILURES | {"refresh_due", "manual_review", "interrupted_outcome_unknown"}


class ContractError(ValueError):
    """Invalid contract, corrupt checkpoint, or illegal transition."""


class ConflictError(ContractError):
    """Stale revision, immutable-scope mismatch, or changed idempotent payload."""


def _require(condition, message):
    if not condition:
        raise ContractError(message)


def _fields(value, names, label):
    _require(isinstance(value, dict) and set(value) == set(names.split()),
             f"{label}: expected exactly {names}")


def _text(value, label, maximum=256):
    _require(isinstance(value, str) and 0 < len(value) <= maximum
             and value == value.strip() and not any(ord(c) < 32 for c in value),
             f"{label}: expected bounded nonempty text")
    return value


def _integer(value, label, maximum=100_000):
    _require(type(value) is int and 0 <= value <= maximum,
             f"{label}: expected integer between 0 and {maximum}")
    return value


def _choice(value, choices, label):
    _require(isinstance(value, str) and value in choices, f"invalid {label}")


def _time(value):
    _require(isinstance(value, str) and bool(re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", value)),
        "timestamp: expected UTC YYYY-MM-DDTHH:MM:SSZ")
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError as exc:
        raise ContractError("timestamp: invalid calendar value") from exc


def _digest(value, length=64):
    _require(isinstance(value, str) and bool(re.fullmatch(rf"[0-9a-f]{{{length}}}", value)),
             f"digest: expected {length} lowercase hexadecimal characters")


def _evidence(value):
    _fields(value, "ref sha256", "evidence")
    _text(value["ref"], "evidence reference", 2048)
    _digest(value["sha256"])


def _json(value):
    try:
        return json.dumps(value, sort_keys=True, separators=(",", ":"),
                          ensure_ascii=False, allow_nan=False)
    except (TypeError, ValueError) as exc:
        raise ContractError("payload must be finite JSON") from exc


def _hash(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _config(value):
    _fields(value, "version run_id catalogue_revision snapshot_kind created_at attempt_budget scopes", "config")
    value = deepcopy(value)
    _require(type(value["version"]) is int and value["version"] == VERSION,
             "unsupported contract version")
    _text(value["run_id"], "run_id")
    _digest(value["catalogue_revision"], 40)
    _choice(value["snapshot_kind"], {"synthetic", "committed", "built", "published"}, "snapshot kind")
    created = _time(value["created_at"])
    _integer(value["attempt_budget"], "attempt budget")
    scopes = value["scopes"]
    _require(isinstance(scopes, list) and 1 <= len(scopes) <= MAX_SCOPES,
             "expected bounded, nonempty scopes")
    seen, work_scopes, members, source_hosts = set(), set(), 0, {}
    for scope in scopes:
        _fields(scope, "id source_id host entity_kind dimension temporal_scope source_revision parser_version eligibility_rule population freshness_seconds", "scope")
        for name in ("id", "source_id", "entity_kind", "dimension", "temporal_scope", "parser_version"):
            _text(scope[name], name)
        _text(scope["eligibility_rule"], "eligibility rule", 2048)
        _text(scope["host"], "host")
        _require(bool(re.fullmatch(r"[a-z0-9]+(?:[.-][a-z0-9]+)*", scope["host"])),
                 "host must be an explicit lowercase hostname, not a URL")
        _require(source_hosts.get(scope["source_id"], scope["host"]) == scope["host"],
                 "one source id cannot evade a host pause through a different host")
        source_hosts[scope["source_id"]] = scope["host"]
        _digest(scope["source_revision"])
        _require(scope["id"] not in seen, "duplicate scope id")
        seen.add(scope["id"])
        work_key = tuple(scope[k] for k in ("source_id", "entity_kind", "dimension", "temporal_scope"))
        _require(work_key not in work_scopes, "duplicate source/entity/dimension/temporal scope")
        work_scopes.add(work_key)
        if scope["freshness_seconds"] is not None:
            _integer(scope["freshness_seconds"], "freshness seconds", 315_360_000)
        population = scope["population"]
        _fields(population, "status eligible_ids as_of evidence reason", "population")
        _choice(population["status"], {"exact", "unknown"}, "population status")
        _require(_time(population["as_of"]) <= created, "population cannot be observed after run creation")
        _evidence(population["evidence"])
        _text(population["reason"], "population basis/limitation", 2048)
        ids = population["eligible_ids"]
        if population["status"] == "unknown":
            _require(ids is None, "unknown population requires null eligible_ids")
        else:
            _require(isinstance(ids, list), "exact population requires enumerated eligible_ids")
            for entity_id in ids:
                _text(entity_id, "eligible entity id")
            _require(len(ids) == len(set(ids)), "duplicate eligible identity")
            population["eligible_ids"] = sorted(ids)
            members += len(ids)
    _require(members <= MAX_ITEMS, "eligible membership limit exceeded")
    value["scopes"] = sorted(scopes, key=lambda s: s["id"])
    return value


def _initial(config):
    return {
        "attempts_used": 0, "last_event_at": config["created_at"],
        "last_committed_at": config["created_at"], "host_pauses": {},
        "scopes": {scope["id"]: {
            "items": {}, "checkpoint": None, "last_successful_full_scan_at": None,
            "last_full_scan_attempts": {},
        } for scope in config["scopes"]},
    }


def _retry(value, at, reason):
    _fields(value, "mode after", "retry")
    _choice(value["mode"], {"none", "automatic", "manual"}, "retry mode")
    if value["mode"] == "automatic":
        _require(_time(value["after"]) >= _time(at), "retry cannot precede the outcome")
    else:
        _require(value["after"] is None, "manual/none retry requires null after")
    return {**value, "reason": reason}


def _attempt(item, attempt_id):
    _text(attempt_id, "attempt_id")
    match = next((a for a in item["attempts"] if a["id"] == attempt_id), None)
    _require(match is not None, "unknown attempt")
    return match


def _pass_ready(config, state):
    population = config["population"]
    if population["status"] != "exact":
        return False
    if set(state["items"]) != set(population["eligible_ids"]):
        return False
    return all(item["attempts"]
               and item["attempts"][-1]["status"] in {"retrieved", "searched_unknown"}
               and item["active_attempt_id"] is None and item["retry"]["mode"] == "none"
               for item in state["items"].values())


def _work_digest(scope):
    # Reviews are independent of collection completion. A new attempt, discovery
    # observation or retry disposition invalidates the earlier completion binding.
    return _hash(_json({entity_id: {k: item[k] for k in (
        "discovery_evidence", "attempts", "active_attempt_id", "retry")}
        for entity_id, item in scope["items"].items()}))


def _apply_event(config, state, event, committed_at):
    _require(isinstance(event, dict), "event must be an object")
    common = "type scope_id at"
    shapes = {
        "discover": common + " entity_id evidence",
        "start": common + " entity_id attempt_id",
        "finish": common + " entity_id attempt_id outcome evidence reason retry",
        "verify": common + " entity_id attempt_id reviewer review effective_at",
        "recover": common + " entity_id attempt_id evidence retry",
        "requeue": common + " entity_id reason retry evidence",
        "checkpoint": common + " cursor status truncated reason evidence",
    }
    kind = event.get("type")
    _require(isinstance(kind, str) and kind in shapes, "unknown event type")
    _fields(event, shapes[kind], "event")
    at = event["at"]
    _require(_time(state["last_event_at"]) <= _time(at) <= _time(committed_at),
             "event time must be monotonic and no later than commit time")
    scope_config = next((s for s in config["scopes"] if s["id"] == event["scope_id"]), None)
    _require(scope_config is not None, "unknown scope")
    scope = state["scopes"][scope_config["id"]]
    if "evidence" in event:
        _evidence(event["evidence"])
    if "retry" in event:
        _retry(event["retry"], at, None)
    if kind == "checkpoint":
        if event["cursor"] is not None:
            _text(event["cursor"], "opaque checkpoint cursor", 2048)
        _require(type(event["truncated"]) is bool, "truncated must be explicit boolean")
        _choice(event["status"], {"partial", "blocked", "complete"}, "checkpoint status")
        if event["status"] == "complete":
            _require(event["cursor"] is None and not event["truncated"]
                     and event["reason"] is None and _pass_ready(scope_config, scope),
                     "complete checkpoint requires exact, fully processed, untruncated population")
            attempts = {entity_id: item["attempts"][-1]["id"]
                        for entity_id, item in scope["items"].items()}
            previous = scope["last_full_scan_attempts"]
            if previous and attempts != previous:
                _require(all(attempt_id != previous[entity_id] for entity_id, attempt_id in attempts.items()),
                         "a new full scan requires a new attempt for every eligible entity")
            if attempts and attempts != previous:
                scope["last_successful_full_scan_at"] = max(
                    item["attempts"][-1]["finished_at"] for item in scope["items"].values())
            scope["last_full_scan_attempts"] = attempts
        else:
            _text(event["reason"], "checkpoint limitation", 2048)
        scope["checkpoint"] = {k: deepcopy(v) for k, v in event.items() if k not in {"type", "scope_id"}}
        scope["checkpoint"]["work_digest"] = _work_digest(scope)
        state["last_event_at"] = at
        return

    entity_id = _text(event["entity_id"], "entity_id")
    if kind == "discover":
        population = scope_config["population"]
        _require(population["status"] == "unknown" or entity_id in population["eligible_ids"],
                 "entity outside pinned eligible population")
        if entity_id not in scope["items"]:
            _require(sum(len(s["items"]) for s in state["scopes"].values()) < MAX_ITEMS,
                     "discovered work item limit exceeded")
            scope["items"][entity_id] = {
                "discovered_at": at, "discovery_evidence": [], "attempts": [],
                "active_attempt_id": None, "last_verification": None,
                "retry": {"mode": "automatic", "after": at, "reason": "not_attempted"},
            }
        item = scope["items"][entity_id]
        if event["evidence"] not in item["discovery_evidence"]:
            item["discovery_evidence"].append(deepcopy(event["evidence"]))
    else:
        _require(entity_id in scope["items"], "discover item before attempting or reviewing it")
        item = scope["items"][entity_id]
        if kind == "start":
            attempt_id = _text(event["attempt_id"], "attempt_id")
            _require(item["active_attempt_id"] is None, "item already has an active attempt")
            _require(item["retry"]["mode"] == "automatic" and item["retry"]["after"] <= at,
                     "item is not due for an automatic attempt; explicit requeue required")
            pause = state["host_pauses"].get(scope_config["host"])
            _require(pause is None or pause["until"] <= at, "source host is paused")
            _require(state["attempts_used"] < config["attempt_budget"], "durable attempt budget exhausted")
            _require(not any(a["id"] == attempt_id for s in state["scopes"].values()
                             for i in s["items"].values() for a in i["attempts"]),
                     "attempt id already used")
            item["attempts"].append({"id": attempt_id, "started_at": at, "status": "in_flight",
                                     "finished_at": None, "reason": None, "evidence": None})
            item["active_attempt_id"] = attempt_id
            state["attempts_used"] += 1
        elif kind in {"finish", "recover"}:
            attempt = _attempt(item, event["attempt_id"])
            _require(attempt["status"] == "in_flight" and item["active_attempt_id"] == attempt["id"],
                     "attempt is no longer active; late results cannot replace recovery")
            if kind == "recover":
                outcome, reason = "interrupted", "interrupted_outcome_unknown"
                _require(event["retry"]["mode"] in {"manual", "automatic"},
                         "interrupted attempt requires explicit retry disposition")
            else:
                outcome, reason = event["outcome"], event["reason"]
                _choice(outcome, {"retrieved", "searched_unknown", "unavailable"}, "outcome")
                if outcome == "retrieved":
                    _require(reason is None and event["retry"]["mode"] == "none",
                             "retrieval success has no failure reason or implicit retry")
                elif outcome == "searched_unknown":
                    _require(reason == "no_supported_value", "searched_unknown requires its search-log reason")
                else:
                    _choice(reason, FAILURES, "unavailable failure reason")
                    _require(event["retry"]["mode"] != "none", "unavailable requires retry or manual disposition")
                    if reason in MANUAL_FAILURES:
                        _require(event["retry"]["mode"] == "manual", "this failure requires manual review")
            retry = _retry(event["retry"], at, reason)
            if reason == "http_rate_limited":
                _require(retry["mode"] == "automatic" and retry["after"] > at,
                         "rate limit requires a future host pause")
                host = scope_config["host"]
                old = state["host_pauses"].get(host)
                if old is None or old["until"] < retry["after"]:
                    state["host_pauses"][host] = {
                        "until": retry["after"], "reason": reason, "at": at,
                        "evidence": deepcopy(event["evidence"]),
                    }
            attempt.update(status=outcome, finished_at=at, reason=reason,
                           evidence=deepcopy(event["evidence"]))
            item["active_attempt_id"] = None
            item["retry"] = retry
        elif kind == "verify":
            attempt = _attempt(item, event["attempt_id"])
            _require(attempt["status"] == "retrieved", "verification requires a retrieved evidence attempt")
            _text(event["reviewer"], "reviewer")
            _evidence(event["review"])
            if event["effective_at"] is not None:
                _require(_time(event["effective_at"]) <= _time(at), "effective time cannot be future")
            item["last_verification"] = {
                "verified_at": at, "attempt_id": attempt["id"],
                "retrieved_at": attempt["finished_at"], "evidence": deepcopy(attempt["evidence"]),
                "review": deepcopy(event["review"]), "reviewer": event["reviewer"],
                "effective_at": event["effective_at"],
            }
        elif kind == "requeue":
            _require(item["active_attempt_id"] is None, "cannot requeue an active attempt; recover explicitly")
            _choice(event["reason"], REQUEUE_REASONS, "requeue reason")
            _require(event["retry"]["mode"] in {"automatic", "manual"}, "requeue requires a retry disposition")
            item["retry"] = _retry(event["retry"], at, event["reason"])
    state["last_event_at"] = at


class Ledger:
    """One immutable run per local SQLite file; event batches use sequence CAS.

    A started attempt records intent, not proof that an HTTP exchange happened.
    Recovery is caller-directed after stopping the prior worker. This is not a
    distributed worker/lease scheduler and performs no external operations.
    """

    def __init__(self, connection, config):
        self._conn = connection
        self._config = config

    @staticmethod
    def _connect(path):
        connection = sqlite3.connect(str(path), timeout=5, isolation_level=None)
        connection.execute("PRAGMA synchronous=FULL")
        connection.execute("PRAGMA foreign_keys=ON")
        return connection

    @classmethod
    def create(cls, path, config):
        config = _config(config)
        path = Path(path)
        try:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError as exc:
            raise ConflictError("ledger already exists; use open with the exact pinned config") from exc
        os.close(fd)
        connection = cls._connect(path)
        try:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute("CREATE TABLE ledger (id INTEGER PRIMARY KEY CHECK(id=1), config TEXT NOT NULL, config_hash TEXT NOT NULL, sequence INTEGER NOT NULL, state TEXT NOT NULL, state_hash TEXT NOT NULL)")
            connection.execute("CREATE TABLE batches (batch_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, sequence INTEGER UNIQUE NOT NULL, committed_at TEXT NOT NULL, payload TEXT NOT NULL)")
            connection.execute(f"PRAGMA user_version={VERSION}")
            config_text, state_text = _json(config), _json(_initial(config))
            connection.execute("INSERT INTO ledger VALUES (1, ?, ?, 0, ?, ?)",
                               (config_text, _hash(config_text), state_text, _hash(state_text)))
            connection.commit()
        except BaseException:
            connection.rollback()
            connection.close()
            raise
        return cls(connection, config)

    @classmethod
    def open(cls, path, expected_config, *, read_only=False):
        expected_config = _config(expected_config)
        _require(Path(path).is_file(), "checkpoint file does not exist")
        # Both modes prevent recreating a file that disappeared after the check.
        mode = "ro" if read_only else "rw"
        uri = Path(path).resolve().as_uri() + "?mode=" + mode
        connection = None
        try:
            connection = sqlite3.connect(uri, uri=True, timeout=5, isolation_level=None)
            connection.execute("PRAGMA synchronous=FULL")
            _require(connection.execute("PRAGMA user_version").fetchone()[0] == VERSION,
                     "unsupported SQLite checkpoint version")
            _require(connection.execute("PRAGMA quick_check").fetchone()[0] == "ok", "corrupt SQLite checkpoint")
            ledger = cls(connection, expected_config)
            ledger.snapshot()
            for fingerprint, payload in connection.execute("SELECT fingerprint, payload FROM batches"):
                _require(_hash(payload) == fingerprint, "journal payload digest mismatch")
            return ledger
        except (sqlite3.DatabaseError, json.JSONDecodeError) as exc:
            if connection is not None:
                connection.close()
            raise ContractError("unreadable/corrupt checkpoint") from exc
        except BaseException:
            if connection is not None:
                connection.close()
            raise

    def close(self):
        self._conn.close()

    def __enter__(self):
        return self

    def __exit__(self, *unused):
        self.close()

    def _load(self):
        row = self._conn.execute("SELECT config, config_hash, sequence, state, state_hash FROM ledger WHERE id=1").fetchone()
        _require(row is not None, "missing checkpoint row")
        config_text, config_hash, sequence, state_text, state_hash = row
        _require(_hash(config_text) == config_hash and _hash(state_text) == state_hash,
                 "checkpoint content digest mismatch")
        if config_text != _json(self._config):
            raise ConflictError("run config changed; use a new ledger for a different population/revision/parser")
        count, first, latest = self._conn.execute("SELECT COUNT(*), COALESCE(MIN(sequence), 0), COALESCE(MAX(sequence), 0) FROM batches").fetchone()
        _require(type(sequence) is int and count == latest == sequence and first == (1 if count else 0),
                 "checkpoint journal/sequence mismatch")
        return sequence, json.loads(state_text)

    def snapshot(self):
        self._conn.execute("BEGIN")
        try:
            sequence, state = self._load()
            return {"config": deepcopy(self._config), "sequence": sequence, "state": state}
        finally:
            self._conn.rollback()

    def apply(self, batch_id, expected_sequence, events, committed_at):
        _text(batch_id, "batch_id")
        _integer(expected_sequence, "expected sequence", 1_000_000_000)
        _time(committed_at)
        _require(isinstance(events, list) and 1 <= len(events) <= MAX_EVENTS, "expected bounded nonempty event batch")
        payload = _json({"expected_sequence": expected_sequence, "events": events, "committed_at": committed_at})
        _require(len(payload.encode("utf-8")) <= 2 * 1024 * 1024, "event batch byte limit exceeded")
        fingerprint = _hash(payload)
        self._conn.execute("BEGIN IMMEDIATE")
        try:
            sequence, state = self._load()
            receipt = self._conn.execute("SELECT fingerprint, sequence FROM batches WHERE batch_id=?", (batch_id,)).fetchone()
            if receipt is not None:
                if receipt[0] != fingerprint:
                    raise ConflictError("batch id reused with a different payload")
                self._conn.rollback()
                return {"sequence": receipt[1], "replayed": True}
            if expected_sequence != sequence:
                raise ConflictError("stale checkpoint sequence")
            _require(_time(committed_at) >= _time(state["last_committed_at"]), "commit time cannot move backwards")
            for event in events:
                _apply_event(self._config, state, event, committed_at)
            state["last_committed_at"] = committed_at
            state_text = _json(state)
            _require(len(state_text.encode("utf-8")) <= MAX_STATE_BYTES, "checkpoint state byte limit exceeded")
            sequence += 1
            self._conn.execute("UPDATE ledger SET sequence=?, state=?, state_hash=? WHERE id=1",
                               (sequence, state_text, _hash(state_text)))
            self._conn.execute("INSERT INTO batches VALUES (?, ?, ?, ?, ?)",
                               (batch_id, fingerprint, sequence, committed_at, payload))
            self._conn.commit()
            return {"sequence": sequence, "replayed": False}
        except BaseException:
            self._conn.rollback()
            raise

    def report(self, as_of):
        now = _time(as_of)
        snapshot = self.snapshot()
        state = snapshot["state"]
        _require(now >= _time(state["last_committed_at"]), "report time predates the checkpoint")
        reports, unions = [], {}
        for config in self._config["scopes"]:
            scope = state["scopes"][config["id"]]
            items = list(scope["items"].values())
            population = config["population"]
            eligible = len(population["eligible_ids"]) if population["status"] == "exact" else None
            policy = config["freshness_seconds"]
            verified = [item["last_verification"] for item in items if item["last_verification"]]
            stale = (sum((now - _time(v["verified_at"])).total_seconds() >= policy for v in verified)
                     if policy is not None else None)
            latest = [item["attempts"][-1] for item in items if item["attempts"]]
            pause = state["host_pauses"].get(config["host"])
            can_retry_host = pause is None or pause["until"] <= as_of
            remaining = self._config["attempt_budget"] - state["attempts_used"]
            counts = {
                "discovered": len(items), "attempted": len(latest),
                "attempts_total": sum(len(item["attempts"]) for item in items),
                "unavailable_attempts_total": sum(a["status"] == "unavailable"
                                                  for item in items for a in item["attempts"]),
                "interrupted_attempts_total": sum(a["status"] == "interrupted"
                                                  for item in items for a in item["attempts"]),
                "verified": len(verified), "stale": stale,
                "fresh_verified": len(verified) - stale if stale is not None else None,
                "freshness_unknown": len(items) - len(verified) if policy is not None else len(items),
                "undiscovered": eligible - len(items) if eligible is not None else None,
                "pending": sum(not item["attempts"] for item in items),
                "retry_due": sum(item["active_attempt_id"] is None and item["retry"]["mode"] == "automatic"
                                 and item["retry"]["after"] <= as_of and can_retry_host and remaining > 0 for item in items),
                "manual_review": sum(item["retry"]["mode"] == "manual" for item in items),
            }
            for outcome in ("unavailable", "interrupted", "in_flight", "searched_unknown"):
                counts[outcome] = sum(a["status"] == outcome for a in latest)
            checkpoint = scope["checkpoint"]
            complete = (checkpoint is not None and checkpoint["status"] == "complete"
                        and checkpoint["work_digest"] == _work_digest(scope) and _pass_ready(config, scope))
            queue = []
            for entity_id, item in sorted(scope["items"].items()):
                retry = item["retry"]
                if item["active_attempt_id"] is not None:
                    action, reason = "reconcile_in_flight", "outcome_unknown_until_recorded"
                elif retry["mode"] == "manual":
                    action, reason = "manual_review", retry["reason"]
                elif retry["mode"] == "none":
                    action, reason = "settled", retry["reason"]
                elif not can_retry_host:
                    action, reason = "wait_for_host", "http_rate_limited"
                elif remaining == 0:
                    action, reason = "blocked_budget", "attempt_budget_exhausted"
                elif retry["after"] > as_of:
                    action, reason = "wait_for_retry", retry["reason"]
                else:
                    action, reason = "attempt", retry["reason"]
                queue.append({"entity_id": entity_id, "action": action, "reason": reason,
                              "retry": deepcopy(retry), "active_attempt_id": item["active_attempt_id"]})
            reports.append({
                "scope_id": config["id"], "source_id": config["source_id"], "entity_kind": config["entity_kind"],
                "dimension": config["dimension"], "temporal_scope": config["temporal_scope"],
                "population_status": population["status"], "eligible_total": eligible,
                "population": deepcopy(population), "counts": counts,
                "verification_ratio": len(verified) / eligible if eligible else None,
                "completion": ("known_empty" if eligible == 0 else "complete") if complete else "partial",
                "latest_attempt_at": max((a["started_at"] for item in items for a in item["attempts"]), default=None),
                "latest_retrieved_at": max((a["finished_at"] for item in items for a in item["attempts"]
                                             if a["status"] == "retrieved"), default=None),
                "latest_verified_at": max((v["verified_at"] for v in verified), default=None),
                "resume_queue": queue,
                "checkpoint": deepcopy(checkpoint),
                "last_successful_full_scan_at": scope["last_successful_full_scan_at"],
            })
            union = unions.setdefault(config["entity_kind"], {"eligible": set(), "discovered": set(), "unknown": False})
            if eligible is None:
                union["unknown"] = True
            else:
                union["eligible"].update(population["eligible_ids"])
            union["discovered"].update(scope["items"])
        return {
            "run_id": self._config["run_id"], "catalogue_revision": self._config["catalogue_revision"],
            "snapshot_kind": self._config["snapshot_kind"], "sequence": snapshot["sequence"], "as_of": as_of,
            "attempt_budget_remaining": self._config["attempt_budget"] - state["attempts_used"],
            "host_pauses": deepcopy(state["host_pauses"]), "scopes": reports,
            "entities_by_kind": {kind: {"eligible": None if union["unknown"] else len(union["eligible"]),
                                        "discovered": len(union["discovered"])} for kind, union in unions.items()},
        }
