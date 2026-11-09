import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { REQUIRED_STAGES, MAX_EVIDENCE_AGE_MS, sourceFingerprint, parseTap, parseJUnit, parseLint, requireFresh, artifact, assess, checkEvidence, sanitizeLog, sha256, zipEntryNames } from './verification-core.mjs';

const tap='# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
const junit='<testsuite tests="2" failures="0" errors="0" skipped="0"><testcase name="one"/><testcase name="two"/></testsuite>';
const lint='<?xml version="1.0"?><issues format="6"></issues>';
function temporary(t){const root=mkdtempSync(join(tmpdir(),'gempur-verify-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}
function put(root,path,bytes){const absolute=join(root,path);mkdirSync(dirname(absolute),{recursive:true});writeFileSync(absolute,bytes);return absolute;}
// Minimal directory fixtures exercise the verifier's ZIP metadata parser; these are not executable APKs.
function zip(names){
  const entries=names.map(name=>{const text=Buffer.from(name),header=Buffer.alloc(46);header.writeUInt32LE(0x02014b50);header.writeUInt16LE(text.length,28);return Buffer.concat([header,text]);});
  const central=Buffer.concat(entries),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(names.length,8);end.writeUInt16LE(names.length,10);end.writeUInt32LE(central.length,12);
  return Buffer.concat([central,end]);
}
function fixture(t){
  const root=temporary(t);for(const dir of ['android','server','web','tools','rules'])mkdirSync(join(root,dir));
  put(root,'server/main.mjs','export const version=1;');
  const startedAt=Date.now()-1000,finishedAt=Date.now()+1000;
  const evidence={schemaVersion:1,mode:'full',status:'PASS',mergeEligible:true,startedAt:new Date(startedAt).toISOString(),finishedAt:new Date(finishedAt).toISOString(),
    commands:REQUIRED_STAGES.map(id=>({id,exitCode:0,validationPassed:true})),tests:{node:parseTap(tap),engine:parseJUnit(junit),androidClient:parseJUnit(junit)},lint:parseLint(lint),reports:[],artifacts:[],errors:[]};
  for(const [path,raw]of [
    ['android/engine/build/test-results/test/TEST-engine.xml',junit],
    ['android/app/build/test-results/testDebugUnitTest/TEST-client.xml',junit],
    ['android/app/build/reports/lint-results-debug.xml',lint]
  ]){put(root,path,raw);const bytes=Buffer.from(raw);evidence.reports.push({path,bytes:bytes.length,sha256:sha256(bytes)});}
  const logPath='out/verify/fixture/logs/node-tests.log';put(root,logPath,tap);
  Object.assign(evidence.commands.find(c=>c.id==='node-tests'),{logPath,logBytes:Buffer.byteLength(tap),logSha256:sha256(Buffer.from(tap))});
  for(const [path,kind,names]of [
    ['android/app/build/outputs/apk/debug/app-debug.apk','debug-apk',['AndroidManifest.xml']],
    ['android/app/build/outputs/bundle/release/app-release.aab','release-aab',['base/manifest/AndroidManifest.xml']],
    ['android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk','instrumentation-apk',['AndroidManifest.xml']]
  ]){put(root,path,zip(names));evidence.artifacts.push(artifact(root,path,kind,startedAt));}
  const before=sourceFingerprint(root);evidence.source={before,after:structuredClone(before),unchanged:true};
  return {root,evidence,now:finishedAt};
}

test('TAP requires executed successful tests and rejects failures, skips and missing summaries',()=>{
  assert.equal(parseTap(tap).tests,2);
  for(const text of ['',tap.replace('# fail 0','# fail 1'),tap.replace('# skipped 0','# skipped 1'),tap.replace('# tests 2','# tests 0'),tap.replace('# pass 2','# pass 1')])assert.throws(()=>parseTap(text));
});
test('JUnit rejects empty, missing, skipped and externally declared results',()=>{
  assert.deepEqual(parseJUnit(junit),{tests:2,failures:0,errors:0,skipped:0});
  for(const xml of ['',junit.replace('tests="2"','tests="0"'),junit.replace(' skipped="0"',''),junit.replace('skipped="0"','skipped="1"'),'<!DOCTYPE testsuite>'+junit])assert.throws(()=>parseJUnit(xml));
});
test('lint distinguishes warnings from fatal errors and rejects missing reports',()=>{
  assert.deepEqual(parseLint('<issues><issue severity="Warning"/><issue severity="Fatal"/><issue severity="Error"/></issues>'),{issues:3,errors:2,warnings:1});
  assert.throws(()=>parseLint(''));
});
test('freshness rejects stale, empty and symbolic-link outputs',t=>{
  const root=temporary(t),now=Date.now(),path=put(root,'output','fresh');
  assert.equal(requireFresh(path,now).size,5);
  utimesSync(path,new Date(now-120000),new Date(now-120000));assert.throws(()=>requireFresh(path,now));
  const empty=put(root,'empty','');assert.throws(()=>requireFresh(empty,now));
  symlinkSync(path,join(root,'link'));assert.throws(()=>requireFresh(join(root,'link'),now));
});
test('source fingerprint changes for source edits but excludes only known generated build roots',t=>{
  const {root}=fixture(t),before=sourceFingerprint(root);
  put(root,'android/app/build/new.bin','generated');put(root,'tools/__pycache__/generated.pyc','generated');
  assert.equal(sourceFingerprint(root).sha256,before.sha256);
  put(root,'server/src/build/feature.mjs','legitimate source');assert.notEqual(sourceFingerprint(root).sha256,before.sha256);
});
test('source fingerprint rejects source symlinks',t=>{
  const {root}=fixture(t);symlinkSync(join(root,'server/main.mjs'),join(root,'server/alias.mjs'));
  assert.throws(()=>sourceFingerprint(root),/symlink/);
});
test('ZIP parser rejects malformed archives and unsigned bundle check rejects signature records',t=>{
  assert.deepEqual(zipEntryNames(zip(['AndroidManifest.xml'])),['AndroidManifest.xml']);
  assert.throws(()=>zipEntryNames(Buffer.from('not a zip')));
  const {root}=fixture(t),path='android/app/build/outputs/bundle/release/app-release.aab';
  put(root,path,zip(['base/manifest/AndroidManifest.xml','META-INF/UPLOAD.RSA']));
  assert.throws(()=>artifact(root,path,'release-aab',Date.now()-10000),/signed/);
  assert.throws(()=>artifact(root,'server/main.mjs','debug-apk',Date.now()-10000),/outside/);
});
test('full assessment fails closed for absent stages, invalid counts and source changes',t=>{
  const {evidence}=fixture(t);assert.equal(assess(evidence),'PASS');
  for(const mutate of [e=>e.commands.pop(),e=>e.commands[0].exitCode=1,e=>delete e.tests.engine.tests,e=>e.tests.node.skipped=1,e=>e.tests.androidClient.tests=0,e=>e.source.unchanged=false,e=>e.errors.push('failed')]){
    const changed=structuredClone(evidence);mutate(changed);assert.equal(assess(changed),'FAIL');
  }
});
test('quick assessment remains PARTIAL and cannot satisfy evidence gate',t=>{
  const {root,evidence,now}=fixture(t);evidence.mode='quick';evidence.status='PARTIAL';evidence.mergeEligible=false;
  assert.equal(assess(evidence),'PARTIAL');assert.equal(checkEvidence(root,evidence,now).valid,false);
});
test('evidence accepts a fresh matching full proof and rejects changed source or old evidence',t=>{
  const {root,evidence,now}=fixture(t);assert.deepEqual(checkEvidence(root,evidence,now).failures,[]);
  assert.equal(checkEvidence(root,evidence,now+MAX_EVIDENCE_AGE_MS+1).valid,false);
  put(root,'server/main.mjs','export const version=2;');assert.match(checkEvidence(root,evidence,now).failures.join(' '),/source/);
});
test('evidence rejects stale or changed artifacts and duplicate output records',t=>{
  const {root,evidence,now}=fixture(t),path=join(root,evidence.artifacts[0].path),original=readFileSync(path);
  writeFileSync(path,Buffer.concat([original,Buffer.from('changed')]));assert.equal(checkEvidence(root,evidence,now).valid,false);
  writeFileSync(path,original);utimesSync(path,new Date(0),new Date(0));assert.equal(checkEvidence(root,evidence,now).valid,false);
  const changed=structuredClone(evidence);changed.artifacts[1]=changed.artifacts[0];assert.equal(checkEvidence(root,changed,now).valid,false);
});
test('evidence rejects report tampering, unsupported counts and missing Node output',t=>{
  const {root,evidence,now}=fixture(t);const changed=structuredClone(evidence);changed.tests.engine.tests=3;
  assert.equal(checkEvidence(root,changed,now).valid,false);
  put(root,evidence.reports[0].path,junit.replace('tests="2"','tests="0"'));assert.equal(checkEvidence(root,evidence,now).valid,false);
  rmSync(join(root,evidence.commands.find(c=>c.id==='node-tests').logPath));assert.equal(checkEvidence(root,evidence,now).valid,false);
});
test('artifact verifier rejects symlinks within Android output paths',t=>{
  const {root,evidence}=fixture(t),item=evidence.artifacts[0],path=join(root,item.path);
  rmSync(path);symlinkSync(put(root,'elsewhere.apk',zip(['AndroidManifest.xml'])),path);
  assert.throws(()=>artifact(root,item.path,item.kind,Date.now()-10000),/Symbolic/);
});
test('log sanitizer masks known secrets, proxy properties and URL credentials',()=>{
  const output=sanitizeLog('token=secretvalue -Dhttps.proxyPassword=proxy-pass https://name:pass@example.org',{API_TOKEN:'secretvalue'});
  assert.equal(output.includes('secretvalue'),false);assert.equal(output.includes('proxy-pass'),false);assert.equal(output.includes('name:pass'),false);
  const options='-Dorg.gradle.project.repoPassword=synthetic-review-secret';
  assert.equal(sanitizeLog(`Picked up JAVA_TOOL_OPTIONS: ${options}`,{JAVA_TOOL_OPTIONS:options}).includes('synthetic-review-secret'),false);
  assert.equal(sanitizeLog(options,{}).includes('synthetic-review-secret'),false);
});
