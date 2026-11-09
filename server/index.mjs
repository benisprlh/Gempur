import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.mjs';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 8080);
const publicOrigin = process.env.PUBLIC_ORIGIN || '';
if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !publicOrigin.startsWith('https://')) {
  throw new Error('Remote binding requires PUBLIC_ORIGIN=https://your-owned-host and a TLS reverse proxy.');
}
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const directory = resolve(process.env.DATA_DIR || './data');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const privateMonitoringEnabled=process.env.GEMPUR_PRIVATE_MONITORING==='true';
const app = createApp({ dbPath: resolve(directory, 'gempur.sqlite'), publicOrigin,privateMonitoringEnabled });
const server = createServer(app.handler);
server.listen(port, host, () => console.log(`Gempur companion listening on ${host}:${port}. ${privateMonitoringEnabled?'Private opt-in detection sharing is enabled; participants must grant scopes separately.':'Automatic detection sharing is disabled.'}`));
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { app.close(); process.exit(0); }));
}
