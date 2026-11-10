# Local AI experiment — 9 November 2026

Owner requested AI and high measured accuracy. Proceed with local inference and no paid/cloud API because no credential is configured and prior owner preference was free operation. Do not create/reuse API keys or send browsing targets/content to an AI provider.

## Scope and activation

Train a genuine small character-ngram logistic classifier for **domain names only**, bundle immutable weights in privateDebug, and infer offline in Java. Existing known/personal/diagnostic/exact-allow precedence and consent/revocation remain. Do not reuse domain-model metrics for application-name/package classification. There is no verified application+certificate dataset yet.

Domain AI is a separate local opt-in, default OFF including upgrades. Ordinary builds have a no-op repository and no model asset. The model provides a risk score, not an asserted probability or certainty. Invalid/OOD/missing/corrupt model abstains. It never marks unknown as safe.

Automatic quarantine eligibility requires independently adjudicated real-world labels, one-sided95% precision lower bound>=99%, FPR upper<=0.1%, zero critical-challenge false blocks and published relevant source/family holdouts. Category-feed proxy labels cannot satisfy that gate. Initial model is **advisory-only**, reason `ml_model`, verdict `suspected`, action `flagged`; existing explicit domain rules still block. No forced success or unearned99% claim.

## Model asset contract

Private assets directory `android/app/src/privateDebug/assets/ml/`. Model file `domain-model.tsv`, manifest `manifest.json`, parity `parity.tsv`. Model is ASCII bounded<=2MiB, features<=24000, finite bounded coefficients, duplicate features rejected.

```text
GEMPUR_DOMAIN_MODEL_V1
model_version<TAB>domain-ml-2026-11-09-v1
min_ngram<TAB>3
max_ngram<TAB>5
intercept<TAB>FINITE_DOUBLE
review_threshold<TAB>DOUBLE_0_TO_1
min_coverage<TAB>0.30
min_matched<TAB>10
auto_quarantine<TAB>false
features<TAB>FEATURE_COUNT
ASCII_NGRAM<TAB>FINITE_WEIGHT
```

Normalize with the existing DomainRules equivalent IDNA2003/ASCII policy, add boundary markers `^` + normalizedDomain + `$`, binary presence of unique char3..5grams, sum each matching feature once plus intercept, sigmoid with stable arithmetic. Coverage=matched vocabulary features / all unique input ngrams; abstain if matched<10 or coverage<0.30. Threshold1 means review disabled, even if floating-point sigmoid rounds to1. Model parameters/preprocessing cannot change without Python/Java parity vectors and model format version change.

Parity file TSV header `domain score matched total abstained flagged` (tab-separated), numeric score tolerance1e-9; include real heldout examples and IDN/malformed/critical/synthetic cases clearly labelled in evaluation only. Invalid input can use score `NA` with abstainedtrue. Training agent and Java agent coordinate exact parser conventions before export.

`LexicalDomainModel` pure Java engine exports immutable `Prediction` fields score,matchedFeatures,totalFeatures,abstained,flagged,modelVersion; parser static `load(InputStream)` and `predict(String)`.

`DomainAiRepository` variant facade:

```java
static boolean enabled(Context context);
static void setEnabled(Context context,boolean enabled);
static LexicalDomainModel.Prediction predict(Context context,String domain);
static JSONObject status(Context context);
```

Ordinary stub alwaysdisabled/abstain. Private requires PRIVATE_BUILD, AIoptin and actual PrivateMonitoring.localEnabled. Cache immutable model and bounded per-host scores. No downloads/remote updates. Root owns UI and consent copy.

`RuleRepository.evaluate` may emit a nonblocking suspected/ml_model decision only for an otherwise unknown domain with an active model review signal. Preserve exact allowances and critical/educational suppressions. Name heuristics are also advisory under the 10 November 2026 safety patch; known/personal/diagnostic rules retain blocking priority. Historical V1 evaluation remains frozen and is not recomputed to match a changed policy. ProtectionService must record flagged ML signals even though DNS continues, behind existing PrivateMonitoring consent gate. Never call it a blocked request.

PrivateEventPolicy/server accept ml_model only for domain+suspected+flagged; never app,known or blocked. Do not add full URLs/content/inventory/AIscore to outbound events. Model version/score remain local metadata shown through local AIstatus/modelcard; no external AI traffic.

## Data, training and evaluation

Public data sources pinned by commit+SHA256; licenses/attribution preserved. Data categories are proxy labels, not fresh independently verified judol. Cache raw sources under ignored `out/ml-data`; commit source lock/provenance/license, deterministic scripts and bounded model/report, not huge raw archives.

Use pinned PSL (including private suffixes) for registrable roots, group digit-stripped brand families across TLDs, drop conflicting label groups, reserve source-holdout families (Indonesia and alternate positive feed) before fitting. Freeze deterministic train/validation/final-test split before model fit. Fit vocabulary on train only, select C/threshold on validation only, write frozen selection/model hash before final-test evaluation once. Do not retune based on final-test results. Model score is uncalibrated unless a separate calibration protocol is actually performed.

Report model-only and baseline heuristic/hybrid results separately: support,TP/FP/TN/FN,accuracy,precision,recall,FPR,PR-AUC,coverage/abstention,confidence intervals, source-holdout recall and synthetic critical challenge. Abstained positives count as missed in operational recall. Report prevalence-adjusted precision examples and label/source limitations. AutoQuarantineEligible remainsfalse without independent labels regardless impressive proxy scores.

Root full gate builds ordinary/private, tests Python-Java parity and artifact/model evidence binding, updates model card/release readiness and merges only after independent review. Offline source reproducibility is separate from a public website/content-classification claim. No actual-device accuracy/battery claim without measured evidence.
