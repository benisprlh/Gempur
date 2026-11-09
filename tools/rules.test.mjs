import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { normalize,parseCandidates,matches,payloadFromReview,envelopeFor,verifyEnvelope,sha256 } from './rules.mjs';

test('normalize domain boundaries and reject URLs/IPs/wildcards',()=>{
  assert.equal(normalize(' BÜCHER.example. '),'xn--bcher-kva.example');
  for(const v of ['https://example.com','52.77.173.72','*.example.com','a..com','example.com:443','com','192.168.1.1','x.com/path','bad_name.com'])
    assert.throws(()=>normalize(v),v);
  assert.equal(matches('child.blocked.example',new Set(['blocked.example'])),true);
  assert.equal(matches('notblocked.example',new Set(['blocked.example'])),false);
});
test('parser deduplicates and protects shared hosts and essential services',()=>{
  const r=parseCandidates('# comment\n0.0.0.0 X.example\nx.example\nco.id\ngoogle.com\nunsafe.github.io\n52.77.173.72\n');
  assert.deepEqual(r.domains,['x.example']); assert.equal(r.rejected.length,4);
});
test('only exact-snapshot explicit reviews can produce payloads',()=>{
  const raw=Buffer.from('blocked.example\nother.example\n');
  const review={schema:1,snapshotSha256:sha256(raw),reviewedBy:'synthetic-test',reviewedAt:'2026-11-09T00:00:00Z',approvedDomains:['blocked.example']};
  const p=payloadFromReview(raw,review,1,'2026-11-09T00:00:00Z');
  assert.deepEqual(JSON.parse(p).domains,['blocked.example']);
  assert.throws(()=>payloadFromReview(Buffer.from('changed.example\n'),review,2,'2026-11-09T00:00:00Z'));
  assert.throws(()=>payloadFromReview(raw,{...review,approvedDomains:['unreviewed.example']},2,'2026-11-09T00:00:00Z'));
  assert.throws(()=>payloadFromReview(raw,{...review,approvedDomains:[]},2,'2026-11-09T00:00:00Z'));
});
test('RSA envelope authenticates exact bytes and rejects tamper, wrong key, rollback',()=>{
  // Ephemeral in-memory fixture only; no key is saved or shipped.
  const k=generateKeyPairSync('rsa',{modulusLength:3072});
  const wrong=generateKeyPairSync('rsa',{modulusLength:3072});
  const privatePem=k.privateKey.export({type:'pkcs8',format:'pem'}), publicPem=k.publicKey.export({type:'spki',format:'pem'});
  const payload=Buffer.from(JSON.stringify({version:2,generatedAt:'2026-11-09T00:00:00Z',domains:['blocked.example']}));
  const envelope=envelopeFor(payload,privatePem);
  assert.equal(verifyEnvelope(envelope,publicPem,1).version,2);
  assert.throws(()=>verifyEnvelope(envelope,publicPem,2));
  assert.throws(()=>verifyEnvelope(envelope,wrong.publicKey.export({type:'spki',format:'pem'}),1));
  assert.throws(()=>verifyEnvelope({...envelope,payload:Buffer.from('tampered').toString('base64')},publicPem,1));
});
