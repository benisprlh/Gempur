# Gambling rules: evidence before activation

Gempur's first Android build has a deliberately limited bundled starter. The files in `candidates/` are **research input, not active rules**. No candidate becomes active merely because it appears in an upstream list, its name contains a gambling word, or its DNS/WHOIS record is live.

## Research snapshot — 9 November 2026

| Source | Verified licensing/scope | Decision |
| --- | --- | --- |
| [arfshl/anti-gambling-domains](https://github.com/arfshl/anti-gambling-domains) | BSD-3-Clause; upstream describes Indonesian-targeted gambling domains collected through the maintainer's own exploration. Snapshot pinned to commit `f96fee6ab791b7eaa9a6a85c437f19f39abecc79`; latest repo push observed 15 September 2026. | Imported for review only. Exact source 9,054 bytes; 480 normalized candidates, 30 rejected entries. This is not independently verified current Indonesian coverage. |
| [StevenBlack gambling-only](https://github.com/StevenBlack/hosts/tree/master/alternates/gambling-only) | Project MIT notice; gambling extensions cite MIT sources BigDargon and Sinfonietta. BigDargon's header describes Vietnamese-language gambling. | Candidate global comparison, not imported or enabled. Do not confuse `gambling-only` with `gambling`, which also includes the base ads/malware list. |
| [HaGeZi gambling](https://github.com/hagezi/dns-blocklists#gambling) | Repository LICENSE is GPL-3.0. Separate full/medium/mini gambling lists; mini is selected using popular-domain data according to upstream. | Not imported or enabled. Resolve distribution/license obligations and memory/false-positive costs before reuse. |
| [Komdigi TrustPositif context](https://www.komdigi.go.id/berita/pengumuman/detail/melindungi-keluarga-dari-konten-negatif-dunia-maya) | Official context describes negative-content filtering broader than gambling. | An unclassified TrustPositif mirror must not be relabeled gambling-only. Official origin does not establish a data-reuse license or per-domain category. |

Sources were read through the official repositories; no gambling domain was visited, DNS-tested, or used to wager. DNS liveness and a category claim are different forms of evidence. The Indonesian snapshot includes IP literals, shared CDN tenants, and names that could represent compromised legitimate websites. Rejecting obvious hazards reduces risk; it does not verify the remaining categories.

The exact source and retained license are in `sources/` and `licenses/`. Snapshot SHA-256 and the normalized candidate SHA-256 are recorded in `candidates/indonesia-2026-11-09.manifest.json`. Retrieval precision is one day because the connector did not retain an exact source retrieval timestamp. `recordedAt` is the actual local ingestion metadata creation time.

## Offline import

Requires Node 24. It reads a supplied source snapshot; it never fetches the listed domains or downloads a feed implicitly.

```sh
node tools/rules.mjs import \
  --input rules/sources/arfshl-domains-2026-11-09.txt \
  --source-url https://raw.githubusercontent.com/arfshl/anti-gambling-domains/f96fee6ab791b7eaa9a6a85c437f19f39abecc79/domains.txt \
  --source-revision f96fee6ab791b7eaa9a6a85c437f19f39abecc79 \
  --license BSD-3-Clause \
  --license-file rules/licenses/arfshl-BSD-3-Clause.txt \
  --retrieved-at 2026-11-09T00:00:00Z \
  --output /tmp/gempur-candidate
```

The timestamp above supplies a known retrieval **date**, not a claim that retrieval occurred at midnight. Output files use exclusive creation to avoid silently overwriting an existing audit record. Inputs support bare domains and standard loopback/null-address hosts lines. Output is sorted, unique, and IDNA-normalized. IP literals, wildcard expressions, URLs, malformed labels, known public suffixes, essential services, and a seed of shared-hosting suffixes are rejected with reasons. The protected seed is defense in depth and is **not** a complete Public Suffix List or a claim that all shared infrastructure is detected.

## Review and promotion

1. Verify source licensing and preservation requirements for the exact snapshot.
2. Review a diff against the last accepted set. Identify official category evidence, potential re-registration, compromised legitimate sites, shared hosting, redirectors, and false positives. Do not open gambling pages or place wagers during this workflow.
3. Test against benign services and boundary/subdomain fixtures; conduct real-device tests separately.
4. Copy `review-template.json` outside the generated candidate folder and explicitly fill `reviewedBy`, `reviewedAt`, and a **selected** `approvedDomains` array. Empty reviews fail. Do not set approval to the full list without completing review.
5. The review binds the SHA-256 of the original source bytes. A changed source invalidates the review. Human metadata is an audit statement; the signing tool does not manufacture evidence that a person reviewed a domain.
6. If the app imports third-party domains, include the source's copyright/license and attribution in the app distribution and source tree. The compact signed payload does not replace licensing material.

## Signed bundle

The Android importer and this tool use exactly:

```json
{"version":1,"generatedAt":"2026-11-09T00:00:00Z","domains":["blocked.example"]}
```

The payload is serialized UTF-8 JSON. The envelope is `{"payload":"<base64 exact bytes>","signature":"<base64 RSA signature>"}`. Signature algorithm: RSA PKCS#1 v1.5 with SHA-256, compatible with Java `SHA256withRSA`. A version must be a positive integer; the device rejects non-increasing versions. Maximums: 100,000 rules and a 5 MiB payload. The generation date is metadata, not a guarantee of current category coverage.

```sh
node tools/rules.mjs bundle \
  --input rules/sources/arfshl-domains-2026-11-09.txt \
  --review /secure/reviewed-selection.json \
  --version 1 \
  --generated-at 2026-11-09T00:00:00Z \
  --private-key /secure/gempur-rules-private.pem \
  --output /tmp/gempur-rules-envelope.json

node tools/rules.mjs verify \
  --input /tmp/gempur-rules-envelope.json \
  --public-key /secure/gempur-rules-public.pem \
  --minimum-version 0
```

Use the real generation timestamp in an operational bundle. The tool accepts an existing RSA private key of at least 3,072 bits located outside this repository; it does not generate a production key. Only the corresponding approved X.509 SPKI public key may be pinned in the app. Do not put a private key in a public CI artifact, commit, script argument containing key content, or build log. An unsigned demonstration file is not a production update. This repo currently contains no production-signed Indonesia bundle, approval review, or release private key.

## Tests

```sh
node --test tools/rules.test.mjs
```

Tests cover normalization, suffix boundaries, shared-host/essential-service rejection, exact-snapshot review binding, explicit subset selection, signature tampering, wrong key, and version rollback. RSA fixtures are generated only in test memory and are never saved. These tests establish tooling behavior, not efficacy against all Indonesian gambling sites.

## Next evidence needed

- Source-specific false-positive/currency review and an explicitly approved subset.
- Broader Indonesian evidence with a clear reuse license and maintainable removal process.
- A maintained Public Suffix List integration rather than relying on the seed guardlist.
- Measured memory/lookup performance on target Android devices before increasing to large feeds.
- Production key ownership, rotation/revocation procedure, and an approved public key.
- A tested signed-update recovery path and a distribution review for the final implementation.
