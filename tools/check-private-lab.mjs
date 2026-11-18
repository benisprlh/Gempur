#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { Agent, get } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const roles = ['participant', 'companion'];

async function adb(args) {
  const { stdout } = await exec('adb', args, { timeout: 5_000, maxBuffer: 256 * 1024, windowsHide: true });
  return stdout;
}

async function health(port) {
  const agent = new Agent();
  try {
    return await new Promise((resolve, reject) => {
      const request = get({
        hostname: '127.0.0.1', port, path: '/api/health', agent,
        signal: AbortSignal.timeout(3_000),
      }, response => {
        if (response.statusCode !== 200) {
          reject(new Error('Health request did not return HTTP 200'));
          response.destroy();
          return;
        }
        const chunks = [];
        let size = 0;
        response.on('error', reject);
        response.on('data', chunk => {
          size += chunk.length;
          if (size > 16_384) response.destroy(new Error('Health response too large'));
          else chunks.push(chunk);
        });
        response.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
          catch (error) { reject(error); }
        });
      });
      request.on('error', reject);
    });
  } finally {
    agent.destroy();
  }
}

function rows(output) {
  return output.trim().split(/\r?\n/).filter(Boolean).map(line => line.trim().split(/\s+/));
}

export async function checkPrivateLab(serials, port = 8080, readAdb = adb, readHealth = health) {
  if (serials.length !== 2 || serials[0] === serials[1] || serials.some(id => !/^[a-z0-9][a-z0-9_.:-]{0,127}$/i.test(id))
      || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Choose two distinct ADB serials and a TCP port from 1 to 65535.');
  }
  const [devices, backend] = await Promise.allSettled([readAdb(['devices']), readHealth(port)]);
  const endpoint = `tcp:${port}`;
  const deviceChecks = await Promise.all(serials.map(async (serial, index) => {
    let status = 'adb_unavailable';
    if (devices.status === 'fulfilled') {
      const matches = rows(devices.value).filter(row => row[0] === serial);
      const state = matches[0]?.[1];
      if (matches.length === 0) status = 'not_listed';
      else if (matches.length !== 1) status = 'ambiguous';
      else if (state === 'unauthorized' || state === 'offline') status = state;
      else if (state !== 'device') status = 'transport_not_ready';
      else {
        try {
          const output = await readAdb(['-s', serial, 'reverse', '--list']);
          const mappings = rows(output).filter(row => row[1] === endpoint);
          status = mappings.length === 0 ? 'reverse_missing'
            : mappings.length === 1 && mappings[0].length === 3 && mappings[0][2] === endpoint
              ? 'matched' : 'reverse_mismatch';
        } catch {
          status = 'reverse_unavailable';
        }
      }
    }
    return { role: roles[index], status };
  }));

  const backendStatus = backend.status === 'rejected' ? 'unavailable'
    : backend.value?.privateMonitoringEnabled === true ? 'private_enabled' : 'private_not_enabled';
  return {
    ready: backendStatus === 'private_enabled' && deviceChecks.every(device => device.status === 'matched'),
    backend: backendStatus,
    localDomainAiSignals: backendStatus === 'private_enabled' && backend.value.localDomainAiSignals === true,
    devices: deviceChecks,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length < 2 || args.length > 3 || (args[2] !== undefined && !/^\d{1,5}$/.test(args[2]))) {
    console.error('Usage: node tools/check-private-lab.mjs PARTICIPANT_SERIAL COMPANION_SERIAL [PORT]');
    process.exitCode = 2;
  } else {
    try {
      const result = await checkPrivateLab(args.slice(0, 2), args[2] === undefined ? 8080 : Number(args[2]));
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.ready ? 0 : 1;
    } catch (error) {
      console.error(error.message);
      process.exitCode = 2;
    }
  }
}
