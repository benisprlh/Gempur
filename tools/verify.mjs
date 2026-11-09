#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve, relative, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceFingerprint, parseTap, parseJUnit, parseLint, requireFresh, artifact, assess, checkEvidence, sanitizeLog, noSymlinkSegments, sha256 } from './verification-core.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
if(args[0]==='--check-evidence' && args.length===2){
  try{const evidence=JSON.parse(readFileSync(resolve(args[1]),'utf8'));const result=checkEvidence(root,evidence);console.log(JSON.stringify(result));process.exit(result.valid?0:1);}
  catch{console.log(JSON.stringify({valid:false,mergeEligible:false,failures:['Evidence could not be read or validated']}));process.exit(1);}
}
if(args.some(arg=>arg!=='--quick')||args.length>1){console.error('Usage: node tools/verify.mjs [--quick] | --check-evidence <file>');process.exit(2);}
const mode=args.includes('--quick')?'quick':'full';
const startedAtMs=Date.now(),runId=new Date(startedAtMs).toISOString().replace(/[-:.]/g,'')+'-'+randomBytes(3).toString('hex');
const output=resolve(root,'out','verify',runId),logs=resolve(output,'logs');mkdirSync(logs,{recursive:true,mode:0o700});
const evidence={schemaVersion:1,runId,mode,startedAt:new Date(startedAtMs).toISOString(),finishedAt:null,status:'FAIL',mergeEligible:false,
  source:{before:null,after:null,unchanged:false},commands:[],tests:{},lint:null,reports:[],artifacts:[],errors:[],
  limits:{emulatorExecuted:false,physicalDeviceTested:false,playApproved:false,productionSigningAttempted:false},
  notice:'Local operator-generated evidence; not an independent CI attestation, device validation, or Play approval.'};
const allowedEnv=new Set(['PATH','JAVA_HOME','ANDROID_HOME','ANDROID_SDK_ROOT','ANDROID_USER_HOME','ANDROID_SDK_HOME','GRADLE_USER_HOME','GRADLE_OPTS','JAVA_OPTS','JAVA_TOOL_OPTIONS','JDK_JAVA_OPTIONS','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','SystemRoot','SYSTEMROOT','ComSpec','COMSPEC','PATHEXT','TMP','TEMP','TMPDIR','LANG','LANGUAGE','LC_ALL','LC_CTYPE','TZ','TERM','NO_COLOR','XDG_CONFIG_HOME','XDG_CACHE_HOME','XDG_DATA_HOME','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy','SSL_CERT_FILE','SSL_CERT_DIR','REQUESTS_CA_BUNDLE','CURL_CA_BUNDLE','NODE_EXTRA_CA_CERTS']);
const childEnv=Object.fromEntries(Object.entries(process.env).filter(([name])=>allowedEnv.has(name)));
childEnv.NO_COLOR='1'; // Do not pass upload-signing, connector, API, or other unrelated credentials to builds/tests.

