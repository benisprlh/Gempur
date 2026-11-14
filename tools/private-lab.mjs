#!/usr/bin/env node
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createApp } from '../server/app.mjs';

export async function startPrivateLab(port = 8080) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid lab port');
  const directory = mkdtempSync(join(tmpdir(), 'gempur-private-lab-'));
  let app;
  let server;
  try {
    app = createApp({ dbPath: join(directory, 'gempur.sqlite'), privateMonitoringEnabled: true });
    server = createServer({ requestTimeout: 15_000, headersTimeout: 10_000, keepAliveTimeout: 5_000 }, app.handler);
    await new Promise((accept, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', reject);
        accept();
      });
    });
  } catch (error) {
    try {
      app?.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    throw error;
  }
  let closing;
  function close() {
    closing ??= new Promise((accept, reject) => {
      server.close(error => {
        try {
          app.close();
          if (error) reject(error);
          else accept();
        } catch (failure) {
          reject(failure);
        }
      });
    });
    return closing;
  }
  return { endpoint: 'http://127.0.0.1:' + server.address().port, directory, close };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const argument = process.argv[2];
  if (process.argv.length > 3 || (argument !== undefined && !/^\d{1,5}$/.test(argument))) {
    console.error('Usage: node tools/private-lab.mjs [PORT]');
    process.exitCode = 2;
  } else {
    try {
      const lab = await startPrivateLab(argument === undefined ? 8080 : Number(argument));
      console.log('Endpoint lab: ' + lab.endpoint);
      console.log('Direktori data lab: ' + lab.directory);
      console.log('Gunakan akun uji. Ctrl+C menghentikan server. Direktori dipertahankan untuk diperiksa atau dihapus oleh operator.');
      const stop = () => lab.close().catch(error => {
        console.error('Gagal menghentikan server lab: ' + (error.code || error.name));
        process.exitCode = 1;
      });
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    } catch (error) {
      console.error('Gagal memulai server lab: ' + (error.code || error.message));
      process.exitCode = 1;
    }
  }
}
