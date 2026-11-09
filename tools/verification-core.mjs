import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { resolve, relative, sep, isAbsolute } from 'node:path';

export const REQUIRED_STAGES = ['node-version', 'node-tests', 'java-version', 'gradle-version', 'android-build', 'apk-signature', 'private-apk-signature'];
export const DISTRIBUTION_REPORTS = {
  releaseManifest:'android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml',
  debugManifest:'android/app/build/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml',
  privateManifest:'android/app/build/intermediates/merged_manifests/privateDebug/processPrivateDebugManifest/AndroidManifest.xml',
  releaseBuildConfig:'android/app/build/generated/source/buildConfig/release/id/gempur/app/BuildConfig.java',
  debugBuildConfig:'android/app/build/generated/source/buildConfig/debug/id/gempur/app/BuildConfig.java',
  privateBuildConfig:'android/app/build/generated/source/buildConfig/privateDebug/id/gempur/app/BuildConfig.java'
};
export const MAX_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000;
const EXCLUDED_DIRS = new Set(['android/.gradle','android/build','android/app/build','android/engine/build','server/data','server/coverage']);
const EXCLUDED_FILES = /(?:^\.env(?:\.|$)|^local\.properties$|\.(?:sqlite(?:-wal|-shm)?|db|log|jks|keystore|key|apk|aab|pyc)$)/i;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function inside(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
}
export function sourceFingerprint(root) {
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name))) {
      const path = resolve(directory, entry.name), rel = relative(root,path).split(sep).join('/');
      if (EXCLUDED_DIRS.has(rel) || ['node_modules','.git','.gradle','__pycache__'].includes(entry.name) || EXCLUDED_FILES.test(entry.name)) continue;
      if (entry.isSymbolicLink()) throw new Error(`Source symlink is not accepted: ${rel}`);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) {
        if (entry.name.endsWith('.pem') && rel !== 'android/app/src/main/assets/rules-public.pem') continue;
        const bytes=readFileSync(path);files.push({path:rel,bytes:bytes.length,sha256:sha256(bytes)});
      }
    }
  }
  for (const dir of ['android','server','web','tools','rules']) visit(resolve(root,dir));
  files.sort((a,b)=>a.path.localeCompare(b.path));
  return { sha256:sha256(Buffer.from(JSON.stringify(files.map(({path,sha256})=>[path,sha256])))),files };
}
export function parseTap(text) {
  const value = key => {
    const matches=[...text.matchAll(new RegExp(`^# ${key} (\\d+)\\r?$`,'gm'))];
    if(!matches.length)throw new Error(`TAP summary missing ${key}`);
    return Number(matches.at(-1)[1]);
  };
  const result={tests:value('tests'),pass:value('pass'),fail:value('fail'),cancelled:value('cancelled'),skipped:value('skipped'),todo:value('todo')};
  if(result.tests<1 || result.pass!==result.tests || result.fail || result.cancelled || result.skipped || result.todo)throw new Error('Node tests did not all execute successfully');
  return result;
}
export function parseJUnit(xml) {
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('Unexpected XML declarations');
  const root=xml.match(/<testsuite\b([^>]*)>/);
  if(!root)throw new Error('JUnit testsuite missing');
  const attrs=Object.fromEntries([...root[1].matchAll(/([A-Za-z]+)=["']([^"']*)["']/g)].map(m=>[m[1],m[2]]));
  const counts={};
  for(const key of ['tests','failures','errors','skipped']){
    if(!/^\d+$/.test(attrs[key]||''))throw new Error(`JUnit count missing or invalid: ${key}`);
    counts[key]=Number(attrs[key]);
  }
  if(counts.tests<1 || counts.failures || counts.errors || counts.skipped)throw new Error('JUnit tests did not all execute successfully');
  return counts;
}
export function parseLint(xml) {
  if(!/<issues\b/.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('Lint XML missing');
  const issues=[...xml.matchAll(/<issue\b([^>]*)>/g)];
  const errorCount=issues.filter(m=>/severity=["'](?:Error|Fatal)["']/.test(m[1])).length;
  return {issues:issues.length,errors:errorCount,warnings:issues.length-errorCount};
}
/** Checks generated variant boundaries, not an assurance of Google Play eligibility. */
export function parseDistribution(reports) {
  const field=(source,name)=>{
    const found=[...String(source).matchAll(new RegExp(`public\\s+static\\s+final\\s+boolean\\s+${name}\\s*=\\s*(true|false)\\s*;`,'g'))];
    if(found.length!==1)throw new Error('Generated distribution flag missing or ambiguous');
    return found[0][1]==='true';
  };
  const applicationId=source=>{
    const found=String(source).match(/public\s+static\s+final\s+String\s+APPLICATION_ID\s*=\s*"([^"]+)"\s*;/);
    if(!found)throw new Error('Generated application ID missing');return found[1];
  };
  for(const key of ['releaseManifest','debugManifest','privateManifest']){
    if(!/<manifest\b/.test(reports[key]||'')||/<!DOCTYPE|<!ENTITY/i.test(reports[key]))throw new Error('Merged manifest missing or invalid');
    if(/android\.permission\.QUERY_ALL_PACKAGES/.test(reports[key]))throw new Error('Broad package inventory permission is not permitted in any distribution');
  }
  const privateNames=['PrivateAutomationService','PrivateAppGuardService'];
  for(const variant of ['release','debug']){
    if(field(reports[variant+'BuildConfig'],'PRIVATE_BUILD'))throw new Error('Ordinary build enables private monitoring');
    if(privateNames.some(name=>reports[variant+'Manifest'].includes(name)))throw new Error('Ordinary manifest exposes private monitoring');
  }
  if(!field(reports.privateBuildConfig,'PRIVATE_BUILD'))throw new Error('Private build does not enable its private flag');
  const expected={release:'id.gempur.app',debug:'id.gempur.app.debug',private:'id.gempur.app.private.debug'};
  for(const [variant,id] of Object.entries(expected))if(applicationId(reports[variant+'BuildConfig'])!==id)throw new Error('Distribution application IDs are not isolated');
  const manifest=reports.privateManifest;
  const queries=manifest.match(/<queries\b[^>]*>([\s\S]*?)<\/queries>/)?.[1];
  if(!queries||!/<intent\b[^>]*>[\s\S]*?<action\b[^>]*android:name="android\.intent\.action\.MAIN"[^>]*\/>[\s\S]*?<category\b[^>]*android:name="android\.intent\.category\.LAUNCHER"[^>]*\/>[\s\S]*?<\/intent>/.test(queries))throw new Error('Private launchable-app query declaration missing');
  for(const name of privateNames)if(!manifest.includes(name))throw new Error('Private service declaration missing');
  const service=manifest.match(/<service\b[^>]*android:name="[^"]*PrivateAppGuardService"[^>]*>/)?.[0];
  const monitor=manifest.match(/<service\b[^>]*android:name="[^"]*PrivateAutomationService"[^>]*>/)?.[0];
  if(!service||!service.includes('android.permission.BIND_ACCESSIBILITY_SERVICE')||!/android:exported="true"/.test(service))throw new Error('Private accessibility service is not permission protected');
  if(!monitor||!/android:exported="false"/.test(monitor)||!/android:foregroundServiceType="specialUse"/.test(monitor))throw new Error('Private automation service is not isolated and visible');
  return {ordinaryMonitoringDisabled:true,privateMonitoringEnabled:true,ordinaryManifestIsolated:true,privateManifestDeclared:true,targetedAppVisibility:true,applicationIds:expected};
}
export function requireFresh(path, startedAtMs, finishedAtMs=Date.now()) {
  const s=lstatSync(path);
  if(s.isSymbolicLink() || !s.isFile() || s.size===0)throw new Error('Missing, empty or symbolic-link build output');
  if(s.mtimeMs<startedAtMs-1000 || s.mtimeMs>finishedAtMs+60_000)throw new Error('Build output is stale or has an invalid timestamp');
  return s;
}
export function noSymlinkSegments(root,path) {
  if(!inside(root,path))throw new Error('Path escapes repository');
  let current=resolve(root);
  for(const segment of relative(root,path).split(sep)){
    current=resolve(current,segment);
    try{if(lstatSync(current).isSymbolicLink())throw new Error('Symbolic-link output path is not accepted');}
    catch(error){if(error.code==='ENOENT')return;throw error;}
  }
}
export function zipEntryNames(bytes) {
  let end=-1;
  for(let at=bytes.length-22;at>=Math.max(0,bytes.length-65557);at--)if(bytes.readUInt32LE(at)===0x06054b50){end=at;break;}
  if(end<0)throw new Error('ZIP end record missing');
  const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),offset=bytes.readUInt32LE(end+16);
  if(count===0xffff || size===0xffffffff || offset===0xffffffff || offset+size>end)throw new Error('Unsupported or malformed ZIP directory');
  const names=[];let at=offset;
  for(let i=0;i<count;i++){
    if(at+46>offset+size || bytes.readUInt32LE(at)!==0x02014b50)throw new Error('Malformed ZIP directory entry');
    const length=bytes.readUInt16LE(at+28),extra=bytes.readUInt16LE(at+30),comment=bytes.readUInt16LE(at+32);
    if(at+46+length+extra+comment>offset+size)throw new Error('Truncated ZIP directory entry');
    names.push(bytes.subarray(at+46,at+46+length).toString('utf8'));at+=46+length+extra+comment;
  }
  return names;
}
export function artifact(root,path,kind,startedAtMs) {
  const absolute=resolve(root,path),allowed=resolve(root,'android/app/build/outputs');
  if(!inside(allowed,absolute) || !/\.(?:apk|aab)$/.test(path))throw new Error('Artifact path is outside Android build outputs');
  noSymlinkSegments(root,absolute);
  requireFresh(absolute,startedAtMs);
  const bytes=readFileSync(absolute),names=zipEntryNames(bytes);
  if(!names.length)throw new Error('Empty artifact');
  let signing='development';
  if(kind==='release-aab'){
    if(names.some(name=>/^META-INF\/.*\.(?:RSA|DSA|EC)$/i.test(name)))throw new Error('Development verifier unexpectedly produced a signed release AAB');
    if(!names.includes('base/manifest/AndroidManifest.xml'))throw new Error('AAB manifest missing');
    signing='unsigned';
  }else if(!names.includes('AndroidManifest.xml'))throw new Error('APK manifest missing');
  return {path:path.split(sep).join('/'),kind,bytes:bytes.length,sha256:sha256(bytes),signing};
}
export function assess(evidence) {
  if(!Array.isArray(evidence.commands)||!evidence.commands.length||evidence.commands.some(c=>c.exitCode!==0||c.validationPassed===false) || evidence.source?.unchanged!==true || evidence.source.before?.sha256!==evidence.source.after?.sha256 || !Array.isArray(evidence.errors)||evidence.errors.length)return 'FAIL';
  if(evidence.mode==='quick')return 'PARTIAL';
  if(REQUIRED_STAGES.some(id=>!evidence.commands.some(c=>c.id===id&&c.exitCode===0)))return 'FAIL';
  const n=evidence.tests?.node;
  if(!n||!Number.isSafeInteger(n.tests)||n.tests<1||n.pass!==n.tests||['fail','skipped','cancelled','todo'].some(key=>n[key]!==0))return 'FAIL';
  for(const group of ['engine','androidClient','privateAndroidClient']){
    const counts=evidence.tests?.[group];
    if(!counts||!Number.isSafeInteger(counts.tests)||counts.tests<1||counts.failures!==0||counts.errors!==0||counts.skipped!==0)return 'FAIL';
  }
  if(!evidence.lint || evidence.lint.errors!==0||!Number.isSafeInteger(evidence.lint.issues)||evidence.lint.issues<0||evidence.lint.warnings!==evidence.lint.issues)return 'FAIL';
  if(!evidence.privateLint || evidence.privateLint.errors!==0||!Number.isSafeInteger(evidence.privateLint.issues)||evidence.privateLint.issues<0||evidence.privateLint.warnings!==evidence.privateLint.issues)return 'FAIL';
  if(!evidence.distribution||['ordinaryMonitoringDisabled','privateMonitoringEnabled','ordinaryManifestIsolated','privateManifestDeclared','targetedAppVisibility'].some(key=>evidence.distribution[key]!==true))return 'FAIL';
  if(!Array.isArray(evidence.artifacts)||evidence.artifacts.length!==4)return 'FAIL';
  return 'PASS';
}
export function checkEvidence(root,evidence,now=Date.now()) {
  const failures=[];
  if(evidence.schemaVersion!==2 || evidence.mode!=='full' || evidence.status!=='PASS' || evidence.mergeEligible!==true)failures.push('Evidence is not a full PASS');
  if(!Number.isFinite(Date.parse(evidence.finishedAt)) || Date.parse(evidence.finishedAt)>now+60_000 || now-Date.parse(evidence.finishedAt)>MAX_EVIDENCE_AGE_MS)failures.push('Evidence is stale or has invalid finish time');
  if(!Number.isFinite(Date.parse(evidence.startedAt)) || Date.parse(evidence.startedAt)>Date.parse(evidence.finishedAt))failures.push('Evidence start time invalid');
  try{if(assess(evidence)!=='PASS')failures.push('Required stages, results or unchanged-source proof missing');}catch{failures.push('Evidence structure invalid');}
  try{const source=sourceFingerprint(root);if(source.sha256!==evidence.source?.before?.sha256 || source.sha256!==evidence.source?.after?.sha256)failures.push('Current source does not match tested source');}catch{failures.push('Current source cannot be fingerprinted');}
  const counts={engine:{tests:0,failures:0,errors:0,skipped:0},androidClient:{tests:0,failures:0,errors:0,skipped:0},privateAndroidClient:{tests:0,failures:0,errors:0,skipped:0}};
  const reportsSeen=new Set(),distributionReports={};let lintSeen=false,privateLintSeen=false;
  for(const item of evidence.reports||[]){
    try{
      const absolute=resolve(root,item.path);noSymlinkSegments(root,absolute);requireFresh(absolute,Date.parse(evidence.startedAt),Date.parse(evidence.finishedAt));
      const raw=readFileSync(absolute);
      if(reportsSeen.has(item.path)||raw.length!==item.bytes||sha256(raw)!==item.sha256)throw new Error('Report hash mismatch');
      reportsSeen.add(item.path);
      const group=item.path.startsWith('android/engine/build/test-results/test/TEST-')?'engine':item.path.startsWith('android/app/build/test-results/testDebugUnitTest/TEST-')?'androidClient':item.path.startsWith('android/app/build/test-results/testPrivateDebugUnitTest/TEST-')?'privateAndroidClient':null;
      if(group&&item.path.endsWith('.xml')){const parsed=parseJUnit(raw.toString('utf8'));for(const key of Object.keys(counts[group]))counts[group][key]+=parsed[key];}
      else if(item.path==='android/app/build/reports/lint-results-debug.xml'){
        lintSeen=true;const parsed=parseLint(raw.toString('utf8'));
        if(JSON.stringify(parsed)!==JSON.stringify(evidence.lint))throw new Error('Lint result mismatch');
      }else if(item.path==='android/app/build/reports/lint-results-privateDebug.xml'){
        privateLintSeen=true;const parsed=parseLint(raw.toString('utf8'));
        if(JSON.stringify(parsed)!==JSON.stringify(evidence.privateLint))throw new Error('Private lint result mismatch');
      }else {
        const key=Object.entries(DISTRIBUTION_REPORTS).find(([,path])=>path===item.path)?.[0];
        if(!key)throw new Error('Unexpected report');distributionReports[key]=raw.toString('utf8');
      }
    }catch{failures.push('Report missing, stale, changed or invalid');}
  }
  for(const group of Object.keys(counts))if(counts[group].tests<1||Object.keys(counts[group]).some(key=>counts[group][key]!==evidence.tests?.[group]?.[key]))failures.push(`JUnit report counts do not match: ${group}`);
  if(!lintSeen)failures.push('Lint report missing');
  if(!privateLintSeen)failures.push('Private lint report missing');
  try{const distribution=parseDistribution(distributionReports);if(JSON.stringify(distribution)!==JSON.stringify(evidence.distribution))throw new Error('Distribution proof mismatch');}catch{failures.push('Distribution boundaries missing, changed or invalid');}
  try{
    const command=evidence.commands.find(item=>item.id==='node-tests');
    if(!command||!/^out\/verify\/[^/]+\/logs\/node-tests\.log$/.test(command.logPath))throw new Error('Node log missing');
    const absolute=resolve(root,command.logPath);noSymlinkSegments(root,absolute);requireFresh(absolute,Date.parse(evidence.startedAt),Date.parse(evidence.finishedAt));
    const raw=readFileSync(absolute),parsed=parseTap(raw.toString('utf8'));
    if(raw.length!==command.logBytes||sha256(raw)!==command.logSha256||Object.keys(parsed).some(key=>parsed[key]!==evidence.tests?.node?.[key]))throw new Error('Node log changed');
  }catch{failures.push('Node test log missing, stale, changed or invalid');}
  const expected=new Map([
    ['debug-apk','android/app/build/outputs/apk/debug/app-debug.apk'],
    ['private-debug-apk','android/app/build/outputs/apk/privateDebug/app-privateDebug.apk'],
    ['release-aab','android/app/build/outputs/bundle/release/app-release.aab'],
    ['instrumentation-apk','android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk']
  ]);
  const seen=new Set();
  for(const item of evidence.artifacts||[]){
    if(expected.get(item.kind)!==item.path || seen.has(item.kind)){failures.push('Unexpected or duplicate artifact');continue;}
    seen.add(item.kind);
    try{
      const current=artifact(root,item.path,item.kind,Date.parse(evidence.startedAt));
      if(current.sha256!==item.sha256 || current.bytes!==item.bytes || current.signing!==item.signing)failures.push(`Artifact mismatch: ${item.kind}`);
    }catch{failures.push(`Artifact missing, stale or invalid: ${item.kind}`);}
  }
  if(seen.size!==4)failures.push('Required artifacts missing');
  return {valid:failures.length===0,status:evidence.status||'INVALID',mergeEligible:failures.length===0,failures};
}
export function sanitizeLog(text,env=process.env) {
  let output=String(text);
  for(const [name,value]of Object.entries(env))if(value&&value.length>=4&&/(?:TOKEN|SECRET|PASSWORD|AUTHORIZATION|PROXY|KEYSTORE|^(?:JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS|JAVA_OPTS|GRADLE_OPTS)$)/i.test(name))output=output.split(value).join('<redacted>');
  return output.replace(/((?:https?|socks)\.proxy(?:Host|Port|User|Password)=)[^\s]+/gi,'$1<redacted>')
    .replace(/(-D[^\s=]*(?:password|secret|token|credential|authorization)[^\s=]*=)[^\s]+/gi,'$1<redacted>')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g,'$1<redacted>@');
}
