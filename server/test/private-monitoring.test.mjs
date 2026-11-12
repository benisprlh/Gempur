import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../app.mjs';

async function fixture(t,options={}) {
  let clock=Date.parse('2026-11-09T04:00:00Z');
  const app=createApp({now:()=>clock,privateMonitoringEnabled:true,...options});
  const server=createServer(app.handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));app.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  async function call(path,{method='GET',token,body}={}) {
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json(),headers:response.headers};
  }
  async function device(role) {const result=await call('/api/devices',{method:'POST',body:{role,name:role}});assert.equal(result.status,201);return result.body;}
  async function pair() {
    const p=await device('participant'),c=await device('companion');
    const invite=await call('/api/pairings',{method:'POST',token:p.token,body:{}});
    const claim=await call('/api/pairings/claim',{method:'POST',token:c.token,body:{invitationCode:invite.body.invitationCode}});
    const confirmed=await call(`/api/pairings/${invite.body.pairingId}/confirm`,{method:'POST',token:p.token,body:{verificationCode:claim.body.verificationCode}});
    assert.equal(confirmed.status,200);
    return {p,c,id:invite.body.pairingId,consentVersion:confirmed.body.pairing.consentVersion};
  }
  async function grant(pair,scopes=['domain','app']) {
    const result=await call(`/api/pairings/${pair.id}/automation`,{method:'PUT',token:pair.p.token,body:{enabled:scopes.length>0,scopes}});
    assert.equal(result.status,200);return result.body.automation;
  }
  function event(overrides={}) {return {eventId:randomUUID(),kind:'domain',target:'service-sample.org',reason:'known_rule',verdict:'known',action:'blocked',occurredAt:new Date(clock).toISOString(),count:1,...overrides};}
  function upload(pair,automation,events,overrides={}) {return call('/api/detections',{method:'POST',token:pair.p.token,body:{pairingId:pair.id,consentVersion:pair.consentVersion,automationVersion:automation.version,events,...overrides}});}
  async function list(pair,token=pair.c.token) {return call(`/api/detections?pairingId=${pair.id}`,{token});}
  async function delayed(path,token,payload,whileWaiting) {
    const bytes=JSON.stringify(payload);
    let ready;
    const started=new Promise(resolve=>{ready=resolve;});
    const result=new Promise((resolve,reject)=>{
      const req=request(base+path,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(bytes)}},res=>{
        let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(body)}));
      });
      req.on('error',reject);req.write(bytes.slice(0,-1));
      setTimeout(async()=>{try{await whileWaiting();req.end(bytes.slice(-1));ready();}catch(error){req.destroy();reject(error);ready();}},20);
    });
    await started;return result;
  }
  return {call,device,pair,grant,event,upload,list,delayed,advance:ms=>clock+=ms,now:()=>clock};
}

test('private server capability is default-off and cannot be enabled by request payload',async t=>{
  assert.throws(()=>createApp({privateMonitoringEnabled:'true'}));
  const f=await fixture(t,{privateMonitoringEnabled:false}),pair=await f.pair();
  assert.equal((await f.call('/api/health')).body.privateMonitoringEnabled,false);
  assert.equal((await f.call('/api/health')).body.localDomainAiSignals,true);
  assert.equal((await f.call('/api/me',{token:pair.p.token})).body.pairings[0].automation,undefined);
  for(const [path,method,body]of [[`/api/pairings/${pair.id}/automation`,'GET'],[`/api/pairings/${pair.id}/automation`,'PUT',{enabled:true,scopes:['domain']}],['/api/detections','POST',{enabled:true}]])assert.equal((await f.call(path,{method,token:pair.p.token,body})).status,404);
  assert.equal((await f.call('/api/exceptions',{method:'POST',token:pair.p.token,body:{pairingId:pair.id,targetKind:'app',target:'org.acme.SlotCasino',reason:'false_positive'}})).status,404);
});

