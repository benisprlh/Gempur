# Local domain-model data and attribution

Recorded 9 November 2026. The experiment uses public category-feed labels as **proxies**, not fresh independently adjudicated evidence that each website currently offers gambling. No listed website was visited, resolved, scanned, or used to wager during source acquisition. Only the HTTPS source-list and license endpoints in `sources.lock.json` were fetched.

## Locked input sources

| Source | Revision | Use | Raw lines | License and credit |
| --- | --- | --- | ---: | --- |
| UT1 `gambling` | `03501c64d230df9d84124176558d758351027be1` | Positive training-pool category | 47,818 | CC BY-SA 4.0; Fabrice Prigent / Université Toulouse Capitole; mirrored by olbat |
| UT1 `bank` | Same revision | Negative-category proxy | 6,646 | Same |
| UT1 `press` | Same revision | Negative-category proxy | 4,644 | Same |
| UT1 `liste_bu` | Same revision | Negative-category proxy | 2,827 | Same |
| UT1 `sports` | Same revision | Negative-category proxy | 2,362 | Same |
| UT1 `games` | Same revision | Negative-category proxy | 33,741 | Same |
| UT1 `shopping` | Same revision | Negative-category proxy | 36,968 | Same |
| UT1 `financial` | Same revision | Negative-category proxy | 472 | Same |
| Sinfonietta `gambling-hosts` | `46f3097d7bcfc9eea323fe365074dfd771d0d17c` | Positive source holdout | 2,694 | MIT; Copyright 2016 Sinfonietta |
| arfshl Indonesian candidates | Original `f96fee6ab791b7eaa9a6a85c437f19f39abecc79`; prepared snapshot pinned in Gempur `e0a73b91fd39f92c1d3d2e64fe144db9324303c9` | Positive source holdout | 480 | BSD-3-Clause; retain original notice in `licenses/arfshl-BSD-3-Clause.txt` |
| Public Suffix List | `7a21dc3491d43db036124fdd6a3a77d1cc44ad8a` | Registrable-domain grouping, including private suffixes | 16,586 | MPL 2.0; Public Suffix List contributors |

Raw line counts precede normalization, deduplication, invalid-input rejection, label-conflict removal, family grouping and split construction. They are not training/evaluation support counts. See the generated evaluation report for actual retained examples.

Source endpoints and exact SHA-256/byte counts are in [sources.lock.json](sources.lock.json). The UT1 mirror describes itself as a mirror of [the university's category database](https://dsi.ut-capitole.fr/blacklists/) and links CC BY-SA 4.0 in its pinned README. The official university download directory includes the same license designation. The mirror README is also hash-locked as provenance. Formal English CC legal code was fetched from Creative Commons and retained in [licenses/CC-BY-SA-4.0.txt](licenses/CC-BY-SA-4.0.txt).

Original source repositories:

- [UT1 pinned mirror](https://github.com/olbat/ut1-blacklists/tree/03501c64d230df9d84124176558d758351027be1)
- [Sinfonietta pinned source](https://github.com/Sinfonietta/hostfiles/tree/46f3097d7bcfc9eea323fe365074dfd771d0d17c)
- [arfshl pinned source](https://github.com/arfshl/anti-gambling-domains/tree/f96fee6ab791b7eaa9a6a85c437f19f39abecc79)
- [Public Suffix List pinned source](https://github.com/publicsuffix/list/tree/7a21dc3491d43db036124fdd6a3a77d1cc44ad8a)

The arfshl holdout is the repository's existing normalized candidate subset, not an activated production rule list. Its prepared-byte hash is distinct from the original 9,054-byte upstream snapshot hash; both the upstream origin and original local snapshot are recorded in the lock. Reusing this subset does not imply a human reviewed every candidate's current content.

## Distribution and modifications

Keep data/model licensing separate from application-code licensing. As a conservative distribution policy, publish the derived domain-model data/weights and their attribution under CC BY-SA 4.0, retain the MIT/BSD notices for additional sources and the MPL notice for the PSL, and describe preprocessing/model-training modifications. Preserve these notices and this attribution in any package distributing the model; a top-level application-code license does not replace them. This policy is not a legal opinion about model-weight copyright or a claim that upstream categorization is accurate.

Large raw sources stay in ignored `out/ml-data/`; the committed lock, downloader, licenses, training code, model card and bounded model/report make the experiment reproducible. `python3 tools/ml/download_sources.py` downloads only pinned list files, checks exact bytes/hash, refuses redirects/symlinks/oversize, and never fetches targets found inside a list. `--check-only` performs no writes or network access.

## Evaluation limitations

- Training and validation/test must separate registrable domains and near-duplicate brand families, with the positive source-holdout families reserved before fitting.
- Source overlap, conflicting category labels, dead/re-registered/compromised domains and broad category definitions can all distort results. Mirrors/aggregators are not independent truth sources.
- The seven negative categories provide useful contrasts, including legitimate games/sports, but they do not represent the full distribution of normal browsing or guarantee each target is benign.
- Source-holdout recall on the 480 Indonesian candidates is not overall Indonesian accuracy; the holdout has only positive proxy labels.
- A hostname model cannot inspect page content, hidden gambling pages under an ordinary institutional host, app behavior, package signatures or encrypted traffic.
- No app-classification accuracy is established by these domain sources. A suitable independently labelled package/certificate benchmark remains unavailable in this experiment.
- Auto-quarantine remains ineligible without independently adjudicated real-world labels and the acceptance bounds in [the local AI contract](../docs/LOCAL_AI_CONTRACT.md), regardless of impressive feed-proxy metrics.
