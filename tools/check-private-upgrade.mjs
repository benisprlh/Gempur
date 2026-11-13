#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256 } from './verification-core.mjs';

const PRIVATE_PACKAGE = 'id.gempur.app.private.debug';

export function parsePrivateApk(badging, certificates) {
  const packages = badging.split(/\r?\n/).filter(line => line.startsWith('package: '));
  const packageName = packages[0]?.match(/\bname='([^']+)'/)?.[1];
  const versionCode = Number(packages[0]?.match(/\bversionCode='([0-9]+)'/)?.[1]);
  if (packages.length !== 1 || packageName !== PRIVATE_PACKAGE
      || !Number.isSafeInteger(versionCode) || versionCode < 1) {
    throw new Error('Expected privateDebug APK with a valid version code');
  }
  const signers = [...certificates.matchAll(/^Signer #\d+ certificate SHA-256 digest: ([a-f0-9]{64})\s*$/gim)];
  if (signers.length !== 1 || !/^Number of signers: 1\s*$/m.test(certificates)) {
    throw new Error('Expected exactly one APK signer with a SHA-256 certificate digest');
  }
  return { packageName, versionCode, signerSha256: signers[0][1].toLowerCase() };
}

export function comparePrivateApks(previous, candidate) {
  const blockers = [];
  if (previous.signerSha256 !== candidate.signerSha256) blockers.push('Signer certificate differs');
  if (candidate.versionCode <= previous.versionCode) blockers.push('Candidate version code must be higher');
  return { compatible: blockers.length === 0, blockers, previous, candidate };
}

function inspectApk(path, sdk, java) {
  const apk = resolve(path);
  const digest = sha256(readFileSync(apk));
  const buildTools = join(sdk, 'build-tools', '35.0.0');
  const options = { encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true };
  const certificates = execFileSync(java,
    ['-jar', join(buildTools, 'lib', 'apksigner.jar'), 'verify', '--verbose', '--print-certs', apk], options);
  const badging = execFileSync(join(buildTools, process.platform === 'win32' ? 'aapt2.exe' : 'aapt2'),
    ['dump', 'badging', apk], options);
  if (digest !== sha256(readFileSync(apk))) throw new Error('APK changed during inspection');
  return { ...parsePrivateApk(badging, certificates), apkSha256: digest };
}

function main(args) {
  if (args.length !== 2 || args.some(arg => arg.startsWith('-'))) {
    console.error('Usage: node tools/check-private-upgrade.mjs OLD_PRIVATE.apk NEW_PRIVATE.apk');
    return 2;
  }
  try {
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    if (!sdk) throw new Error('Set ANDROID_HOME or ANDROID_SDK_ROOT to SDK with build-tools 35.0.0');
    const java = process.env.JAVA_HOME
      ? join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
    const result = comparePrivateApks(inspectApk(args[0], sdk, java), inspectApk(args[1], sdk, java));
    console.log(JSON.stringify(result, null, 2));
    return result.compatible ? 0 : 1;
  } catch (error) {
    console.error(error.status === undefined && error.code === undefined
      ? error.message : 'Could not inspect APK. Verify APK paths, signatures, JDK and build-tools 35.0.0.');
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