test('new and existing pairs remain manual until participant grants exact scopes',async t=>{
  const f=await fixture(t),pair=await f.pair();
  assert.equal((await f.call('/api/health')).body.privateMonitoringEnabled,true);
  const initial=(await f.call('/api/me',{token:pair.p.token})).body.pairings[0].automation;
  assert.deepEqual(initial,{enabled:false,version:0,scopes:[],updatedAt:null});
  assert.equal((await f.upload(pair,initial,[f.event()])).status,409);
  assert.equal((await f.call(`/api/pairings/${pair.id}/automation`,{method:'PUT',token:pair.c.token,body:{enabled:true,scopes:['domain']}})).status,404);
  for(const body of [{enabled:true,scopes:[]},{enabled:false,scopes:['domain']},{enabled:true,scopes:['domain','domain']},{enabled:true,scopes:['inventory']},{enabled:true,scopes:['domain'],hidden:true}])assert.equal((await f.call(`/api/pairings/${pair.id}/automation`,{method:'PUT',token:pair.p.token,body})).status,400);
  const grant=await f.grant(pair,['domain']);assert.equal(grant.version,1);
  const same=await f.grant(pair,['domain']);assert.deepEqual(same,grant);
  const expanded=await f.grant(pair,['app','domain']);assert.equal(expanded.version,2);assert.deepEqual(expanded.scopes,['app','domain']);
  assert.deepEqual((await f.call(`/api/pairings/${pair.id}/automation`,{token:pair.c.token})).body.automation,expanded);
});

test('detections are normalized, owner-scoped and idempotent without general browsing data',async t=>{
  const f=await fixture(t),pair=await f.pair(),grant=await f.grant(pair),event=f.event({target:'BÜCHER-SERVICE.ORG.',count:8});
  const accepted=await f.upload(pair,grant,[event]);assert.equal(accepted.status,200);assert.deepEqual(accepted.body.acceptedEventIds,[event.eventId]);
  assert.equal((await f.upload(pair,grant,[f.event()],{consentVersion:pair.consentVersion+1})).status,409);
  assert.equal((await f.upload(pair,grant,[event])).status,200);
  assert.equal((await f.upload(pair,grant,[{...event,count:9}])).status,409);
  const listed=await f.list(pair);assert.equal(listed.status,200);assert.equal(listed.body.detections.length,1);
  assert.equal(listed.body.detections[0].target,'xn--bcher-service-wob.org');assert.equal(listed.body.detections[0].count,8);
  assert.equal(listed.body.detections[0].readAt,null);assert.equal(listed.body.detections[0].label,undefined);
  const stranger=await f.device('companion');assert.equal((await f.list(pair,stranger.token)).status,404);
  assert.equal((await f.call('/api/detections',{method:'POST',token:pair.c.token,body:{pairingId:pair.id,consentVersion:1,automationVersion:1,events:[f.event()]}})).status,404);
  assert.equal((await f.call(`/api/detections?pairingId=${pair.id}&inventory=true`,{token:pair.c.token})).status,400);
});

test('event payload rejects URLs, diagnostics, inventories, unknown fields and invalid reason/count/time',async t=>{
  const f=await fixture(t),pair=await f.pair(),grant=await f.grant(pair);
  const invalid=[
    {target:'https://service-sample.org/path?secret=1'},{target:'service-sample.org/path'},
    {target:'gempur-block.test'},{target:'example.com'},{target:'sub.example.org'},{target:'demo.invalid'},
    {kind:'app',target:'id.gempur.app.private.debug'},{kind:'app',target:'com.example.SlotCasino'},{kind:'app',target:'com.gempur.fixture'},
    {kind:'app',target:'https://org.acme.app'},{kind:'app',target:'org/acme/app'},
    {label:'Private label'},{url:'https://service-sample.org'},{inventory:['org.acme.app']},
    {reason:'unknown'},{reason:'name_heuristic',verdict:'known'},{action:'allow'},
    {count:0},{count:1001},{count:1.2},{occurredAt:new Date(f.now()-86400001).toISOString()},
    {occurredAt:new Date(f.now()+60001).toISOString()},{occurredAt:'Mon, 09 Nov 2026 04:00:00 GMT'},{eventId:'not-a-uuid'}
  ];
  for(const override of invalid)assert.equal((await f.upload(pair,grant,[f.event(override)])).status,400,JSON.stringify(override));
  assert.equal((await f.upload(pair,grant,[])).status,400);
  assert.equal((await f.upload(pair,grant,Array.from({length:11},()=>f.event()))).status,400);
  const duplicate=f.event();assert.equal((await f.upload(pair,grant,[duplicate,duplicate])).status,400);
  assert.equal((await f.upload(pair,grant,[f.event()],{screenshots:[]})).status,400);
  assert.equal((await f.list(pair)).body.detections.length,0);
});

