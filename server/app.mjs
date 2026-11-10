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

function privateTarget(kind, value) {
  if (kind === 'domain') {
    const target = normalizeDomain(value);
    if (/(?:^|\.)(?:test|invalid|example|localhost)$/.test(target) || /(?:^|\.)example\.(?:com|net|org)$/.test(target)) reject(400,'diagnostic_target','Domain diagnostik tidak boleh dibagikan.');
    return target;
  }
  if (kind !== 'app') reject(400,'invalid_kind','Jenis target tidak valid.');
  const target=text(value,253);
  if (!/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(target) || /^(?:(?:id|com)\.gempur(?:\.|$)|com\.example(?:\.|$)|(?:test|example|invalid|localhost)\.)/i.test(target)) reject(400,'invalid_package','Nama paket aplikasi tidak valid atau merupakan diagnostik.');
  return target;
}

export function createApp({ dbPath = ':memory:', now = Date.now, publicOrigin = '', cooldownMs = 10 * MINUTE, privateMonitoringEnabled = false } = {}) {
  if(typeof privateMonitoringEnabled!=='boolean')throw new Error('privateMonitoringEnabled must be a boolean.');
  if (publicOrigin && (new URL(publicOrigin).origin !== publicOrigin || !publicOrigin.startsWith('https://'))) throw new Error('PUBLIC_ORIGIN must be an HTTPS origin without path or trailing slash.');
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY, role TEXT NOT NULL, name TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS pairings(id TEXT PRIMARY KEY, participant_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE, companion_id TEXT REFERENCES devices(id) ON DELETE CASCADE, status TEXT NOT NULL, invitation_hash TEXT UNIQUE, verification_code TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, consent_version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS snapshots(id TEXT PRIMARY KEY, pairing_id TEXT NOT NULL REFERENCES pairings(id) ON DELETE CASCADE, payload TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS supports(id TEXT PRIMARY KEY, pairing_id TEXT NOT NULL REFERENCES pairings(id) ON DELETE CASCADE, message TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, read_at INTEGER, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS exceptions(id TEXT PRIMARY KEY, pairing_id TEXT NOT NULL REFERENCES pairings(id) ON DELETE CASCADE, target TEXT NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL, decided_at INTEGER, ready_at INTEGER, expires_at INTEGER NOT NULL, permit_hash TEXT, applied_at INTEGER);
    CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY, device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE, target TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS automation_grants(pairing_id TEXT PRIMARY KEY REFERENCES pairings(id) ON DELETE CASCADE, enabled INTEGER NOT NULL, version INTEGER NOT NULL, scopes TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS detections(id TEXT PRIMARY KEY, pairing_id TEXT NOT NULL REFERENCES pairings(id) ON DELETE CASCADE, event_id TEXT NOT NULL, kind TEXT NOT NULL, target TEXT NOT NULL, reason TEXT NOT NULL, verdict TEXT NOT NULL, action TEXT NOT NULL, occurred_at INTEGER NOT NULL, count INTEGER NOT NULL, created_at INTEGER NOT NULL, read_at INTEGER, UNIQUE(pairing_id,event_id));
    CREATE INDEX IF NOT EXISTS detections_pair ON detections(pairing_id,created_at);
    CREATE INDEX IF NOT EXISTS snapshots_pair ON snapshots(pairing_id,created_at); CREATE INDEX IF NOT EXISTS supports_pair ON supports(pairing_id,created_at); CREATE INDEX IF NOT EXISTS exceptions_pair ON exceptions(pairing_id,created_at);`);
  const exceptionColumns=new Set(db.prepare('PRAGMA table_info(exceptions)').all().map(column=>column.name));
  if(!exceptionColumns.has('target_kind'))db.exec("ALTER TABLE exceptions ADD COLUMN target_kind TEXT NOT NULL DEFAULT 'domain'");
  if(!exceptionColumns.has('detection_id'))db.exec('ALTER TABLE exceptions ADD COLUMN detection_id TEXT');
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
    run('DELETE FROM detections WHERE created_at < ?',now()-7*DAY);
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
      ...(row.status === 'claimed' ? { verificationCode: row.verification_code } : {}), ...(privateMonitoringEnabled?{automation:automationView(row.id)}:{}) };
  }
  function supportView(row) { return { id: row.id, message: row.message, status: row.status === 'received' && row.expires_at <= now() ? 'expired' : row.status, createdAt: date(row.created_at), readAt: date(row.read_at), expiresAt: date(row.expires_at) }; }
  function exceptionView(row) { return { id: row.id, target: row.target, targetKind:row.target_kind||'domain', ...(row.detection_id?{detectionId:row.detection_id}:{}), state: row.expires_at <= now() && !['denied','cancelled'].includes(row.state) ? 'expired' : row.state, createdAt: date(row.created_at), readyAt: date(row.ready_at), expiresAt: date(row.expires_at) }; }
  function snapshotView(row) { return row ? { id: row.id, ...JSON.parse(row.payload), receivedAt: date(row.created_at) } : null; }
  function reportView(row) { return { id:row.id,target:row.target,status:row.status,createdAt:date(row.created_at) }; }
  function automationView(pairingId) {
    const row=get('SELECT * FROM automation_grants WHERE pairing_id=?',pairingId);
    return row?{enabled:row.enabled===1,version:row.version,scopes:JSON.parse(row.scopes),updatedAt:date(row.updated_at)}:{enabled:false,version:0,scopes:[],updatedAt:null};
  }
  function detectionView(row) {return {id:row.id,eventId:row.event_id,kind:row.kind,target:row.target,reason:row.reason,verdict:row.verdict,action:row.action,occurredAt:date(row.occurred_at),receivedAt:date(row.created_at),count:row.count,readAt:date(row.read_at)};}
  function privateMode(){if(!privateMonitoringEnabled)reject(404,'not_found','Fitur privat tidak diaktifkan operator.');}
  function enabledAutomation(pairingId) {
    const grant=automationView(pairingId);
    if(!grant.enabled)reject(409,'automation_inactive','Berbagi deteksi otomatis belum aktif.');
    return grant;
  }
  function revoke(pairingId) {
    atomic(() => {
      run("UPDATE pairings SET status='revoked',invitation_hash=NULL,verification_code=NULL,consent_version=consent_version+1 WHERE id=?", pairingId);
      run("UPDATE exceptions SET state='cancelled',permit_hash=NULL WHERE pairing_id=?", pairingId);
      for (const table of ['snapshots','supports']) run(`DELETE FROM ${table} WHERE pairing_id=?`, pairingId);
      run('DELETE FROM detections WHERE pairing_id=?',pairingId);
      run("UPDATE automation_grants SET enabled=0,version=version+1,scopes='[]',updated_at=? WHERE pairing_id=?",now(),pairingId);
    });
  }
  async function body(req, requiresAuth = true) {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) reject(415, 'content_type', 'Gunakan application/json.');
    let count = 0; const chunks = [];
    for await (const chunk of req) { count += chunk.length; if (count > 8192) reject(413, 'too_large', 'Permintaan terlalu besar.'); chunks.push(chunk); }
    let parsed;
    try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); if (!plain(parsed)) throw new Error(); } catch { reject(400, 'invalid_json', 'JSON tidak valid.'); }
    // A capability may have been revoked while an incomplete body was waiting.
    if(requiresAuth)authenticate(req);
    return parsed;
  }
  function expectedOrigin(req) {
    if (publicOrigin) return publicOrigin;
    const host = req.headers.host || '';
    const standardLocalHost=/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
    // Android Emulator maps 10.0.2.2 to its host's loopback interface.
    // Accept that exact development authority only for an actual loopback peer;
    // forwarded headers never grant this exception.
    const loopbackPeer=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    const emulatorHost=loopbackPeer&&/^10\.0\.2\.2(?::\d+)?$/.test(host);
    if (!standardLocalHost&&!emulatorHost) reject(403, 'origin_rejected', 'Akses jarak jauh memerlukan PUBLIC_ORIGIN dan HTTPS.');
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
        const files = { '/':'index.html', '/app.js':'app.js', '/detection-inbox.mjs':'detection-inbox.mjs', '/styles.css':'styles.css', '/privacy':'privacy.html' };
        const file = files[path];
        if (!file) reject(404, 'not_found', 'Halaman tidak ditemukan.');
        const types = { html:'text/html; charset=utf-8', js:'text/javascript; charset=utf-8', mjs:'text/javascript; charset=utf-8', css:'text/css; charset=utf-8' };
        const content = readFileSync(join(webRoot,file));
        res.writeHead(200, { 'Content-Type':types[file.split('.').pop()], 'Content-Length':content.length, 'Cache-Control':'no-store', 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'", 'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff', 'Permissions-Policy':'camera=(), microphone=(), geolocation=()' });
        res.end(req.method === 'HEAD' ? undefined : content); return;
      }
      if (path === '/api/health' && req.method === 'GET') return send(res,200,{ status:'ok', version:'0.3.2-alpha.1', mode:privateMonitoringEnabled?'private-opt-in-detection':'voluntary-sharing',privateMonitoringEnabled,localDomainAiSignals:true });
      if (path === '/api/devices' && req.method === 'POST') {
        throttle(`register:${ip}`,20,60*MINUTE);
        const payload = await body(req,false); shape(payload,['role','name']);
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
        return send(res,200,{exportedAt:date(now()),device:deviceView(device),reports:all('SELECT * FROM reports WHERE device_id=? ORDER BY created_at DESC',device.id).map(reportView),pairings:pairings.map(pairing=>({ ...pairingView(pairing,device), ...(pairing.status==='active' ? { snapshots:all('SELECT * FROM snapshots WHERE pairing_id=?',pairing.id).map(snapshotView), supports:all('SELECT * FROM supports WHERE pairing_id=?',pairing.id).map(supportView), exceptions:all('SELECT * FROM exceptions WHERE pairing_id=?',pairing.id).map(exceptionView), ...(get('SELECT pairing_id FROM automation_grants WHERE pairing_id=?',pairing.id)?{automation:automationView(pairing.id),detections:all('SELECT * FROM detections WHERE pairing_id=? ORDER BY created_at DESC,rowid DESC',pairing.id).map(detectionView)}:{}) } : {}) }))});
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
      const automation=/^\/api\/pairings\/([^/]+)\/automation$/.exec(path);
      if(automation) {
        privateMode();
        if(req.method==='GET'){ownPairing(automation[1],device);return send(res,200,{automation:automationView(automation[1])});}
        if(req.method==='PUT') {
          const payload=await body(req);shape(payload,['enabled','scopes']);
          const pairing=ownPairing(automation[1],device,'participant');
          if(typeof payload.enabled!=='boolean'||!Array.isArray(payload.scopes)||payload.scopes.some(scope=>!['domain','app'].includes(scope))||new Set(payload.scopes).size!==payload.scopes.length||payload.scopes.length>2||(payload.enabled?payload.scopes.length===0:payload.scopes.length!==0))reject(400,'invalid_automation','Pilih lingkup berbagi deteksi yang valid.');
          const scopes=[...payload.scopes].sort(),previous=automationView(pairing.id);
          if(previous.enabled!==payload.enabled||JSON.stringify(previous.scopes)!==JSON.stringify(scopes))atomic(()=>{
            run("UPDATE exceptions SET state='cancelled',permit_hash=NULL WHERE pairing_id=? AND detection_id IS NOT NULL",pairing.id);
            run('DELETE FROM detections WHERE pairing_id=?',pairing.id);
            run('INSERT INTO automation_grants VALUES (?,?,?,?,?) ON CONFLICT(pairing_id) DO UPDATE SET enabled=excluded.enabled,version=excluded.version,scopes=excluded.scopes,updated_at=excluded.updated_at',pairing.id,payload.enabled?1:0,previous.version+1,JSON.stringify(scopes),now());
          });
          return send(res,200,{automation:automationView(pairing.id)});
        }
        reject(405,'method_not_allowed','Metode tidak diizinkan.');
      }
      if(path==='/api/detections'&&req.method==='POST') {
        privateMode();
        const payload=await body(req);shape(payload,['pairingId','consentVersion','automationVersion','events']);
        const pairing=ownPairing(text(payload.pairingId),device,'participant'),grant=enabledAutomation(pairing.id);
        if(!Number.isSafeInteger(payload.consentVersion)||payload.consentVersion!==pairing.consent_version||!Number.isSafeInteger(payload.automationVersion)||payload.automationVersion!==grant.version)reject(409,'consent_changed','Izin berbagi deteksi telah berubah.');
        if(!Array.isArray(payload.events)||payload.events.length<1||payload.events.length>10)reject(400,'invalid_batch','Kirim 1 sampai 10 deteksi.');
        const eventIds=new Set(),events=payload.events.map(event=>{
          shape(event,['eventId','kind','target','reason','verdict','action','occurredAt','count']);
          if(typeof event.eventId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.eventId))reject(400,'invalid_event_id','ID deteksi harus UUID.');
          const eventId=event.eventId.toLowerCase();if(eventIds.has(eventId))reject(400,'duplicate_event','ID deteksi ganda dalam batch.');eventIds.add(eventId);
          if(!['domain','app'].includes(event.kind)||!grant.scopes.includes(event.kind))reject(400,'scope_rejected','Jenis deteksi di luar izin berbagi.');
          const target=privateTarget(event.kind,event.target),expectedVerdict={known_rule:'known',personal_rule:'personal',name_heuristic:'suspected',ml_model:'suspected'}[event.reason];
          const invalidMl=event.reason==='ml_model'&&(event.kind!=='domain'||event.verdict!=='suspected'||event.action!=='flagged');
          if(!expectedVerdict||event.verdict!==expectedVerdict||!['blocked','flagged'].includes(event.action)||invalidMl||!Number.isSafeInteger(event.count)||event.count<1||event.count>1000)reject(400,'invalid_detection','Ringkasan deteksi tidak valid.');
          const occurredAt=typeof event.occurredAt==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(event.occurredAt)?Date.parse(event.occurredAt):NaN;
          if(!Number.isFinite(occurredAt)||occurredAt<now()-DAY||occurredAt>now()+MINUTE)reject(400,'invalid_time','Deteksi harus dibuat dalam 24 jam terakhir.');
          return {eventId,kind:event.kind,target,reason:event.reason,verdict:event.verdict,action:event.action,occurredAt,count:event.count};
        });
        throttle(`detections:${pairing.id}`,30);
        atomic(()=>{
          const additions=[];
          for(const event of events){
            const old=get('SELECT * FROM detections WHERE pairing_id=? AND event_id=?',pairing.id,event.eventId);
            if(old){
              if(old.kind!==event.kind||old.target!==event.target||old.reason!==event.reason||old.verdict!==event.verdict||old.action!==event.action||old.occurred_at!==event.occurredAt||old.count!==event.count)reject(409,'event_conflict','ID deteksi telah dipakai untuk payload berbeda.');
            }else additions.push(event);
          }
          if(get('SELECT COUNT(*) AS count FROM detections WHERE pairing_id=?',pairing.id).count+additions.length>500)reject(429,'storage_full','Kotak deteksi penuh. Proteksi lokal tetap aktif; data lama akan kedaluwarsa sesuai retensi.');
          for(const event of additions)run('INSERT INTO detections VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL)',identifier('detection'),pairing.id,event.eventId,event.kind,event.target,event.reason,event.verdict,event.action,event.occurredAt,event.count,now());
        });
        return send(res,200,{acceptedEventIds:events.map(event=>event.eventId)});
      }
      if(path==='/api/detections'&&req.method==='GET') {
        privateMode();
        if([...url.searchParams.keys()].some(key=>key!=='pairingId')||url.searchParams.getAll('pairingId').length!==1)reject(400,'invalid_query','Pilih satu pasangan.');
        const pairing=ownPairing(text(url.searchParams.get('pairingId')),device),grant=automationView(pairing.id);
        return send(res,200,{detections:grant.enabled?all('SELECT * FROM detections WHERE pairing_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100',pairing.id).map(detectionView):[],automation:grant});
      }
      const detectionRead=/^\/api\/detections\/([^/]+)\/read$/.exec(path);
      if(detectionRead&&req.method==='POST') {
        privateMode();shape(await body(req),[]);
        const row=get('SELECT * FROM detections WHERE id=? AND created_at>=?',detectionRead[1],now()-7*DAY);if(!row)reject(404,'not_found','Deteksi tidak ditemukan.');
        ownPairing(row.pairing_id,device,'companion');enabledAutomation(row.pairing_id);
        run('UPDATE detections SET read_at=COALESCE(read_at,?) WHERE id=?',now(),row.id);
        return send(res,200,{detection:detectionView(get('SELECT * FROM detections WHERE id=?',row.id))});
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
        const payload=await body(req);shape(payload,['pairingId','target','reason','targetKind','detectionId'],['pairingId','target','reason']);
        const pairing=ownPairing(text(payload.pairingId),device,'participant');
        if(payload.reason!=='false_positive')reject(400,'invalid_reason','Koreksi hanya untuk domain normal yang salah diblokir.');
        const targetKind=payload.targetKind??'domain';
        if(!['domain','app'].includes(targetKind))reject(400,'invalid_kind','Jenis target tidak valid.');
        if(targetKind==='app'||payload.detectionId!==undefined)privateMode();
        const target=privateMonitoringEnabled?privateTarget(targetKind,payload.target):normalizeDomain(payload.target),id=identifier('exception');
        let detectionId=null;
        if(payload.detectionId!==undefined){
          detectionId=text(payload.detectionId);const detection=get('SELECT * FROM detections WHERE id=? AND pairing_id=? AND created_at>=?',detectionId,pairing.id,now()-7*DAY);
          enabledAutomation(pairing.id);
          if(!detection||detection.kind!==targetKind||detection.target!==target)reject(404,'detection_mismatch','Deteksi tidak sesuai target koreksi.');
        }
        throttle(`exceptions:${pairing.id}`,10,DAY);
        run("INSERT INTO exceptions(id,pairing_id,target,state,created_at,expires_at,target_kind,detection_id) VALUES (?,?,?,'pending',?,?,?,?)",id,pairing.id,target,now(),now()+DAY,targetKind,detectionId);
        return send(res,201,{exception:exceptionView(get('SELECT * FROM exceptions WHERE id=?',id))});
      }
      const exception=/^\/api\/exceptions\/([^/]+)(?:\/(decision|permit|apply))?$/.exec(path);
      if(exception) {
        // Consume the asynchronous body before checking mutable authorization/state.
        // Once read, checks and writes below are synchronous in this process.
        const payload=req.method==='POST'?await body(req):null;
        const row=get('SELECT * FROM exceptions WHERE id=?',exception[1]);if(!row)reject(404,'not_found','Koreksi tidak ditemukan.');
        if(row.target_kind==='app'||row.detection_id)privateMode();
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
          return send(res,200,{exception:exceptionView(get('SELECT * FROM exceptions WHERE id=?',row.id)),target:row.target,targetKind:row.target_kind||'domain',expiresAt:date(row.expires_at),notice:'Terapkan hanya setelah konfirmasi lokal, untuk satu target yang salah diblokir.'});
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
