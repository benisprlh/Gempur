import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { startPrivateLab } from './private-lab.mjs';

async function fixture(t) {
  const lab = await startPrivateLab(0);
  t.after(async () => {
    await lab.close();
    rmSync(lab.directory, { recursive: true, force: true });
  });
  return lab;
}

test('private lab serves health over loopback using its own database', async t => {
  const first = await fixture(t);
  const second = await fixture(t);
  assert.notEqual(first.directory, second.directory);
  assert.equal(new URL(first.endpoint).hostname, '127.0.0.1');
  assert.ok(existsSync(join(first.directory, 'gempur.sqlite')));
  const health = await fetch(first.endpoint + '/api/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).privateMonitoringEnabled, true);
  await first.close();
  assert.ok(existsSync(join(first.directory, 'gempur.sqlite')));
});

test('private lab fails when the selected port is already in use', async t => {
  const lab = await fixture(t);
  await assert.rejects(startPrivateLab(Number(new URL(lab.endpoint).port)), { code: 'EADDRINUSE' });
  assert.equal((await fetch(lab.endpoint + '/api/health')).status, 200);
});
