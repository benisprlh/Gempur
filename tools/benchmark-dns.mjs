#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function parseOptions(args) {
  if (args.length === 1 && args[0] === '--help') return { help: true };
  if (!args.length) return { samples: 5000 };
  if (args.length !== 2 || args[0] !== '--samples' || !/^[1-9][0-9]{2,5}$/.test(args[1])) throw new Error('Use --samples 100..100000 or --help');
  const samples = Number(args[1]);
  if (samples < 100 || samples > 100000) throw new Error('Samples must be 100..100000');
  return { samples };
}
function inputHashes(paths) {
  return paths.map(path => {
    if (!lstatSync(join(root, path)).isFile() || lstatSync(join(root, path)).isSymbolicLink()) throw new Error('Regular source inputs required');
    const bytes = readFileSync(join(root, path));
    return { path, bytes: bytes.length, sha256: hash(bytes) };
  });
}
export function benchmark({ samples }) {
  const engine = 'android/engine/src/main/java/id/gempur/engine';
  const model = 'android/app/src/privateDebug/assets/ml/domain-model.tsv';
  const manifest = 'android/app/src/privateDebug/assets/ml/manifest.json';
  const harness = 'tools/perf/DnsEngineBenchmark.java';
  const sources = readdirSync(join(root, engine)).filter(name => name.endsWith('.java')).sort().map(name => `${engine}/${name}`);
  const paths = [...sources, harness, model, manifest, 'tools/benchmark-dns.mjs'];
  const inputs = inputHashes(paths);
  const modelManifest = JSON.parse(readFileSync(join(root, manifest), 'utf8'));
  const modelInput = inputs.find(input => input.path === model);
  if (modelInput.sha256 !== modelManifest.modelSha256 || modelInput.bytes !== modelManifest.modelBytes) throw new Error('Model does not match its pinned manifest');
  const env = Object.fromEntries(['PATH', 'JAVA_HOME', 'SystemRoot', 'WINDIR'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  env.LANG = 'C.UTF-8'; // No inherited JVM agents, options, proxy credentials or application secrets.
  const executable = name => process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', name + (process.platform === 'win32' ? '.exe' : '')) : name;
  const run = (name, args, timeout = 120000) => execFileSync(executable(name), args, { env, cwd: root, encoding: 'utf8', timeout, maxBuffer: 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const version = run('java', ['--version']).split(/\r?\n/)[0];
  if (!/^(?:openjdk|java) 17(?:\.| )/.test(version) || !/^javac 17\./.test(run('javac', ['-version']))) throw new Error('Full JDK17 required');
  const temporary = mkdtempSync(join(tmpdir(), 'gempur-dns-benchmark-'));
  try {
    run('javac', ['--release', '17', '-d', temporary, ...sources.map(path => join(root, path)), join(root, harness)]);
    const result = JSON.parse(run('java', ['-cp', temporary, 'DnsEngineBenchmark', join(root, model), String(samples)]));
    if (JSON.stringify(inputs) !== JSON.stringify(inputHashes(paths))) throw new Error('Benchmark inputs changed during execution');
    return { schemaVersion: 1, kind: 'HOST_TIMING_DIAGNOSTIC', createdAt: new Date().toISOString(),
      java: version, os: process.platform, arch: process.arch, inputs, fixturesSha256: hash(JSON.stringify(result.fixtures)),
      ...result, limits: ['Host HotSpot JVM only; not Android ART, live DNS latency, network, battery, notification or detection accuracy evidence',
        'Fixed synthetic corpus and cyclic order; no websites, sockets, ADB, accounts or participant data',
        'No Android RuleRepository/cache/VPN/vault/consent path measured; uncached model prediction in isolation',
        'Single process/run, warmup20000 per stage, timer/dispatch/GC/JIT/host noise included; p99 is descriptive, not a release threshold or rigorous JMH/performance stability evidence',
        'Model load is one observation including file read and parsing, not a repeated cold-load distribution'] };
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let options;
  try { options = parseOptions(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 2; }
  if (options) {
    if (options.help) console.log(JSON.stringify({ usage: 'node tools/benchmark-dns.mjs [--samples 100..100000]', java: 'JDK17 via JAVA_HOME or PATH', limits: 'Offline host microbenchmark only; redirect JSON to ignored out/perf/' }));
    else try { console.log(JSON.stringify(benchmark(options), null, 2)); }
    catch { console.error('Benchmark failed; check JDK17, intact model/source inputs and local toolchain. No result accepted.'); process.exitCode = 1; }
  }
}
