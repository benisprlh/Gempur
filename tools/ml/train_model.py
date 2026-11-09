#!/usr/bin/env python3
"""Fit once from pinned category snapshots, select on validation, then score frozen final test."""
from __future__ import annotations

import argparse
import json
import math
import platform
import shutil
import time
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import scipy
import sklearn
from sklearn.exceptions import ConvergenceWarning
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score

from evaluation_core import (
    CONTEXT, EXEMPT, baseline_heuristic, evaluate_rows, json_bytes, metric_flags, ngrams,
    normalize_domain, parse_model, predict_lexical, prepare_dataset, select_threshold, sha256,
)

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "android/app/src/privateDebug/assets/ml"
MODEL = ASSETS / "domain-model.tsv"
EXPERIMENT = ROOT / "ml/experiment.json"
LOCK = ROOT / "ml/sources.lock.json"
SPLIT = ROOT / "ml/split_manifest.json"
FROZEN = ROOT / "ml/frozen_selection.json"
EVALUATION = ROOT / "ml/evaluation.json"
GUARD_CONTEXT = CONTEXT | {"anti", "stop", "cegah", "pemulihan", "rehab", "recovery", "support", "help", "bantuan", "konseling"}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def save(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(json_bytes(data))


def runtime_ai_guard(domain: str) -> bool:
    """Matches production suppression, separate from raw model evaluation/parity."""
    import re
    try:
        value = normalize_domain(domain)
    except ValueError:
        return False
    if any(value == item or value.endswith("." + item) for item in ("example.com", "example.net", "example.org")) or value.endswith((".test", ".invalid", ".example", ".localhost")):
        return False
    if any(value == suffix or value.endswith("." + suffix) for suffix in EXEMPT):
        return False
    return not GUARD_CONTEXT.intersection(re.split("[^a-z]+", value))


def format_model(model_version, intercept, threshold, weights) -> bytes:
    if not math.isfinite(intercept) or abs(intercept) > 100:
        raise ValueError("Trained intercept exceeds bounded mobile format")
    for token, weight in weights.items():
        if not math.isfinite(weight) or abs(weight) > 100:
            raise ValueError("Trained weight exceeds bounded mobile format")
    lines = [
        "GEMPUR_DOMAIN_MODEL_V1", "model_version\t" + model_version, "min_ngram\t3", "max_ngram\t5",
        "intercept\t" + format(intercept, ".17g"), "review_threshold\t" + format(threshold, ".17g"),
        "min_coverage\t0.30", "min_matched\t10", "auto_quarantine\tfalse", "features\t" + str(len(weights)),
    ]
    lines += [token + "\t" + format(weights[token], ".17g") for token in sorted(weights)]
    raw = ("\n".join(lines) + "\n").encode("ascii")
    parse_model(raw)
    return raw


def arrays(rows, vectorizer):
    values = ["^" + row["domain"] + "$" for row in rows]
    matrix = vectorizer.transform(values)
    totals = np.asarray([len(ngrams(row["domain"])) for row in rows])
    matched = np.asarray(matrix.getnnz(axis=1)).reshape(-1)
    eligible = (matched >= 10) & (matched / totals >= 0.30)
    return matrix, np.asarray([row["label"] for row in rows]), eligible


def metrics_for_partition(rows, weights, intercept, threshold):
    predictions, operational = evaluate_rows(rows, weights, intercept, threshold)
    labels = np.asarray([row["label"] for row in rows])
    scores = np.asarray([item["score"] if item["score"] is not None else 0 for item in predictions])
    eligible = np.asarray([not item["abstained"] for item in predictions])
    half = eligible & (scores >= 0.5)
    review = np.asarray([item["flagged"] for item in predictions])
    raw_half = scores >= 0.5
    baseline = np.asarray([baseline_heuristic(row["domain"]) for row in rows])
    guarded_ml = np.asarray([item["flagged"] and runtime_ai_guard(row["domain"]) for row, item in zip(rows, predictions)])
    hybrid = baseline | guarded_ml
    result = {
        "modelAtHalf": metric_flags(labels, half, scores, eligible),
        "modelAtHalfWithoutAbstention": metric_flags(labels, raw_half, scores),
        "modelAtReviewThreshold": operational,
        "runtimeAiReviewSignals": metric_flags(labels, guarded_ml, scores, eligible),
        "baselineHeuristicDetection": metric_flags(labels, baseline),
        "hybridDetection": metric_flags(labels, hybrid),
        "newAiSignalsBeyondHeuristic": int(np.sum(guarded_ml & ~baseline)),
        "automaticMlBlocks": 0,
        "meaning": "Heuristic may block; ML and hybrid positives are review signals. This does not certify live-site classification.",
    }
    return result, predictions


def source_holdout_result(rows, weights, intercept, threshold):
    if not rows:
        return {"n": 0, "positiveSupport": 0, "negativeSupport": 0, "precision": None,
                "falsePositiveRate": None, "recall": None, "reason": "No retained source families after exclusions"}
    predictions = [predict_lexical(row["domain"], weights, intercept, threshold) for row in rows]
    count = sum(item["flagged"] for item in predictions)
    hybrid = sum(baseline_heuristic(row["domain"]) or (item["flagged"] and runtime_ai_guard(row["domain"]))
                 for row, item in zip(rows, predictions))
    baseline = sum(baseline_heuristic(row["domain"]) for row in rows)
    runtime_flags = sum(item["flagged"] and runtime_ai_guard(row["domain"]) for row, item in zip(rows, predictions))
    return {
        "n": len(rows), "positiveSupport": len(rows), "negativeSupport": 0,
        "labelQuality": "Positive-only source-category proxy, not independent current website adjudication",
        "precision": None, "falsePositiveRate": None, "accuracy": None,
        "modelReviewFlags": count, "missedOrAbstained": len(rows) - count, "recall": count / len(rows),
        "runtimeAiReviewFlags": runtime_flags, "runtimeAiReviewRecall": runtime_flags / len(rows),
        "modelHalfRecall": sum(not item["abstained"] and item["score"] >= 0.5 for item in predictions) / len(rows),
        "abstained": sum(item["abstained"] for item in predictions),
        "baselineHeuristicRecall": baseline / len(rows), "hybridDetectionRecall": hybrid / len(rows),
        "sourceFamilyOverlapWithTraining": 0,
        "sourceIndependenceLimit": "The feeds can share upstream labels even after host/family overlap is removed.",
    }


def prevalence_examples(metrics):
    recall = metrics["recall"]
    fpr = metrics["falsePositiveRate"]
    output = []
    for prevalence in (0.001, 0.01, 0.10):
        den = recall * prevalence + fpr * (1 - prevalence)
        lower, upper = metrics["recallLower95"], metrics["fprUpper95"]
        conservative_den = lower * prevalence + upper * (1 - prevalence)
        output.append({"assumedPrevalence": prevalence, "proxyPointPrecision": recall * prevalence / den if den else None,
                       "sampleBoundIllustration": lower * prevalence / conservative_den if conservative_den else None,
                       "meaning": "Hypothetical proxy illustration combining two marginal one-sided95% bounds, not a joint95% or deployment precision guarantee"})
    return output


def parity_bytes(test_rows, experiment, weights, intercept, threshold):
    domains = [row["domain"] for row in test_rows[:30]]
    domains += [row["domain"] for row in experiment["challenge"]]
    domains += ["BÜCHER.de.", "faß.de", "mañana.com", "  Example.COM.  ", "https://example.com/a?b=c",
                "127.0.0.1", "foo..com", "-bad.com", "bad_.com", "gempur-block.test", "a" * 64 + ".com",
                "abcdefghijklmnopqrstuvwxyz0123456789.invalid", "subdomain.school.ac.id", "bad-domain.invalid.", "localhost"]
    rows = ["domain\tscore\tmatched\ttotal\tabstained\tflagged"]
    for domain in dict.fromkeys(domains):
        result = predict_lexical(domain, weights, intercept, threshold)
        score = "NA" if result["score"] is None else format(result["score"], ".17g")
        rows.append("\t".join([domain, score, str(result["matched"]), str(result["total"]),
                               str(result["abstained"]).lower(), str(result["flagged"]).lower()]))
    return ("\n".join(rows) + "\n").encode("utf-8")


def verify_runtime():
    expected = {"numpy": "2.3.5", "scipy": "1.17.0", "scikit-learn": "1.8.0"}
    actual = {"numpy": np.__version__, "scipy": scipy.__version__, "scikit-learn": sklearn.__version__}
    if actual != expected:
        raise ValueError("Reproduce with pinned tools/ml/requirements.txt versions")
    return {**actual, "python": platform.python_version()}


def evaluate_frozen(experiment, lock, splits, holdouts, split_manifest):
    """Independent reconstruction path: no fitting, threshold selection or model mutation."""
    headers, weights, intercept, threshold = parse_model(MODEL.read_bytes())
    frozen = json.loads(FROZEN.read_text())
    expected = json.loads(EVALUATION.read_text())
    provenance = {"sourcesLockSha256": sha256(LOCK.read_bytes()), "experimentSha256": sha256(EXPERIMENT.read_bytes()),
                  "splitManifestSha256": sha256(SPLIT.read_bytes()), "frozenSelectionSha256": sha256(FROZEN.read_bytes())}
    if expected["provenance"] != provenance or any(frozen[key] != value for key, value in provenance.items() if key != "frozenSelectionSha256"):
        raise ValueError("Frozen evaluation provenance changed")
    if sha256(MODEL.read_bytes()) != frozen["modelSha256"] or threshold != frozen["reviewThreshold"]:
        raise ValueError("Frozen selection differs from model")
    if (expected["artifact"]["modelSha256"] != sha256(MODEL.read_bytes())
            or expected["artifact"]["paritySha256"] != sha256((ASSETS / "parity.tsv").read_bytes())
            or expected["modelVersion"] != headers["model_version"]):
        raise ValueError("Frozen report artifacts changed")
    if json.loads(SPLIT.read_text()) != split_manifest:
        raise ValueError("Reconstructed split differs")
    test, _ = metrics_for_partition(splits["test"], weights, intercept, threshold)
    source_results = {key: source_holdout_result(value, weights, intercept, threshold) for key, value in holdouts.items()}
    challenge_rows = [{**row, "source": "developer-authored-control"} for row in experiment["challenge"]]
    challenge, _ = metrics_for_partition(challenge_rows, weights, intercept, threshold)
    actual = {"test": test, "sourceHoldouts": source_results, "challenge": challenge}
    if actual != expected["evaluation"]:
        raise ValueError("Recomputed frozen evaluation differs from committed report")
    if parity_bytes(splits["test"], experiment, weights, intercept, threshold) != (ASSETS / "parity.tsv").read_bytes():
        raise ValueError("Parity vectors differ from frozen model")
    return {"verified": True, "modelVersion": headers["model_version"], "modelSha256": frozen["modelSha256"],
            "testN": len(splits["test"]), "autoQuarantineEligible": False}


def train():
    versions = verify_runtime()
    if EVALUATION.exists() or FROZEN.exists():
        raise ValueError("Frozen experiment already exists. Use --evaluate-frozen; do not retune after viewing test results.")
    experiment, lock = json.loads(EXPERIMENT.read_text()), json.loads(LOCK.read_text())
    if not experiment["splitBeforeFit"] or experiment["fitVocabularyOn"] != "train" or experiment["selectionScope"] != "validation":
        raise ValueError("Protocol must be frozen before fitting")
    experiment_sha, lock_sha = sha256(EXPERIMENT.read_bytes()), sha256(LOCK.read_bytes())
    print("Preparing pinned family-disjoint dataset", flush=True)
    splits, holdouts, split_manifest = prepare_dataset(ROOT, lock, experiment)
    save(SPLIT, split_manifest)  # Assignment exists before any vectorizer/model fit.
    for name, rows in splits.items():
        if len(rows) < 1000 or len({row["label"] for row in rows}) != 2:
            raise ValueError("Insufficient split support: " + name)
    print(json.dumps({name: len(rows) for name, rows in splits.items()}), flush=True)
    features = experiment["features"]
    vectorizer = CountVectorizer(analyzer="char", ngram_range=(3, 5), binary=True, lowercase=False,
                                 min_df=features["minimumDocumentFrequency"], max_features=features["maxFeatures"], dtype=np.float64)
    train_rows = splits["train"]
    x_train = vectorizer.fit_transform(["^" + row["domain"] + "$" for row in train_rows])
    y_train = np.asarray([row["label"] for row in train_rows])
    x_validation, y_validation, validation_eligible = arrays(splits["validation"], vectorizer)
    candidates, selected = [], None
    for c in experiment["cCandidates"]:
        print("Fitting C=" + str(c) + " on train only", flush=True)
        started = time.perf_counter()
        model = LogisticRegression(C=c, solver="liblinear", class_weight="balanced", tol=1e-6,
                                   max_iter=1000, random_state=experiment["seed"])
        with warnings.catch_warnings():
            warnings.simplefilter("error", ConvergenceWarning)
            model.fit(x_train, y_train)
        scores = model.predict_proba(x_validation)[:, 1]
        threshold, operating_point = select_threshold(y_validation, scores, validation_eligible, experiment["thresholdSelection"])
        ap = float(average_precision_score(y_validation, scores))
        key = (operating_point.get("tp", 0), ap, -c)
        record = {"C": c, "reviewThreshold": threshold, "validationPrAuc": ap, "validationOperatingPoint": operating_point,
                  "fitSeconds": time.perf_counter() - started}
        candidates.append(record)
        if selected is None or key > selected["key"]:
            selected = {"key": key, "record": record, "model": model}
        print(json.dumps({key_: value for key_, value in record.items() if key_ != "fitSeconds"}), flush=True)
    weights = dict(zip(vectorizer.get_feature_names_out().tolist(), selected["model"].coef_[0].tolist()))
    intercept = float(selected["model"].intercept_[0])
    # Resolve the operating point using the exported model arithmetic before freezing.
    validation_predictions = [predict_lexical(row["domain"], weights, intercept, 1.0) for row in splits["validation"]]
    threshold, exported_operating_point = select_threshold(
        y_validation, np.asarray([item["score"] for item in validation_predictions]),
        np.asarray([not item["abstained"] for item in validation_predictions]), experiment["thresholdSelection"])
    raw = format_model(experiment["modelVersion"], intercept, threshold, weights)
    ASSETS.mkdir(parents=True, exist_ok=True)
    MODEL.write_bytes(raw)
    frozen = {
        "schemaVersion": 1, "frozenAt": now(), "modelVersion": experiment["modelVersion"],
        "selectionScope": "validation", "finalTestConsultedForSelection": False,
        "selectedC": selected["record"]["C"], "reviewThreshold": threshold,
        "modelSha256": sha256(raw), "modelBytes": len(raw), "featureCount": len(weights),
        "sourcesLockSha256": lock_sha, "experimentSha256": experiment_sha, "splitManifestSha256": sha256(SPLIT.read_bytes()),
        "candidates": candidates, "selectedValidation": {**selected["record"], "reviewThreshold": threshold,
                                                          "validationOperatingPoint": exported_operating_point},
        "exportedValidationOperatingPoint": exported_operating_point,
        "scoreMeaning": "Uncalibrated lexical risk score, not verified probability of judol",
        "autoQuarantineEligible": False, "independentlyReviewedLabelCount": 0,
    }
    save(FROZEN, frozen)  # Frozen bytes/hash written before FIRST final-test model prediction.
    print("Selection frozen; scoring final test once", flush=True)
    # No candidate other than the already selected frozen model sees final-test labels/scores.
    headers, weights, intercept, threshold = parse_model(raw)
    test, test_predictions = metrics_for_partition(splits["test"], weights, intercept, threshold)
    sources = {key: source_holdout_result(value, weights, intercept, threshold) for key, value in holdouts.items()}
    challenge, challenge_predictions = metrics_for_partition(experiment["challenge"], weights, intercept, threshold)
    parity = parity_bytes(splits["test"], experiment, weights, intercept, threshold)
    (ASSETS / "parity.tsv").write_bytes(parity)
    provenance = {"sourcesLockSha256": lock_sha, "experimentSha256": experiment_sha,
                  "splitManifestSha256": sha256(SPLIT.read_bytes()), "frozenSelectionSha256": sha256(FROZEN.read_bytes())}
    artifact = {"modelSha256": sha256(raw), "modelBytes": len(raw), "paritySha256": sha256(parity), "featureCount": len(weights)}
    report = {
        "schemaVersion": 1, "createdAt": now(), "modelVersion": experiment["modelVersion"],
        "sourceProxyLabels": True, "independentlyReviewedLabelCount": 0, "autoQuarantineEligible": False,
        "automaticGateReasons": ["No independently adjudicated current real-world labels", "Source-category agreement is not verified judol accuracy",
                                 "Domain benchmark cannot validate application classification", "No physical-device or future temporal holdout validation"],
        "scoreMeaning": frozen["scoreMeaning"], "prAucDefinition": "average_precision",
        "artifact": artifact, "provenance": provenance, "runtime": versions,
        "dataset": split_manifest, "selection": {"C": frozen["selectedC"], "reviewThreshold": threshold,
                                                "selectionScope": "validation", "finalTestConsultedForSelection": False},
        "evaluation": {"test": test, "sourceHoldouts": sources, "challenge": challenge},
        "prevalenceIllustrations": prevalence_examples(test["modelAtReviewThreshold"]),
        "challengeDetails": [{**row, "rawPrediction": prediction, "runtimeAiGuardAllows": runtime_ai_guard(row["domain"]),
                              "baselineHeuristic": baseline_heuristic(row["domain"])}
                             for row, prediction in zip(experiment["challenge"], challenge_predictions)],
        "limitations": [
            "Feed categories can be wrong, stale, broad, shared or re-registered; no websites were visited or independently adjudicated",
            "Negative categories are proxy non-gambling labels, not proof of current safe content",
            "Family grouping prevents exact-root, TLD and numeric-stem leakage but not every semantic/near-duplicate relation",
            "Final test is a frozen cross-sectional source split, not a future temporal or representative deployment sample",
            "Source holdouts are positive-only, upstream category claims may overlap, and do not estimate precision/FPR",
            "Synthetic/developer-authored challenge controls are separate from empirical source metrics",
            "Uncalibrated hostname score cannot read hidden content, arbitrary renamed targets, encrypted DNS or app content",
            "ML remains advisory; its flags are not automatic blocks or evidence of intentional gambling",
        ],
    }
    save(EVALUATION, report)
    for path in sorted((ROOT / "ml/licenses").glob("*.txt")):
        shutil.copyfile(path, ASSETS / path.name)
    license_path = ASSETS / "LICENSE-CC-BY-SA-4.0.txt"
    shutil.copyfile(ROOT / "ml/licenses/CC-BY-SA-4.0.txt", license_path)
    notice_path = ASSETS / "NOTICE.txt"
    notice_path.write_text(
        "Gempur hostname-only experimental model. Risk scores are uncalibrated; advisory only.\n"
        "Trained from UT1 Toulouse category snapshots (Fabrice Prigent / Universite Toulouse Capitole; mirror olbat), CC BY-SA4.0.\n"
        "Training excludes held-out source families from Sinfonietta (MIT) and arfshl (BSD3); evaluation labels remain source claims.\n"
        "Grouping uses the Public Suffix List contributors' pinned data, MPL2.0. Source license texts accompany this asset.\n"
        "Model/data distribution conservatively preserves CC BY-SA4.0 attribution/share-alike separately from application code.\n"
        "See repository ml/ATTRIBUTION.md, ml/sources.lock.json, ml/evaluation.json and ml/experiment.json for exact pins/hashes/protocol.\n",
        encoding="ascii",
    )
    manifest = {
        "schemaVersion": 1, "modelVersion": experiment["modelVersion"], "modelFile": "domain-model.tsv",
        **artifact, "parityFile": "parity.tsv", "reviewThreshold": threshold,
        "autoQuarantineEligible": False, "scoreMeaning": frozen["scoreMeaning"], "training": provenance,
        "license": "CC-BY-SA-4.0", "attributionFile": "NOTICE.txt",
        "licenses": {"noticeFile": "NOTICE.txt", "noticeSha256": sha256(notice_path.read_bytes()),
                     "licenseFile": license_path.name, "licenseSha256": sha256(license_path.read_bytes())},
    }
    save(ASSETS / "manifest.json", manifest)
    print(json.dumps({"modelVersion": experiment["modelVersion"], **artifact, "test": test["modelAtReviewThreshold"],
                      "sourceHoldouts": sources, "autoQuarantineEligible": False}, indent=2), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evaluate-frozen", action="store_true")
    args = parser.parse_args()
    if args.evaluate_frozen:
        verify_runtime()
        experiment, lock = json.loads(EXPERIMENT.read_text()), json.loads(LOCK.read_text())
        splits, holdouts, manifest = prepare_dataset(ROOT, lock, experiment)
        print(json.dumps(evaluate_frozen(experiment, lock, splits, holdouts, manifest), indent=2))
    else:
        train()


if __name__ == "__main__":
    main()
