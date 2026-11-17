#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, linkSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { comparePrivateApks, inspectApk } from './check-private-upgrade.mjs';
import { checkEvidence, noSymlinkSegments } from './verification-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STORE_PASSWORD = 'GEMPUR_PRIVATE_STORE_PASSWORD';
const KEY_PASSWORD = 'GEMPUR_PRIVATE_KEY_PASSWORD';

function signUpgrade(evidencePath, oldApk, outputPath) {
  const output = resolve(outputPath);
  if (!output.startsWith(join(root, 'out') + sep) || !output.toLowerCase().endsWith('.apk')) {
    throw new Error('Choose a new APK path under the ignored out directory.');
  }
  noSymlinkSegments(root, output);
  if (existsSync(output)) throw new Error('Output already exists. Choose a new path.');

  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  if (!checkEvidence(root, evidence).valid) throw new Error('A fresh full PASS matching this checkout and its build artifacts is required.');
  const artifact = evidence.artifacts.find(item => item.kind === 'private-debug-apk');
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk) throw new Error('Set ANDROID_HOME or ANDROID_SDK_ROOT to the SDK with Build Tools 35.0.0.');
  const java = process.env.JAVA_HOME
    ? join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
  const toolEnv = { LANG: 'C' };
  for (const name of ['PATH', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TMP', 'TEMP', 'TMPDIR']) {
    if (process.env[name] !== undefined) toolEnv[name] = process.env[name];
  }
  const previous = inspectApk(oldApk, sdk, java, toolEnv);
  const keystore = process.env.GEMPUR_PRIVATE_STORE_FILE;
  const alias = process.env.GEMPUR_PRIVATE_KEY_ALIAS;
  if (!keystore || !isAbsolute(keystore) || !alias || !process.env[STORE_PASSWORD] || !process.env[KEY_PASSWORD]) {
    throw new Error('Provide all four GEMPUR_PRIVATE signing variables in the key holder environment.');
  }
  const storeFile = realpathSync(keystore);
  const keyPathWithinRepo = relative(realpathSync(root), storeFile);
  if (!isAbsolute(keyPathWithinRepo) && keyPathWithinRepo !== '..' && !keyPathWithinRepo.startsWith('..' + sep)) {
    throw new Error('Keep the private keystore outside the repository.');
  }

  const scratch = mkdtempSync(join(dirname(output), '.gempur-sign-'));
  try {
    const copied = join(scratch, 'input.apk');
    const signed = join(scratch, 'signed.apk');
    copyFileSync(resolve(root, artifact.path), copied);
    const input = inspectApk(copied, sdk, java, toolEnv);
    if (input.apkSha256 !== artifact.sha256) throw new Error('Private APK does not match the verified build.');
    if (input.versionCode <= previous.versionCode) throw new Error('Candidate version code must be higher.');

    const result = spawnSync(java, ['-jar', join(sdk, 'build-tools', '35.0.0', 'lib', 'apksigner.jar'),
      'sign', '--ks', storeFile, '--ks-key-alias', alias,
      '--ks-pass', 'env:' + STORE_PASSWORD, '--key-pass', 'env:' + KEY_PASSWORD,
      '--v4-signing-enabled', 'false', '--out', signed, copied], {
      env: { ...toolEnv, [STORE_PASSWORD]: process.env[STORE_PASSWORD], [KEY_PASSWORD]: process.env[KEY_PASSWORD] },
      stdio: 'ignore', timeout: 30_000, windowsHide: true,
    });
    if (result.status !== 0) throw new Error('APK signing failed. Check the selected keystore, alias, passwords, and SDK.');
    const candidate = inspectApk(signed, sdk, java, toolEnv);
    const comparison = comparePrivateApks(previous, candidate);
    if (!comparison.compatible || candidate.versionCode !== input.versionCode) {
      throw new Error('Signed candidate does not match the installed APK signer or expected version.');
    }

    noSymlinkSegments(root, output);
    linkSync(signed, output); // Create without overwriting an existing artifact, even on concurrent runs.
    return { ...comparison, inputApkSha256: input.apkSha256, sourceSha256: evidence.source.before.sha256 };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const args = process.argv.slice(2);
if (args.length !== 3 || args.some(arg => arg.startsWith('-'))) {
  console.error('Usage: node tools/sign-private-upgrade.mjs EVIDENCE.json OLD_PRIVATE.apk out/NEW_PRIVATE.apk');
  process.exitCode = 2;
} else {
  try {
    console.log(JSON.stringify(signUpgrade(...args), null, 2));
  } catch (error) {
    console.error(error.code === 'EEXIST' ? 'Output already exists. Choose a new path.' :
      error.status === undefined && error.code === undefined && !(error instanceof SyntaxError)
        ? error.message : 'Could not verify, sign, or write the APK. Check the local inputs and toolchain.');
    process.exitCode = 1;
  }
}