test('local domain AI reports are scoped advisory signals and remain idempotent',async t=>{
  const f=await fixture(t),pair=await f.pair(),grant=await f.grant(pair,['domain']);
  const health=(await f.call('/api/health')).body;
  assert.equal(health.version,'0.3.4-alpha.1');assert.equal(health.localDomainAiSignals,true);
  const event=f.event({reason:'ml_model',verdict:'suspected',action:'flagged'});
  const uploaded=await f.upload(pair,grant,[event]);
  assert.equal(uploaded.status,200);assert.deepEqual(uploaded.body.acceptedEventIds,[event.eventId]);
  assert.equal((await f.upload(pair,grant,[event])).status,200);
  const inbox=(await f.list(pair)).body.detections;
  assert.equal(inbox.length,1);assert.equal(inbox[0].reason,'ml_model');
  assert.equal(inbox[0].kind,'domain');assert.equal(inbox[0].verdict,'suspected');
  assert.equal(inbox[0].action,'flagged');assert.equal(inbox[0].readAt,null);
  assert.equal(inbox[0].riskScore,undefined);assert.equal(inbox[0].modelVersion,undefined);
  const correction=await f.call('/api/exceptions',{method:'POST',token:pair.p.token,body:{pairingId:pair.id,target:inbox[0].target,targetKind:'domain',detectionId:inbox[0].id,reason:'false_positive'}});
  assert.equal(correction.status,201);assert.equal(correction.body.exception.detectionId,inbox[0].id);
  assert.equal((await f.list(pair,(await f.device('companion')).token)).status,404);
  await f.grant(pair,['app']);
  assert.equal((await f.upload(pair,grant,[event])).status,409);
  assert.deepEqual((await f.list(pair)).body.detections,[]);
});

test('AI cannot claim known gambling, block automatically, classify apps or upload extra model data',async t=>{
  const f=await fixture(t),pair=await f.pair(),grant=await f.grant(pair);
  const invalid=[
    {kind:'app',target:'org.acme.SlotCasino'},
    {verdict:'known'},{verdict:'personal'},{verdict:'unknown'},
    {action:'blocked'},{action:'allow'},
    {riskScore:0.999},{modelVersion:'model-claimed-verified'},{pageText:'private page contents'}
  ];
  for(const override of invalid){
    const event=f.event({reason:'ml_model',verdict:'suspected',action:'flagged',...override});
    assert.equal((await f.upload(pair,grant,[event])).status,400,JSON.stringify(override));
  }
  assert.deepEqual((await f.list(pair)).body.detections,[]);
  const appOnly=await f.grant(pair,['app']);
  assert.equal((await f.upload(pair,appOnly,[f.event({reason:'ml_model',verdict:'suspected',action:'flagged'})])).status,400);
});

test('scope/grant changes reject stale queues and erase events plus event-bound corrections',async t=>{
  const f=await fixture(t),pair=await f.pair(),old=await f.grant(pair,['domain']);
  assert.equal((await f.upload(pair,old,[f.event({kind:'app',target:'org.acme.app'})])).status,400);
  const event=f.event();await f.upload(pair,old,[event]);
  const detection=(await f.list(pair)).body.detections[0];
  const correction=await f.call('/api/exceptions',{method:'POST',token:pair.p.token,body:{pairingId:pair.id,target:detection.target,targetKind:'domain',detectionId:detection.id,reason:'false_positive'}});
  assert.equal(correction.status,201);
  const current=await f.grant(pair,['app']);assert.equal(current.version,old.version+1);
  assert.equal((await f.upload(pair,old,[event])).status,409);assert.equal((await f.list(pair)).body.detections.length,0);
  assert.equal((await f.call(`/api/exceptions/${correction.body.exception.id}`,{token:pair.p.token})).body.exception.state,'cancelled');
  assert.equal((await f.upload(pair,current,[f.event({kind:'app',target:'org.acme.SlotCasino',reason:'name_heuristic',verdict:'suspected'})])).status,200);
  const disabled=await f.grant(pair,[]);assert.equal(disabled.enabled,false);assert.deepEqual((await f.list(pair)).body.detections,[]);
  assert.equal((await f.upload(pair,current,[event])).status,409);
});

