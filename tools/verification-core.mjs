import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { resolve, relative, sep, isAbsolute } from 'node:path';
import { inflateRawSync } from 'node:zlib';

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
  for (const dir of ['android','server','web','tools','rules','ml']) visit(resolve(root,dir));
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
/** Extract one bounded stored/deflated entry; duplicate names are rejected. */
export function zipEntryBytes(bytes, name, limit=2*1024*1024) {
  let end=-1;
  for(let at=bytes.length-22;at>=Math.max(0,bytes.length-65557);at--)if(bytes.readUInt32LE(at)===0x06054b50){end=at;break;}
  if(end<0)throw new Error('ZIP end record missing');
  const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),offset=bytes.readUInt32LE(end+16);
  if(count===0xffff||size===0xffffffff||offset===0xffffffff||offset+size>end)throw new Error('Unsupported ZIP directory');
  let at=offset,found=null;
  for(let i=0;i<count;i++){
    if(at+46>offset+size||bytes.readUInt32LE(at)!==0x02014b50)throw new Error('Malformed ZIP directory');
    const length=bytes.readUInt16LE(at+28),extra=bytes.readUInt16LE(at+30),comment=bytes.readUInt16LE(at+32);
    if(at+46+length+extra+comment>offset+size)throw new Error('Truncated ZIP directory');
    const entryName=bytes.subarray(at+46,at+46+length).toString('utf8');
    if(entryName===name){
      if(found)throw new Error('Duplicate ZIP model entry');
      const flags=bytes.readUInt16LE(at+8),method=bytes.readUInt16LE(at+10),compressed=bytes.readUInt32LE(at+20),uncompressed=bytes.readUInt32LE(at+24),local=bytes.readUInt32LE(at+42);
      if(flags&1||![0,8].includes(method)||uncompressed<1||uncompressed>limit||compressed>limit||local+30>offset||bytes.readUInt32LE(local)!==0x04034b50)throw new Error('Unsupported or oversized ZIP model entry');
      if(bytes.readUInt16LE(local+6)!==flags||bytes.readUInt16LE(local+8)!==method)throw new Error('ZIP model compression/flags disagree');
      const localLength=bytes.readUInt16LE(local+26),localExtra=bytes.readUInt16LE(local+28),start=local+30+localLength+localExtra;
      if(start+compressed>offset||bytes.subarray(local+30,local+30+localLength).toString('utf8')!==name)throw new Error('ZIP entry header mismatch');
      const data=bytes.subarray(start,start+compressed);
      found=method===0?Buffer.from(data):inflateRawSync(data,{maxOutputLength:limit});
      if(found.length!==uncompressed)throw new Error('ZIP entry length mismatch');
    }
    at+=46+length+extra+comment;
  }
  if(!found)throw new Error('Required ZIP model entry missing');
  return found;
}
export const ML_ASSET_ROOT='android/app/src/privateDebug/assets/ml';
export const ML_ASSET_FILES=['domain-model.tsv','manifest.json','parity.tsv','NOTICE.txt','LICENSE-CC-BY-SA-4.0.txt'];
const HEX256=/^[a-f0-9]{64}$/;
function requireValue(value,message){if(!value)throw new Error(message);}
function closeNumber(actual,expected){return expected===null?actual===null:Number.isFinite(actual)&&Math.abs(actual-expected)<=1e-10;}
function localBytes(root,path,limit=2*1024*1024){const absolute=resolve(root,path);noSymlinkSegments(root,absolute);const stats=lstatSync(absolute);requireValue(stats.isFile()&&!stats.isSymbolicLink()&&stats.size>0&&stats.size<=limit,'ML input absent, oversized or invalid');return readFileSync(absolute);}
function jsonInput(root,path){return JSON.parse(localBytes(root,path).toString('utf8'));}
/** Independent, bounded parser for the bundled inference representation. */
export function parseMlModel(bytes){
  requireValue(bytes.length>0&&bytes.length<=2*1024*1024&&!bytes.some(byte=>byte>127),'ML model must be bounded ASCII');
  const lines=bytes.toString('ascii').trimEnd().split('\n').map(line=>line.replace(/\r$/,''));
  requireValue(lines.shift()==='GEMPUR_DOMAIN_MODEL_V1','ML model format mismatch');
  const keys=['model_version','min_ngram','max_ngram','intercept','review_threshold','min_coverage','min_matched','auto_quarantine','features'];
  const fields={};for(const key of keys){const parts=(lines.shift()||'').split('\t');requireValue(parts.length===2&&parts[0]===key,'ML model header missing or ambiguous');fields[key]=parts[1];}
  requireValue(/^[a-z0-9.-]{1,80}$/.test(fields.model_version)&&fields.min_ngram==='3'&&fields.max_ngram==='5'&&fields.min_matched==='10'&&Number(fields.min_coverage)===0.30&&fields.auto_quarantine==='false','ML model policy incompatible');
  const intercept=Number(fields.intercept),threshold=Number(fields.review_threshold),count=Number(fields.features);
  requireValue(Number.isFinite(intercept)&&Math.abs(intercept)<=100&&Number.isFinite(threshold)&&threshold>=0&&threshold<=1&&Number.isSafeInteger(count)&&count>=1&&count<=24000&&lines.length===count,'ML model numeric bounds invalid');
  const features=new Map();for(const line of lines){const parts=line.split('\t'),weight=Number(parts[1]);requireValue(parts.length===2&&/^[a-z0-9.^$-]{3,5}$/.test(parts[0])&&!features.has(parts[0])&&Number.isFinite(weight)&&Math.abs(weight)<=100,'ML feature invalid, duplicate or nonfinite');features.set(parts[0],weight);}
  return {version:fields.model_version,intercept,threshold,features};
}
function asciiPrediction(model,raw){
  const domain=raw.trim().toLowerCase().replace(/\.$/,'');
  const labels=domain.split('.');
  if(domain.length>253||labels.length<2||/^\d+(?:\.\d+){3}$/.test(domain)||labels.some(label=>!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))return {score:null,matched:0,total:0,abstained:true,flagged:false};
  const text='^'+domain+'$',ngrams=new Set();for(let length=3;length<=5;length++)for(let at=0;at+length<=text.length;at++)ngrams.add(text.slice(at,at+length));
  let logit=model.intercept,matched=0;for(const gram of ngrams)if(model.features.has(gram)){logit+=model.features.get(gram);matched++;}
  const score=logit>=0?1/(1+Math.exp(-logit)):Math.exp(logit)/(1+Math.exp(logit));
  const abstained=matched<10||matched/ngrams.size<0.30;
  return {score,matched,total:ngrams.size,abstained,flagged:!abstained&&model.threshold<1&&score>=model.threshold};
}
/** ASCII numerical parity is independently checked here; full IDNA parity is exercised by Java tests. */
export function checkMlParity(model,bytes){
  requireValue(bytes.length>0&&bytes.length<=512*1024,'ML parity input size invalid');
  const lines=bytes.toString('utf8').trimEnd().split('\n').map(line=>line.replace(/\r$/,''));
  requireValue(lines.shift()==='domain\tscore\tmatched\ttotal\tabstained\tflagged'&&lines.length>=20&&lines.length<=1000,'ML parity cases missing');
  let asciiChecked=0;for(const line of lines){
    const parts=line.split('\t');requireValue(parts.length===6&&/^\d+$/.test(parts[2])&&/^\d+$/.test(parts[3])&&['true','false'].includes(parts[4])&&['true','false'].includes(parts[5]),'ML parity row malformed');
    const expected={score:parts[1]==='NA'?null:Number(parts[1]),matched:Number(parts[2]),total:Number(parts[3]),abstained:parts[4]==='true',flagged:parts[5]==='true'};
    requireValue((expected.score===null||(Number.isFinite(expected.score)&&expected.score>=0&&expected.score<=1))&&expected.matched<=expected.total&&(!expected.abstained||!expected.flagged),'ML parity result invalid');
    if(/^[\x00-\x7f]*$/.test(parts[0])){
      const actual=asciiPrediction(model,parts[0]);requireValue(closeNumber(actual.score,expected.score)&&['matched','total','abstained','flagged'].every(key=>actual[key]===expected[key]),'ML exported weights do not match ASCII parity');asciiChecked++;
    }
  }
  requireValue(asciiChecked>=10,'ML ASCII parity support too small');return {rows:lines.length,asciiChecked};
}
function validateMetric(value){
  for(const key of ['tp','fp','tn','fn','n','positiveSupport','negativeSupport','predictedPositive','abstained'])requireValue(Number.isSafeInteger(value[key])&&value[key]>=0,'ML metric count invalid');
  const {tp,fp,tn,fn,n,positiveSupport:positive,negativeSupport:negative,predictedPositive:predicted,abstained}=value;
  requireValue(tp+fp+tn+fn===n&&tp+fn===positive&&tn+fp===negative&&tp+fp===predicted&&abstained<=n,'ML metric counts disagree');
  const precision=negative&&predicted?tp/predicted:null,recall=positive?tp/positive:null,fpr=negative?fp/negative:null;
  requireValue(closeNumber(value.precision,precision)&&closeNumber(value.recall,recall)&&closeNumber(value.falsePositiveRate,fpr),'ML metric ratios disagree with counts');
  if(positive&&negative)requireValue(closeNumber(value.accuracy,(tp+tn)/n)&&closeNumber(value.balancedAccuracy,(tp/positive+tn/negative)/2),'ML accuracy ratios disagree with counts');
  else requireValue(value.accuracy===null&&value.balancedAccuracy===null,'One-class holdout must not claim overall accuracy');
  requireValue(closeNumber(value.coverage,n?1-abstained/n:null)&&closeNumber(value.flaggedCoverage,n?predicted/n:null),'ML coverage ratios disagree');
  requireValue(value.prAuc===null||(Number.isFinite(value.prAuc)&&value.prAuc>=0&&value.prAuc<=1),'ML ranking score invalid');
  for(const [key,point,lower]of [['precisionLower95',precision,true],['fprUpper95',fpr,false],['recallLower95',recall,true]])requireValue(point===null?value[key]===null:Number.isFinite(value[key])&&value[key]>=0&&value[key]<=1&&(lower?value[key]<=point+1e-10:value[key]>=point-1e-10),'ML interval bounds invalid');
}
/** Hash-bound source/protocol/model/report checks; this certifies consistency, not real-world accuracy. */
export function verifyMlArtifacts(root){
  const manifest=jsonInput(root,ML_ASSET_ROOT+'/manifest.json'),evaluation=jsonInput(root,'ml/evaluation.json'),frozen=jsonInput(root,'ml/frozen_selection.json'),experiment=jsonInput(root,'ml/experiment.json'),split=jsonInput(root,'ml/split_manifest.json'),sources=jsonInput(root,'ml/sources.lock.json');
  const rawModel=localBytes(root,ML_ASSET_ROOT+'/domain-model.tsv'),model=parseMlModel(rawModel),rawParity=localBytes(root,ML_ASSET_ROOT+'/parity.tsv'),parity=checkMlParity(model,rawParity);
  const modelHash=sha256(rawModel),parityHash=sha256(rawParity),provenance=Object.fromEntries([['sourcesLockSha256','ml/sources.lock.json'],['experimentSha256','ml/experiment.json'],['splitManifestSha256','ml/split_manifest.json'],['frozenSelectionSha256','ml/frozen_selection.json']].map(([key,path])=>[key,sha256(localBytes(root,path))]));
  requireValue(manifest.schemaVersion===1&&evaluation.schemaVersion===1&&experiment.schemaVersion===1&&split.schemaVersion===1&&sources.schemaVersion===1,'ML metadata schema invalid');
  requireValue(manifest.modelFile==='domain-model.tsv'&&manifest.parityFile==='parity.tsv'&&manifest.modelVersion===model.version&&evaluation.modelVersion===model.version&&experiment.modelVersion===model.version,'ML model identity mismatch');
  requireValue(manifest.modelSha256===modelHash&&manifest.modelBytes===rawModel.length&&manifest.paritySha256===parityHash&&manifest.featureCount===model.features.size&&manifest.reviewThreshold===model.threshold,'ML manifest does not match weights/parity');
  requireValue(evaluation.artifact?.modelSha256===modelHash&&evaluation.artifact?.modelBytes===rawModel.length&&evaluation.artifact?.paritySha256===parityHash&&evaluation.artifact?.featureCount===model.features.size&&frozen.modelSha256===modelHash,'ML evaluation or frozen model differs');
  for(const [key,digest]of Object.entries(provenance))requireValue(manifest.training?.[key]===digest&&evaluation.provenance?.[key]===digest,'ML provenance hash mismatch');
  requireValue(experiment.selectionScope==='validation'&&experiment.finalTestConsultedForSelection===false&&experiment.splitBeforeFit===true&&experiment.fitVocabularyOn==='train'&&frozen.selectionScope==='validation'&&frozen.finalTestConsultedForSelection===false,'ML selection protocol missing');
  const chosenC=frozen.selectedC??frozen.C;
  requireValue(Number.isFinite(chosenC)&&chosenC>0&&chosenC===(evaluation.selection?.C??evaluation.selection?.selectedC)&&frozen.reviewThreshold===model.threshold&&evaluation.selection?.reviewThreshold===model.threshold,'ML frozen selection mismatch');
  requireValue(manifest.autoQuarantineEligible===false&&evaluation.autoQuarantineEligible===false&&experiment.autoQuarantineEligible===false&&evaluation.independentlyReviewedLabelCount===0&&evaluation.sourceProxyLabels===true,'Proxy-labelled model cannot claim automatic quarantine eligibility');
  requireValue(evaluation.prAucDefinition==='average_precision','ML ranking metric definition missing');
  requireValue(JSON.stringify(evaluation.dataset)===JSON.stringify(split)&&split.familyOverlapAcrossSplits===0&&split.familyOverlapWithSourceHoldouts===0,'ML split/report assignment proof differs');
  for(const key of ['train','validation','test']){
    const counts=split.splits?.[key];requireValue(counts&&['n','positive','negative'].every(name=>Number.isSafeInteger(counts[name])&&counts[name]>=0)&&counts.n>0&&counts.positive+counts.negative===counts.n&&HEX256.test(counts.familyAssignmentsSha256||'')&&HEX256.test(counts.normalizedRowsSha256||''),'ML split counts/hashes invalid');
  }
  requireValue(typeof manifest.scoreMeaning==='string'&&/uncalibrated|bukan probabilitas|not.*probability/i.test(manifest.scoreMeaning),'ML score meaning must disclose its limitations');
  requireValue(Array.isArray(sources.sources)&&sources.sources.some(s=>s.role==='train_pool'&&s.label===0)&&sources.sources.some(s=>s.role==='train_pool'&&s.label===1)&&sources.sources.some(s=>s.role==='source_holdout'),'ML training/holdout sources missing');
  for(const source of [...sources.sources,sources.psl])requireValue(source&&/^https:\/\//.test(source.url)&&/^[a-f0-9]{40}$/.test(source.revision)&&source.url.includes(source.revision)&&HEX256.test(source.sha256)&&Number.isSafeInteger(source.bytes)&&source.bytes>0,'ML source is not pinned');
  requireValue(sources.psl.includesPrivateSuffixes===true&&Array.isArray(sources.licenses)&&sources.licenses.length>0,'ML grouping/license evidence missing');
  const licenseFiles=new Set();for(const license of sources.licenses){requireValue(typeof license.path==='string'&&license.path.startsWith('ml/licenses/')&&inside(resolve(root,'ml/licenses'),resolve(root,license.path))&&sha256(localBytes(root,license.path))===license.sha256,'ML source license changed or absent');licenseFiles.add(license.path);}
  requireValue([...sources.sources,sources.psl].every(source=>licenseFiles.has(source.licensePath)),'ML source license mapping incomplete');
  requireValue(manifest.licenses?.noticeFile==='NOTICE.txt'&&manifest.licenses?.licenseFile==='LICENSE-CC-BY-SA-4.0.txt','ML bundled attribution declaration missing');
  for(const [file,key]of [['NOTICE.txt','noticeSha256'],['LICENSE-CC-BY-SA-4.0.txt','licenseSha256']])requireValue(sha256(localBytes(root,ML_ASSET_ROOT+'/'+file))===manifest.licenses[key],'ML bundled attribution hash mismatch');
  let metricSets=0;function walk(value){if(!value||typeof value!=='object')return;if(['tp','fp','tn','fn'].every(key=>key in value)){validateMetric(value);metricSets++;}else for(const item of Object.values(value))walk(item);}
  requireValue(evaluation.evaluation?.test?.modelAtHalf&&evaluation.evaluation?.test?.modelAtReviewThreshold&&evaluation.evaluation?.test?.baselineHeuristicDetection&&evaluation.evaluation?.test?.hybridDetection&&evaluation.evaluation?.sourceHoldouts&&evaluation.evaluation?.challenge,'ML evaluation scopes incomplete');walk(evaluation.evaluation);requireValue(metricSets>=6,'ML evaluation metrics incomplete');
  for(const metric of Object.values(evaluation.evaluation.test))if(metric&&typeof metric==='object'&&'tp' in metric)requireValue(metric.n===split.splits.test.n&&metric.positiveSupport===split.splits.test.positive&&metric.negativeSupport===split.splits.test.negative,'ML test metric support differs from frozen split');
  requireValue(split.sourceHoldouts&&Object.keys(split.sourceHoldouts).length>0,'ML source holdout proof missing');
  for(const [key,counts]of Object.entries(split.sourceHoldouts)){
    const measured=evaluation.evaluation.sourceHoldouts[key];requireValue(counts.positiveOnly===true&&Number.isSafeInteger(counts.n)&&counts.n>=0&&HEX256.test(counts.familyAssignmentsSha256||'')&&HEX256.test(counts.normalizedRowsSha256||'')&&measured?.n===counts.n&&measured.positiveSupport===counts.n&&measured.negativeSupport===0&&measured.precision===null&&measured.falsePositiveRate===null,'ML positive-only holdout count/scope invalid');
    if(counts.n)requireValue(Number.isSafeInteger(measured.modelReviewFlags)&&Number.isSafeInteger(measured.missedOrAbstained)&&measured.modelReviewFlags+measured.missedOrAbstained===counts.n&&closeNumber(measured.recall,measured.modelReviewFlags/counts.n)&&measured.accuracy===null,'ML source holdout recall arithmetic invalid');
  }
  return {valid:true,modelVersion:model.version,modelSha256:modelHash,paritySha256:parityHash,manifestSha256:sha256(localBytes(root,ML_ASSET_ROOT+'/manifest.json')),evaluationSha256:sha256(localBytes(root,'ml/evaluation.json')),...provenance,featureCount:model.features.size,reviewThreshold:model.threshold,mode:'advisory-only',autoQuarantineEligible:false,independentlyReviewedLabelCount:0,parityRows:parity.rows,asciiParityVerified:parity.asciiChecked,metricSets};
}
export function verifyMlPackaging(root){
  const regular=readFileSync(resolve(root,'android/app/build/outputs/apk/debug/app-debug.apk')),release=readFileSync(resolve(root,'android/app/build/outputs/bundle/release/app-release.aab')),privateApk=readFileSync(resolve(root,'android/app/build/outputs/apk/privateDebug/app-privateDebug.apk'));
  for(const bytes of [regular,release])requireValue(!zipEntryNames(bytes).some(name=>/^(?:base\/)?assets\/ml(?:\/|$)/.test(name)),'Ordinary artifact contains private ML assets');
  const files={};for(const file of ML_ASSET_FILES){const expected=localBytes(root,ML_ASSET_ROOT+'/'+file),actual=zipEntryBytes(privateApk,'assets/ml/'+file);requireValue(sha256(actual)===sha256(expected),'Private APK contains mismatched ML assets');files[file]=sha256(actual);}
  return {ordinaryAssetsAbsent:true,privateAssetsBound:true,files};
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
  if(evidence.ml?.valid!==true||evidence.ml.mode!=='advisory-only'||evidence.ml.autoQuarantineEligible!==false||evidence.ml.independentlyReviewedLabelCount!==0||!HEX256.test(evidence.ml.modelSha256||''))return 'FAIL';
  if(evidence.mlPackaging?.ordinaryAssetsAbsent!==true||evidence.mlPackaging.privateAssetsBound!==true||ML_ASSET_FILES.some(file=>!HEX256.test(evidence.mlPackaging.files?.[file]||'')))return 'FAIL';
  if(!Array.isArray(evidence.artifacts)||evidence.artifacts.length!==4)return 'FAIL';
  return 'PASS';
}
export function checkEvidence(root,evidence,now=Date.now()) {
  const failures=[];
  if(evidence.schemaVersion!==3 || evidence.mode!=='full' || evidence.status!=='PASS' || evidence.mergeEligible!==true)failures.push('Evidence is not a full PASS');
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
  try{if(JSON.stringify(verifyMlArtifacts(root))!==JSON.stringify(evidence.ml))throw new Error('ML source proof mismatch');}catch{failures.push('ML model, parity, source protocol or evaluation changed/invalid');}
  try{if(JSON.stringify(verifyMlPackaging(root))!==JSON.stringify(evidence.mlPackaging))throw new Error('ML packaged proof mismatch');}catch{failures.push('ML asset distribution boundaries changed/invalid');}
  return {valid:failures.length===0,status:evidence.status||'INVALID',mergeEligible:failures.length===0,failures};
}
export function sanitizeLog(text,env=process.env) {
  let output=String(text);
  for(const [name,value]of Object.entries(env))if(value&&value.length>=4&&/(?:TOKEN|SECRET|PASSWORD|AUTHORIZATION|PROXY|KEYSTORE|^(?:JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS|JAVA_OPTS|GRADLE_OPTS)$)/i.test(name))output=output.split(value).join('<redacted>');
  return output.replace(/((?:https?|socks)\.proxy(?:Host|Port|User|Password)=)[^\s]+/gi,'$1<redacted>')
    .replace(/(-D[^\s=]*(?:password|secret|token|credential|authorization)[^\s=]*=)[^\s]+/gi,'$1<redacted>')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g,'$1<redacted>@');
}
