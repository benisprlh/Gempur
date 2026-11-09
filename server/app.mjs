import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomInt, createHash, timingSafeEqual } from 'node:crypto';
import { domainToASCII, fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MINUTE = 60_000;
const DAY = 86_400_000;
const TOKEN_TTL = 30 * DAY;
const webRoot = fileURLToPath(new URL('../web/', import.meta.url));
const hash = text => createHash('sha256').update(text).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const identifier = prefix => `${prefix}_${randomBytes(16).toString('hex')}`;
const date = value => value == null ? null : new Date(value).toISOString();
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function reject(status, code, message) { throw new ApiError(status, code, message); }
function shape(value, allowed, required = allowed) {
  if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !(key in value))) {
    reject(400, 'invalid_payload', 'Kolom permintaan tidak sesuai.');
  }
}
function text(value, max = 80) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) reject(400, 'invalid_text', 'Teks tidak valid.');
  return value.trim();
}
export function normalizeDomain(value) {
  let input = text(value, 253).toLowerCase();
  if (/[:/\\@?#*\s]/.test(input)) reject(400, 'invalid_domain', 'Masukkan domain saja, tanpa tautan lengkap atau wildcard.');
  input = domainToASCII(input.replace(/\.$/, ''));
  if (!input || input.length > 253 || !input.includes('.') || input.split('.').some(part => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part)) || /^\d+(?:\.\d+){3}$/.test(input)) {
    reject(400, 'invalid_domain', 'Domain tidak valid.');
  }
  return input;
}

export function createApp({ dbPath = ':memory:', now = Date.now, publicOrigin = '', cooldownMs = 10 * MINUTE } = {}) {
  if (publicOrigin && (new URL(publicOrigin).origin !== publicOrigin || !publicOrigin.startsWith('https://'))) throw new Error('PUBLIC_ORIGIN must be an HTTPS origin without path or trailing slash.');
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY, role TEXT NOT NULL, name TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS pairings(id TEXT PRIMARY KEY, participant_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE, companion_id TEXT REFERENCES devices(id) ON DELETE CASCADE, status TEXT NOT NULL, invitation_hash TEXT UNIQUE, verification_code TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, consent_version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS snapshots(id TEXT PRIMARY KEY, pairing_id TEXT NOT NULL REFERENCES pairings(id) ON DELETE CASCADE, payload TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS supports(id TEXT PRIMARY KEY, pairing_id TEXT NOT NULL REFERENCES pairings(id) ON DELETE CASCADE, message TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, read_at INTEGER, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS exceptions(id TEXT PRIMARY KEY, pairing_id TEXT NOT NULL REFERENCES pairings(id) ON DELETE CASCADE, target TEXT NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL, decided_at INTEGER, ready_at INTEGER, expires_at INTEGER NOT NULL, permit_hash TEXT, applied_at INTEGER);
    CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY, device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE, target TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS snapshots_pair ON snapshots(pairing_id,created_at); CREATE INDEX IF NOT EXISTS supports_pair ON supports(pairing_id,created_at); CREATE INDEX IF NOT EXISTS exceptions_pair ON exceptions(pairing_id,created_at);`);
  const limits = new Map();
  let lastPrune = 0;
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  function atomic(fn) { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (e) { db.exec('ROLLBACK'); throw e; } }
  function prune() {
    if (now() - lastPrune < MINUTE) return;
    lastPrune = now();
    for (const table of ['snapshots', 'supports', 'exceptions']) run(`DELETE FROM ${table} WHERE created_at < ?`, now() - 14 * DAY);
    run('DELETE FROM reports WHERE created_at < ?',now()-14*DAY);
    run('DELETE FROM devices WHERE expires_at < ?', now());
    run("UPDATE pairings SET status='expired',invitation_hash=NULL,verification_code=NULL WHERE status IN ('invited','claimed') AND expires_at < ?", now());
    run("UPDATE supports SET status='expired' WHERE status='received' AND expires_at < ?", now());
    run("UPDATE exceptions SET state='expired',permit_hash=NULL WHERE state IN ('pending','approved','issued','applied') AND expires_at < ?", now());
    for (const [key, value] of limits) if (value.end < now()) limits.delete(key);
  }
  function throttle(key, maximum, window = MINUTE) {
    let entry = limits.get(key);
    if (!entry || entry.end <= now()) { entry = { count: 0, end: now() + window }; limits.set(key, entry); }
    entry.count += 1;
    if (entry.count > maximum) reject(429, 'rate_limited', 'Terlalu banyak permintaan. Coba lagi nanti.');
  }
  function tokenOf(req) {
    if (req.headers.authorization) {
      const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization);
      return match?.[1] || '';
    }
    return /(?:^|;\s*)gempur_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(req.headers.cookie || '')?.[1] || '';
  }
  function authenticate(req) {
    const token = tokenOf(req);
    const digest = hash(token);
    const device = get('SELECT * FROM devices WHERE token_hash=? AND expires_at>?', digest, now());
    if (!device || !token || !timingSafeEqual(Buffer.from(device.token_hash), Buffer.from(digest))) reject(401, 'unauthorized', 'Sesi tidak valid atau sudah berakhir.');
    return device;
  }
  function ownPairing(id, device, role = null) {
    const pairing = get('SELECT * FROM pairings WHERE id=?', id);
    const owner = pairing && (pairing.participant_id === device.id || pairing.companion_id === device.id);
    if (!owner || (role === 'participant' && pairing.participant_id !== device.id) || (role === 'companion' && pairing.companion_id !== device.id)) reject(404, 'not_found', 'Pasangan tidak ditemukan.');
    if (pairing.status !== 'active') reject(409, 'pairing_inactive', 'Berbagi belum aktif atau sudah dicabut.');
    return pairing;
  }
  function deviceView(device) { return { id: device.id, role: device.role, name: device.name }; }
  function pairingView(row, current) {
    const participant = get('SELECT id,name,role FROM devices WHERE id=?', row.participant_id);
    const companion = row.companion_id ? get('SELECT id,name,role FROM devices WHERE id=?', row.companion_id) : null;
    return { id: row.id, status: row.status, participant, companion, createdAt: date(row.created_at), expiresAt: date(row.expires_at), consentVersion: row.consent_version,
      ...(row.status === 'claimed' ? { verificationCode: row.verification_code } : {}) };
  }
  function supportView(row) { return { id: row.id, message: row.message, status: row.status === 'received' && row.expires_at <= now() ? 'expired' : row.status, createdAt: date(row.created_at), readAt: date(row.read_at), expiresAt: date(row.expires_at) }; }
  function exceptionView(row) { return { id: row.id, target: row.target, state: row.expires_at <= now() && !['denied','cancelled'].includes(row.state) ? 'expired' : row.state, createdAt: date(row.created_at), readyAt: date(row.ready_at), expiresAt: date(row.expires_at) }; }
  function snapshotView(row) { return row ? { id: row.id, ...JSON.parse(row.payload), receivedAt: date(row.created_at) } : null; }
  function reportView(row) { return { id:row.id,target:row.target,status:row.status,createdAt:date(row.created_at) }; }
  function revoke(pairingId) {
    atomic(() => {
      run("UPDATE pairings SET status='revoked',invitation_hash=NULL,verification_code=NULL,consent_version=consent_version+1 WHERE id=?", pairingId);
      run("UPDATE exceptions SET state='cancelled',permit_hash=NULL WHERE pairing_id=?", pairingId);
      for (const table of ['snapshots','supports']) run(`DELETE FROM ${table} WHERE pairing_id=?`, pairingId);
    });
  }
  async function body(req) {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) reject(415, 'content_type', 'Gunakan application/json.');
    let count = 0; const chunks = [];
    for await (const chunk of req) { count += chunk.length; if (count > 8192) reject(413, 'too_large', 'Permintaan terlalu besar.'); chunks.push(chunk); }
    try { const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); if (!plain(parsed)) throw new Error(); return parsed; } catch { reject(400, 'invalid_json', 'JSON tidak valid.'); }
  }
  function expectedOrigin(req) {
    if (publicOrigin) return publicOrigin;
    const host = req.headers.host || '';
    if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) reject(403, 'origin_rejected', 'Akses jarak jauh memerlukan PUBLIC_ORIGIN dan HTTPS.');
    return `http://${host}`;
  }
  function send(res, status, payload, headers = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
    res.end(JSON.stringify(payload));
  }
  async function handler(req, res) {
    try {
      prune();
      const origin = expectedOrigin(req);
      if (req.headers.origin && req.headers.origin !== origin) reject(403, 'origin_rejected', 'Origin tidak diizinkan.');
      const url = new URL(req.url, origin);
      const path = url.pathname;
      const ip = req.socket.remoteAddress || 'unknown';
      throttle(`all:${ip}`, 180);
      if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
        throttle(`write:${ip}`, 60);
        if (!req.headers.authorization && req.headers.cookie && req.headers['x-gempur-client'] !== 'web') reject(403, 'csrf_rejected', 'Permintaan browser tidak valid.');
      }
      if (!path.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') reject(405, 'method_not_allowed', 'Metode tidak diizinkan.');
        const files = { '/':'index.html', '/app.js':'app.js', '/styles.css':'styles.css', '/privacy':'privacy.html' };
        const file = files[path];
        if (!file) reject(404, 'not_found', 'Halaman tidak ditemukan.');
        const types = { html:'text/html; charset=utf-8', js:'text/javascript; charset=utf-8', css:'text/css; charset=utf-8' };
        const content = readFileSync(join(webRoot,file));
        res.writeHead(200, { 'Content-Type':types[file.split('.').pop()], 'Content-Length':content.length, 'Cache-Control':'no-store', 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'", 'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff', 'Permissions-Policy':'camera=(), microphone=(), geolocation=()' });
        res.end(req.method === 'HEAD' ? undefined : content); return;
      }
      if (path === '/api/health' && req.method === 'GET') return send(res,200,{ status:'ok', version:'0.1.0', mode:'voluntary-sharing' });
      if (path === '/api/devices' && req.method === 'POST') {
        throttle(`register:${ip}`,20,60*MINUTE);
        const payload = await body(req); shape(payload,['role','name']);
        if (!['participant','companion'].includes(payload.role)) reject(400,'invalid_role','Peran tidak valid.');
        const name = text(payload.name,60), id = identifier('device'), token = secret();
        run('INSERT INTO devices VALUES (?,?,?,?,?,?)',id,payload.role,name,hash(token),now(),now()+TOKEN_TTL);
        return send(res,201,{device:{id,role:payload.role,name},token,expiresAt:date(now()+TOKEN_TTL)}, {'Set-Cookie':`gempur_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${publicOrigin ? '; Secure' : ''}`});
      }
      const device = authenticate(req);
      throttle(`device:${device.id}`,120);
      if (path === '/api/me' && req.method === 'GET') return send(res,200,{device:deviceView(device),pairings:all('SELECT * FROM pairings WHERE participant_id=? OR companion_id=? ORDER BY created_at DESC',device.id,device.id).map(row=>pairingView(row,device))});
      if (path === '/api/session' && req.method === 'DELETE') {
        // This alpha has no account recovery. Never strand a participant with a
        // live sharing grant after removing their only browser capability.
        const rows=all("SELECT id FROM pairings WHERE (participant_id=? OR companion_id=?) AND status IN ('invited','claimed','active')",device.id,device.id);
        for(const row of rows)revoke(row.id);
        run('UPDATE devices SET token_hash=? WHERE id=?',hash(secret()),device.id);
        return send(res,200,{loggedOut:true,sharingEnded:true},{'Set-Cookie':`gempur_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${publicOrigin ? '; Secure' : ''}`});
      }
      if (path === '/api/me' && req.method === 'DELETE') {
        run('DELETE FROM devices WHERE id=?',device.id);
        return send(res,200,{deleted:true},{'Set-Cookie':`gempur_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${publicOrigin ? '; Secure' : ''}`});
      }
      if (path === '/api/me/export' && req.method === 'GET') {
        const pairings = all('SELECT * FROM pairings WHERE participant_id=? OR companion_id=?',device.id,device.id);
        return send(res,200,{exportedAt:date(now()),device:deviceView(device),reports:all('SELECT * FROM reports WHERE device_id=? ORDER BY created_at DESC',device.id).map(reportView),pairings:pairings.map(pairing=>({ ...pairingView(pairing,device), ...(pairing.status==='active' ? { snapshots:all('SELECT * FROM snapshots WHERE pairing_id=?',pairing.id).map(snapshotView), supports:all('SELECT * FROM supports WHERE pairing_id=?',pairing.id).map(supportView), exceptions:all('SELECT * FROM exceptions WHERE pairing_id=?',pairing.id).map(exceptionView) } : {}) }))});
      }
      if(path==='/api/reports'&&req.method==='GET')return send(res,200,{reports:all('SELECT * FROM reports WHERE device_id=? ORDER BY created_at DESC',device.id).map(reportView)});
      if(path==='/api/reports'&&req.method==='POST') {
        const payload=await body(req);shape(payload,['target']);
        if(device.role!=='participant')reject(403,'participant_only','Laporan dikirim atas pilihan peserta.');
        const target=normalizeDomain(payload.target);throttle(`reports:${device.id}`,5,DAY);
        const id=identifier('report');run("INSERT INTO reports VALUES (?,?,?,'pending',?)",id,device.id,target,now());
        return send(res,201,{report:reportView(get('SELECT * FROM reports WHERE id=?',id)),notice:'Masuk antrean tinjauan. Tidak otomatis ditambahkan ke daftar blok global.'});
      }
      if (path === '/api/pairings' && req.method === 'POST') {
        if (device.role!=='participant') reject(403,'participant_only','Undangan dibuat oleh peserta.');
        shape(await body(req),[]);
        if (get("SELECT id FROM pairings WHERE participant_id=? AND status IN ('active','claimed','invited') AND (status='active' OR expires_at>?)",device.id,now())) reject(409,'pairing_exists','Akhiri pasangan/undangan sebelumnya terlebih dahulu.');
        const id=identifier('pair'), invitationCode=secret();
        run("INSERT INTO pairings(id,participant_id,status,invitation_hash,created_at,expires_at) VALUES (?,?,'invited',?,?,?)",id,device.id,hash(invitationCode),now(),now()+10*MINUTE);
        return send(res,201,{pairingId:id,invitationCode,expiresAt:date(now()+10*MINUTE)});
      }
      if (path === '/api/pairings/claim' && req.method === 'POST') {
        if (device.role!=='companion') reject(403,'companion_only','Undangan diterima oleh pendamping.');
        const payload=await body(req);shape(payload,['invitationCode']);
        const invitation=text(payload.invitationCode,80);
        const pairing=get("SELECT * FROM pairings WHERE invitation_hash=? AND status='invited' AND expires_at>?",hash(invitation),now());
        if (!pairing) reject(404,'invalid_invitation','Undangan tidak valid, sudah dipakai, atau kedaluwarsa.');
        const verificationCode=String(randomInt(100000,1000000));
        run("UPDATE pairings SET companion_id=?,status='claimed',invitation_hash=NULL,verification_code=? WHERE id=? AND status='invited'",device.id,verificationCode,pairing.id);
        return send(res,200,{pairingId:pairing.id,verificationCode,participant:deviceView(get('SELECT * FROM devices WHERE id=?',pairing.participant_id)),expiresAt:date(pairing.expires_at)});
      }
      const confirm=/^\/api\/pairings\/([^/]+)\/confirm$/.exec(path);
      if(confirm&&req.method==='POST') {
        const payload=await body(req);shape(payload,['verificationCode']);
        const pairing=get("SELECT * FROM pairings WHERE id=? AND participant_id=? AND status='claimed' AND expires_at>?",confirm[1],device.id,now());
        if(!pairing)reject(404,'not_found','Undangan tidak ditemukan.');
        throttle(`confirm:${pairing.id}`,5,10*MINUTE);
        if(typeof payload.verificationCode!=='string'||payload.verificationCode!==pairing.verification_code)reject(400,'verification_mismatch','Kode verifikasi tidak cocok.');
        run("UPDATE pairings SET status='active',verification_code=NULL WHERE id=?",pairing.id);
        return send(res,200,{pairing:pairingView(get('SELECT * FROM pairings WHERE id=?',pairing.id),device)});
      }
      const pairingPath=/^\/api\/pairings\/([^/]+)$/.exec(path);
      if(pairingPath&&req.method==='DELETE') {
        const pairing=get('SELECT * FROM pairings WHERE id=? AND (participant_id=? OR companion_id=?)',pairingPath[1],device.id,device.id);
        if(!pairing)reject(404,'not_found','Pasangan tidak ditemukan.');
        revoke(pairing.id);return send(res,200,{revoked:true});
      }
      const dashboard=/^\/api\/pairings\/([^/]+)\/(dashboard|activity)$/.exec(path);
      if(dashboard&&req.method==='GET') {
        const pairing=ownPairing(dashboard[1],device,dashboard[2]==='activity'?'participant':'companion');
        return send(res,200,{pairing:pairingView(pairing,device),snapshot:snapshotView(get('SELECT * FROM snapshots WHERE pairing_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1',pairing.id)),supports:all('SELECT * FROM supports WHERE pairing_id=? ORDER BY created_at DESC',pairing.id).map(supportView),exceptions:all('SELECT * FROM exceptions WHERE pairing_id=? ORDER BY created_at DESC',pairing.id).map(exceptionView),notice:'Ringkasan dikirim peserta; bukan status langsung atau bukti transaksi.'});
      }
      if(path==='/api/snapshots'&&req.method==='POST') {
        const payload=await body(req);shape(payload,['pairingId','protection','rulesVersion','blockedRequests','observedAt']);
        const pairing=ownPairing(text(payload.pairingId),device,'participant');
        if(!['active','inactive','unknown'].includes(payload.protection)||!Number.isSafeInteger(payload.blockedRequests)||payload.blockedRequests<0||payload.blockedRequests>1e9)reject(400,'invalid_snapshot','Ringkasan tidak valid.');
        const observed=Date.parse(payload.observedAt);
        if(typeof payload.observedAt!=='string'||!Number.isFinite(observed)||observed>now()+MINUTE||observed<now()-DAY)reject(400,'invalid_time','Ringkasan harus dibuat dalam 24 jam terakhir.');
        const rulesVersion=text(payload.rulesVersion,40);
        const id=identifier('snapshot');
        const safe={protection:payload.protection,rulesVersion,blockedRequests:payload.blockedRequests,observedAt:date(observed)};
        run('INSERT INTO snapshots VALUES (?,?,?,?)',id,pairing.id,JSON.stringify(safe),now());
        return send(res,201,{snapshot:{id,...safe,receivedAt:date(now())}});
      }
      if(path==='/api/support'&&req.method==='POST') {
        const payload=await body(req);shape(payload,['pairingId','message']);
        const pairing=ownPairing(text(payload.pairingId),device,'participant');
        if(!['call','message','company'].includes(payload.message))reject(400,'invalid_message','Pilih permintaan dukungan yang tersedia.');
        throttle(`support:${pairing.id}`,6,15*MINUTE);
        const id=identifier('support');run("INSERT INTO supports VALUES (?,?,?,'received',?,NULL,?)",id,pairing.id,payload.message,now(),now()+15*MINUTE);
        return send(res,201,{request:supportView(get('SELECT * FROM supports WHERE id=?',id))});
      }
      const supportRead=/^\/api\/support\/([^/]+)\/read$/.exec(path);
      if(supportRead&&req.method==='POST') {
        shape(await body(req),[]);const row=get('SELECT * FROM supports WHERE id=?',supportRead[1]);
        if(!row)reject(404,'not_found','Permintaan tidak ditemukan.');ownPairing(row.pairing_id,device,'companion');
        if(row.expires_at<=now())reject(409,'expired','Permintaan sudah lewat waktunya; hubungi peserta secara langsung.');
        run("UPDATE supports SET status='read',read_at=COALESCE(read_at,?) WHERE id=?",now(),row.id);
        return send(res,200,{request:supportView(get('SELECT * FROM supports WHERE id=?',row.id))});
      }
      if(path==='/api/exceptions'&&req.method==='POST') {
        const payload=await body(req);shape(payload,['pairingId','target','reason']);
        const pairing=ownPairing(text(payload.pairingId),device,'participant');
        if(payload.reason!=='false_positive')reject(400,'invalid_reason','Koreksi hanya untuk domain normal yang salah diblokir.');
        const target=normalizeDomain(payload.target), id=identifier('exception');
        throttle(`exceptions:${pairing.id}`,10,DAY);
        run("INSERT INTO exceptions(id,pairing_id,target,state,created_at,expires_at) VALUES (?,?,?,'pending',?,?)",id,pairing.id,target,now(),now()+DAY);
        return send(res,201,{exception:exceptionView(get('SELECT * FROM exceptions WHERE id=?',id))});
      }
      const exception=/^\/api\/exceptions\/([^/]+)(?:\/(decision|permit|apply))?$/.exec(path);
      if(exception) {
        // Consume the asynchronous body before checking mutable authorization/state.
        // Once read, checks and writes below are synchronous in this process.
        const payload=req.method==='POST'?await body(req):null;
        const row=get('SELECT * FROM exceptions WHERE id=?',exception[1]);if(!row)reject(404,'not_found','Koreksi tidak ditemukan.');
        ownPairing(row.pairing_id,device);
        const pairing=get('SELECT * FROM pairings WHERE id=?',row.pairing_id);
        const isParticipant=pairing.participant_id===device.id;
        if(req.method==='GET'&&!exception[2])return send(res,200,{exception:exceptionView(row)});
        if(req.method==='POST'&&exception[2]==='decision') {
          if(isParticipant)reject(403,'companion_only','Koreksi ditinjau pendamping.');shape(payload,['decision']);
          if(!['approve','deny'].includes(payload.decision))reject(400,'invalid_decision','Keputusan tidak valid.');
          if(row.state!=='pending'||row.expires_at<=now())reject(409,'invalid_state','Koreksi tidak lagi menunggu tinjauan.');
          const approve=payload.decision==='approve';
          run('UPDATE exceptions SET state=?,decided_at=?,ready_at=?,expires_at=? WHERE id=?',approve?'approved':'denied',now(),approve?now()+cooldownMs:null,approve?now()+cooldownMs+30*MINUTE:row.expires_at,row.id);
          return send(res,200,{exception:exceptionView(get('SELECT * FROM exceptions WHERE id=?',row.id))});
        }
        if(req.method==='POST'&&exception[2]==='permit') {
          if(!isParticipant)reject(403,'participant_only','Izin penerapan hanya untuk peserta.');shape(payload,[]);
          if(row.state!=='approved'||row.expires_at<=now()||row.ready_at>now())reject(409,'not_ready','Masa tunggu belum selesai atau koreksi tidak berlaku.');
          const permitToken=secret();run("UPDATE exceptions SET state='issued',permit_hash=? WHERE id=?",hash(permitToken),row.id);
          return send(res,200,{permitToken,exception:exceptionView(get('SELECT * FROM exceptions WHERE id=?',row.id)),consentVersion:pairing.consent_version});
        }
        if(req.method==='POST'&&exception[2]==='apply') {
          if(!isParticipant)reject(403,'participant_only','Penerapan dilakukan peserta.');shape(payload,['permitToken']);
          if(row.state!=='issued'||row.expires_at<=now()||typeof payload.permitToken!=='string'||hash(payload.permitToken)!==row.permit_hash)reject(409,'invalid_permit','Izin tidak valid, sudah dipakai, atau kedaluwarsa.');
          run("UPDATE exceptions SET state='applied',permit_hash=NULL,applied_at=? WHERE id=?",now(),row.id);
          return send(res,200,{exception:exceptionView(get('SELECT * FROM exceptions WHERE id=?',row.id)),target:row.target,expiresAt:date(row.expires_at),notice:'Terapkan hanya setelah konfirmasi lokal, untuk domain normal yang salah diblokir.'});
        }
      }
      reject(404,'not_found','Endpoint tidak ditemukan.');
    } catch(error) {
      if(res.headersSent){res.end();return;}
      const safe=error instanceof ApiError;
      send(res,safe?error.status:500,{error:{code:safe?error.code:'internal_error',message:safe?error.message:'Layanan mengalami gangguan. Coba lagi.'}});
    }
  }
  return { handler, close:()=>db.close() };
}
