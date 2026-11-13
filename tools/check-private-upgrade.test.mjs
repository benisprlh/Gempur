import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePrivateApks, parsePrivateApk } from './check-private-upgrade.mjs';

const badging = (code, name = 'id.gempur.app.private.debug') =>
  `package: name='${name}' versionCode='${code}' versionName='fixture'`;
const cert = digest => `Number of signers: 1\nSigner #1 certificate SHA-256 digest: ${digest}\n`;
const previous = parsePrivateApk(badging(6), cert('a'.repeat(64)));

test('accepts higher private version with the same verified signing certificate', () => {
  assert.equal(comparePrivateApks(previous, parsePrivateApk(badging(7), cert('a'.repeat(64)))).compatible, true);
});

test('blocks mismatched signing certificate and same or lower version code', () => {
  const result = comparePrivateApks(previous, parsePrivateApk(badging(6), cert('b'.repeat(64))));
  assert.equal(result.compatible, false);
  assert.equal(result.blockers.length, 2);
  assert.equal(comparePrivateApks(previous, parsePrivateApk(badging(5), cert('a'.repeat(64)))).compatible, false);
});

test('rejects the ordinary package, missing version, and ambiguous certificate output', () => {
  assert.throws(() => parsePrivateApk(badging(7, 'id.gempur.app.debug'), cert('a'.repeat(64))), /privateDebug/);
  assert.throws(() => parsePrivateApk(badging(''), cert('a'.repeat(64))), /version code/);
  assert.throws(() => parsePrivateApk(badging(7), ''), /exactly one/);
  assert.throws(() => parsePrivateApk(badging(7), cert('a'.repeat(64)) + cert('b'.repeat(64))), /exactly one/);
});
