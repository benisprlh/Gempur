import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import { rmSync } from 'node:fs';
import { checkPrivateLab } from './check-private-lab.mjs';
import { startPrivateLab } from './private-lab.mjs';

const serials = ['participant-fixture', 'companion-fixture'];
const header = 'List of devices attached\r\n';
const healthy = async () => ({ privateMonitoringEnabled: true, localDomainAiSignals: true });

test('checks host health and existing reverse mappings for only the two selected roles', async t => {
  const lab = await startPrivateLab(0);
  t.after(async () => {
    await lab.close();
    rmSync(lab.directory, { recursive: true, force: true });
  });
  const port = Number(new URL(lab.endpoint).port);
  const calls = [];
  const result = await checkPrivateLab(serials, port, async args => {
    calls.push(args);
    if (args[0] === 'devices') return header + serials.map(id => id + '\tdevice').join('\r\n');
    return `(reverse) tcp:${port} tcp:${port}\r\n(reverse) localabstract:other tcp:9090\r\n`;
  });
  assert.deepEqual(result, {
    ready: true, backend: 'private_enabled', localDomainAiSignals: true,
    devices: [{ role: 'participant', status: 'matched' }, { role: 'companion', status: 'matched' }],
  });
  assert.deepEqual(calls, [['devices'], ...serials.map(id => ['-s', id, 'reverse', '--list'])]);
});

test('distinguishes an unauthorized device and a mapping to the wrong host port', async () => {
  const result = await checkPrivateLab(serials, 8080, async args => {
    if (args[0] === 'devices') return header + serials[0] + '\tunauthorized\n' + serials[1] + '\tdevice\n';
    assert.deepEqual(args, ['-s', serials[1], 'reverse', '--list']);
    return 'UsbFfs tcp:8080 tcp:8081\n';
  }, healthy);
  assert.equal(result.ready, false);
  assert.deepEqual(result.devices.map(device => device.status), ['unauthorized', 'reverse_mismatch']);
});

test('keeps missing mappings and absent devices separate from backend capability', async () => {
  const result = await checkPrivateLab(serials, 8080, async args =>
    args[0] === 'devices' ? header + serials[0] + '\tdevice\n' : '',
  async () => ({ privateMonitoringEnabled: 'true', localDomainAiSignals: true }));
  assert.equal(result.ready, false);
  assert.equal(result.backend, 'private_not_enabled');
  assert.equal(result.localDomainAiSignals, false);
  assert.deepEqual(result.devices.map(device => device.status), ['reverse_missing', 'not_listed']);
});

test('redacts tool failures and rejects invalid inputs before probing either endpoint', async () => {
  const fail = async () => { throw new Error('synthetic private diagnostic'); };
  const result = await checkPrivateLab(serials, 8080, fail, fail);
  assert.equal(result.ready, false);
  assert.equal(result.backend, 'unavailable');
  assert.deepEqual(result.devices.map(device => device.status), ['adb_unavailable', 'adb_unavailable']);
  assert.doesNotMatch(JSON.stringify(result), /synthetic private diagnostic/);
  await assert.rejects(checkPrivateLab([serials[0], serials[0]], 8080, fail, fail), /two distinct/);
  await assert.rejects(checkPrivateLab(['-s', serials[1]], 8080, fail, fail), /two distinct/);
  await assert.rejects(checkPrivateLab(serials, 65_536, fail, fail), /TCP port/);
});

test('reaches the local lab without using an environment proxy', async t => {
  const lab = await startPrivateLab(0);
  t.after(async () => {
    await lab.close();
    rmSync(lab.directory, { recursive: true, force: true });
  });
  let requests = 0;
  const proxy = createServer((req, res) => {
    requests++;
    res.writeHead(502).end();
  });
  proxy.on('connect', (req, socket) => {
    requests++;
    socket.destroy();
  });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => proxy.close(resolve)));
  const port = Number(new URL(lab.endpoint).port);
  const moduleUrl = new URL('./check-private-lab.mjs', import.meta.url).href;
  const address = 'http://127.0.0.1:' + proxy.address().port;
  const program = `
    import { checkPrivateLab } from ${JSON.stringify(moduleUrl)};
    const result = await checkPrivateLab(${JSON.stringify(serials)}, ${port}, async () => '');
    console.log(result.backend);
  `;
  const { stdout } = await promisify(execFile)(process.execPath, ['--use-env-proxy', '--input-type=module', '-e', program], {
    env: { ...process.env, HTTP_PROXY: address, http_proxy: address, NO_PROXY: '', no_proxy: '' },
    timeout: 8_000,
  });
  assert.equal(stdout.trim(), 'private_enabled');
  assert.equal(requests, 0);
});
