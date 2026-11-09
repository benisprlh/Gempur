#!/usr/bin/env node
/** Offline rule ingestion and detached RSA signing. No domain visits or implicit activation. */
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { domainToASCII } from 'node:url';
import { isIP } from 'node:net';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MAX_RULES = 100_000;
export const MAX_PAYLOAD = 5 * 1024 * 1024;
// Defense-in-depth seed, not a replacement for a maintained Public Suffix List.
const PROTECTED = new Set(['com','net','org','id','co.id','or.id','ac.id','go.id','sch.id','web.id','my.id',
  'com.au','co.uk','org.uk','gov.uk','github.io','github.com','cloudfront.net','b-cdn.net','pages.dev',
  'workers.dev','vercel.app','netlify.app','blogspot.com','wordpress.com','firebaseapp.com','web.app',
  'amazonaws.com','azurewebsites.net','googleusercontent.com','google.com','gstatic.com','googleapis.com',
  'microsoft.com','apple.com','whatsapp.com','facebook.com','instagram.com','telegram.org','t.me',
  'youtube.com','ojk.go.id','kemkes.go.id','komdigi.go.id','bca.co.id','bankmandiri.co.id','bri.co.id','bni.co.id']);
const PROTECTED_SHARED = ['github.io','cloudfront.net','b-cdn.net','pages.dev','workers.dev','vercel.app',
  'netlify.app','blogspot.com','wordpress.com','firebaseapp.com','web.app','amazonaws.com','azurewebsites.net'];
export const BENIGN = ['google.com','www.google.com','kemkes.go.id','ojk.go.id','bca.co.id','bankmandiri.co.id',
  'whatsapp.com','github.com','github.io','cdn.cloudflare.com','cloudflare.com','support.google.com'];

