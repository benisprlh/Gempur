import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { auditManifest, MAX_BYTES } from './audit-domain-review.mjs';
const digest = letter => letter.repeat(64);
const review = (id, label = 'gambling', method = 'human_asserted') => ({ reviewerId: id, method, label, evidenceSha256: digest('e'), reviewedAt: '2026-11-26T01:00:00.000Z' });
const row = () => ({ id: 'row-a', domainSha256: digest('a'), familySha256: digest('b'), sourceId: 'source-a', sourceSnapshotSha256: digest('c'), datasetLicense: 'CC-BY-4.0', observedAt: '2026-11-26T00:00:00.000Z', partition: 'holdout', reviews: [review('reviewer-a'), review('reviewer-b')] });
const bytes = records => Buffer.from(JSON.stringify({ schemaVersion: 1, records }));
const cli = args => spawnSync(process.execPath, [resolve('tools/audit-domain-review.mjs'), ...args], { encoding: 'utf8', timeout: 5000 });

test('declared consensus remains a candidate and never certifies labels or activation', () => {
  const input = bytes([row()]), result = auditManifest(input);
  assert.equal(result.recordCount, 1); assert.equal(result.consensusCandidateCount, 1);
  assert.equal(result.consensusCandidateLabels.gambling, 1); assert.equal(result.partitionCounts.holdout, 1);
  assert.equal(result.independentlyVerifiedLabelCount, 0); assert.equal(result.autoQuarantineEligible, false); assert.equal(result.productionRulesChanged, false);
  assert.match(result.inputSha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(result).includes('reviewer-a'), false);
  assert.equal(auditManifest(bytes([{ ...row(), reviews: [review('a', 'non_gambling'), review('b', 'non_gambling')] }])).consensusCandidateLabels.non_gambling, 1);
});
test('disagreement uncertain missing and nonhuman reviews stay unresolved', () => {
  for (const reviews of [[], [review('a')], [review('a'), review('b', 'non_gambling')], [review('a', 'uncertain'), review('b', 'uncertain')], [review('a'), review('b', 'gambling', 'proxy')], [review('a'), review('b'), review('c', 'gambling', 'automated')]]) {
    const result = auditManifest(bytes([{ ...row(), reviews }]));
    assert.equal(result.consensusCandidateCount, 0); assert.equal(result.unresolvedCount, 1);
  }
});
test('rejects undeclared raw metadata malformed hashes tokens dates and enums', () => {
  for (const patch of [{ hostname: 'private.example' }, { id: 'person@example.org' }, { domainSha256: 'A'.repeat(64) }, { familySha256: 'x' }, { sourceSnapshotSha256: '' }, { datasetLicense: 'unlicensed' }, { observedAt: '2026-02-30T00:00:00.000Z' }, { partition: 'production' }])
    assert.throws(() => auditManifest(bytes([{ ...row(), ...patch }])));
  for (const patch of [{ screenshot: 'secret' }, { reviewerId: 'Person Name' }, { method: 'llm_human' }, { label: 'safe' }, { evidenceSha256: '' }, { reviewedAt: '2026-11-25T00:00:00.000Z' }])
    assert.throws(() => auditManifest(bytes([{ ...row(), reviews: [{ ...review('a'), ...patch }] }])));
  assert.throws(() => auditManifest(Buffer.from('{"schemaVersion":1,"records":[],"privateData":true}')));
});
test('rejects duplicate IDs domains reviewers and family leakage between partitions', () => {
  assert.throws(() => auditManifest(bytes([row(), { ...row(), domainSha256: digest('d') }])));
  assert.throws(() => auditManifest(bytes([row(), { ...row(), id: 'row-b' }])));
  assert.throws(() => auditManifest(bytes([{ ...row(), reviews: [review('a'), review('a')] }])));
  assert.throws(() => auditManifest(bytes([row(), { ...row(), id: 'row-b', domainSha256: digest('d'), partition: 'train' }])));
  assert.equal(auditManifest(bytes([row(), { ...row(), id: 'row-b', domainSha256: digest('d') }])).recordCount, 2);
});
test('input must be bounded valid UTF8 JSON with bounded records and reviews', () => {
  assert.throws(() => auditManifest(Buffer.alloc(MAX_BYTES + 1)));
  assert.throws(() => auditManifest(Buffer.from([0xff])));
  assert.throws(() => auditManifest(Buffer.from('null')));
  assert.throws(() => auditManifest(bytes(Array(2001).fill(row()))));
  assert.throws(() => auditManifest(bytes([{ ...row(), reviews: Array.from({length: 21}, (_, i) => review('r-' + i)) }])));
});
test('CLI provides generic failures and only aggregate output without raw input', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gempur-review-'));
  try {
    const file = join(dir, 'review.json'); writeFileSync(file, bytes([row()]));
    const good = cli([file]); assert.equal(good.status, 0); assert.equal(good.stderr, '');
    assert.equal(JSON.parse(good.stdout).consensusCandidateCount, 1);
    assert.equal(good.stdout.includes('reviewer-a'), false);
    writeFileSync(file, '{"privateData":"SECRET_MARKER"}');
    const bad = cli([file]); assert.equal(bad.status, 2); assert.equal(bad.stdout, '');
    assert.equal(bad.stderr.includes('SECRET_MARKER'), false); assert.equal(bad.stderr.includes(dir), false);
    assert.equal(cli(['--help']).status, 0); assert.equal(cli([]).status, 2); assert.equal(cli(['--unknown']).status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('CLI rejects oversized files directories and symlinks including parent symlinks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gempur-review-'));
  try {
    const file = join(dir, 'review.json'), link = join(dir, 'link.json');
    writeFileSync(file, Buffer.alloc(MAX_BYTES + 1)); assert.equal(cli([file]).status, 2);
    writeFileSync(file, bytes([])); symlinkSync(file, link); assert.equal(cli([link]).status, 2);
    assert.equal(cli([dir]).status, 2);
    if (process.platform === 'linux') {
      const fifo = join(dir, 'fifo');
      assert.equal(spawnSync('mkfifo', [fifo]).status, 0);
      assert.equal(cli([fifo]).status, 2);
    }
    const parent = join(dir, 'parent'); symlinkSync(dir, parent); assert.equal(cli([join(parent, 'review.json')]).status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
