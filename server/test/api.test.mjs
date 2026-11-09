import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { createApp, normalizeDomain } from '../app.mjs';

async function fixture(t) {
  let clock=Date.parse('2026-11-09T04:00:00Z');
  const app=createApp({now:()=>clock,cooldownMs:600_000});
  const server=createServer(app.handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));app.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  async function call(path,{method='GET',token,body,headers={}}={}) {
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json(),headers:response.headers};
  }
  async function device(role,name=role) { const result=await call('/api/devices',{method:'POST',body:{role,name}});assert.equal(result.status,201);return result.body; }
  async function pair() {
    const p=await device('participant','Peserta'),c=await device('companion','Pendamping');
    const invite=await call('/api/pairings',{method:'POST',token:p.token,body:{}});assert.equal(invite.status,201);
    const claim=await call('/api/pairings/claim',{method:'POST',token:c.token,body:{invitationCode:invite.body.invitationCode}});assert.equal(claim.status,200);
    const confirm=await call(`/api/pairings/${invite.body.pairingId}/confirm`,{method:'POST',token:p.token,body:{verificationCode:claim.body.verificationCode}});assert.equal(confirm.status,200);
    return {p,c,id:invite.body.pairingId,invite:invite.body};
  }
  return {call,device,pair,base,advance:value=>clock+=value,now:()=>clock};
}
test('domain normalization handles IDN, boundaries and disallows URLs/IP/wildcards',()=>{
  assert.equal(normalizeDomain('WWW.Example.COM.'),'www.example.com');
  assert.equal(normalizeDomain('bücher.example'),'xn--bcher-kva.example');
  for(const value of ['https://example.com/path?secret=a','*.example.com','127.0.0.1','localhost','a..test','-invalid.test','foo.test:443','foo bar.test'])assert.throws(()=>normalizeDomain(value));
});
test('authentication required and secrets never returned from me',async t=>{
  const f=await fixture(t);assert.equal((await f.call('/api/me')).status,401);
  const p=await f.device('participant');const me=await f.call('/api/me',{token:p.token});
  assert.equal(me.status,200);assert.equal(me.body.device.role,'participant');assert.ok(!JSON.stringify(me.body).includes(p.token));assert.ok(!JSON.stringify(me.body).includes('token_hash'));
});
test('registration validates role, unknown fields, names and cookie attributes',async t=>{
  const f=await fixture(t);
  for(const body of [{role:'admin',name:'x'},{role:'participant',name:''},{role:'participant',name:'x',chat:'secret'}])assert.equal((await f.call('/api/devices',{method:'POST',body})).status,400);
  const result=await f.call('/api/devices',{method:'POST',body:{role:'participant',name:'Nama'}});
  assert.match(result.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
});
test('pairing needs claim plus participant confirmation; invitation single use',async t=>{
  const f=await fixture(t);const p=await f.device('participant'),c=await f.device('companion');
  const invite=(await f.call('/api/pairings',{method:'POST',token:p.token,body:{}})).body;
  const claim=await f.call('/api/pairings/claim',{method:'POST',token:c.token,body:{invitationCode:invite.invitationCode}});assert.equal(claim.status,200);
  assert.equal((await f.call(`/api/pairings/${invite.pairingId}/dashboard`,{token:c.token})).status,409);
  assert.equal((await f.call('/api/pairings/claim',{method:'POST',token:c.token,body:{invitationCode:invite.invitationCode}})).status,404);
  assert.equal((await f.call(`/api/pairings/${invite.pairingId}/confirm`,{method:'POST',token:p.token,body:{verificationCode:'000000'}})).status,400);
  assert.equal((await f.call(`/api/pairings/${invite.pairingId}/confirm`,{method:'POST',token:p.token,body:{verificationCode:claim.body.verificationCode}})).status,200);
});
test('invitation expires after ten minutes',async t=>{
  const f=await fixture(t);const p=await f.device('participant'),c=await f.device('companion');
  const invite=(await f.call('/api/pairings',{method:'POST',token:p.token,body:{}})).body;f.advance(600_001);
  assert.equal((await f.call('/api/pairings/claim',{method:'POST',token:c.token,body:{invitationCode:invite.invitationCode}})).status,404);
});
test('unpaired users cannot read or write another pairing',async t=>{
  const f=await fixture(t);const {p,c,id}=await f.pair();const stranger=await f.device('companion','Other');
  assert.equal((await f.call(`/api/pairings/${id}/dashboard`,{token:stranger.token})).status,404);
  assert.equal((await f.call(`/api/pairings/${id}/dashboard`,{token:p.token})).status,404);
  assert.equal((await f.call('/api/snapshots',{method:'POST',token:c.token,body:{pairingId:id,protection:'active',rulesVersion:'1',blockedRequests:0,observedAt:new Date(f.now()).toISOString()}})).status,404);
});
test('manual snapshots are typed and time limited without browsing data',async t=>{
  const f=await fixture(t);const {p,c,id}=await f.pair();
  const body={pairingId:id,protection:'active',rulesVersion:'seed-1',blockedRequests:3,observedAt:new Date(f.now()).toISOString()};
  const write=await f.call('/api/snapshots',{method:'POST',token:p.token,body});assert.equal(write.status,201);
  const read=await f.call(`/api/pairings/${id}/dashboard`,{token:c.token});assert.equal(read.body.snapshot.blockedRequests,3);assert.match(read.body.notice,/bukan status langsung/);
  assert.equal((await f.call('/api/snapshots',{method:'POST',token:p.token,body:{...body,url:'https://example.test/private'}})).status,400);
  assert.equal((await f.call('/api/snapshots',{method:'POST',token:p.token,body:{...body,observedAt:'2020-01-01'}})).status,400);
});
test('support message is received by server then explicitly marked read',async t=>{
  const f=await fixture(t);const {p,c,id}=await f.pair();
  const result=await f.call('/api/support',{method:'POST',token:p.token,body:{pairingId:id,message:'call'}});assert.equal(result.status,201);assert.equal(result.body.request.status,'received');
  const read=await f.call(`/api/support/${result.body.request.id}/read`,{method:'POST',token:c.token,body:{}});assert.equal(read.body.request.status,'read');
  assert.equal((await f.call('/api/support',{method:'POST',token:p.token,body:{pairingId:id,message:'private free text'}})).status,400);
});
test('expired support requests are not represented as fresh or readable',async t=>{
  const f=await fixture(t);const {p,c,id}=await f.pair();const sent=(await f.call('/api/support',{method:'POST',token:p.token,body:{pairingId:id,message:'company'}})).body.request;
  f.advance(900_001);const read=await f.call(`/api/support/${sent.id}/read`,{method:'POST',token:c.token,body:{}});assert.equal(read.status,409);
  const dash=await f.call(`/api/pairings/${id}/dashboard`,{token:c.token});assert.equal(dash.body.supports[0].status,'expired');
});
test('revocation immediately blocks future access and sharing',async t=>{
  const f=await fixture(t);const {p,c,id}=await f.pair();
  assert.equal((await f.call(`/api/pairings/${id}`,{method:'DELETE',token:p.token})).status,200);
  assert.equal((await f.call(`/api/pairings/${id}/dashboard`,{token:c.token})).status,409);
  assert.equal((await f.call('/api/support',{method:'POST',token:p.token,body:{pairingId:id,message:'call'}})).status,409);
  const exported=await f.call('/api/me/export',{token:c.token});assert.equal(exported.body.pairings[0].status,'revoked');assert.equal(exported.body.pairings[0].snapshots,undefined);
});
test('exceptions require legitimate-domain declaration and enforce cooling off',async t=>{
  const f=await fixture(t);const {p,c,id}=await f.pair();
  assert.equal((await f.call('/api/exceptions',{method:'POST',token:p.token,body:{pairingId:id,target:'example.org',reason:'gambling'}})).status,400);
  const row=(await f.call('/api/exceptions',{method:'POST',token:p.token,body:{pairingId:id,target:'Example.ORG',reason:'false_positive'}})).body.exception;
  assert.equal(row.target,'example.org');
  assert.equal((await f.call(`/api/exceptions/${row.id}/decision`,{method:'POST',token:p.token,body:{decision:'approve'}})).status,403);
  assert.equal((await f.call(`/api/exceptions/${row.id}/decision`,{method:'POST',token:c.token,body:{decision:'approve'}})).status,200);
  assert.equal((await f.call(`/api/exceptions/${row.id}/permit`,{method:'POST',token:p.token,body:{}})).status,409);
  f.advance(600_001);const permit=await f.call(`/api/exceptions/${row.id}/permit`,{method:'POST',token:p.token,body:{}});assert.equal(permit.status,200);
  assert.equal((await f.call(`/api/exceptions/${row.id}/apply`,{method:'POST',token:p.token,body:{permitToken:permit.body.permitToken}})).status,200);
  assert.equal((await f.call(`/api/exceptions/${row.id}/apply`,{method:'POST',token:p.token,body:{permitToken:permit.body.permitToken}})).status,409);
});
test('exception permit cannot be used for other target, user, or after revocation',async t=>{
  const f=await fixture(t);const {p,c,id}=await f.pair();const stranger=await f.device('participant');
  const first=(await f.call('/api/exceptions',{method:'POST',token:p.token,body:{pairingId:id,target:'example.org',reason:'false_positive'}})).body.exception;
  const second=(await f.call('/api/exceptions',{method:'POST',token:p.token,body:{pairingId:id,target:'example.net',reason:'false_positive'}})).body.exception;
  for(const row of [first,second])await f.call(`/api/exceptions/${row.id}/decision`,{method:'POST',token:c.token,body:{decision:'approve'}});
  f.advance(600_001);const permit=(await f.call(`/api/exceptions/${first.id}/permit`,{method:'POST',token:p.token,body:{}})).body;
  assert.equal((await f.call(`/api/exceptions/${second.id}/apply`,{method:'POST',token:p.token,body:{permitToken:permit.permitToken}})).status,409);
  assert.equal((await f.call(`/api/exceptions/${first.id}`,{token:stranger.token})).status,404);
  await f.call(`/api/pairings/${id}`,{method:'DELETE',token:p.token});
  assert.equal((await f.call(`/api/exceptions/${first.id}/apply`,{method:'POST',token:p.token,body:{permitToken:permit.permitToken}})).status,409);
});
test('account deletion invalidates token and cascades pairing data',async t=>{
  const f=await fixture(t);const {p,c,id}=await f.pair();await f.call('/api/support',{method:'POST',token:p.token,body:{pairingId:id,message:'call'}});
  assert.equal((await f.call('/api/me',{method:'DELETE',token:p.token})).status,200);
  assert.equal((await f.call('/api/me',{token:p.token})).status,401);
  assert.equal((await f.call('/api/me',{token:c.token})).body.pairings.length,0);
});
test('retention and account expiration are applied without retaining secrets',async t=>{
  const f=await fixture(t);const {p,c,id}=await f.pair();await f.call('/api/support',{method:'POST',token:p.token,body:{pairingId:id,message:'call'}});
  f.advance(15*86_400_000);const dashboard=await f.call(`/api/pairings/${id}/dashboard`,{token:c.token});assert.equal(dashboard.body.supports.length,0);
  f.advance(16*86_400_000);assert.equal((await f.call('/api/me',{token:p.token})).status,401);
});
test('cross-origin requests and cookie mutation without custom header are rejected',async t=>{
  const f=await fixture(t);const p=await f.device('participant');
  assert.equal((await f.call('/api/me',{token:p.token,headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal((await f.call('/api/pairings',{method:'POST',headers:{Cookie:`gempur_session=${p.token}`},body:{}})).status,403);
  assert.equal((await f.call('/api/pairings',{method:'POST',headers:{Cookie:`gempur_session=${p.token}`,'X-Gempur-Client':'web'},body:{}})).status,201);
});
test('static dashboard has restrictive headers and no external dependencies',async t=>{
  const f=await fixture(t);const response=await fetch(f.base+'/');assert.equal(response.status,200);assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.match(await response.text(),/Gempur/);
  assert.equal((await fetch(f.base+'/../server/app.mjs')).status,404);
});
test('oversized payload, non-JSON content type, malformed JSON and method errors are safe',async t=>{
  const f=await fixture(t);
  const oversized=await f.call('/api/devices',{method:'POST',body:{name:'a'.repeat(9000),role:'participant'}});assert.equal(oversized.status,413);
  assert.equal((await f.call('/api/devices',{method:'POST',headers:{'Content-Type':'text/plain'},body:{}})).status,415);
  const malformed=await fetch(f.base+'/api/devices',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});assert.equal(malformed.status,400);
  assert.equal((await f.call('/api/me',{headers:{Authorization:'Bearer bad'}})).status,401);
});
test('registration rate limiting is bounded',async t=>{
  const f=await fixture(t);let status=0;for(let i=0;i<21;i++)status=(await f.call('/api/devices',{method:'POST',body:{role:'participant',name:'Test'}})).status;assert.equal(status,429);
});
test('concurrent replay of one exception permit succeeds exactly once',async t=>{
  const f=await fixture(t);const {p,c,id}=await f.pair();
  const row=(await f.call('/api/exceptions',{method:'POST',token:p.token,body:{pairingId:id,target:'example.org',reason:'false_positive'}})).body.exception;
  await f.call(`/api/exceptions/${row.id}/decision`,{method:'POST',token:c.token,body:{decision:'approve'}});f.advance(600_001);
  const permit=(await f.call(`/api/exceptions/${row.id}/permit`,{method:'POST',token:p.token,body:{}})).body;
  const attempts=await Promise.all(Array.from({length:8},()=>f.call(`/api/exceptions/${row.id}/apply`,{method:'POST',token:p.token,body:{permitToken:permit.permitToken}})));
  assert.equal(attempts.filter(item=>item.status===200).length,1);
  assert.equal(attempts.filter(item=>item.status===409).length,7);
});
test('revocation while exception request body is incomplete invalidates authorization',async t=>{
  const f=await fixture(t);const {p,c,id}=await f.pair();
  const row=(await f.call('/api/exceptions',{method:'POST',token:p.token,body:{pairingId:id,target:'example.org',reason:'false_positive'}})).body.exception;
  await f.call(`/api/exceptions/${row.id}/decision`,{method:'POST',token:c.token,body:{decision:'approve'}});f.advance(600_001);
  let pending;
  const result=new Promise((resolve,reject)=>{
    pending=request(`${f.base}/api/exceptions/${row.id}/permit`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${p.token}`,'Transfer-Encoding':'chunked'}},response=>{let data='';response.on('data',chunk=>data+=chunk);response.on('end',()=>resolve({status:response.statusCode,body:JSON.parse(data)}));});
    pending.on('error',reject);pending.write('{');
  });
  await new Promise(resolve=>setTimeout(resolve,25));
  await f.call(`/api/pairings/${id}`,{method:'DELETE',token:p.token});pending.end('}');
  assert.equal((await result).status,409);
});
test('logout revokes server capability and does not strand an active sharing grant',async t=>{
  const f=await fixture(t);const {p,c,id}=await f.pair();
  const logout=await f.call('/api/session',{method:'DELETE',token:p.token});assert.equal(logout.status,200);assert.equal(logout.body.sharingEnded,true);
  assert.equal((await f.call('/api/me',{token:p.token})).status,401);
  assert.equal((await f.call(`/api/pairings/${id}/dashboard`,{token:c.token})).status,409);
});
test('domain reports are explicit, normalized, private to author and never activate rules',async t=>{
  const f=await fixture(t);const p=await f.device('participant'),other=await f.device('participant');
  const report=await f.call('/api/reports',{method:'POST',token:p.token,body:{target:'WWW.Example.ORG.'}});assert.equal(report.status,201);assert.equal(report.body.report.target,'www.example.org');assert.equal(report.body.report.status,'pending');
  assert.equal((await f.call('/api/reports',{token:p.token})).body.reports.length,1);
  assert.equal((await f.call('/api/reports',{token:other.token})).body.reports.length,0);
  assert.equal((await f.call('/api/reports',{method:'POST',token:p.token,body:{target:'https://example.org/secret?otp=123'}})).status,400);
  assert.equal((await f.call('/api/reports',{method:'POST',token:p.token,body:{target:'example.org',notes:'private'}})).status,400);
  const exported=await f.call('/api/me/export',{token:p.token});assert.equal(exported.body.reports[0].id,report.body.report.id);
  f.advance(15*86_400_000);assert.equal((await f.call('/api/reports',{token:p.token})).body.reports.length,0);
});
test('domain report rate limit is five per day per participant',async t=>{
  const f=await fixture(t);const p=await f.device('participant');
  for(let i=0;i<5;i++)assert.equal((await f.call('/api/reports',{method:'POST',token:p.token,body:{target:`site${i}.example`}})).status,201);
  assert.equal((await f.call('/api/reports',{method:'POST',token:p.token,body:{target:'site6.example'}})).status,429);
});