test('read acknowledgements are explicit companion actions and idempotent',async t=>{
  const f=await fixture(t),pair=await f.pair(),grant=await f.grant(pair);await f.upload(pair,grant,[f.event()]);
  const detection=(await f.list(pair)).body.detections[0];assert.equal(detection.readAt,null);
  assert.equal((await f.call(`/api/detections/${detection.id}/read`,{method:'POST',token:pair.p.token,body:{}})).status,404);
  const read=await f.call(`/api/detections/${detection.id}/read`,{method:'POST',token:pair.c.token,body:{}});assert.equal(read.status,200);assert.ok(read.body.detection.readAt);
  f.advance(1000);assert.equal((await f.call(`/api/detections/${detection.id}/read`,{method:'POST',token:pair.c.token,body:{}})).body.detection.readAt,read.body.detection.readAt);
});

test('revoking a pair during incomplete upload invalidates authorization after body',async t=>{
  const f=await fixture(t),pair=await f.pair(),grant=await f.grant(pair);
  const payload={pairingId:pair.id,consentVersion:1,automationVersion:grant.version,events:[f.event()]};
  const result=await f.delayed('/api/detections',pair.p.token,payload,async()=>{assert.equal((await f.call(`/api/pairings/${pair.id}`,{method:'DELETE',token:pair.c.token})).status,200);});
  assert.equal(result.status,409);assert.equal((await f.list(pair)).status,409);
});

test('grant disable or scope change during incomplete upload rejects the captured old version',async t=>{
  for(const scopes of [[],['app']]){
    const f=await fixture(t),pair=await f.pair(),grant=await f.grant(pair,['domain']);
    const result=await f.delayed('/api/detections',pair.p.token,{pairingId:pair.id,consentVersion:1,automationVersion:grant.version,events:[f.event()]},()=>f.grant(pair,scopes));
    assert.equal(result.status,409);assert.equal((await f.list(pair)).body.detections.length,0);
  }
});

test('logout during incomplete upload invalidates token and ends private grants',async t=>{
  const f=await fixture(t),pair=await f.pair(),grant=await f.grant(pair);
  const result=await f.delayed('/api/detections',pair.p.token,{pairingId:pair.id,consentVersion:1,automationVersion:grant.version,events:[f.event()]},async()=>{assert.equal((await f.call('/api/session',{method:'DELETE',token:pair.p.token})).status,200);});
  assert.equal(result.status,401);assert.equal((await f.list(pair)).status,409);
});

test('typed corrections bind exactly to one accessible detection and preserve permit replay protection',async t=>{
  const f=await fixture(t),pair=await f.pair(),grant=await f.grant(pair);await f.upload(pair,grant,[f.event({kind:'app',target:'org.acme.SlotCasino',reason:'name_heuristic',verdict:'suspected'})]);
  const detection=(await f.list(pair)).body.detections[0];
  const payload={pairingId:pair.id,target:detection.target,targetKind:'app',detectionId:detection.id,reason:'false_positive'};
  assert.equal((await f.call('/api/exceptions',{method:'POST',token:pair.p.token,body:{...payload,target:'org.acme.OtherApp'}})).status,404);
  const other=await f.pair();await f.grant(other);assert.equal((await f.call('/api/exceptions',{method:'POST',token:other.p.token,body:{...payload,pairingId:other.id}})).status,404);
  const created=await f.call('/api/exceptions',{method:'POST',token:pair.p.token,body:payload});assert.equal(created.status,201);assert.equal(created.body.exception.targetKind,'app');
  const id=created.body.exception.id;await f.call(`/api/exceptions/${id}/decision`,{method:'POST',token:pair.c.token,body:{decision:'approve'}});
  assert.equal((await f.call(`/api/exceptions/${id}/permit`,{method:'POST',token:pair.p.token,body:{}})).status,409);
  f.advance(600001);const permit=await f.call(`/api/exceptions/${id}/permit`,{method:'POST',token:pair.p.token,body:{}});
  const applied=await f.call(`/api/exceptions/${id}/apply`,{method:'POST',token:pair.p.token,body:{permitToken:permit.body.permitToken}});
  assert.equal(applied.status,200);assert.equal(applied.body.targetKind,'app');assert.equal(applied.body.target,detection.target);
  assert.equal((await f.call(`/api/exceptions/${id}/apply`,{method:'POST',token:pair.p.token,body:{permitToken:permit.body.permitToken}})).status,409);
});

