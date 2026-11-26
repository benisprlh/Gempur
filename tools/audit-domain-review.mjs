#!/usr/bin/env node
import { constants, openSync, fstatSync, readSync, closeSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export const MAX_BYTES = 1024 * 1024;
const licenses = new Set(['CC-BY-4.0', 'CC-BY-SA-4.0', 'MIT', 'BSD-3-Clause', 'CC0-1.0']);
const partitions = new Set(['train', 'validation', 'test', 'holdout']);
const methods = new Set(['human_asserted', 'proxy', 'automated']);
const labels = new Set(['gambling', 'non_gambling', 'uncertain']);
const token = value => typeof value === 'string' && /^[a-z][a-z0-9_-]{0,47}$/.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const requireValid = condition => { if (!condition) throw new Error('Invalid review manifest'); };
function exactKeys(value, keys) {
  requireValid(value !== null && typeof value === 'object' && !Array.isArray(value));
  requireValid(Object.keys(value).sort().join('|') === [...keys].sort().join('|'));
}
function timestamp(value) {
  requireValid(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value));
  const time = Date.parse(value);
  requireValid(Number.isFinite(time) && new Date(time).toISOString() === value);
  return time;
}

/** Audit declared metadata only. No identities, licenses, labels or independence are certified. */
export function auditManifest(bytes) {
  requireValid(Buffer.isBuffer(bytes) && bytes.length <= MAX_BYTES);
  const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  exactKeys(manifest, ['schemaVersion', 'records']);
  requireValid(manifest.schemaVersion === 1 && Array.isArray(manifest.records) && manifest.records.length <= 2000);
  const ids = new Set(), domains = new Set(), families = new Map();
  const result = {
    schemaVersion: 1,
    inputSha256: createHash('sha256').update(bytes).digest('hex'),
    recordCount: manifest.records.length,
    consensusCandidateCount: 0,
    unresolvedCount: 0,
    consensusCandidateLabels: { gambling: 0, non_gambling: 0 },
    partitionCounts: { train: 0, validation: 0, test: 0, holdout: 0 },
    independentlyVerifiedLabelCount: 0,
    autoQuarantineEligible: false,
    productionRulesChanged: false,
    notice: 'Declared metadata audit only; humans, licenses, content, hash preimages and source/family independence are not verified. No model fitting or production promotion.',
  };
  for (const row of manifest.records) {
    exactKeys(row, ['id', 'domainSha256', 'familySha256', 'sourceId', 'sourceSnapshotSha256', 'datasetLicense', 'observedAt', 'partition', 'reviews']);
    requireValid(token(row.id) && token(row.sourceId));
    requireValid(hash(row.domainSha256) && hash(row.familySha256) && hash(row.sourceSnapshotSha256));
    requireValid(licenses.has(row.datasetLicense) && partitions.has(row.partition));
    requireValid(!ids.has(row.id) && !domains.has(row.domainSha256));
    ids.add(row.id); domains.add(row.domainSha256);
    requireValid(!families.has(row.familySha256) || families.get(row.familySha256) === row.partition);
    families.set(row.familySha256, row.partition);
    const observed = timestamp(row.observedAt), reviewers = new Set();
    requireValid(Array.isArray(row.reviews) && row.reviews.length <= 20);
    for (const review of row.reviews) {
      exactKeys(review, ['reviewerId', 'method', 'label', 'evidenceSha256', 'reviewedAt']);
      requireValid(token(review.reviewerId) && !reviewers.has(review.reviewerId));
      reviewers.add(review.reviewerId);
      requireValid(methods.has(review.method) && labels.has(review.label) && hash(review.evidenceSha256));
      requireValid(timestamp(review.reviewedAt) >= observed);
    }
    result.partitionCounts[row.partition]++;
    const agreed = row.reviews.length >= 2 && row.reviews.every(review =>
      review.method === 'human_asserted' && review.label !== 'uncertain' && review.label === row.reviews[0].label);
    if (agreed) {
      result.consensusCandidateCount++;
      result.consensusCandidateLabels[row.reviews[0].label]++;
    } else result.unresolvedCount++;
  }
  return result;
}

function readBoundedFile(path) {
  const absolute = resolve(path);
  requireValid(realpathSync(absolute) === absolute); // Reject symlink components as well as a symlink file.
  const fd = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = fstatSync(fd);
    requireValid(stat.isFile() && stat.size <= MAX_BYTES);
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let size = 0, count;
    while (size < buffer.length && (count = readSync(fd, buffer, size, buffer.length - size, null)) > 0) size += count;
    requireValid(size <= MAX_BYTES);
    return buffer.subarray(0, size);
  } finally { closeSync(fd); }
}

export function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('Usage: node tools/audit-domain-review.mjs MANIFEST.json\nOffline declared metadata audit; counts only, no label certification or production promotion.\n');
    return 0;
  }
  if (args.length !== 1 || args[0].startsWith('-')) {
    process.stderr.write('Usage: node tools/audit-domain-review.mjs MANIFEST.json\n');
    return 2;
  }
  try {
    process.stdout.write(JSON.stringify(auditManifest(readBoundedFile(args[0]))) + '\n');
    return 0;
  } catch {
    // Never echo file names, row contents, parser errors or reviewer identifiers.
    process.stderr.write('Review manifest rejected: invalid input or unreadable bounded regular file.\n');
    return 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
