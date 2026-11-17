import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = fileURLToPath(new URL('./sign-private-upgrade.mjs', import.meta.url));

function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', timeout: 5_000 });
}

function fixture(t) {
  const out = join(root, 'out');
  mkdirSync(out, { recursive: true });
  const directory = mkdtempSync(join(out, 'sign-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const evidence = join(directory, 'partial.json');
  writeFileSync(evidence, '{"mode":"quick","status":"PARTIAL"}');
  return { output: join(directory, 'new.apk'), evidence };
}

test('private signing refuses partial evidence without leaving an output APK', t => {
  const { output, evidence } = fixture(t);
  const result = run(evidence, 'old.apk', output);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /fresh full PASS/);
  assert.equal(existsSync(output), false);
});

test('private signing preserves existing files and rejects external APK destinations', t => {
  const { output, evidence } = fixture(t);
  writeFileSync(output, 'existing fixture');
  const existing = run(evidence, 'old.apk', output);
  assert.equal(existing.status, 1, existing.stderr);
  assert.match(existing.stderr, /Output already exists/);
  assert.equal(readFileSync(output, 'utf8'), 'existing fixture');
  const outside = run(evidence, 'old.apk', join(root, 'outside-sign-test.apk'));
  assert.equal(outside.status, 1, outside.stderr);
  assert.match(outside.stderr, /under the ignored out directory/);
});