test('private export includes own scoped data, seven-day retention removes events, deletion cascades',async t=>{
  const f=await fixture(t),pair=await f.pair(),grant=await f.grant(pair);await f.upload(pair,grant,[f.event()]);
  const exported=(await f.call('/api/me/export',{token:pair.p.token})).body;
  assert.equal(exported.pairings[0].detections.length,1);assert.equal(exported.pairings[0].automation.enabled,true);assert.equal(JSON.stringify(exported).includes(pair.p.token),false);
  f.advance(7*86400000+60001);assert.equal((await f.list(pair)).body.detections.length,0);
  const fresh=f.event();assert.equal((await f.upload(pair,grant,[fresh])).status,200);
  await f.call('/api/me',{method:'DELETE',token:pair.p.token});
  assert.equal((await f.call('/api/me',{token:pair.c.token})).body.pairings.length,0);assert.equal((await f.list(pair)).status,404);
});

test('event storage cap is atomic, keeps old IDs idempotent and list is bounded to100',async t=>{
  const f=await fixture(t),pair=await f.pair(),grant=await f.grant(pair);let first;
  for(let batch=0;batch<50;batch++){
    if(batch&&batch%10===0)f.advance(61000);
    const events=Array.from({length:10},()=>f.event());if(!first)first=events[0];
    assert.equal((await f.upload(pair,grant,events)).status,200);
  }
  assert.equal((await f.list(pair)).body.detections.length,100);
  const capped=await f.upload(pair,grant,[first,f.event()]);assert.equal(capped.status,429);assert.equal(capped.body.error.code,'storage_full');
  assert.equal((await f.upload(pair,grant,[first])).status,200);
  assert.equal((await f.call('/api/me/export',{token:pair.p.token})).body.pairings[0].detections.length,500);
});

test('detection upload rate is bounded independently from valid batch storage',async t=>{
  const f=await fixture(t),pair=await f.pair(),grant=await f.grant(pair);
  for(let i=0;i<30;i++)assert.equal((await f.upload(pair,grant,[f.event()])).status,200);
  const limited=await f.upload(pair,grant,[f.event()]);assert.equal(limited.status,429);assert.equal(limited.body.error.code,'rate_limited');
  f.advance(60001);assert.equal((await f.upload(pair,grant,[f.event()])).status,200);
});

test('legacy database correction rows migrate without resetting existing accounts',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'gempur-legacy-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const path=join(directory,'legacy.sqlite'),clock=Date.parse('2026-11-09T04:00:00Z'),token='a'.repeat(43),db=new DatabaseSync(path);
  db.exec('CREATE TABLE devices(id TEXT PRIMARY KEY,role TEXT NOT NULL,name TEXT NOT NULL,token_hash TEXT UNIQUE NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL); CREATE TABLE pairings(id TEXT PRIMARY KEY,participant_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,companion_id TEXT REFERENCES devices(id) ON DELETE CASCADE,status TEXT NOT NULL,invitation_hash TEXT UNIQUE,verification_code TEXT,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,consent_version INTEGER NOT NULL DEFAULT 1); CREATE TABLE exceptions(id TEXT PRIMARY KEY,pairing_id TEXT NOT NULL REFERENCES pairings(id) ON DELETE CASCADE,target TEXT NOT NULL,state TEXT NOT NULL,created_at INTEGER NOT NULL,decided_at INTEGER,ready_at INTEGER,expires_at INTEGER NOT NULL,permit_hash TEXT,applied_at INTEGER)');
  db.prepare('INSERT INTO devices VALUES (?,?,?,?,?,?)').run('p','participant','Legacy',createHash('sha256').update(token).digest('hex'),clock,clock+86400000);
  db.prepare("INSERT INTO pairings(id,participant_id,status,created_at,expires_at) VALUES ('pair','p','active',?,?)").run(clock,clock+86400000);
  db.prepare("INSERT INTO exceptions(id,pairing_id,target,state,created_at,expires_at) VALUES ('correction','pair','normal-service.org','pending',?,?)").run(clock,clock+86400000);db.close();
  const f=await fixture(t,{dbPath:path});const me=await f.call('/api/me',{token});assert.equal(me.status,200);assert.equal(me.body.device.name,'Legacy');assert.equal(me.body.pairings[0].automation.enabled,false);
  const correction=await f.call('/api/exceptions/correction',{token});assert.equal(correction.body.exception.targetKind,'domain');assert.equal(correction.body.exception.target,'normal-service.org');
});