export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
export function normalize(input) {
  if (typeof input !== 'string') throw new Error('Domain must be text');
  const value = input.trim().replace(/\.$/, '').toLowerCase();
  if (!value || value.length > 253 || /[\s/:@?#*\\\[\]]/.test(value)) throw new Error('Not a bare domain');
  const domain = domainToASCII(value);
  if (!domain || domain.length > 253 || isIP(domain) || !domain.includes('.')) throw new Error('Not a domain');
  const labels = domain.split('.');
  if (labels.some(l => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l))) throw new Error('Invalid DNS label');
  if (/^\d+$/.test(labels.at(-1))) throw new Error('Numeric TLD');
  return domain;
}
export function protectedReason(domain) {
  if (PROTECTED.has(domain)) return 'protected_service_or_public_suffix';
  if (PROTECTED_SHARED.some(s => domain.endsWith('.' + s))) return 'shared_host_requires_separate_review';
  if (BENIGN.some(b => b === domain || b.endsWith('.' + domain))) return 'would_block_benign_fixture';
  return null;
}
export function parseCandidates(text) {
  const accepted = new Set(), rejected = [];
  for (const [index, original] of text.split(/\r?\n/).entries()) {
    const line = original.split('#')[0].trim();
    if (!line || line.startsWith('!')) continue;
    const parts = line.split(/\s+/);
    const value = parts.length === 2 && ['0.0.0.0','127.0.0.1','::'].includes(parts[0]) ? parts[1] : line;
    try {
      const domain = normalize(value), reason = protectedReason(domain);
      if (reason) rejected.push({ line: index + 1, input: original, reason }); else accepted.add(domain);
    } catch { rejected.push({ line: index + 1, input: original, reason: 'invalid_or_non_domain' }); }
  }
  return { domains: [...accepted].sort(), rejected };
}
export function matches(domain, rules) {
  let current = normalize(domain);
  while (current.includes('.')) {
    if (rules.has(current)) return true;
    current = current.slice(current.indexOf('.') + 1);
  }
  return false;
}
function iso(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value)))
    throw new Error('Timestamp must be explicit ISO-8601 UTC');
  return value;
}
export function payloadFromReview(candidateBytes, review, version, generatedAt) {
  if (!Number.isSafeInteger(version) || version < 1) throw new Error('Version must be positive integer');
  if (review.schema !== 1 || review.snapshotSha256 !== sha256(candidateBytes) || !review.reviewedBy?.trim())
    throw new Error('Review metadata does not match this exact candidate snapshot');
  iso(review.reviewedAt); iso(generatedAt);
  if (!Array.isArray(review.approvedDomains) || !review.approvedDomains.length || review.approvedDomains.length > MAX_RULES)
    throw new Error('Explicit nonempty approvedDomains required');
  const candidate = new Set(parseCandidates(candidateBytes.toString('utf8')).domains);
  const domains = [...new Set(review.approvedDomains.map(normalize))].sort();
  for (const d of domains) if (!candidate.has(d) || protectedReason(d)) throw new Error('Approved domain is not an eligible candidate');
  const rules = new Set(domains);
  if (BENIGN.some(b => matches(b,rules))) throw new Error('Rules block benign fixture');
  const payload = Buffer.from(JSON.stringify({ version, generatedAt, domains }), 'utf8');
  if (payload.length > MAX_PAYLOAD) throw new Error('Payload exceeds limit');
  return payload;
}
export function envelopeFor(payload, privateKey) {
  const key = createPrivateKey(privateKey);
  if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength || 0) < 3072)
    throw new Error('RSA key of at least 3072 bits required');
  return { payload: payload.toString('base64'), signature: sign('RSA-SHA256', payload, key).toString('base64') };
}
export function verifyEnvelope(envelope, publicKey, minimumVersion = 0) {
  if (!envelope || typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string') throw new Error('Invalid envelope');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(envelope.payload) || !/^[A-Za-z0-9+/]*={0,2}$/.test(envelope.signature)) throw new Error('Invalid base64');
  const payload = Buffer.from(envelope.payload,'base64');
  if (!payload.length || payload.length > MAX_PAYLOAD || !verify('RSA-SHA256',payload,createPublicKey(publicKey),Buffer.from(envelope.signature,'base64')))
    throw new Error('Signature verification failed');
  const parsed = JSON.parse(payload.toString('utf8'));
  if (!Number.isSafeInteger(parsed.version) || parsed.version <= minimumVersion || !Array.isArray(parsed.domains) || !parsed.domains.length || parsed.domains.length > MAX_RULES)
    throw new Error('Invalid or nonmonotonic version/rules');
  iso(parsed.generatedAt);
  const unique = new Set(parsed.domains.map(normalize));
  if (unique.size !== parsed.domains.length || [...unique].some(protectedReason) || BENIGN.some(b=>matches(b,unique)))
    throw new Error('Unsafe or duplicate rule');
  return parsed;
}
function args(values) {
  const result={};
  for(let i=0;i<values.length;i+=2) {
    if (!values[i].startsWith('--') || values[i+1] === undefined || values[i+1].startsWith('--')) throw new Error('Use --name value arguments');
    result[values[i].slice(2)]=values[i+1];
  }
  return result;
}
function required(a,name) {if(!a[name])throw new Error('Missing --'+name);return a[name];}
function put(path,bytes){mkdirSync(dirname(resolve(path)),{recursive:true});writeFileSync(path,bytes,{flag:'wx'});}
export function main(argv) {
  const [command,...rest]=argv, a=args(rest);
  if(command === 'import') {
    const input=readFileSync(required(a,'input'));
    if(input.length > 20*1024*1024)throw new Error('Snapshot too large');
    const sourceUrl=new URL(required(a,'source-url'));
    if(sourceUrl.protocol!=='https:')throw new Error('Source URL must be HTTPS');
    const license=required(a,'license'), licenseBytes=readFileSync(required(a,'license-file'));
    if(!['BSD-3-Clause','MIT','GPL-3.0-only','GPL-3.0-or-later'].includes(license))throw new Error('Record and review supported explicit license identifier');
    const result=parseCandidates(input.toString('utf8')), out=required(a,'output');
    const manifest={schema:1,status:'pending_human_review_not_active',sourceUrl:sourceUrl.href,
      sourceRevision:a['source-revision']||null,license,retrievedOn:iso(required(a,'retrieved-at')).slice(0,10),
      retrievalTimePrecision:'day; exact connector retrieval time not retained',recordedAt:new Date().toISOString(),
      snapshotSha256:sha256(input),licenseSha256:sha256(licenseBytes),candidateCount:result.domains.length,
      rejectedCount:result.rejected.length,normalizedSha256:sha256(result.domains.join('\n')+'\n'),
      warning:'Upstream category claim is not independent verification; DNS/WHOIS liveness does not establish gambling content. No domains have been visited.'};
    put(out+'.domains.txt',result.domains.join('\n')+'\n');
    put(out+'.manifest.json',JSON.stringify(manifest,null,2)+'\n');
    put(out+'.rejected.json',JSON.stringify(result.rejected,null,2)+'\n');
    console.log(JSON.stringify({status:manifest.status,candidates:result.domains.length,rejected:result.rejected.length}));
  } else if(command === 'bundle') {
    const keyPath=realpathSync(resolve(required(a,'private-key')));
    if(keyPath===ROOT || keyPath.startsWith(ROOT+sep))throw new Error('Signing private key must remain outside the repository');
    const bytes=readFileSync(required(a,'input')), review=JSON.parse(readFileSync(required(a,'review'),'utf8'));
    const payload=payloadFromReview(bytes,review,Number(required(a,'version')),required(a,'generated-at'));
    const env=envelopeFor(payload,readFileSync(keyPath));
    put(required(a,'output'),JSON.stringify(env)+'\n');
    console.log(JSON.stringify({version:Number(a.version),domains:JSON.parse(payload).domains.length,payloadSha256:sha256(payload)}));
  } else if(command === 'verify') {
    const env=JSON.parse(readFileSync(required(a,'input'),'utf8'));
    const parsed=verifyEnvelope(env,readFileSync(required(a,'public-key')),Number(a['minimum-version']||0));
    console.log(JSON.stringify({verified:true,version:parsed.version,domains:parsed.domains.length}));
  } else throw new Error('Commands: import, bundle, verify; see rules/README.md');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try{main(process.argv.slice(2));}catch(error){console.error('Rules operation failed: '+error.message);process.exitCode=1;}
}
