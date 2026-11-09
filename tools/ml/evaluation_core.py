"""Deterministic, hostname-only evaluation helpers. No network or site content access."""
from __future__ import annotations

import hashlib
import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from scipy.stats import beta
from sklearn.metrics import average_precision_score


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def json_bytes(value) -> bytes:
    return (json.dumps(value, ensure_ascii=True, indent=2, sort_keys=True) + "\n").encode()


def normalize_domain(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("A hostname is required")
    value = re.sub(r"^[\x00-\x20]+|[\x00-\x20]+$", "", value)
    if value.endswith("."):
        value = value[:-1]
    if not value or any(c in value for c in "/:?#@*\\"):
        raise ValueError("Hostname only, not a URL")
    try:
        value = value.encode("idna").decode("ascii").lower()
    except (UnicodeError, ValueError) as error:
        raise ValueError("Invalid IDNA hostname") from error
    labels = value.split(".")
    if len(value) > 253 or len(labels) < 2 or any(
        not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", item) for item in labels
    ):
        raise ValueError("Invalid hostname")
    if all(item.isdigit() for item in labels):
        raise ValueError("IP/numeric-only input is not a hostname")
    return value


class PublicSuffixList:
    """PSL longest-match implementation, including wildcard, exception and private rules."""

    def __init__(self, text: str):
        self.exact, self.wildcard, self.exception = set(), set(), set()
        for raw in text.splitlines():
            rule = raw.split("//", 1)[0].strip()
            if not rule:
                continue
            target = self.exact
            if rule.startswith("!"):
                target, rule = self.exception, rule[1:]
            elif rule.startswith("*."):
                target, rule = self.wildcard, rule[2:]
            target.add(rule.encode("idna").decode("ascii").lower())
        if not self.exact:
            raise ValueError("Empty PSL")

    def registrable(self, domain: str) -> str:
        labels = normalize_domain(domain).split(".")
        count = 1
        for i in range(len(labels)):
            suffix = ".".join(labels[i:])
            if suffix in self.exception:
                count = len(labels) - i - 1
                break
            if suffix in self.exact:
                count = max(count, len(labels) - i)
            if i > 0 and suffix in self.wildcard:
                count = max(count, len(labels) - i + 1)
        if len(labels) <= count:
            raise ValueError("Public suffix itself is not a registrable hostname")
        return ".".join(labels[-count - 1:])

    def has_explicit_suffix(self, domain: str) -> bool:
        labels = normalize_domain(domain).split(".")
        return any(".".join(labels[i:]) in self.exact or ".".join(labels[i:]) in self.exception
                   or (i > 0 and ".".join(labels[i:]) in self.wildcard) for i in range(len(labels)))


def brand_key(root: str) -> str:
    label = root.split(".")[0]
    base = re.sub(r"[-0-9]", "", label)
    # Conservative cross-TLD and numeric-variant grouping, not a complete clone detector.
    return base if len(base) >= 3 else label.replace("-", "")


def load_verified(root: Path, item: dict) -> bytes:
    path = (root / item["path"]).resolve()
    if not path.is_relative_to(root.resolve()) or path.is_symlink():
        raise ValueError("Source cache path escapes workspace")
    raw = path.read_bytes()
    if len(raw) != item["bytes"] or sha256(raw) != item["sha256"]:
        raise ValueError("Pinned source hash mismatch: " + item["id"])
    return raw


def read_source(raw: bytes, format_name: str):
    for line in raw.decode("utf-8-sig").splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        columns = line.split()
        values = columns[1:] if format_name == "hosts" else [line]
        for value in values:
            try:
                yield normalize_domain(value)
            except ValueError:
                yield None


def split_for(group: str, seed: int) -> str:
    value = int(sha256(f"{seed}:{group}".encode())[:16], 16) % 10_000
    return "train" if value < 7000 else "validation" if value < 8500 else "test"


def prepare_dataset(root: Path, lock: dict, experiment: dict):
    """Reserve holdout families BEFORE fitting; each retained family contributes one row."""
    psl = PublicSuffixList(load_verified(root, lock["psl"]).decode())
    rows, counts = [], {}
    for source in lock["sources"]:
        domains = list(read_source(load_verified(root, source), source["format"]))
        valid = sorted(set(item for item in domains if item is not None))
        counts[source["id"]] = {
            "rawParsed": len(domains), "invalid": sum(item is None for item in domains),
            "uniqueNormalized": len(valid), "label": source["label"], "role": source["role"],
        }
        for domain in valid:
            if not psl.has_explicit_suffix(domain):
                counts[source["id"]]["unknownPslSuffixExcluded"] = counts[source["id"]].get("unknownPslSuffixExcluded", 0) + 1
                continue
            try:
                registrable = psl.registrable(domain)
            except ValueError:
                counts[source["id"]]["invalidPublicSuffix"] = counts[source["id"]].get("invalidPublicSuffix", 0) + 1
                continue
            rows.append({"domain": domain, "root": registrable, "brand": brand_key(registrable),
                         "label": source["label"], "source": source["id"], "role": source["role"]})

    # A registrable root always maps to one brand key. Grouping the brand joins roots across TLDs.
    grouped = defaultdict(list)
    for row in rows:
        grouped[row["brand"]].append(row)
    known = set()
    for line in (root / experiment["knownRulesPath"]).read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            try:
                known.add(brand_key(psl.registrable(line)))
            except ValueError:
                pass
    challenge_families = set()
    for item in experiment["challenge"]:
        try:
            challenge_families.add(brand_key(psl.registrable(item["domain"])))
        except ValueError:
            pass

    splits = {"train": [], "validation": [], "test": []}
    holdouts = {item["id"]: [] for item in lock["sources"] if item["role"] == "source_holdout"}
    excluded = Counter()
    for family, members in sorted(grouped.items()):
        if len({row["label"] for row in members}) != 1:
            excluded["conflictingLabelFamilies"] += 1
            excluded["conflictingLabelRows"] += len(members)
            continue
        if family in known:
            excluded["knownRuleFamilies"] += 1
            continue
        if family in challenge_families:
            excluded["challengeFamiliesReserved"] += 1
            continue
        family_id = sha256(("brand:" + family).encode())
        source_holdouts = sorted({row["source"] for row in members if row["role"] == "source_holdout"})
        if source_holdouts:
            excluded["sourceHoldoutFamiliesReserved"] += 1
            excluded["poolRowsReservedForSourceHoldout"] += sum(row["role"] == "train_pool" for row in members)
            for source_id in source_holdouts:
                representative = min((row for row in members if row["source"] == source_id),
                                     key=lambda row: (len(row["domain"]), row["domain"]))
                holdouts[source_id].append({**representative, "family": family_id})
            continue
        representative = min(members, key=lambda row: (len(row["domain"]), row["domain"], row["source"]))
        partition = split_for(family_id, experiment["seed"])
        splits[partition].append({**representative, "family": family_id})
    for value in [*splits.values(), *holdouts.values()]:
        value.sort(key=lambda row: row["family"])
    split_sets = {key: {row["family"] for row in value} for key, value in splits.items()}
    if any(split_sets[a] & split_sets[b] for a, b in [("train", "validation"), ("train", "test"), ("validation", "test")]):
        raise ValueError("Family leakage")
    all_holdout = {row["family"] for rows_ in holdouts.values() for row in rows_}
    if any(value & all_holdout for value in split_sets.values()):
        raise ValueError("Source holdout leaked")
    manifest = {
        "schemaVersion": 1, "seed": experiment["seed"],
        "assignment": "SHA256(seed:SHA256(brand-family)) modulo10000;70/15/15",
        "grouping": "Pinned PSL registrable roots plus equal digit/hyphen-stripped brand stems across TLDs; one representative per family",
        "unknownSuffixPolicy": "Exclude source rows without an explicit pinned PSL suffix; PSL default wildcard is not used to admit training/evaluation sources",
        "residualLeakageRisk": "Similar brands with different remaining stems can remain in different groups; no complete near-duplicate or temporal independence claim",
        "sourceCounts": counts, "excluded": dict(excluded),
        "splits": {key: {"n": len(value), "positive": sum(row["label"] for row in value),
                         "negative": sum(1 - row["label"] for row in value),
                         "familyAssignmentsSha256": sha256("\n".join(row["family"] + ":" + str(row["label"]) for row in value).encode()),
                         "normalizedRowsSha256": sha256(json_bytes([(row["domain"], row["label"], row["family"], row["source"]) for row in value]))}
                   for key, value in splits.items()},
        "sourceHoldouts": {key: {"n": len(value), "positiveOnly": True,
                                "familyAssignmentsSha256": sha256("\n".join(row["family"] for row in value).encode()),
                                "normalizedRowsSha256": sha256(json_bytes([(row["domain"], row["label"], row["family"]) for row in value]))}
                          for key, value in holdouts.items()},
        "sourceHoldoutUnionFamilies": len(all_holdout),
        "sourceHoldoutFamilyOverlapBetweenFeeds": sum(len(value) for value in holdouts.values()) - len(all_holdout),
        "familyOverlapAcrossSplits": 0, "familyOverlapWithSourceHoldouts": 0,
    }
    return splits, holdouts, manifest


def ngrams(domain: str) -> set[str]:
    value = "^" + normalize_domain(domain) + "$"
    return {value[i:i+n] for n in (3, 4, 5) for i in range(len(value) - n + 1)}


def sigmoid(value: float) -> float:
    if value >= 0:
        return 1.0 / (1.0 + math.exp(-value))
    exp = math.exp(value)
    return exp / (1.0 + exp)


def predict_lexical(domain: str, weights: dict, intercept: float, threshold: float) -> dict:
    try:
        tokens = ngrams(domain)
    except ValueError:
        return {"score": None, "matched": 0, "total": 0, "abstained": True, "flagged": False}
    matched = tokens & weights.keys()
    score = sigmoid(intercept + sum(weights[token] for token in sorted(matched)))
    abstained = len(matched) < 10 or len(matched) / len(tokens) < 0.30
    return {"score": score, "matched": len(matched), "total": len(tokens), "abstained": abstained,
            "flagged": not abstained and threshold < 1.0 and score >= threshold}


def metric_flags(labels, flags, scores=None, eligible=None) -> dict:
    y = np.asarray(labels, dtype=int)
    prediction = np.asarray(flags, dtype=bool)
    n = len(y)
    if not n or len(prediction) != n or not np.isin(y, [0, 1]).all():
        raise ValueError("Nonempty binary labels/predictions required")
    eligible = np.ones(n, dtype=bool) if eligible is None else np.asarray(eligible, dtype=bool)
    tp = int(np.sum((y == 1) & prediction)); fp = int(np.sum((y == 0) & prediction))
    tn = int(np.sum((y == 0) & ~prediction)); fn = int(np.sum((y == 1) & ~prediction))
    positive, negative = tp + fn, tn + fp
    precision = tp / (tp + fp) if tp + fp else None
    recall = tp / positive if positive else None
    fpr = fp / negative if negative else None
    return {
        "n": n, "positiveSupport": positive, "negativeSupport": negative,
        "tp": tp, "fp": fp, "tn": tn, "fn": fn, "predictedPositive": tp + fp,
        "precision": precision, "recall": recall, "falsePositiveRate": fpr,
        "accuracy": (tp + tn) / n,
        "balancedAccuracy": (recall + 1 - fpr) / 2 if recall is not None and fpr is not None else None,
        "prAuc": float(average_precision_score(y, scores)) if scores is not None and positive and negative else None,
        "prAucDefinition": "average_precision_of_raw_scores_not_trapezoidal_area",
        "abstained": int(np.sum(~eligible)), "coverage": float(np.mean(eligible)), "flaggedCoverage": (tp + fp) / n,
        "precisionLower95": float(beta.ppf(0.05, tp, fp + 1)) if tp else (0.0 if fp else None),
        "fprUpper95": float(beta.ppf(0.95, fp + 1, tn)) if tn else (1.0 if negative else None),
        "recallLower95": float(beta.ppf(0.05, tp, fn + 1)) if tp else (0.0 if positive else None),
        "confidenceIntervalMethod": "One-sided95%Clopper-Pearson; proxy labels and residual family/source dependence limit deployment interpretation",
    }


def evaluate_rows(rows, weights: dict, intercept: float, threshold: float):
    predictions = [predict_lexical(row["domain"], weights, intercept, threshold) for row in rows]
    scores = np.asarray([item["score"] if item["score"] is not None else 0.0 for item in predictions])
    eligible = np.asarray([not item["abstained"] for item in predictions])
    labels = np.asarray([row["label"] for row in rows], dtype=int)
    flags = eligible & (scores >= threshold) & (threshold < 1.0)
    return predictions, metric_flags(labels, flags, scores, eligible)


GAME = r"(?:slot|slots|casino|poker|judi|togel|baccarat|roulette)"
PROMOTION = r"(?:gacor|maxwin|jackpot|deposit|withdraw|taruhan|betting)"
GAME_WORD, PROMOTION_WORD = re.compile(GAME), re.compile(PROMOTION)
COMPOUND = re.compile(r"(?:" + GAME + PROMOTION + "|" + PROMOTION + GAME + r")(?:online|vip|app)?")
CONTEXT = {"education", "educational", "edukasi", "belajar", "learn", "learning", "tutorial", "research",
           "penelitian", "news", "berita", "analysis", "analisis", "museum", "simulator"}
EXEMPT = ("go.id", "ac.id", "sch.id", "gov", "edu", "bca.co.id", "bankmandiri.co.id", "bni.co.id", "bri.co.id")


def baseline_heuristic(domain: str) -> bool:
    try:
        domain = normalize_domain(domain)
    except ValueError:
        return False
    if any(domain == suffix or domain.endswith("." + suffix) for suffix in EXEMPT):
        return False
    value = "".join(c for c in unicodedata.normalize("NFKD", domain) if not unicodedata.combining(c)).lower()
    words = re.split("[^a-z]+", value)
    if CONTEXT.intersection(words):
        return False
    return any(COMPOUND.fullmatch(word) for word in words) or (
        any(GAME_WORD.fullmatch(word) for word in words) and any(PROMOTION_WORD.fullmatch(word) for word in words))


def select_threshold(labels, scores, eligible, config) -> tuple[float, dict]:
    """Only validation labels may be supplied. Fixed proxy target, not a deployment gate."""
    labels, scores, eligible = np.asarray(labels), np.asarray(scores), np.asarray(eligible)
    index = np.flatnonzero(eligible)
    if not len(index):
        return 1.0, {"reason": "No eligible validation predictions", "predictedPositive": 0, "tp": 0}
    order = index[np.argsort(-scores[index], kind="stable")]
    sorted_scores = scores[order]
    tp = np.cumsum(labels[order] == 1)
    fp = np.cumsum(labels[order] == 0)
    ends = np.r_[np.flatnonzero(sorted_scores[:-1] != sorted_scores[1:]), len(order)-1]
    negatives = max(1, int(np.sum(labels == 0)))
    options = []
    for at in ends:
        predicted = int(tp[at] + fp[at])
        precision = float(tp[at] / predicted)
        fpr = float(fp[at] / negatives)
        if predicted >= config["minimumValidationFlags"] and precision >= config["minimumProxyPrecision"] and fpr <= config["maximumProxyFpr"]:
            upper = float(sorted_scores[at])
            lower = float(sorted_scores[at + 1]) if at + 1 < len(order) else 0.0
            threshold = (upper + lower) / 2
            if not lower < threshold <= upper:
                threshold = upper
            options.append((int(tp[at]), -int(fp[at]), threshold, predicted, precision, fpr))
    if not options:
        return 1.0, {"reason": "No validation operating point satisfies predeclared proxy constraints", "predictedPositive": 0, "tp": 0}
    best = max(options)
    return best[2], {"reason": "Validation-only proxy operating point; no independent-label gate", "tp": best[0], "fp": -best[1],
                     "predictedPositive": best[3], "precision": best[4], "falsePositiveRate": best[5]}


def parse_model(raw: bytes):
    lines = raw.decode("ascii").splitlines()
    if not lines or lines[0] != "GEMPUR_DOMAIN_MODEL_V1":
        raise ValueError("Model format mismatch")
    names = ["model_version", "min_ngram", "max_ngram", "intercept", "review_threshold", "min_coverage",
             "min_matched", "auto_quarantine", "features"]
    headers = {}
    for line, expected in zip(lines[1:10], names):
        parts = line.split("\t")
        if len(parts) != 2 or parts[0] != expected:
            raise ValueError("Model header order mismatch")
        headers[parts[0]] = parts[1]
    if (headers.get("auto_quarantine") != "false" or headers.get("min_coverage") != "0.30"
            or headers.get("min_ngram") != "3" or headers.get("max_ngram") != "5"
            or headers.get("min_matched") != "10"
            or not re.fullmatch(r"[a-z0-9][a-z0-9.-]{0,79}", headers.get("model_version", ""))):
        raise ValueError("Model policy mismatch")
    count = int(headers["features"])
    if len(raw) > 2 * 1024 * 1024 or not 1 <= count <= 24000 or len(lines) != count + 10:
        raise ValueError("Model bounds mismatch")
    weights = {}
    for line in lines[10:]:
        token, value = line.split("\t")
        weight = float(value)
        if token in weights or not 3 <= len(token) <= 5 or not re.fullmatch(r"\^?[a-z0-9.-]+\$?", token) or not math.isfinite(weight) or abs(weight) > 100:
            raise ValueError("Model feature invalid")
        weights[token] = weight
    intercept, threshold = float(headers["intercept"]), float(headers["review_threshold"])
    if not math.isfinite(intercept) or abs(intercept) > 100 or not 0 <= threshold <= 1:
        raise ValueError("Invalid model scalars")
    return headers, weights, intercept, threshold