function run(id,program,commandArgs,timeout=120_000,validate=null){
  console.log(`Running ${id}…`);
  const start=Date.now();let executable=program,actualArgs=commandArgs;
  if(process.platform==='win32'&&/\.(?:bat|cmd)$/i.test(program)){
    if(/["%&|<>!^\r\n]/.test(program)||commandArgs.some(arg=>/[^A-Za-z0-9_.:/=\-]/.test(arg)))throw new Error('Use a development checkout path without shell-special characters on Windows');
    executable=process.env.ComSpec||'cmd.exe';actualArgs=['/d','/s','/c',`""${program}" ${commandArgs.join(' ')}"`];
  }
  const result=spawnSync(executable,actualArgs,{cwd:root,env:childEnv,encoding:'utf8',timeout,maxBuffer:64*1024*1024,windowsHide:true});
  const text=sanitizeLog(String(result.stdout||'')+'\n'+String(result.stderr||''));
  const logPath=relative(root,resolve(logs,`${id}.log`)).replaceAll('\\','/');
  writeFileSync(resolve(root,logPath),text,{mode:0o600});
  const command={id,program:basename(program),arguments:commandArgs.map(arg=>sanitizeLog(arg)),exitCode:result.status??1,
    durationMs:Date.now()-start,logPath,logBytes:Buffer.byteLength(text),logSha256:sha256(Buffer.from(text)),timedOut:result.error?.code==='ETIMEDOUT',validationPassed:true};
  if(result.error)command.errorCode=result.error.code||'SPAWN_ERROR';
  evidence.commands.push(command);
  if(command.exitCode!==0){command.validationPassed=false;throw new Error(`${id} failed (${command.timedOut?'timeout':command.exitCode}); inspect its local log`);}
  if(validate)try{validate(text);}catch(error){command.validationPassed=false;throw error;}
  console.log(`${id}: PASS`);return text;
}
function filesIn(directory,predicate){
  if(!existsSync(directory))return [];
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const path=join(directory,entry.name);
    if(entry.isSymbolicLink())throw new Error('Unexpected symbolic-link test report');
    return entry.isDirectory()?filesIn(path,predicate):entry.isFile()&&predicate(path)?[path]:[];
  });
}
function report(path){
  noSymlinkSegments(root,path);const stats=requireFresh(path,startedAtMs);const bytes=readFileSync(path);
  evidence.reports.push({path:relative(root,path).replaceAll('\\','/'),bytes:bytes.length,sha256:sha256(bytes),modifiedAt:new Date(stats.mtimeMs).toISOString()});
  return bytes.toString('utf8');
}
function junitGroup(directory){
  const paths=filesIn(resolve(root,directory),path=>basename(path).startsWith('TEST-')&&path.endsWith('.xml'));
  if(!paths.length)throw new Error(`Fresh JUnit reports missing: ${directory}`);
  const total={tests:0,failures:0,errors:0,skipped:0};
  for(const path of paths){const counts=parseJUnit(report(path));for(const key of Object.keys(total))total[key]+=counts[key];}
  return total;
}
function cleanGenerated(path){
  const absolute=resolve(root,path);noSymlinkSegments(root,absolute);
  rmSync(absolute,{force:true,recursive:true});if(existsSync(absolute))throw new Error('A stale build output could not be removed');
}
try{
  evidence.source.before=sourceFingerprint(root);
  run('node-version',process.execPath,['--version'],30_000,text=>{if(!/^v24\./m.test(text))throw new Error('Node.js 24 is required');});
  const testFiles=[...filesIn(resolve(root,'server/test'),path=>path.endsWith('.test.mjs')),
    ...filesIn(resolve(root,'tools'),path=>path.endsWith('.test.mjs'))].sort().map(path=>relative(root,path));
  if(!testFiles.length)throw new Error('No Node test files found');
  const tap=run('node-tests',process.execPath,['--test','--test-reporter=tap',...testFiles],120_000);
  evidence.tests.node=parseTap(tap);
  if(mode==='full'){
    const java=process.env.JAVA_HOME?resolve(process.env.JAVA_HOME,'bin',process.platform==='win32'?'java.exe':'java'):'java';
    run('java-version',java,['-version'],30_000,text=>{if(!/(?:openjdk|java) version "17\./.test(text))throw new Error('A full JDK 17 installation is required');});
    const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;
    if(!sdk||!existsSync(resolve(sdk,'platforms/android-36/android.jar')))throw new Error('ANDROID_HOME/ANDROID_SDK_ROOT must contain SDK platform 36');
    const apksigner=resolve(sdk,'build-tools/35.0.0',process.platform==='win32'?'apksigner.bat':'apksigner');
    if(!existsSync(apksigner))throw new Error('Android build-tools 35.0.0 with apksigner is required');
    const gradle=process.env.GEMPUR_GRADLE||resolve(root,'android',process.platform==='win32'?'gradlew.bat':'gradlew');
    run('gradle-version',gradle,['--version'],120_000,text=>{if(!/^Gradle 8\.11\.1\s*$/m.test(text))throw new Error('Pinned Gradle 8.11.1 is required');});
    for(const path of ['android/engine/build/test-results/test','android/app/build/test-results/testDebugUnitTest','android/app/build/reports/lint-results-debug.xml',
      'android/app/build/outputs/apk/debug/app-debug.apk','android/app/build/outputs/bundle/release/app-release.aab','android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'])cleanGenerated(path);
    run('android-build',gradle,['-p','android','--no-daemon','--console=plain','--rerun-tasks','--no-build-cache',':engine:test',':app:testDebugUnitTest',':app:lintDebug',':app:assembleDebug',':app:bundleRelease',':app:assembleDebugAndroidTest'],20*60_000);
    evidence.tests.engine=junitGroup('android/engine/build/test-results/test');
    evidence.tests.androidClient=junitGroup('android/app/build/test-results/testDebugUnitTest');
    evidence.lint=parseLint(report(resolve(root,'android/app/build/reports/lint-results-debug.xml')));
    if(evidence.lint.errors)throw new Error('Android lint has errors');
    evidence.artifacts=[artifact(root,'android/app/build/outputs/apk/debug/app-debug.apk','debug-apk',startedAtMs),
      artifact(root,'android/app/build/outputs/bundle/release/app-release.aab','release-aab',startedAtMs),
      artifact(root,'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk','instrumentation-apk',startedAtMs)];
    run('apk-signature',apksigner,['verify','--verbose','--print-certs','android/app/build/outputs/apk/debug/app-debug.apk'],30_000,text=>{
      if(!/^Verifies\s*$/m.test(text))throw new Error('APK signature verification did not confirm success');
    });
  }
}catch(error){evidence.errors.push(sanitizeLog(error.message));}
finally{
  try{evidence.source.after=sourceFingerprint(root);evidence.source.unchanged=evidence.source.before?.sha256===evidence.source.after.sha256;}
  catch(error){evidence.errors.push(sanitizeLog(error.message));}
  if(!evidence.source.unchanged)evidence.errors.push('Source inputs changed during verification or could not be compared');
  evidence.finishedAt=new Date().toISOString();evidence.status=assess(evidence);evidence.mergeEligible=evidence.status==='PASS'&&mode==='full';
  const path=resolve(output,'evidence.json');writeFileSync(path,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({status:evidence.status,mergeEligible:evidence.mergeEligible,evidencePath:relative(root,path).replaceAll('\\','/'),tests:evidence.tests,errors:evidence.errors}));
  process.exitCode=evidence.status==='FAIL'?1:0;
}
