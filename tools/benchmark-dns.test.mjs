import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { parseOptions } from './benchmark-dns.mjs';

test('benchmark input bounds disallow arbitrary paths, device access and unbounded workloads', () => {
  for (const args of [['--samples', '0'], ['--samples', '99'], ['--samples', '100001'], ['--samples', '1e5'], ['--samples', '0100'], ['--samples', '100', 'extra'], ['--input', '/private/data'], ['--adb']]) assert.throws(() => parseOptions(args));
  assert.deepEqual(parseOptions([]), { samples: 5000 });
  assert.deepEqual(parseOptions(['--samples', '100']), { samples: 100 });
  assert.deepEqual(parseOptions(['--samples', '100000']), { samples: 100000 });
});
test('benchmark help needs no SDK, device or JDK', () => {
  const raw = execFileSync(process.execPath, ['tools/benchmark-dns.mjs', '--help'], { env: { ...process.env, JAVA_HOME: '/nonexistent-jdk' }, encoding: 'utf8' });
  assert.match(JSON.parse(raw).limits, /host microbenchmark/);
});
test('invalid benchmark arguments fail before attempting a JDK', () => {
  assert.throws(() => execFileSync(process.execPath, ['tools/benchmark-dns.mjs', '--input', '/private/data'], { env: { ...process.env, JAVA_HOME: '/nonexistent-jdk' }, stdio: 'pipe' }), error => error.status === 2 && error.stdout.length === 0);
});
