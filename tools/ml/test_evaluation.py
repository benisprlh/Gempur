import json
import math
import tempfile
import unittest
from pathlib import Path

import numpy as np

from evaluation_core import (
    PublicSuffixList, baseline_heuristic, brand_key, json_bytes, load_verified, metric_flags,
    ngrams, normalize_domain, parse_model, predict_lexical, prepare_dataset, select_threshold,
    sha256, split_for,
)


class EvaluationTests(unittest.TestCase):
    def test_normalization_matches_hostname_boundaries_and_idna2003(self):
        self.assertEqual(normalize_domain(" BÜCHER.de. "), "xn--bcher-kva.de")
        self.assertEqual(normalize_domain("faß.de"), "fass.de")
        self.assertEqual(normalize_domain("a。example.com"), "a.example.com")
        for bad in [None, "", "localhost", "a..com", "-a.com", "a_.com", "127.0.0.1",
                    "https://example.com", "example.com?token=a", "*.example.com", "a" * 64 + ".com", "a.com.."]:
            with self.assertRaises(ValueError, msg=str(bad)):
                normalize_domain(bad)

    def test_psl_exact_wildcard_exception_and_private_suffix(self):
        psl = PublicSuffixList("com\nco.uk\n*.ck\n!www.ck\ngithub.io\n")
        self.assertEqual(psl.registrable("a.b.example.co.uk"), "example.co.uk")
        self.assertEqual(psl.registrable("x.a.b.ck"), "a.b.ck")
        self.assertEqual(psl.registrable("a.www.ck"), "www.ck")
        self.assertEqual(psl.registrable("x.tenant.github.io"), "tenant.github.io")
        self.assertTrue(psl.has_explicit_suffix("example.co.uk"))
        self.assertFalse(psl.has_explicit_suffix("example.not-a-pinned-suffix"))
        with self.assertRaises(ValueError):
            psl.registrable("co.uk")

    def test_brand_grouping_keeps_number_and_tld_variants_together(self):
        self.assertEqual(brand_key("slot-gacor123.com"), brand_key("slotgacor456.net"))
        self.assertEqual(brand_key("bet365.com"), brand_key("bet777.net"))
        self.assertNotEqual(brand_key("banking.com"), brand_key("shopping.com"))
        self.assertEqual(split_for("same-family", 42), split_for("same-family", 42))

    def test_source_pins_fail_on_changed_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "source"
            path.write_bytes(b"pinned")
            item = {"id": "fixture", "path": "source", "bytes": 6, "sha256": sha256(b"pinned")}
            self.assertEqual(load_verified(root, item), b"pinned")
            path.write_bytes(b"changed")
            with self.assertRaises(ValueError):
                load_verified(root, item)

    def test_family_holdouts_conflicts_and_known_challenge_are_reserved_before_split(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "known").write_text("known123.com\n")
            def source(name, text, label, role):
                raw = text.encode()
                (root / name).write_bytes(raw)
                return {"id": name, "path": name, "sha256": sha256(raw), "bytes": len(raw),
                        "format": "domains", "label": label, "role": role}
            psl = source("psl", "com\nnet\norg\n", 0, "grouping")
            lock = {"psl": psl, "sources": [
                source("positive", "hold123.com\nnormalpositive.com\nclash.com\nknown777.net\nchallenge2.com\nunknown.not-in-psl\n", 1, "train_pool"),
                source("negative", "normalnegative.com\nclash.net\n", 0, "train_pool"),
                source("holdout", "hold999.net\n", 1, "source_holdout"),
            ]}
            experiment = {"seed": 42, "knownRulesPath": "known", "challenge": [{"domain": "challenge1.org"}]}
            splits, holdouts, manifest = prepare_dataset(root, lock, experiment)
            pool = [row["domain"] for rows in splits.values() for row in rows]
            self.assertEqual(set(pool), {"normalpositive.com", "normalnegative.com"})
            self.assertEqual([row["domain"] for row in holdouts["holdout"]], ["hold999.net"])
            self.assertEqual(manifest["familyOverlapAcrossSplits"], 0)
            self.assertEqual(manifest["familyOverlapWithSourceHoldouts"], 0)
            self.assertEqual(manifest["excluded"]["conflictingLabelFamilies"], 1)
            self.assertEqual(manifest["sourceCounts"]["positive"]["unknownPslSuffixExcluded"], 1)

    def test_ngrams_have_unique_binary_presence_and_boundaries(self):
        tokens = ngrams("aaaa.com")
        self.assertIn("^aa", tokens)
        self.assertIn("om$", tokens)
        self.assertEqual(len([item for item in tokens if item == "aaa"]), 1)

    def test_operational_abstentions_count_positive_as_missed(self):
        labels = [1, 1, 0, 0]
        result = metric_flags(labels, [True, False, True, False], [0.9, 0.2, 0.8, 0.1], [True, False, True, True])
        self.assertEqual([result[key] for key in ["tp", "fp", "tn", "fn"]], [1, 1, 1, 1])
        self.assertEqual(result["recall"], 0.5)
        self.assertEqual(result["falsePositiveRate"], 0.5)
        self.assertEqual(result["abstained"], 1)
        self.assertEqual(result["coverage"], 0.75)

    def test_confidence_bounds_expose_small_sample_limit_and_undefined_precision(self):
        result = metric_flags([0] * 100, [False] * 100)
        self.assertIsNone(result["precision"])
        self.assertIsNone(result["recall"])
        self.assertGreater(result["fprUpper95"], 0.029)
        self.assertLess(result["fprUpper95"], 0.030)
        large = metric_flags([0] * 3000, [False] * 3000)
        self.assertLess(large["fprUpper95"], 0.001)

    def test_threshold_uses_validation_constraints_and_disabled_fallback(self):
        config = {"minimumValidationFlags": 2, "minimumProxyPrecision": 1, "maximumProxyFpr": 0}
        threshold, result = select_threshold([1, 1, 0], [0.9, 0.8, 0.7], [True] * 3, config)
        self.assertGreater(threshold, 0.7)
        self.assertLessEqual(threshold, 0.8)
        self.assertEqual(result["tp"], 2)
        threshold, _ = select_threshold([1, 0], [0.9, 0.99], [True, True], config)
        self.assertEqual(threshold, 1)

    def test_model_score_is_binary_unique_and_threshold_one_disables_even_rounded_one(self):
        tokens = sorted(ngrams("slotgacor.com"))
        weights = {item: 20.0 for item in tokens}
        result = predict_lexical("slotgacor.com", weights, 100.0, 1.0)
        self.assertEqual(result["score"], 1.0)
        self.assertFalse(result["abstained"])
        self.assertFalse(result["flagged"])
        invalid = predict_lexical("https://slotgacor.com", weights, 0, 0.5)
        self.assertIsNone(invalid["score"])
        self.assertTrue(invalid["abstained"])

    def test_sparse_or_out_of_vocabulary_input_abstains(self):
        result = predict_lexical("example.com", {"exa": 1.0}, 2.0, 0.5)
        self.assertTrue(result["abstained"])
        self.assertFalse(result["flagged"])

    def test_baseline_is_separate_and_preserves_context_controls(self):
        self.assertTrue(baseline_heuristic("slotgacor.com"))
        self.assertTrue(baseline_heuristic("casino-deposit.com"))
        self.assertFalse(baseline_heuristic("berita-slot-gacor.com"))
        self.assertFalse(baseline_heuristic("slot-deposit.ac.id"))
        self.assertFalse(baseline_heuristic("calendar-slot.com"))

    def test_parser_rejects_changed_preprocessing_nonfinite_duplicate_and_unsafe_auto(self):
        base = ("GEMPUR_DOMAIN_MODEL_V1\nmodel_version\tdomain-ml-v1\nmin_ngram\t3\nmax_ngram\t5\n"
                "intercept\t0\nreview_threshold\t0.9\nmin_coverage\t0.30\nmin_matched\t10\n"
                "auto_quarantine\tfalse\nfeatures\t1\nabc\t1\n")
        self.assertEqual(parse_model(base.encode())[0]["model_version"], "domain-ml-v1")
        for invalid in [
            base.replace("min_ngram\t3", "min_ngram\t2"),
            base.replace("max_ngram\t5", "max_ngram\t6"),
            base.replace("min_matched\t10", "min_matched\t1"),
            base.replace("auto_quarantine\tfalse", "auto_quarantine\ttrue"),
            base.replace("abc\t1", "abc\tnan"),
            base.replace("features\t1", "features\t2") + "abc\t2\n",
        ]:
            with self.assertRaises(ValueError):
                parse_model(invalid.encode())


if __name__ == "__main__":
    unittest.main()
